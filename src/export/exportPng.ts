/** Rasterize an SVG string to a PNG Blob at the requested pixel scale. */
export function svgToPng(svgString: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const vb = svgString.match(/viewBox="([\d.\-\s]+)"/)
    let w = 1024
    let h = 1024
    if (vb) {
      const [, , vw, vh] = vb[1].split(/\s+/).map(Number)
      if (vw && vh) {
        w = vw
        h = vh
      }
    }
    // cap the longest side so a pathological viewBox can't allocate gigabytes
    const MAX_DIM = 8000
    const longest = Math.max(w, h) * scale
    const eff = longest > MAX_DIM ? (MAX_DIM / Math.max(w, h)) : scale

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w * eff))
      canvas.height = Math.max(1, Math.round(h * eff))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Could not get 2D context'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('PNG encoding failed'))
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to render SVG to image'))
    }
    img.src = url
  })
}
