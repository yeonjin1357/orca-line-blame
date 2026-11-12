import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { canonicalBlobId, git } from './git'
import type { FileMatch, LocateInput } from './protocol'

/** Changed files read to compare; a tree with more is not searched by content. */
const MAX_CHANGED_FILES = 3000
/** A source file larger than this is never the open text. */
const MAX_COMPARED_BYTES = 8 * 1024 * 1024

export type Workspace = { name: string; path: string; branch: string | null }

type IndexCache = { mtimeMs: number; byBlob: Map<string, string[]> }

const indexCaches = new Map<string, IndexCache>()

/** Every tracked file by the blob git holds for it; rebuilt only when the index file changes. */
async function trackedByBlob(root: string): Promise<Map<string, string[]>> {
  const indexPath = path.resolve(root, (await git(root, ['rev-parse', '--git-path', 'index'])).trim())
  const { mtimeMs } = await stat(indexPath)
  const cached = indexCaches.get(root)
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.byBlob
  }
  const byBlob = new Map<string, string[]>()
  for (const record of (await git(root, ['ls-files', '-s', '-z'])).split('\0')) {
    const tab = record.indexOf('\t')
    if (tab < 0) {
      continue
    }
    const blob = record.slice(0, tab).split(' ')[1]
    const paths = byBlob.get(blob)
    if (paths) {
      paths.push(record.slice(tab + 1))
    } else {
      byBlob.set(blob, [record.slice(tab + 1)])
    }
  }
  indexCaches.set(root, { mtimeMs, byBlob })
  return byBlob
}

/** Files with uncommitted edits and new files: the only places an unmatched text can be. */
async function changedPaths(root: string): Promise<string[]> {
  const records = (await git(root, ['status', '--porcelain=v1', '-z', '-uall'])).split('\0')
  const paths: string[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record.length < 4) {
      continue
    }
    const status = record.slice(0, 2)
    if (!status.includes('D')) {
      paths.push(record.slice(3))
    }
    // A rename or copy is followed by the path it came from.
    if (status[0] === 'R' || status[0] === 'C') {
      i++
    }
  }
  return paths
}

/**
 * The files of `workspace` whose text is the one the frame describes. Orca gives an editor no
 * path, so the text is matched instead: against git's index when the file is unchanged, and
 * against the content of changed and new files otherwise.
 */
export async function locateIn(workspace: Workspace, input: LocateInput): Promise<FileMatch[]> {
  const toMatch = (state: FileMatch['state']) => (file: string): FileMatch => ({
    root: workspace.path,
    workspaceName: workspace.name,
    path: file,
    state
  })
  const [changed, tracked] = await Promise.all([changedPaths(workspace.path), trackedByBlob(workspace.path)])
  const changedSet = new Set(changed)
  const committed = new Set<string>()
  for (const id of input.blobIds) {
    for (const file of tracked.get(id) ?? []) {
      // The index still holds the old blob of a file edited since: it is not this text.
      if (!changedSet.has(file)) {
        committed.add(file)
      }
    }
  }
  if (committed.size > 0) {
    return [...committed].sort().map(toMatch('committed'))
  }
  if (changed.length > MAX_CHANGED_FILES) {
    return []
  }
  const matches: string[] = []
  await Promise.all(
    changed.map(async (file) => {
      try {
        const absolute = path.join(workspace.path, file)
        if ((await stat(absolute)).size > MAX_COMPARED_BYTES) {
          return
        }
        if (canonicalBlobId(await readFile(absolute)) === input.canonicalId) {
          matches.push(file)
        }
      } catch {
        // Deleted or unreadable between `git status` and now: not the open file.
      }
    })
  )
  return matches.sort().map(toMatch('changed'))
}
