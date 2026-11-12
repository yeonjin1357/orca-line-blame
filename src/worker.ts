import path from 'node:path'
import type { OrcaWorkerApi } from 'orca/worker'
import { parseBlame } from './blame'
import { lineChange, parseHunks } from './change'
import { git } from './git'
import { locateIn, type Workspace } from './locate'
import type { FileRevision } from './protocol'

/** Workspaces searched after the focused one, so an odd setup cannot stall a file open. */
const MAX_OTHER_WORKSPACES = 8
/** `hostId` of workspaces on this machine; any other is on a host git here cannot reach. */
const LOCAL_HOST_IDS: readonly (string | null)[] = [null, 'local']
/** The tree with no files: diffing from it shows a commit's first version of a file as all new. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

function invalid(message: string): Error {
  return Object.assign(new Error(message), { code: 'invalid_params' })
}

/** A request names commits by full id only: anything else could be read by git as an option. */
function commitId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw invalid('a commit must be named by its full id')
  }
  return value
}

function insidePath(value: unknown): string {
  if (typeof value !== 'string' || value === '' || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    throw invalid('path must stay inside the workspace')
  }
  return value
}

function lineNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw invalid('line must be a whole number from 1')
  }
  return value
}

function revision(value: FileRevision): FileRevision {
  return { sha: commitId(value?.sha), path: insidePath(value?.path) }
}

function shortBranch(branch: string | null | undefined): string {
  return (branch ?? '').replace(/^refs\/heads\//, '')
}

export default function activate(orca: OrcaWorkerApi) {
  async function workspaces(): Promise<Workspace[]> {
    const { workspaces: all } = await orca.host.call('workspace.list')
    return all
      .filter((workspace) => LOCAL_HOST_IDS.includes(workspace.hostId) && path.isAbsolute(workspace.path))
      .map(({ name, path: root, branch }) => ({ name, path: root, branch }))
  }

  /** Requests name a workspace root; only roots Orca itself lists are ever handed to git. */
  async function knownRoot(root: unknown): Promise<string> {
    const match = (await workspaces()).find((workspace) => workspace.path === root)
    if (!match) {
      throw invalid('not a workspace Orca lists')
    }
    return match.path
  }

  orca.panels.handle('locate', async (input) => {
    const all = await workspaces()
    const branch = shortBranch(input.context?.branch)
    const focused = all.filter((workspace) => input.context !== null && shortBranch(workspace.branch) === branch)
    const others = all.filter((workspace) => !focused.includes(workspace)).slice(0, MAX_OTHER_WORKSPACES)
    for (const workspace of [...focused, ...others]) {
      try {
        const matches = await locateIn(workspace, input)
        if (matches.length > 0) {
          return { matches }
        }
      } catch (error) {
        // A folder workspace that is not a git repository: skip it.
        orca.log(`locate skipped ${workspace.path}: ${(error as Error).message}`)
      }
    }
    return { matches: [] }
  })

  orca.panels.handle('blame', async (input) => {
    const root = await knownRoot(input.root)
    return parseBlame(await git(root, ['blame', '--porcelain', '--', insidePath(input.path)]))
  })

  orca.panels.handle('detail', async (input) => {
    const root = await knownRoot(input.root)
    const sha = commitId(input.commit?.sha)
    const file = insidePath(input.commit?.path)
    const line = lineNumber(input.line)
    const previous = input.commit.previous ? revision(input.commit.previous) : null
    const [message, diff] = await Promise.all([
      git(root, ['show', '-s', '--format=%B', sha]),
      previous
        ? git(root, ['diff', '-U0', '-M', previous.sha, sha, '--', previous.path, file])
        : git(root, ['diff', '-U0', EMPTY_TREE, sha, '--', file])
    ])
    return { message: message.trim(), change: lineChange(parseHunks(diff), line) }
  })

  orca.panels.handle('lineBlame', async (input) => {
    const root = await knownRoot(input.root)
    const { sha, path: file } = revision(input.revision)
    const line = lineNumber(input.line)
    const blame = parseBlame(await git(root, ['blame', '--porcelain', '-L', `${line},${line}`, sha, '--', file]))
    const commit = blame.commits[blame.lines[line - 1]]
    if (!commit) {
      throw invalid('that revision has no such line')
    }
    return { commit, sourceLine: blame.sourceLines[line - 1] }
  })
}
