/**
 * Real Book Parser and Reading Progress Persistence for Kinora.
 * Parses local and fetched EPUB (.epub), Plain Text (.txt), Markdown (.md),
 * HTML/XHTML (.html/.xhtml), and PDF (.pdf) documents with zero runtime dependencies.
 * Strictly adheres to project typography standards: zero em-dashes.
 */

export interface BookChapter {
  title: string
  subtitle?: string
  content: string[]
}

export interface ParsedBook {
  id: string
  title: string
  author: string
  format: 'epub' | 'pdf' | 'txt' | 'html' | 'md'
  chapters: BookChapter[]
  /** Raw PDF bytes rendered directly to canvas via PDF.js without loosening CSP. */
  pdfBytes?: Uint8Array
  /** Legacy object URL retained only for backward compatibility with callers. */
  pdfBlobUrl?: string
}

export interface BookBookmark {
  id: string
  chapterIndex: number
  label: string
  createdAt: string
}

export interface BookReadingProgress {
  bookKey: string
  title: string
  author?: string
  format?: string
  chapterIndex: number
  totalChapters: number
  percent: number
  bookmarks: BookBookmark[]
  updatedAt: string
}

const READING_PROGRESS_PREFIX = 'kinora.reading_progress.v1'

export function readingProgressStorageKey(profileId = 'default'): string {
  return profileId === 'default' ? READING_PROGRESS_PREFIX : `${READING_PROGRESS_PREFIX}.${profileId}`
}

export function loadAllBookProgress(profileId = 'default'): Record<string, BookReadingProgress> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(readingProgressStorageKey(profileId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, BookReadingProgress>) : {}
  } catch {
    return {}
  }
}

export function saveBookProgress(entry: BookReadingProgress, profileId = 'default'): void {
  if (typeof localStorage === 'undefined') return
  try {
    const all = loadAllBookProgress(profileId)
    all[entry.bookKey] = {
      ...entry,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(readingProgressStorageKey(profileId), JSON.stringify(all))
  } catch {
    // Storage quota safety
  }
}

/** Strips HTML/XHTML tags safely into clean paragraph arrays. */
export function extractParagraphsFromHtml(html: string): { title?: string; paragraphs: string[] } {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, (m) => {
      const t = m.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      return t ? `<title>${t[1]}</title>` : ' '
    })

  const titleMatch = withoutScripts.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || withoutScripts.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

  const blockSeparated = withoutScripts
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|blockquote|section|article|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  const decoded = blockSeparated
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))

  const paragraphs = decoded
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)

  return { title: title || undefined, paragraphs }
}

