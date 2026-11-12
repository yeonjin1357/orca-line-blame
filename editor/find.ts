/** One occurrence: columns `start` to `end` (exclusive) of line `line`, all from 0. */
export type Match = { line: number; start: number; end: number }

/** Every occurrence of `query` in `lines`, in reading order, never overlapping. */
export function findMatches(lines: string[], query: string, caseSensitive: boolean): Match[] {
  if (query === '') {
    return []
  }
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: Match[] = []
  for (const [line, text] of lines.entries()) {
    const haystack = caseSensitive ? text : text.toLowerCase()
    for (let start = haystack.indexOf(needle); start >= 0; start = haystack.indexOf(needle, start + needle.length)) {
      matches.push({ line, start, end: start + needle.length })
    }
  }
  return matches
}
