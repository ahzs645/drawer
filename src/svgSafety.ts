/** Restricted, self-contained SVG subset for inline rendering. No network resources. */
const NS = 'http://www.w3.org/2000/svg'
const TAGS = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'title', 'desc', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'marker', 'use', 'image'])
const CSS = new Set(['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'word-spacing', 'display', 'visibility', 'clip-path', 'vector-effect', 'paint-order'])
const LOCAL_REF = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/
/** An embedded raster (Drawer's own PNG/JPEG/WebP import); never a network or SVG URL. */
const RASTER_DATA = /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/

function safePaint(value: string): boolean {
  // Reject escaped/obfuscated CSS and all non-fragment URL references.
  if (/[\\<>]|\/\*|javascript\s*:|data\s*:|https?\s*:|@import|expression\s*\(/i.test(value)) return false
  let remaining = value
  remaining = remaining.replace(/url\(\s*(['"]?)(#[A-Za-z_][A-Za-z0-9_.:-]*)\1\s*\)/gi, '')
  return !/url\s*\(/i.test(remaining)
}

/**
 * Illustrator, Inkscape and most design tools style artwork through a <style>
 * sheet of class rules (`.cls-1 { fill: #fff }`). <style> itself is never kept,
 * so first copy each simple rule onto the elements it matches as an inline
 * style (which the per-property filter below then checks). Only compound
 * selectors are applied — `tag`, `.class`, `#id` and combinations, in comma
 * lists; anything more complex is ignored. Later rules win, and an element's
 * own style attribute wins over the sheet.
 */
function inlineStyleSheets(root: Element): void {
  const sheets = Array.from(root.querySelectorAll('style'))
  if (!sheets.length) return
  const applied = new Map<Element, string[]>()
  for (const sheet of sheets) {
    const css = (sheet.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const rule of css.split('}')) {
      const brace = rule.indexOf('{')
      if (brace < 0) continue
      const declarations = rule.slice(brace + 1).trim()
      if (!declarations || /[<>\\]|@import/i.test(declarations)) continue
      for (const raw of rule.slice(0, brace).split(',')) {
        const selector = raw.trim()
        if (!/^(?:[A-Za-z][\w-]*)?(?:[.#][A-Za-z_][\w-]*)*$/.test(selector) || !selector) continue
        let matches: Element[] = []
        try {
          matches = Array.from(root.querySelectorAll(selector))
        } catch {
          continue
        }
        for (const el of matches) applied.set(el, [...(applied.get(el) ?? []), declarations])
      }
    }
  }
  for (const [el, declarations] of applied) {
    const own = el.getAttribute('style')
    el.setAttribute('style', [...declarations, own ?? ''].filter(Boolean).join(';'))
  }
}

export function sanitizeSvgElement(root: Element): void {
  inlineStyleSheets(root)
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
        const value = attr.value.trim()
        if (!LOCAL_REF.test(value) && !(el.localName === 'image' && RASTER_DATA.test(value))) el.removeAttributeNode(attr)
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