/** Splits plain text or Markdown into chapters by heading markers or readable page sizes. */
export function parsePlainTextToChapters(text: string, fallbackTitle: string): BookChapter[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return [{ title: fallbackTitle, content: ['This document is empty.'] }]
  }

  // Split by Markdown headings (# / ##) or "Chapter N" lines when present
  const lines = normalized.split('\n')
  const chapters: BookChapter[] = []
  let currentTitle = fallbackTitle
  let currentLines: string[] = []

  const flush = () => {
    const body = currentLines.join('\n').trim()
    if (!body) return
    const paragraphs = body
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (paragraphs.length > 0) {
      chapters.push({ title: currentTitle, content: paragraphs })
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const mdHeading = trimmed.match(/^#{1,2}\s+(.+)$/)
    const chapterHeading = trimmed.match(/^(chapter\s+[ivxlcdm\d]+(?:[:.\-]\s*.*)?)$/i)
    if (mdHeading && mdHeading[1]) {
      flush()
      currentTitle = mdHeading[1].trim()
      currentLines = []
    } else if (chapterHeading && chapterHeading[1] && trimmed.length <= 120) {
      flush()
      currentTitle = chapterHeading[1].trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  flush()

  if (chapters.length > 1) return chapters

  // If no explicit chapter markers, paginate cleanly every ~12 paragraphs
  const allParagraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  if (allParagraphs.length <= 14) {
    return [{ title: fallbackTitle, content: allParagraphs }]
  }

  const paged: BookChapter[] = []
  const chunkSize = 12
  for (let i = 0; i < allParagraphs.length; i += chunkSize) {
    const pageNum = Math.floor(i / chunkSize) + 1
    paged.push({
      title: `${fallbackTitle} (Section ${pageNum})`,
      content: allParagraphs.slice(i, i + chunkSize),
    })
  }
  return paged
}

interface ZipEntry {
  name: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>> 0
  )
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('EPUB DEFLATE decompression requires DecompressionStream support in this runtime.')
  }
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  await writer.write(compressed as unknown as BufferSource)
  await writer.close()
  const out = await new Response(ds.readable).arrayBuffer()
  return new Uint8Array(out)
}

/** Lightweight pure-TypeScript ZIP extractor for standard EPUB archives. */
export async function extractZipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder('utf-8')

  // Locate End of Central Directory signature (0x06054b50)
  let eocdOffset = -1
  const minOffset = Math.max(0, bytes.length - 65557)
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid EPUB archive: ZIP directory header not found.')
  }

  const cdEntries = readU16LE(bytes, eocdOffset + 10)
  const cdOffset = readU32LE(bytes, eocdOffset + 16)
  const entries: ZipEntry[] = []

  let cursor = cdOffset
  for (let i = 0; i < cdEntries && cursor + 46 <= bytes.length; i++) {
    if (readU32LE(bytes, cursor) !== 0x02014b50) break
    const compressionMethod = readU16LE(bytes, cursor + 10)
    const compressedSize = readU32LE(bytes, cursor + 20)
    const uncompressedSize = readU32LE(bytes, cursor + 24)
    const nameLen = readU16LE(bytes, cursor + 28)
    const extraLen = readU16LE(bytes, cursor + 30)
    const commentLen = readU16LE(bytes, cursor + 32)
    const localHeaderOffset = readU32LE(bytes, cursor + 42)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen))
    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset })
    cursor += 46 + nameLen + extraLen + commentLen
  }

  const files = new Map<string, Uint8Array>()
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue
    const lh = entry.localHeaderOffset
    if (lh + 30 > bytes.length || readU32LE(bytes, lh) !== 0x04034b50) continue
    const lhNameLen = readU16LE(bytes, lh + 26)
    const lhExtraLen = readU16LE(bytes, lh + 28)
    const dataStart = lh + 30 + lhNameLen + lhExtraLen
    const slice = bytes.subarray(dataStart, dataStart + entry.compressedSize)

    if (entry.compressionMethod === 0) {
      files.set(entry.name, slice)
    } else if (entry.compressionMethod === 8) {
      try {
        const inflated = await inflateRawBytes(slice)
        files.set(entry.name, inflated)
      } catch {
        // Skip undecodable binary asset
      }
    }
  }

  return files
}

function resolveRelativeZipPath(baseDir: string, href: string): string {
  const cleanHref = decodeURIComponent(href.split('#')[0] ?? href)
  if (!baseDir) return cleanHref.replace(/^\/+/, '')
  const parts = `${baseDir}/${cleanHref}`.split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.join('/')
}

