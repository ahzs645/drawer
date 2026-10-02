#!/usr/bin/env node
/** Keep the bundled template literal identical to the editable base SVG. */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(resolve(root, 'public/samples/foot_arteries_base.svg'), 'utf8')
const out = resolve(root, 'src/templates/footArteriesArtwork.ts')
const source = `// Generated from public/samples/foot_arteries_base.svg; run node scripts/sync-foot-artwork.mjs after editing.\nexport const FOOT_ARTERIES_SVG = ${JSON.stringify(svg)}\n`
if (process.argv.includes('--check')) {
  const current = readFileSync(out, 'utf8')
  // Check the actual literal rather than requiring an identical header comment.
  const match = current.match(/export const FOOT_ARTERIES_SVG = (".*")\s*;?\s*$/s)
  if (!match || JSON.parse(match[1]) !== svg) { console.error('Foot SVG and template literal differ.'); process.exit(1) }
  console.log('Foot SVG and bundled template are synchronized.')
} else {
  writeFileSync(out, source)
  console.log(`Updated ${out}`)
}
