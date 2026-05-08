// ─── PDF text extraction and metadata heuristics ──────────────────────────

import type { Leitura } from '@/types'

async function getPdfJs() {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString()
  return pdfjsLib
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await getPdfJs()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const maxPages = Math.min(pdf.numPages, 3)
  const pages: string[] = []

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(text)
  }

  return pages.join('\n\n')
}

function extractYear(text: string): string | undefined {
  const match = text.match(/\b(19[5-9]\d|20[0-2]\d)\b/)
  return match ? match[1] : undefined
}

function extractTitle(lines: string[]): string {
  for (const line of lines) {
    const clean = line.trim()
    if (clean.length > 15 && clean.length < 250 && !/^https?:\/\//.test(clean) && !/^\d/.test(clean)) {
      return clean
    }
  }
  return lines[0]?.trim() ?? 'Título não identificado'
}

function extractAuthors(text: string, titleLine: string): string[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const titleIdx = lines.findIndex(l => l.includes(titleLine.slice(0, 20)))

  // Look for author pattern after title
  const candidateLines = titleIdx >= 0 ? lines.slice(titleIdx + 1, titleIdx + 5) : lines.slice(1, 5)

  for (const line of candidateLines) {
    // Matches patterns like "João Silva, Maria Souza" or "J. Silva and M. Souza"
    if (/^[A-ZÁÉÍÓÚÀÂÊÔÃ][a-záéíóú]/.test(line) && line.length < 200 && !line.includes('@')) {
      const authors = line.split(/,\s*|\s+(?:e|and|&)\s+/).map(a => a.trim()).filter(Boolean)
      if (authors.length >= 1 && authors.length <= 10) return authors
    }
  }

  return []
}

function extractSource(text: string): string | undefined {
  const journalPatterns = [
    /(?:published in|journal of|revista|in:)\s+([^.;\n]{5,80})/i,
    /([A-Z][a-zA-Z\s]+Journal[^.;\n]{0,40})/,
    /([A-Z][a-zA-Z\s]+Review[^.;\n]{0,40})/,
    /(?:Proceedings of[^.;\n]{5,80})/i,
  ]

  for (const pattern of journalPatterns) {
    const match = text.match(pattern)
    if (match) return match[1]?.trim()
  }
  return undefined
}

export async function extractPdfMetadata(buffer: ArrayBuffer): Promise<Partial<Leitura>> {
  try {
    const text = await extractPdfText(buffer)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

    const title = extractTitle(lines)
    const authors = extractAuthors(text, title)
    const year = extractYear(text)
    const source = extractSource(text)

    return { title, authors, year, source }
  } catch {
    return { title: '', authors: [], year: undefined, source: undefined }
  }
}
