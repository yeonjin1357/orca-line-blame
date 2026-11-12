import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

/** How far below a workspace root a repository is looked for: `a/.git` and `a/b/.git`. */
const MAX_DEPTH = 2
/** Folders near the root that are opened to look for repositories; past this the scan stops. */
const MAX_FOLDERS = 2000
/** Clones come and go rarely: one scan of a workspace is reused for this long. */
const REUSE_MS = 60_000

const scans = new Map<string, { at: number; found: Promise<string[]> }>()

async function isRepository(folder: string): Promise<boolean> {
  try {
    // A folder for a clone, a file for a submodule or a worktree.
    await stat(path.join(folder, '.git'))
    return true
  } catch {
    return false
  }
}

async function scan(root: string): Promise<string[]> {
  const found: string[] = []
  let opened = 0
  let level = [root]
  for (let depth = 1; depth <= MAX_DEPTH && level.length > 0; depth++) {
    const children: string[] = []
    for (const folder of level) {
      if (opened++ >= MAX_FOLDERS) {
        return found
      }
      const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        // Dependencies and hidden folders hold no project of the user's; links could loop.
        if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          children.push(path.join(folder, entry.name))
        }
      }
    }
    const repositories = await Promise.all(children.map(isRepository))
    found.push(...children.filter((_, index) => repositories[index]))
    // A repository's own folders belong to it: nothing inside is looked at.
    level = children.filter((_, index) => !repositories[index])
  }
  return found.sort()
}

/**
 * Git repositories that sit inside a workspace without being part of it: a clone the workspace
 * ignores, a submodule. Git lists none of their files for the workspace, so each is searched as a
 * repository of its own. Only the first two levels of folders are looked at.
 */
export function nestedRepositories(root: string): Promise<string[]> {
  const known = scans.get(root)
  if (known && Date.now() - known.at < REUSE_MS) {
    return known.found
  }
  const found = scan(root)
  scans.set(root, { at: Date.now(), found })
  return found
}