/** Parses an EPUB ArrayBuffer into structured chapters using container.xml and OPF spine. */
export async function parseEpubBuffer(buffer: ArrayBuffer, fallbackTitle: string): Promise<ParsedBook> {
  const decoder = new TextDecoder('utf-8')
  const files = await extractZipEntries(buffer)

  let title = fallbackTitle
  let author = 'Local EPUB'
  const chapterPaths: string[] = []

  const containerBytes = files.get('META-INF/container.xml')
  if (containerBytes) {
    const containerXml = decoder.decode(containerBytes)
    const opfMatch = containerXml.match(/full-path=["']([^"']+)["']/i)
    if (opfMatch && opfMatch[1]) {
      const opfPath = opfMatch[1]
      const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : ''
      const opfBytes = files.get(opfPath)
      if (opfBytes) {
        const opfXml = decoder.decode(opfBytes)
        const titleMatch = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)
        if (titleMatch?.[1]) title = titleMatch[1].replace(/<[^>]+>/g, '').trim() || title
        const creatorMatch = opfXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)
        if (creatorMatch?.[1]) author = creatorMatch[1].replace(/<[^>]+>/g, '').trim() || author

        // Build manifest id -> href map
        const manifest = new Map<string, string>()
        const itemRegex = /<item\s+([^>]+)\/?>/gi
        let m: RegExpExecArray | null
        while ((m = itemRegex.exec(opfXml)) !== null) {
          const attrs = m[1] ?? ''
          const idMatch = attrs.match(/\bid=["']([^"']+)["']/i)
          const hrefMatch = attrs.match(/\bhref=["']([^"']+)["']/i)
          if (idMatch?.[1] && hrefMatch?.[1]) {
            manifest.set(idMatch[1], resolveRelativeZipPath(opfDir, hrefMatch[1]))
          }
        }

        // Read spine order
        const spineRegex = /<itemref\s+[^>]*idref=["']([^"']+)["'][^>]*\/?>/gi
        while ((m = spineRegex.exec(opfXml)) !== null) {
          const idref = m[1]
          const resolved = idref ? manifest.get(idref) : undefined
          if (resolved) chapterPaths.push(resolved)
        }
      }
    }
  }

  // Fallback if OPF spine was empty: pick sorted xhtml/html files
  if (chapterPaths.length === 0) {
    for (const name of Array.from(files.keys()).sort()) {
      if (/\.(xhtml|html|htm)$/i.test(name)) {
        chapterPaths.push(name)
      }
    }
  }

  const chapters: BookChapter[] = []
  for (let idx = 0; idx < chapterPaths.length; idx++) {
    const path = chapterPaths[idx]!
    const bytes = files.get(path)
    if (!bytes) continue
    const html = decoder.decode(bytes)
    const extracted = extractParagraphsFromHtml(html)
    if (extracted.paragraphs.length > 0) {
      chapters.push({
        title: extracted.title || `Section ${chapters.length + 1}`,
        content: extracted.paragraphs,
      })
    }
  }

  if (chapters.length === 0) {
    throw new Error('No readable chapters were found inside this EPUB archive.')
  }

  return {
    id: `epub:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title,
    author,
    format: 'epub',
    chapters,
  }
}

/** Loads a user-selected File (.epub, .pdf, .txt, .md, .html, .xhtml) into a ParsedBook. */
export async function parseLocalBookFile(file: File): Promise<ParsedBook> {
  const cleanTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || file.name
  const lower = file.name.toLowerCase()

  if (lower.endsWith('.epub')) {
    const buf = await file.arrayBuffer()
    return parseEpubBuffer(buf, cleanTitle)
  }

  if (lower.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer()
    const pdfBytes = new Uint8Array(buffer)
    const isPdfHeader =
      pdfBytes.length >= 5 &&
      pdfBytes[0] === 0x25 && // %
      pdfBytes[1] === 0x50 && // P
      pdfBytes[2] === 0x44 && // D
      pdfBytes[3] === 0x46 && // F
      pdfBytes[4] === 0x2d // -
    if (!isPdfHeader) {
      throw new Error('Selected file is not a valid PDF document (missing %PDF- header).')
    }
    return {
      id: `pdf:${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: cleanTitle,
      author: 'Local PDF Document',
      format: 'pdf',
      chapters: [{ title: cleanTitle, content: ['PDF document loaded in canvas reader.'] }],
      pdfBytes,
    }
  }

  if (lower.endsWith('.html') || lower.endsWith('.xhtml') || lower.endsWith('.htm')) {
    const text = await file.text()
    const extracted = extractParagraphsFromHtml(text)
    return {
      id: `html:${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: extracted.title || cleanTitle,
      author: 'Local HTML Document',
      format: 'html',
      chapters: [
        {
          title: extracted.title || cleanTitle,
          content: extracted.paragraphs.length > 0 ? extracted.paragraphs : ['Document contains no readable text.'],
        },
      ],
    }
  }

  const text = await file.text()
  const format = lower.endsWith('.md') ? 'md' : 'txt'
  return {
    id: `${format}:${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title: cleanTitle,
    author: format === 'md' ? 'Local Markdown Document' : 'Local Text Document',
    format,
    chapters: parsePlainTextToChapters(text, cleanTitle),
  }
}
