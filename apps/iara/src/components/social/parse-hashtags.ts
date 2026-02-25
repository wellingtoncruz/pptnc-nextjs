export function parseHashtags(text: string): string[] {
  const raw = text.split(/[\s,]+/).filter(Boolean)
  const withHash = raw.map(s => (s.startsWith('#') ? s : `#${s}`))
  // Dedup case-insensitive, keep first occurrence
  const seen = new Set<string>()
  return withHash.filter(h => {
    const lower = h.toLowerCase()
    if (seen.has(lower)) return false
    seen.add(lower)
    return true
  })
}
