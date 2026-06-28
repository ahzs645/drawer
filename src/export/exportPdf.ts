// Vector PDF export. jspdf + svg2pdf.js are heavy, so they are loaded lazily
// (dynamic import) only when the user actually exports a PDF.

import type { jsPDF as JsPDF } from 'jspdf'

function parseViewBox(svgEl: Element): { w: number; h: number } {
  const vb = (svgEl.getAttribute('viewBox') || '0 0 800 600').split(/[\s,]+/).map(Number)
  return { w: vb[2] || 800, h: vb[3] || 600 }
}

/** Mount an SVG string offscreen (svg2pdf needs it in the DOM to measure). */
function mountSvg(svgString: string): { el: SVGSVGElement; w: number; h: number } {
  const parsed = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const el = parsed.documentElement as unknown as SVGSVGElement
  const { w, h } = parseViewBox(el)
  el.setAttribute('width', String(w))
  el.setAttribute('height', String(h))
  el.style.position = 'absolute'
  el.style.left = '-100000px'
  el.style.top = '0'
  document.body.appendChild(el)
  return { el, w, h }
}

type Svg2Pdf = (
  el: Element,
  pdf: JsPDF,
  opts: { x: number; y: number; width: number; height: number },
) => Promise<JsPDF>

async function loadLibs(): Promise<{ jsPDF: typeof JsPDF; svg2pdf: Svg2Pdf }> {
  const [{ jsPDF }, svg2pdfMod] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const svg2pdf =
    (svg2pdfMod as { svg2pdf?: Svg2Pdf }).svg2pdf ??
    (svg2pdfMod as unknown as { default: Svg2Pdf }).default
  return { jsPDF, svg2pdf }
}

/** Render one SVG string per page into a vector PDF and download it. */
export async function svgsToPdf(svgStrings: string[], filename: string): Promise<void> {
  if (!svgStrings.length) return
  const { jsPDF, svg2pdf } = await loadLibs()
  let pdf: JsPDF | null = null
  for (let i = 0; i < svgStrings.length; i++) {
    const { el, w, h } = mountSvg(svgStrings[i])
    try {
      if (i === 0) {
        pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: w >= h ? 'l' : 'p', compress: false })
      } else {
        pdf!.addPage([w, h], w >= h ? 'l' : 'p')
      }
      await svg2pdf(el, pdf!, { x: 0, y: 0, width: w, height: h })
    } finally {
      document.body.removeChild(el)
    }
  }
  pdf!.save(filename)
}

/** Render a single standalone SVG string into a one-page vector PDF. */
export function svgToPdf(svgString: string, filename: string): Promise<void> {
  return svgsToPdf([svgString], filename)
}
