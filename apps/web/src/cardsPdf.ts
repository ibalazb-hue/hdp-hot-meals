import { jsPDF } from 'jspdf'
import { toPng } from 'html-to-image'

/** A4 portrait layout: 3 rows; each row = front (left) | back (right). */
export const PDF_LAYOUT = {
  pageW: 210,
  pageH: 297,
  margin: 8,
  gutter: 6,
  rowGap: 6,
  faceW: 94,
  faceH: 88,
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
  const { pageW, margin, gutter, rowGap, faceW, faceH } = PDF_LAYOUT
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-row]'))
  // Wait until QR codes are generated (img present instead of placeholder)
  for (let i = 0; i < 100; i += 1) {
    if (!root.querySelector('.card-qr-placeholder')) break
    await new Promise((r) => setTimeout(r, 100))
  }
  await waitForImages(root)
  if (document.fonts?.ready) await document.fonts.ready

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const totalW = faceW * 2 + gutter
  const left = (pageW - totalW) / 2

  for (let i = 0; i < rows.length; i += 1) {
    const slot = i % 3
    if (i > 0 && slot === 0) pdf.addPage()
    const y = margin + slot * (faceH + rowGap)
    const front = rows[i].querySelector<HTMLElement>('.entitlement-front')
    const back = rows[i].querySelector<HTMLElement>('.entitlement-back')
    const opts = { pixelRatio: 3, backgroundColor: '#ffffff', cacheBust: false }
    if (front) pdf.addImage(await toPng(front, opts), 'PNG', left, y, faceW, faceH, undefined, 'FAST')
    if (back) pdf.addImage(await toPng(back, opts), 'PNG', left + faceW + gutter, y, faceW, faceH, undefined, 'FAST')
    // light cut guide
    pdf.setDrawColor(200)
    pdf.setLineWidth(0.1)
    pdf.rect(left, y, faceW, faceH)
    pdf.rect(left + faceW + gutter, y, faceW, faceH)
    onProgress?.(i + 1, rows.length)
  }
  pdf.save(filename)
}
