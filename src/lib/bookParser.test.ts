// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  extractParagraphsFromHtml,
  loadAllBookProgress,
  parseEpubBuffer,
  parseLocalBookFile,
  parsePlainTextToChapters,
  saveBookProgress,
} from './bookParser'

/** Builds a minimal valid uncompressed ZIP (stored method 0) for testing EPUB extraction. */
function buildStoredZip(files: { name: string; content: string }[]): ArrayBuffer {
  const enc = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = enc.encode(file.name)
    const dataBytes = enc.encode(file.content)

    const local = new Uint8Array(30 + nameBytes.length + dataBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, 0, true) // stored
    lv.setUint32(18, dataBytes.length, true)
    lv.setUint32(22, dataBytes.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(dataBytes, 30 + nameBytes.length)
    localParts.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(10, 0, true)
    cv.setUint32(20, dataBytes.length, true)
    cv.setUint32(24, dataBytes.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centralParts.push(central)

    offset += local.length
  }

  const cdStart = offset
  const cdSize = centralParts.reduce((sum, p) => sum + p.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdStart, true)

  const total = cdStart + cdSize + eocd.length
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of localParts) {
    out.set(p, pos)
    pos += p.length
  }
  for (const p of centralParts) {
    out.set(p, pos)
    pos += p.length
  }
  out.set(eocd, pos)
  return out.buffer
}

describe('bookParser real EPUB, HTML, TXT parsing and reading progress', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('extracts paragraphs safely while stripping script and style blocks', () => {
    const html = `
      <html><head><title>Test Essay</title><style>body{color:red}</style></head>
      <body>
        <h1>The Night Sky</h1>
        <script>alert('xss')</script>
        <p>First paragraph about &amp; stars.</p>
        <p>Second paragraph about planets.</p>
      </body></html>
    `
    const parsed = extractParagraphsFromHtml(html)
    expect(parsed.title).toBe('The Night Sky')
    expect(parsed.paragraphs.join(' ')).not.toContain('alert')
    expect(parsed.paragraphs.join(' ')).not.toContain('color:red')
    expect(parsed.paragraphs).toContain('First paragraph about & stars.')
    expect(parsed.paragraphs).toContain('Second paragraph about planets.')
  })

  it('splits plain text and markdown into chapters cleanly', () => {
    const md = '# Prologue\n\nOpening line.\n\n# Chapter 1\n\nSecond section.'
    const chapters = parsePlainTextToChapters(md, 'Fallback')
    expect(chapters).toHaveLength(2)
    expect(chapters[0]?.title).toBe('Prologue')
    expect(chapters[1]?.title).toBe('Chapter 1')
  })

  it('parses a real EPUB ZIP archive via container.xml and OPF spine', async () => {
    const zip = buildStoredZip([
      {
        name: 'META-INF/container.xml',
        content: `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
      },
      {
        name: 'OEBPS/content.opf',
        content: `<?xml version="1.0"?><package><metadata><dc:title>Northern Meridian</dc:title><dc:creator>Clara Finch</dc:creator></metadata><manifest><item id="c1" href="ch1.xhtml"/><item id="c2" href="ch2.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
      },
      {
        name: 'OEBPS/ch1.xhtml',
        content: `<html><body><h1>Departure</h1><p>The harbour fog lifted at dawn.</p></body></html>`,
      },
      {
        name: 'OEBPS/ch2.xhtml',
        content: `<html><body><h1>Open Water</h1><p>Compass steady due north.</p></body></html>`,
      },
    ])

    const book = await parseEpubBuffer(zip, 'Fallback')
    expect(book.title).toBe('Northern Meridian')
    expect(book.author).toBe('Clara Finch')
    expect(book.format).toBe('epub')
    expect(book.chapters).toHaveLength(2)
    expect(book.chapters[0]?.title).toBe('Departure')
    expect(book.chapters[1]?.content).toContain('Compass steady due north.')
  })

  it('persists profile-scoped reading progress and bookmarks', () => {
    saveBookProgress(
      {
        bookKey: 'epub:northern-meridian',
        title: 'Northern Meridian',
        chapterIndex: 1,
        totalChapters: 2,
        percent: 100,
        bookmarks: [{ id: 'bm-1', chapterIndex: 1, label: 'Section 2', createdAt: '2026-11-26T00:00:00Z' }],
        updatedAt: '2026-11-26T00:00:00Z',
      },
      'profile-a',
    )

    expect(loadAllBookProgress('profile-a')['epub:northern-meridian']?.percent).toBe(100)
    expect(loadAllBookProgress('profile-b')['epub:northern-meridian']).toBeUndefined()
  })

  it('validates real PDF headers and stores raw PDF bytes for canvas rendering', async () => {
    const validPdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n')
    const validFile = {
      name: 'Kinora_Guide.pdf',
      arrayBuffer: async () => validPdfBytes.buffer.slice(0),
    } as unknown as File

    const parsed = await parseLocalBookFile(validFile)
    expect(parsed.format).toBe('pdf')
    expect(parsed.title).toBe('Kinora Guide')
    expect(parsed.pdfBytes).toBeInstanceOf(Uint8Array)
    expect(parsed.pdfBytes?.byteLength).toBe(validPdfBytes.byteLength)

    const bogusBytes = new TextEncoder().encode('<html>not a pdf</html>')
    const invalidFile = {
      name: 'Fake.pdf',
      arrayBuffer: async () => bogusBytes.buffer.slice(0),
    } as unknown as File

    await expect(parseLocalBookFile(invalidFile)).rejects.toThrow('missing %PDF- header')
  })
})
