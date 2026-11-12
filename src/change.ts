import type { LineChange } from './protocol'

/** One change of a `git diff -U0`: `oldLines` at `oldStart` became `newLines` at `newStart`. */
export type Hunk = { oldStart: number; oldLines: string[]; newStart: number; newLines: string[] }

/** A removed line: line `index` of `hunk.oldLines`. */
type Removed = { hunk: Hunk; index: number }

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
/** A diff that removed more lines than this is searched by position only. */
const MAX_COMPARED_LINES = 2000
/** How alike a removed line of the same hunk must be to count as the line's earlier form. */
const MIN_LIKENESS_NEARBY = 0.3
/** The same for a line removed elsewhere in the file: a move keeps most of the line. */
const MIN_LIKENESS_MOVED = 0.6

/**
 * Reads the hunks of a `git diff -U0`. Each header says how many lines follow on each side, and
 * exactly that many are taken: a removed line whose text starts with `--` would otherwise read
 * as a file header.
 */
export function parseHunks(diff: string): Hunk[] {
  const rows = diff.split('\n')
  const hunks: Hunk[] = []
  for (let index = 0; index < rows.length; index++) {
    const header = HUNK_HEADER.exec(rows[index])
    if (!header) {
      continue
    }
    const hunk: Hunk = { oldStart: Number(header[1]), oldLines: [], newStart: Number(header[3]), newLines: [] }
    const oldCount = Number(header[2] ?? 1)
    const newCount = Number(header[4] ?? 1)
    while (hunk.oldLines.length < oldCount || hunk.newLines.length < newCount) {
      const row = rows[++index]
      if (row === undefined) {
        break
      }
      if (row.startsWith('-') && hunk.oldLines.length < oldCount) {
        hunk.oldLines.push(row.slice(1))
      } else if (row.startsWith('+') && hunk.newLines.length < newCount) {
        hunk.newLines.push(row.slice(1))
      }
      // Anything else is the "\ No newline at end of file" marker.
    }
    hunks.push(hunk)
  }
  return hunks
}

function pairsOf(text: string): Map<string, number> {
  const pairs = new Map<string, number>()
  for (let index = 0; index < text.length - 1; index++) {
    const pair = text.slice(index, index + 2)
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
  }
  return pairs
}

/** How alike two lines are, from 0 to 1: the share of character pairs they have in common. */
function likeness(left: string, right: string): number {
  const leftPairs = pairsOf(left.trim())
  const rightPairs = pairsOf(right.trim())
  let shared = 0
  let total = 0
  for (const [pair, count] of leftPairs) {
    shared += Math.min(count, rightPairs.get(pair) ?? 0)
    total += count
  }
  for (const count of rightPairs.values()) {
    total += count
  }
  return total === 0 ? 0 : (2 * shared) / total
}

/**
 * The removed line that the added line at `offset` of `hunk` most likely replaced, or null when
 * the commit wrote the line new. A diff never pairs its lines, so this is a judgement:
 * the removed line most like it wins (anywhere in the file, since a commit may move a line while
 * editing it); failing that, the removed line at the same position of the hunk, which is how a
 * rewritten line shows up; and a line past the end of the hunk's removed lines is an addition.
 */
function replaced(hunks: Hunk[], hunk: Hunk, offset: number): Removed | null {
  const asked = hunk.newLines[offset]
  let best: Removed | null = offset < hunk.oldLines.length ? { hunk, index: offset } : null
  let bestLikeness = 0
  const consider = (candidate: Hunk, minimum: number): void => {
    for (const [index, text] of candidate.oldLines.entries()) {
      const score = likeness(asked, text)
      if (score >= minimum && score > bestLikeness) {
        best = { hunk: candidate, index }
        bestLikeness = score
      }
    }
  }
  consider(hunk, MIN_LIKENESS_NEARBY)
  const removedInAll = hunks.reduce((total, each) => total + each.oldLines.length, 0)
  if (removedInAll <= MAX_COMPARED_LINES) {
    for (const other of hunks) {
      if (other !== hunk) {
        consider(other, MIN_LIKENESS_MOVED)
      }
    }
  }
  return best
}

function windowAround<T>(items: T[], center: number, context: number): { start: number; shown: T[] } {
  const start = Math.max(0, center - context)
  return { start, shown: items.slice(start, center + context + 1) }
}

/**
 * What the diff did to line `line` (from 1) of its new side: the added lines of its hunk within
 * `context` of it, the removed lines around the one it replaced, and where that one was on the
 * old side. Null when no hunk added the line.
 */
export function lineChange(hunks: Hunk[], line: number, context = 2): LineChange | null {
  const hunk = hunks.find(({ newStart, newLines }) => line >= newStart && line < newStart + newLines.length)
  if (!hunk) {
    return null
  }
  const offset = line - hunk.newStart
  const added = windowAround(hunk.newLines, offset, context)
  const before = replaced(hunks, hunk, offset)
  const removed = before ? windowAround(before.hunk.oldLines, before.index, context) : { start: 0, shown: [] }
  return {
    removed: removed.shown,
    added: added.shown,
    focus: offset - added.start,
    removedFocus: before ? before.index - removed.start : null,
    hiddenRemoved: (before?.hunk.oldLines.length ?? 0) - removed.shown.length,
    hiddenAdded: hunk.newLines.length - added.shown.length,
    previousLine: before ? before.hunk.oldStart + before.index : null
  }
}
