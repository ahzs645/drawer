// Lets `node --test` load the app's TypeScript modules directly (Node 22+
// strips the types); this hook adds the `.ts` the source's imports leave off.
import { register } from 'node:module'

register('./ts-resolve.mjs', import.meta.url)
