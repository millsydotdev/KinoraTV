import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export interface PdfCanvasViewerProps {
  bytes: Uint8Array
  title: string
  initialPage?: number
  onPageChange?: (pageIndex: number, totalPages: number) => void
}

interface PdfDocumentLike {
  numPages: number
  getPage: (pageNumber: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number }
    render: (opts: {
      canvasContext: CanvasRenderingContext2D
      viewport: { width: number; height: number }
      transform?: number[]
    }) => { promise: Promise<void>; cancel?: () => void }
  }>
  destroy?: () => Promise<void> | void
}

/**
 * CSP-safe canvas PDF renderer powered by pdfjs-dist.
 * Uses `isEvalSupported: false` and a bundled same-origin worker asset so Kinora's
 * strict `script-src 'self'` CSP remains completely intact across WebKitGTK, WKWebView, and WebView2.
 */
export function PdfCanvasViewer({
  bytes,
  title,
  initialPage = 0,
  onPageChange,
}: PdfCanvasViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const docRef = useRef<PdfDocumentLike | null>(null)
  const [pageNumber, setPageNumber] = useState(Math.max(1, initialPage + 1))
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.25)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load PDF document lazily when bytes change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const loadDoc = async () => {
      try {
        const [pdfjs, workerUrlMod] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ])
        if (cancelled) return

        if (pdfjs.GlobalWorkerOptions && workerUrlMod.default) {
          pdfjs.GlobalWorkerOptions.workerSrc = workerUrlMod.default
        }

        // Copy bytes because pdfjs-dist transfers the underlying ArrayBuffer to the worker
        const copy = new Uint8Array(bytes.byteLength)
        copy.set(bytes)

        const loadingTask = pdfjs.getDocument({
          data: copy,
          useSystemFonts: true,
        })
        const doc = (await loadingTask.promise) as unknown as PdfDocumentLike
        if (cancelled) {
          void doc.destroy?.()
          return
        }

        docRef.current = doc
        const clamped = Math.max(1, Math.min(initialPage + 1, doc.numPages))
        setNumPages(doc.numPages)
        setPageNumber(clamped)
        onPageChange?.(clamped - 1, doc.numPages)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setLoading(false)
        setError(err instanceof Error ? err.message : 'Unable to render this PDF document.')
      }
    }

    void loadDoc()

    return () => {
      cancelled = true
      const doc = docRef.current
      docRef.current = null
      if (doc) {
        void doc.destroy?.()
      }
    }
  }, [bytes])

  // Render active page onto canvas
  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || numPages === 0 || pageNumber < 1 || pageNumber > numPages) return

    let cancelled = false
    let activeTask: { promise: Promise<void>; cancel?: () => void } | null = null
    setRendering(true)
    setError(null)

    const renderPage = async () => {
      try {
        const page = await doc.getPage(pageNumber)
        if (cancelled) return
        const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
        const viewport = page.getViewport({ scale })
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setError('Canvas 2D rendering context is unavailable.')
          setRendering(false)
          return
        }

        canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        activeTask = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        })
        await activeTask.promise
        if (!cancelled) {
          setRendering(false)
          onPageChange?.(pageNumber - 1, numPages)
        }
      } catch (err) {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ''
        if (name === 'RenderingCancelledException') return
        setRendering(false)
        setError(err instanceof Error ? err.message : 'Could not render PDF page.')
      }
    }

    void renderPage()

    return () => {
      cancelled = true
      try {
        activeTask?.cancel?.()
      } catch {
        // Safe ignore
      }
    }
  }, [pageNumber, numPages, scale])

  // Keyboard page navigation
  useEffect(() => {
    if (numPages <= 1) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        setPageNumber((p) => Math.min(numPages, p + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setPageNumber((p) => Math.max(1, p - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numPages])

  return (
    <div
      data-testid="pdf-canvas-viewer"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div
        className="book-reader-settings-bar"
        style={{
          width: '100%',
          justifyContent: 'space-between',
          borderRadius: '8px',
        }}
        aria-label="PDF document controls"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={loading || pageNumber <= 1}
            aria-label="Previous PDF page"
          >
            <Icon name="left" size={14} />
            <span>Prev</span>
          </button>
          <span
            data-testid="pdf-page-indicator"
            style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '104px', textAlign: 'center' }}
          >
            {numPages > 0 ? `Page ${pageNumber} of ${numPages}` : 'Loading PDF...'}
          </span>
          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={loading || numPages === 0 || pageNumber >= numPages}
            aria-label="Next PDF page"
          >
            <span>Next</span>
            <Icon name="right" size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={() => setScale((s) => Math.max(0.75, Math.round((s - 0.25) * 100) / 100))}
            disabled={loading || scale <= 0.75}
            aria-label="Zoom out PDF"
          >
            -
          </button>
          <span style={{ fontSize: '0.82rem', minWidth: '46px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={() => setScale((s) => Math.min(2.25, Math.round((s + 0.25) * 100) / 100))}
            disabled={loading || scale >= 2.25}
            aria-label="Zoom in PDF"
          >
            +
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            maxWidth: '640px',
            padding: '12px 16px',
            borderRadius: '8px',
            border: '1px solid var(--red, #d44)',
            color: 'var(--red, #f66)',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          width: '100%',
          overflowX: 'auto',
          display: 'flex',
          justifyContent: 'center',
          padding: '8px 0 24px',
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`PDF page ${pageNumber} of ${title}`}
          data-rendered={(!loading && !rendering && numPages > 0 && !error) ? 'true' : 'false'}
          style={{
            background: '#ffffff',
            borderRadius: '6px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
            maxWidth: '100%',
            height: 'auto',
            opacity: rendering ? 0.75 : 1,
            transition: 'opacity 0.12s ease',
          }}
        />
      </div>
    </div>
  )
}
