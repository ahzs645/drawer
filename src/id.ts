let counter = 0

/** Short, readable, collision-resistant id for in-document entities. */
export function uid(prefix = 'id'): string {
  counter += 1
  const rand = Math.random().toString(36).slice(2, 7)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`
}
