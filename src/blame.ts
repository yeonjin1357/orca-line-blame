import type { BlameCommit, BlameOutput, FileRevision } from './protocol'

type CommitDetails = Omit<BlameCommit, 'path'>

/** Undoes git's quoting of a path with characters it will not print bare. */
function unquotePath(text: string): string {
  if (!text.startsWith('"') || !text.endsWith('"')) {
    return text
  }
  const escapes: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\' }
  return text.slice(1, -1).replace(/\\(.)/g, (_, char: string) => escapes[char] ?? char)
}

function parseRevision(text: string): FileRevision {
  const space = text.indexOf(' ')
  return { sha: text.slice(0, space), path: unquotePath(text.slice(space + 1)) }
}

/**
 * Reads `git blame --porcelain`. Git prints a commit's details once, and its `filename` again
 * only when that commit's lines come from more than one path, so a group without one keeps the
 * path last seen for its commit.
 */
export function parseBlame(porcelain: string): BlameOutput {
  const commits: BlameCommit[] = []
  const lines: number[] = []
  const sourceLines: number[] = []
  const detailsBySha = new Map<string, CommitDetails>()
  const pathBySha = new Map<string, string>()
  const indexByShaAndPath = new Map<string, number>()
  let details: CommitDetails | null = null
  let sourceLine = 0
  let finalLine = 0

  for (const row of porcelain.split('\n')) {
    if (row.startsWith('\t')) {
      if (!details) {
        continue
      }
      const path = pathBySha.get(details.sha) ?? ''
      const key = `${details.sha}\n${path}`
      let index = indexByShaAndPath.get(key)
      if (index === undefined) {
        index = commits.push({ ...details, path }) - 1
        indexByShaAndPath.set(key, index)
      }
      lines[finalLine - 1] = index
      sourceLines[finalLine - 1] = sourceLine
      continue
    }
    const header = /^([0-9a-f]{40}) (\d+) (\d+)/.exec(row)
    if (header) {
      sourceLine = Number(header[2])
      finalLine = Number(header[3])
      details = detailsBySha.get(header[1]) ?? null
      if (!details) {
        details = { sha: header[1], author: '', mail: '', time: 0, summary: '', previous: null }
        detailsBySha.set(header[1], details)
      }
      continue
    }
    if (!details) {
      continue
    }
    if (row.startsWith('author ')) {
      details.author = row.slice(7)
    } else if (row.startsWith('author-mail ')) {
      details.mail = row.slice(12).replace(/^<|>$/g, '')
    } else if (row.startsWith('author-time ')) {
      details.time = Number(row.slice(12))
    } else if (row.startsWith('summary ')) {
      details.summary = row.slice(8)
    } else if (row.startsWith('previous ')) {
      details.previous = parseRevision(row.slice(9))
    } else if (row.startsWith('filename ')) {
      pathBySha.set(details.sha, unquotePath(row.slice(9)))
    }
  }
  return { commits, lines, sourceLines }
}
