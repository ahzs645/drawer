import type { Landmark } from '../types'

const FORMAT = 'drawer-landmarks'
const VERSION = 1

export interface LandmarkCatalogData {
  landmarks: Omit<Landmark, 'id'>[]
  groupOrder: string[]
}

export function serializeLandmarkCatalog(
  name: string,
  landmarks: Landmark[],
  groupOrder: string[],
): string {
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    name,
    groupOrder,
    landmarks: landmarks.map(({ id: _id, ...landmark }) => landmark),
  }, null, 2)
}

export function parseLandmarkCatalog(text: string): LandmarkCatalogData {
  const parsed = JSON.parse(text) as Record<string, unknown>
  if (parsed.format !== FORMAT || !Array.isArray(parsed.landmarks)) {
    throw new Error('Not a valid Drawer landmark catalog.')
  }
  const landmarks = parsed.landmarks.filter((value): value is Omit<Landmark, 'id'> => {
    if (!value || typeof value !== 'object') return false
    const item = value as Record<string, unknown>
    return typeof item.name === 'string' && typeof item.nx === 'number' && typeof item.ny === 'number'
  })
  const groupOrder = Array.isArray(parsed.groupOrder)
    ? parsed.groupOrder.filter((g): g is string => typeof g === 'string' && !!g.trim())
    : Array.from(new Set(landmarks.map((l) => l.group || 'Other')))
  return { landmarks, groupOrder }
}
