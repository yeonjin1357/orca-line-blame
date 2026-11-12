import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { canonicalBlobId, git } from './git'
import type { FileMatch, LocateInput } from './protocol'

/** Changed files read to compare; a tree with more is not searched by content. */
const MAX_CHANGED_FILES = 3000
/** A source file larger than this is never the open text. */
const MAX_COMPARED_BYTES = 8 * 1024 * 1024

/** A git repository to search: a workspace, or a repository inside one. `name` is shown to the user. */
export type Repository = { root: string; name: string }

type IndexCache = { indexPath: string; mtimeMs: number; byBlob: Map<string, string[]> }

const indexCaches = new Map<string, IndexCache>()

/** Every tracked file by the blob git holds for it; rebuilt only when the index file changes. */
async function trackedByBlob(root: string): Promise<Map<string, string[]>> {
  const cached = indexCaches.get(root)
  // Asking git where the index is costs a process: once per repository is enough.
  const indexPath = cached?.indexPath ?? path.resolve(root, (await git(root, ['rev-parse', '--git-path', 'index'])).trim())
  const { mtimeMs } = await stat(indexPath)
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
  indexCaches.set(root, { indexPath, mtimeMs, byBlob })
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

/** The files among `files` whose content on disk is the text the frame describes. */
async function withThisText(root: string, files: string[], input: LocateInput): Promise<string[]> {
  const same = await Promise.all(
    files.map(async (file) => {
      try {
        const absolute = path.join(root, file)
        return (await stat(absolute)).size <= MAX_COMPARED_BYTES && canonicalBlobId(await readFile(absolute)) === input.canonicalId
      } catch {
        // Deleted or unreadable since git listed it: not the open file.
        return false
      }
    })
  )
  return files.filter((_, index) => same[index]).sort()
}

function matchesIn(repository: Repository, files: string[], state: FileMatch['state']): FileMatch[] {
  return files.map((file) => ({ root: repository.root, workspaceName: repository.name, path: file, state }))
}

/**
 * The unchanged files of `repository` whose text is the one the frame describes. Orca gives an
 * editor no path, so the text is matched instead, here against the blobs in git's index. This is
 * the cheap search: no `git status`, so it can run over every repository.
 */
export async function locateCommitted(repository: Repository, input: LocateInput): Promise<FileMatch[]> {
  const tracked = await trackedByBlob(repository.root)
  const candidates = [...new Set(input.blobIds.flatMap((id) => tracked.get(id) ?? []))]
  // The index still holds the old blob of a file edited since: on disk it is no longer this text.
  return matchesIn(repository, await withThisText(repository.root, candidates, input), 'committed')
}

/** The edited and new files of `repository` whose text is the one the frame describes. */
export async function locateChanged(repository: Repository, input: LocateInput): Promise<FileMatch[]> {
  const changed = await changedPaths(repository.root)
  if (changed.length > MAX_CHANGED_FILES) {
    return []
  }
  return matchesIn(repository, await withThisText(repository.root, changed, input), 'changed')
}
