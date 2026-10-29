import { jsPDF } from 'jspdf'
import { toPng } from 'html-to-image'

/** A4 portrait layout: 3 rows; each row = front (left) | back (right). */
/** Faces are true ID-1 size (85.6 × 54 mm). Row pitch spreads 3 rows across A4. */
export const PDF_LAYOUT = {
  pageW: 210,
  pageH: 297,
  margin: 33.75,
  gutter: 10,
  rowGap: 33.75,
  faceW: 85.6,
  faceH: 54,
} as const

async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
}

/**
 * Rasterises each `[data-pdf-row]` (containing `.entitlement-front` and `.entitlement-back`)
 * and writes one multi-page A4 PDF, 3 households per page.
 */
export async function buildCardsPdf(
  root: HTMLElement,
  filename: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const { pageW, pageH, margin, gutter, rowGap, faceW, faceH } = PDF_LAYOUT
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-row]'))
  // Wait until QR codes are generated (img present instead of placeholder)
  for (let i = 0; i < 100; i += 1) {
    if (!root.querySelector('.card-qr-placeholder')) break
    await new Promise((r) => setTimeout(r, 100))
  }
  await waitForImages(root)
  if (document.fonts?.ready) await document.fonts.ready

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  void pageH
  const totalW = faceW * 2 + gutter
  const left = (pageW - totalW) / 2

  for (let i = 0; i < rows.length; i += 1) {
    const slot = i % 3
    if (i > 0 && slot === 0) pdf.addPage()
    const y = margin + slot * (faceH + rowGap)
    const front = rows[i].querySelector<HTMLElement>('.entitlement-front')
    const back = rows[i].querySelector<HTMLElement>('.entitlement-back')
    const opts = { pixelRatio: 6, backgroundColor: '#ffffff', cacheBust: false }
    if (front) pdf.addImage(await toPng(front, opts), 'PNG', left, y, faceW, faceH, undefined, 'FAST')
    if (back) pdf.addImage(await toPng(back, opts), 'PNG', left + faceW + gutter, y, faceW, faceH, undefined, 'FAST')
    // light cut guides (corner ticks) around each face
    pdf.setDrawColor(170)
    pdf.setLineWidth(0.1)
    for (const x of [left, left + faceW + gutter]) cutMarks(pdf, x, y, faceW, faceH)
    onProgress?.(i + 1, rows.length)
  }
  pdf.save(filename)
}

function cutMarks(pdf: jsPDF, x: number, y: number, w: number, h: number) {
  const k = 3
  const o = 1
  for (const [cx, cy, dx, dy] of [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ] as const) {
    pdf.line(cx + dx * o, cy, cx + dx * (o + k), cy)
    pdf.line(cx, cy + dy * o, cx, cy + dy * (o + k))
  }
}
