import path from 'node:path'
import type { OrcaWorkerApi } from 'orca/worker'
import { parseBlame } from './blame'
import { lineChange, parseHunks } from './change'
import { git, type GitFailure } from './git'
import { LINE_HISTORY_FORMAT, parseLineHistory } from './history'
import { locateChanged, locateCommitted, type Repository } from './locate'
import type { FileMatch, FileRevision, LocateInput } from './protocol'
import { nestedRepositories } from './repositories'

/** Repositories beyond the focused workspace searched for an edited or new file: that takes a slow `git status` each. */
const MAX_OTHER_REPOSITORIES_FOR_CHANGES = 8
/** Repositories searched at the same time. */
const SEARCHED_AT_ONCE = 8
/** Commits listed for one line: more would no longer be a list to look over. */
const MAX_HISTORY = 200
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

type Workspace = { name: string; path: string; branch: string | null }
type Search = (repository: Repository, input: LocateInput) => Promise<FileMatch[]>

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

  /** Each workspace followed by the repositories found inside it, none twice. */
  async function repositoriesOf(list: Workspace[]): Promise<Repository[]> {
    const groups = await Promise.all(
      list.map(async (workspace) => {
        const nested = await nestedRepositories(workspace.path).catch((): string[] => [])
        const inside = (root: string) => path.relative(workspace.path, root).split(path.sep).join('/')
        return [
          { root: workspace.path, name: workspace.name },
          ...nested.map((root) => ({ root, name: `${workspace.name}/${inside(root)}` }))
        ]
      })
    )
    const seen = new Set<string>()
    return groups.flat().filter(({ root }) => {
      const key = path.resolve(root)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  /** Requests name a repository; only workspaces Orca lists, and repositories inside them, are ever handed to git. */
  async function knownRoot(root: unknown): Promise<string> {
    const known = typeof root === 'string' ? await repositoriesOf(await workspaces()) : []
    const match = known.find((repository) => path.resolve(repository.root) === path.resolve(root as string))
    if (!match) {
      throw invalid('not a workspace Orca lists, nor a repository inside one')
    }
    return match.root
  }

  /**
   * The matches of the first repository, in order, that has any; several repositories are searched
   * at once. A repository that could not be searched has no match and is noted in `failures`.
   */
  async function firstMatches(
    repositories: Repository[],
    search: Search,
    input: LocateInput,
    failures: Error[]
  ): Promise<FileMatch[]> {
    for (let start = 0; start < repositories.length; start += SEARCHED_AT_ONCE) {
      const found = await Promise.all(
        repositories.slice(start, start + SEARCHED_AT_ONCE).map((repository) =>
          search(repository, input).catch((error: Partial<GitFailure>): FileMatch[] => {
            // A folder workspace is no repository: that is ordinary, not a failure.
            if (error.reason !== 'not-a-repository') {
              const where = error.reason === 'git-missing' ? '' : ` (in ${repository.name})`
              failures.push(new Error(`${error.message}${where}`))
            }
            return []
          })
        )
      )
      const matches = found.find((each) => each.length > 0)
      if (matches) {
        return matches
      }
    }
    return []
  }

  orca.panels.handle('locate', async (input) => {
    const all = await workspaces()
    const branch = shortBranch(input.context?.branch)
    const focused = await repositoriesOf(
      all.filter((workspace) => input.context !== null && shortBranch(workspace.branch) === branch)
    )
    const others = (await repositoriesOf(all)).filter((repository) => !focused.some((each) => each.root === repository.root))
    // The focused workspace first. Elsewhere, an unchanged file is found through git's index, which is
    // cheap enough for every repository; an edited or new one needs `git status`, so only a few are asked.
    const searches: [Repository[], Search][] = [
      [focused, locateCommitted],
      [focused, locateChanged],
      [others, locateCommitted],
      [others.slice(0, MAX_OTHER_REPOSITORIES_FOR_CHANGES), locateChanged]
    ]
    const failures: Error[] = []
    for (const [repositories, search] of searches) {
      const matches = await firstMatches(repositories, search, input, failures)
      if (matches.length > 0) {
        return { matches }
      }
    }
    orca.log(`locate: no file with this text in ${focused.length + others.length} repositories`)
    // "Not found" would hide the real trouble when git is missing or refused to read a repository.
    if (failures.length > 0) {
      throw failures[0]
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

  orca.panels.handle('history', async (input) => {
    const root = await knownRoot(input.root)
    const { sha, path: file } = revision(input.revision)
    const line = lineNumber(input.line)
    const log = await git(root, ['log', `--max-count=${MAX_HISTORY}`, LINE_HISTORY_FORMAT, '-L', `${line},${line}:${file}`, sha])
    return { entries: parseLineHistory(log) }
  })
}
