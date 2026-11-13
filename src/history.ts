import { unquotePath } from './blame'
import type { HistoryEntry } from './protocol'

const NUL = String.fromCharCode(0)
const UNIT = String.fromCharCode(31)

/**
 * The `git log -L` format `parseLineHistory` reads: a NUL, then the commit's id, parents, author,
 * mail, time and subject split by unit separators. Git prints the line's diff after it.
 */
export const LINE_HISTORY_FORMAT = '--format=%x00%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s'

/** The file a `--- a/…` or `+++ b/…` row names; null for `/dev/null`, the side with no file. */
function fileNamed(row: string): string | null {
  const name = unquotePath(row.slice(4))
  return name === '/dev/null' ? null : name.slice(2)
}

/**
 * Reads `git log -L <line>,<line>:<file>` printed with `LINE_HISTORY_FORMAT`: every commit that
 * changed the line, newest first. Git follows the line as edits above move it and as the file is
 * renamed, so each commit comes with the file's name and the line's number in its own version.
 */
export function parseLineHistory(output: string): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  for (const record of output.split(NUL)) {
    const headEnd = record.indexOf('\n')
    const [sha, parents = '', author = '', mail = '', time = '', summary = ''] = (
      headEnd < 0 ? record : record.slice(0, headEnd)
    ).split(UNIT)
    let before: string | null = null
    let path: string | null = null
    // Git shows the whole range it follows, which grows to several lines where one line replaced
    // many. The line to show is the first one the commit wrote; failing that, where it removed some.
    let written = 0
    let removedAt = 0
    /** The number, in the commit's version, of the row being read; 0 before the first hunk. */
    let number = 0
    for (const row of headEnd < 0 ? [] : record.slice(headEnd + 1).split('\n')) {
      if (row.startsWith('@@ ')) {
        number = Number(/ \+(\d+)/.exec(row)?.[1] ?? 0)
      } else if (number === 0) {
        // Only before the first hunk: a changed line may itself begin with `--- ` or `+++ `.
        if (row.startsWith('--- ')) {
          before = fileNamed(row)
        } else if (row.startsWith('+++ ')) {
          path = fileNamed(row)
        }
      } else if (row.startsWith('+')) {
        written ||= number
        number++
      } else if (row.startsWith('-')) {
        removedAt ||= number
      } else if (row.startsWith(' ')) {
        number++
      }
    }
    const sourceLine = written || removedAt
    if (!/^[0-9a-f]{40}$/.test(sha) || path === null || sourceLine < 1) {
      continue
    }
    const parent = parents.split(' ')[0]
    entries.push({
      commit: {
        sha,
        author,
        mail,
        time: Number(time),
        summary,
        path,
        previous: before !== null && parent ? { sha: parent, path: before } : null
      },
      sourceLine
    })
  }
  return entries
}
