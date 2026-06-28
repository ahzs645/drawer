// Vector PDF export. jspdf + svg2pdf.js are heavy, so they are loaded lazily
// (dynamic import) only when the user actually exports a PDF.

function parseViewBox(svgEl: Element): { w: number; h: number } {
  const vb = (svgEl.getAttribute('viewBox') || '0 0 800 600').split(/[\s,]+/).map(Number)
  return { w: vb[2] || 800, h: vb[3] || 600 }
}

/** Render a standalone SVG string into a single-page vector PDF and download it. */
export async function svgToPdf(svgString: string, filename: string): Promise<void> {
  const [{ jsPDF }, svg2pdfMod] = await Promise.all([
    import('jspdf'),
    import('svg2pdf.js'),
  ])
  const svg2pdf =
    (svg2pdfMod as { svg2pdf?: typeof import('svg2pdf.js').svg2pdf }).svg2pdf ??
    (svg2pdfMod as unknown as { default: typeof import('svg2pdf.js').svg2pdf }).default

  const parsed = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const svgEl = parsed.documentElement as unknown as SVGSVGElement
  const { w, h } = parseViewBox(svgEl)

  // svg2pdf measures via getBBox/computed styles, so the node must be in the DOM
  svgEl.setAttribute('width', String(w))
  svgEl.setAttribute('height', String(h))
  svgEl.style.position = 'absolute'
  svgEl.style.left = '-100000px'
  svgEl.style.top = '0'
  document.body.appendChild(svgEl)
  try {
    const pdf = new jsPDF({ unit: 'pt', format: [w, h], compress: false })
    await svg2pdf(svgEl, pdf, { x: 0, y: 0, width: w, height: h })
    pdf.save(filename)
  } finally {
    document.body.removeChild(svgEl)
  }
}
