// Extract text lines from a PDF in the browser. pdf.js is loaded on demand so
// people who only import CSVs never download it.

export class PdfTextError extends Error {}

interface PositionedText {
  str: string
  transform: number[]
  width: number
}

export async function extractPdfLines(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  let doc
  try {
    doc = await task.promise
  } catch (e) {
    if (e instanceof Error && e.name === 'PasswordException') {
      throw new PdfTextError('This PDF is password-protected. Save an unlocked copy and try again.')
    }
    throw new PdfTextError('This file could not be opened as a PDF.')
  }

  const lines: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    lines.push(
      ...itemsToLines(content.items.flatMap((i) => ('str' in i ? [{ str: i.str, transform: i.transform, width: i.width }] : []))),
    )
  }
  await task.destroy()

  if (!lines.some((l) => l.trim())) {
    throw new PdfTextError('This PDF has no text in it (it is probably a scanned image). Download a CSV from your bank instead.')
  }
  return lines
}

/** Group positioned text into lines (same baseline), left to right. */
export function itemsToLines(items: PositionedText[]): string[] {
  const rows: { y: number; parts: { x: number; end: number; str: string }[] }[] = []
  for (const item of items) {
    if (!item.str.trim()) continue
    const x = item.transform[4]
    const y = item.transform[5]
    let row = rows.find((r) => Math.abs(r.y - y) < 3)
    if (!row) rows.push((row = { y, parts: [] }))
    row.parts.push({ x, end: x + item.width, str: item.str })
  }
  // PDF y grows upward, so higher y comes first on the page.
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x)
    let line = ''
    let lastEnd = -Infinity
    for (const p of r.parts) {
      // Keep separate words apart, but don't split text pdf.js broke mid-word.
      line += line && p.x - lastEnd > 1 ? ` ${p.str}` : p.str
      lastEnd = p.end
    }
    return line.trim()
  })
}
