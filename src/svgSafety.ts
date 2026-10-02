/** Restricted, self-contained SVG subset for inline rendering. No network resources. */
const NS = 'http://www.w3.org/2000/svg'
const TAGS = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'title', 'desc', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'marker', 'use'])
const CSS = new Set(['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'word-spacing', 'display', 'visibility', 'clip-path', 'vector-effect', 'paint-order'])
const LOCAL_REF = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/

function safePaint(value: string): boolean {
  // Reject escaped/obfuscated CSS and all non-fragment URL references.
  if (/[\\<>]|\/\*|javascript\s*:|data\s*:|https?\s*:|@import|expression\s*\(/i.test(value)) return false
  let remaining = value
  remaining = remaining.replace(/url\(\s*(['"]?)(#[A-Za-z_][A-Za-z0-9_.:-]*)\1\s*\)/gi, '')
  return !/url\s*\(/i.test(remaining)
}

export function sanitizeSvgElement(root: Element): void {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const el of elements) {
    if (el !== root && (!TAGS.has(el.localName) || el.namespaceURI !== NS)) {
      el.remove()
      continue
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.localName
      if (/^on/i.test(name) || ['src', 'srcset', 'base', 'tabindex'].includes(name.toLowerCase())) {
        el.removeAttributeNode(attr)
      } else if (name === 'href') {
        if (!LOCAL_REF.test(attr.value.trim())) el.removeAttributeNode(attr)
      } else if (name === 'style') {
        const style = document.createElement('span').style
        style.cssText = attr.value
        const clean: string[] = []
        for (let i = 0; i < style.length; i++) {
          const key = style.item(i)
          const value = style.getPropertyValue(key)
          if (CSS.has(key) && safePaint(value)) clean.push(`${key}:${value}`)
        }
        el.removeAttributeNode(attr)
        if (clean.length) el.setAttribute('style', clean.join(';'))
      } else if (!safePaint(attr.value) && !['xmlns', 'id', 'data-drawer-el'].includes(attr.name)) {
        el.removeAttributeNode(attr)
      }
    }
  }
}
