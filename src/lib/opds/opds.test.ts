// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseOpdsCatalog,
  classifyEbookFormat,
} from './parser'
import { buildOpdsSearchUrl } from './client'
import {
  getOpdsCatalogs,
  saveOpdsCatalog,
  removeOpdsCatalog,
} from '../../state/opdsCatalogs'

describe('OPDS 1.2 and 2.0 Catalogue Parser', () => {
  const sampleOpds1Xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:opds:gutenberg:popular</id>
  <title>Project Gutenberg Popular Books</title>
  <subtitle>Most downloaded public domain literature</subtitle>
  <link rel="search" href="/ebooks/search.opds?q={searchTerms}" type="application/atom+xml"/>
  <link rel="next" href="/ebooks/popular.opds?page=2" type="application/atom+xml"/>
  <link rel="subsection" href="/ebooks/genres.opds" title="Browse by Genre" type="application/atom+xml"/>

  <entry>
    <id>http://www.gutenberg.org/ebooks/1342</id>
    <title>Pride and Prejudice</title>
    <author><name>Jane Austen</name></author>
    <published>1998-06-01</published>
    <summary>A romantic novel of manners written by Jane Austen in 1813.</summary>
    
    <!-- Cover images -->
    <link rel="http://opds-spec.org/image" href="/cache/epub/1342/pg1342.cover.medium.jpg" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="/cache/epub/1342/pg1342.cover.small.jpg" type="image/jpeg"/>
    
    <!-- Acquisition links -->
    <link rel="http://opds-spec.org/acquisition" href="/ebooks/1342.epub3.images" type="application/epub+zip" title="EPUB (Images)"/>
    <link rel="http://opds-spec.org/acquisition" href="/ebooks/1342.pdf" type="application/pdf" title="PDF Document"/>
    <link rel="http://opds-spec.org/acquisition" href="/files/1342/1342-h/1342-h.htm" type="text/html" title="Read Online HTML"/>
  </entry>

  <entry>
    <id>http://www.gutenberg.org/ebooks/84</id>
    <title>Frankenstein; Or, The Modern Prometheus</title>
    <author><name>Mary Wollstonecraft Shelley</name></author>
    <summary>A gothic thriller of scientific ambition and humanity.</summary>
    <link rel="http://opds-spec.org/image" href="https://example.com/art/frankenstein.jpg" type="image/jpeg"/>
    <link rel="http://opds-spec.org/acquisition" href="https://example.com/books/frankenstein.epub" type="application/epub+zip"/>
  </entry>
</feed>`

  const sampleOpds2Json = JSON.stringify({
    metadata: {
      title: 'Standard Ebooks Public Catalogue',
      description: 'Free public domain ebooks produced for modern typography.',
      identifier: 'urn:opds2:standardebooks',
    },
    links: [
      { rel: 'self', href: 'https://standardebooks.org/opds' },
      { rel: 'search', href: 'https://standardebooks.org/opds/search?query={searchTerms}' },
      { rel: 'next', href: 'https://standardebooks.org/opds?page=2' },
    ],
    navigation: [
      { title: 'Philosophy', href: '/opds/subjects/philosophy', rel: 'subsection' },
    ],
    publications: [
      {
        metadata: {
          title: 'The Great Gatsby',
          author: [{ name: 'F. Scott Fitzgerald' }],
          description: 'A 1925 novel following Jay Gatsby and Daisy Buchanan on Long Island.',
          identifier: 'urn:standardebooks:the-great-gatsby',
        },
        images: [
          { href: '/ebooks/the-great-gatsby/cover.jpg', type: 'image/jpeg' },
        ],
        links: [
          {
            rel: 'http://opds-spec.org/acquisition/open-access',
            href: '/ebooks/the-great-gatsby/dist.epub',
            type: 'application/epub+zip',
            title: 'EPUB',
          },
        ],
      },
    ],
  })

  it('parses OPDS 1.2 Atom XML with publication entries, covers, and formats', () => {
    const result = parseOpdsCatalog(sampleOpds1Xml, 'https://m.gutenberg.org/ebooks.opds')
    expect(result.title).toBe('Project Gutenberg Popular Books')
    expect(result.searchUrl).toBe('https://m.gutenberg.org/ebooks/search.opds?q={searchTerms}')
    expect(result.nextPageUrl).toBe('https://m.gutenberg.org/ebooks/popular.opds?page=2')
    expect(result.navigation.length).toBe(1)
    expect(result.navigation[0]!.title).toBe('Browse by Genre')

    expect(result.entries.length).toBe(2)

    const book1 = result.entries[0]!
    expect(book1.title).toBe('Pride and Prejudice')
    expect(book1.authors).toContain('Jane Austen')
    expect(book1.coverUrl).toBe('https://m.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg')
    expect(book1.acquisitionLinks.length).toBe(3)
    expect(book1.supportedFormats).toContain('epub')
    expect(book1.supportedFormats).toContain('pdf')
    expect(book1.supportedFormats).toContain('html')

    const book2 = result.entries[1]!
    expect(book2.title).toContain('Frankenstein')
    expect(book2.authors).toContain('Mary Wollstonecraft Shelley')
    expect(book2.coverUrl).toBe('https://example.com/art/frankenstein.jpg')
    expect(book2.supportedFormats).toEqual(['epub'])
  })

  it('parses OPDS 2.0 JSON catalogues cleanly', () => {
    const result = parseOpdsCatalog(sampleOpds2Json, 'https://standardebooks.org/opds')
    expect(result.title).toBe('Standard Ebooks Public Catalogue')
    expect(result.searchUrl).toBe('https://standardebooks.org/opds/search?query={searchTerms}')
    expect(result.nextPageUrl).toBe('https://standardebooks.org/opds?page=2')
    expect(result.navigation.length).toBe(1)
    expect(result.navigation[0]!.title).toBe('Philosophy')

    expect(result.entries.length).toBe(1)
    const book = result.entries[0]!
    expect(book.title).toBe('The Great Gatsby')
    expect(book.authors).toContain('F. Scott Fitzgerald')
    expect(book.coverUrl).toBe('https://standardebooks.org/ebooks/the-great-gatsby/cover.jpg')
    expect(book.supportedFormats).toContain('epub')
  })

  it('accurately classifies ebook formats from MIME types and extensions', () => {
    expect(classifyEbookFormat('application/epub+zip')).toBe('epub')
    expect(classifyEbookFormat('application/x-epub', 'book.epub')).toBe('epub')
    expect(classifyEbookFormat('application/pdf')).toBe('pdf')
    expect(classifyEbookFormat('', 'document.pdf')).toBe('pdf')
    expect(classifyEbookFormat('text/html')).toBe('html')
    expect(classifyEbookFormat('text/plain')).toBe('txt')
    expect(classifyEbookFormat('application/octet-stream')).toBe('other')
  })

  it('builds templated search URLs correctly', () => {
    const template1 = 'https://example.com/search?q={searchTerms}'
    expect(buildOpdsSearchUrl(template1, 'Sherlock Holmes')).toBe('https://example.com/search?q=Sherlock%20Holmes')

    const template2 = 'https://example.com/opds/query'
    expect(buildOpdsSearchUrl(template2, 'Dune')).toBe('https://example.com/opds/query?q=Dune')
  })
})

describe('OPDS Catalogue Configuration Store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('provides default public domain OPDS catalogues', () => {
    const catalogs = getOpdsCatalogs()
    expect(catalogs.length).toBeGreaterThanOrEqual(2)
    expect(catalogs.some((c) => c.name === 'Project Gutenberg')).toBe(true)
    expect(catalogs.some((c) => c.name === 'Standard Ebooks')).toBe(true)
  })

  it('saves and removes custom OPDS catalogues', () => {
    const custom = {
      id: 'opds-open-library',
      name: 'Open Library OPDS',
      url: 'https://openlibrary.org/opds',
      isDefault: false,
    }

    saveOpdsCatalog(custom)
    const updated = getOpdsCatalogs()
    expect(updated.some((c) => c.id === 'opds-open-library')).toBe(true)

    removeOpdsCatalog('opds-open-library')
    expect(getOpdsCatalogs().some((c) => c.id === 'opds-open-library')).toBe(false)
  })
})
