import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, assert, mockHost, mountWorker, test } from 'orca/testing'
import type { LocateInput } from './protocol'
import { createRepo, type TestRepo } from './test-repo'
import * as worker from './worker'

const repos: TestRepo[] = []

function repo(at?: string): TestRepo {
  const created = createRepo(at)
  repos.push(created)
  return created
}

const folders: string[] = []

/** A folder that is not a git repository. */
function folder(): string {
  const created = mkdtempSync(path.join(tmpdir(), 'line-blame-folder-'))
  folders.push(created)
  return created
}

afterEach(() => {
  for (const created of repos.splice(0)) {
    created.dispose()
  }
  for (const created of folders.splice(0)) {
    rmSync(created, { recursive: true, force: true })
  }
})

type ListedWorkspace = { name: string; root: string; branch: string | null; hostId?: string }

/** The worker as Orca runs it, with Orca listing these workspaces. */
function mount(workspaces: ListedWorkspace[]) {
  const host = mockHost({
    capabilities: ['workspace:read'],
    results: {
      'workspace.list': {
        workspaces: workspaces.map(({ name, root, branch, hostId = 'local' }, index) => ({
          id: `w${index}`,
          kind: 'worktree',
          name,
          path: root,
          branch,
          hostId
        })),
        truncated: false
      }
    }
  })
  return mountWorker(worker, { host })
}

/** What the editor frame sends for a file whose text is `text` (LF, no BOM). */
function describe(created: TestRepo, text: string, branch: string | null = 'main'): LocateInput {
  const id = created.blobId(text)
  return { context: branch === null ? null : { branch, displayName: 'Main' }, blobIds: [id], canonicalId: id }
}

function rejectsWith(code: string) {
  return (error: unknown) => (error as { code?: string }).code === code
}

test('locate finds a committed file by the blob id of its text', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\ntwo\n')
  main.write('src/other.ts', 'something else\n')
  main.commit('first')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  const { matches } = await mounted.request('locate', describe(main, 'one\ntwo\n'))

  assert.deepEqual(matches, [{ root: main.root, workspaceName: 'Main', path: 'src/a.ts', state: 'committed' }])
})

test('locate names every path when the same text is committed twice', async () => {
  const main = repo()
  main.write('src/a.ts', 'same\n')
  main.write('src/b.ts', 'same\n')
  main.commit('first')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  const { matches } = await mounted.request('locate', describe(main, 'same\n'))

  assert.deepEqual(
    matches.map((match) => match.path),
    ['src/a.ts', 'src/b.ts']
  )
})

test('locate finds a file with uncommitted edits by its text, whatever its line endings on disk', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\ntwo\n')
  main.commit('first')
  main.write('src/a.ts', 'one\r\nchanged\r\n')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  const { matches } = await mounted.request('locate', describe(main, 'one\nchanged\n'))

  assert.deepEqual(matches, [{ root: main.root, workspaceName: 'Main', path: 'src/a.ts', state: 'changed' }])
})

test('locate does not offer an edited file for the text it had when committed', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\ntwo\n')
  main.commit('first')
  main.write('src/a.ts', 'one\nchanged\n')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  const { matches } = await mounted.request('locate', describe(main, 'one\ntwo\n'))

  assert.deepEqual(matches, [])
})

test('locate finds a new file git does not track yet', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\n')
  main.commit('first')
  main.write('src/fresh.ts', 'brand new\n')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  const { matches } = await mounted.request('locate', describe(main, 'brand new\n'))

  assert.deepEqual(matches, [{ root: main.root, workspaceName: 'Main', path: 'src/fresh.ts', state: 'changed' }])
})

test('locate answers from the workspace on the focused branch before any other', async () => {
  const other = repo()
  other.write('src/a.ts', 'shared\n')
  other.commit('first')
  const focused = repo()
  focused.write('src/a.ts', 'shared\n')
  focused.commit('first')
  const mounted = await mount([
    { name: 'Other', root: other.root, branch: 'release' },
    { name: 'Focused', root: focused.root, branch: 'main' }
  ])

  const { matches } = await mounted.request('locate', describe(focused, 'shared\n', 'main'))

  assert.deepEqual(
    matches.map((match) => match.workspaceName),
    ['Focused']
  )
})

test('locate never searches a workspace on another host', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\n')
  main.commit('first')
  const mounted = await mount([{ name: 'Remote', root: main.root, branch: 'main', hostId: 'ssh-build-box' }])

  const { matches } = await mounted.request('locate', describe(main, 'one\n'))

  assert.deepEqual(matches, [])
})

test('blame answers which commit last changed each line and from which revision', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\ntwo\n')
  const first = main.commit('first')
  main.write('src/a.ts', 'one\nTWO\n')
  const second = main.commit('second')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  const blame = await mounted.request('blame', { root: main.root, path: 'src/a.ts' })

  assert.deepEqual(
    blame.lines.map((index) => blame.commits[index].sha),
    [first, second]
  )
  assert.deepEqual(blame.sourceLines, [1, 2])
  assert.deepEqual(blame.commits[blame.lines[1]].previous, { sha: first, path: 'src/a.ts' })
  assert.equal(blame.commits[blame.lines[1]].summary, 'second')
  assert.equal(blame.commits[blame.lines[1]].author, 'Tester')
})

test('detail shows what the commit did to the line, with its whole message', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\ntwo\nthree\n')
  main.commit('first')
  main.write('src/a.ts', 'one\nTWO\nthree\n')
  main.commit('second\n\nwhy it changed')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])
  const blame = await mounted.request('blame', { root: main.root, path: 'src/a.ts' })

  const detail = await mounted.request('detail', { root: main.root, commit: blame.commits[blame.lines[1]], line: 2 })

  assert.deepEqual(detail, {
    message: 'second\n\nwhy it changed',
    change: { removed: ['two'], added: ['TWO'], focus: 0, removedFocus: 0, hiddenRemoved: 0, hiddenAdded: 0, previousLine: 2 }
  })
})

test('detail shows a line of the commit that added the file as new, with nothing before it', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\ntwo\n')
  main.commit('first')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])
  const blame = await mounted.request('blame', { root: main.root, path: 'src/a.ts' })

  const { change } = await mounted.request('detail', { root: main.root, commit: blame.commits[0], line: 2 })

  assert.deepEqual(change, {
    removed: [],
    added: ['one', 'two'],
    focus: 1,
    removedFocus: null,
    hiddenRemoved: 0,
    hiddenAdded: 0,
    previousLine: null
  })
})

test('detail compares across a rename, against the file under its old name', async () => {
  const main = repo()
  main.write('src/old.ts', 'one\ntwo\nthree\nfour\nfive\n')
  main.commit('first')
  main.git('mv', 'src/old.ts', 'src/new.ts')
  main.write('src/new.ts', 'one\nTWO\nthree\nfour\nfive\n')
  main.commit('rename and edit')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])
  const blame = await mounted.request('blame', { root: main.root, path: 'src/new.ts' })

  const { change } = await mounted.request('detail', { root: main.root, commit: blame.commits[blame.lines[1]], line: 2 })

  assert.deepEqual(change?.removed, ['two'])
  assert.deepEqual(change?.added, ['TWO'])
  assert.equal(change?.previousLine, 2)
})

test('lineBlame answers who wrote a line as of an older revision', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\ntwo\n')
  main.commit('first')
  main.write('src/a.ts', 'zero\none\nTWO\n')
  const second = main.commit('second')
  main.write('src/a.ts', 'zero\none\ntwo again\n')
  main.commit('third')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])
  const blame = await mounted.request('blame', { root: main.root, path: 'src/a.ts' })
  const third = blame.commits[blame.lines[2]]

  const before = await mounted.request('lineBlame', { root: main.root, revision: third.previous!, line: 3 })

  assert.equal(before.commit.sha, second)
  assert.equal(before.commit.summary, 'second')
  assert.equal(before.sourceLine, 3)
})

test('refuses a root Orca does not list as a workspace', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\n')
  main.commit('first')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  await assert.rejects(mounted.request('blame', { root: tmpdir(), path: 'src/a.ts' }), rejectsWith('invalid_params'))
})

test('refuses a path that leaves the workspace', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\n')
  main.commit('first')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  await assert.rejects(mounted.request('blame', { root: main.root, path: '../outside.ts' }), rejectsWith('invalid_params'))
})

test('refuses a revision that is not a full commit id, so it can never be read as a git option', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\n')
  main.commit('first')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  await assert.rejects(
    mounted.request('lineBlame', { root: main.root, revision: { sha: '--output=owned', path: 'src/a.ts' }, line: 1 }),
    rejectsWith('invalid_params')
  )
})

/** A workspace that ignores its `vendor` folder, and a repository of its own cloned into `vendor/api`. */
function workspaceWithClone(): { outer: TestRepo; inner: TestRepo } {
  const outer = repo()
  outer.write('.gitignore', 'vendor\n')
  outer.write('README.md', 'outer\n')
  outer.commit('first')
  const inner = repo(path.join(outer.root, 'vendor', 'api'))
  inner.write('src/Main.java', 'class Main {}\n')
  inner.commit('first')
  return { outer, inner }
}

test('locate finds a file of a repository that sits inside a workspace, such as a clone it ignores', async () => {
  const { outer, inner } = workspaceWithClone()
  const mounted = await mount([{ name: 'Outer', root: outer.root, branch: 'main' }])

  const { matches } = await mounted.request('locate', describe(inner, 'class Main {}\n'))

  assert.deepEqual(matches, [{ root: inner.root, workspaceName: 'Outer/vendor/api', path: 'src/Main.java', state: 'committed' }])
})

test('locate finds an edited file of a repository inside the focused workspace', async () => {
  const { outer, inner } = workspaceWithClone()
  inner.write('src/Main.java', 'class Main { int edited; }\n')
  const mounted = await mount([{ name: 'Outer', root: outer.root, branch: 'main' }])

  const { matches } = await mounted.request('locate', describe(inner, 'class Main { int edited; }\n'))

  assert.deepEqual(matches, [{ root: inner.root, workspaceName: 'Outer/vendor/api', path: 'src/Main.java', state: 'changed' }])
})

test('locate answers from a repository inside the focused workspace before another workspace with the same text', async () => {
  const other = repo()
  other.write('src/Main.java', 'class Main {}\n')
  other.commit('first')
  const { outer } = workspaceWithClone()
  const mounted = await mount([
    { name: 'Other', root: other.root, branch: 'release' },
    { name: 'Focused', root: outer.root, branch: 'main' }
  ])

  const { matches } = await mounted.request('locate', describe(other, 'class Main {}\n', 'main'))

  assert.deepEqual(
    matches.map((match) => match.workspaceName),
    ['Focused/vendor/api']
  )
})

test('locate searches every workspace, however many Orca lists and whichever is focused', async () => {
  const last = repo()
  last.write('src/a.ts', 'in the last workspace\n')
  last.commit('first')
  const before = Array.from({ length: 12 }, (_, index) => {
    const created = repo()
    created.write('src/a.ts', `workspace ${index}\n`)
    created.commit('first')
    return { name: `Workspace ${index}`, root: created.root, branch: 'main' }
  })
  const mounted = await mount([...before, { name: 'Last', root: last.root, branch: 'main' }])

  const { matches } = await mounted.request('locate', describe(last, 'in the last workspace\n', null))

  assert.deepEqual(
    matches.map((match) => match.workspaceName),
    ['Last']
  )
})

test('blame reads a file of a repository inside a workspace', async () => {
  const { outer, inner } = workspaceWithClone()
  const mounted = await mount([{ name: 'Outer', root: outer.root, branch: 'main' }])

  const blame = await mounted.request('blame', { root: inner.root, path: 'src/Main.java' })

  assert.equal(blame.commits[blame.lines[0]].summary, 'first')
})

test('refuses a folder inside a workspace that is not a repository', async () => {
  const { outer } = workspaceWithClone()
  const mounted = await mount([{ name: 'Outer', root: outer.root, branch: 'main' }])

  await assert.rejects(
    mounted.request('blame', { root: path.join(outer.root, 'vendor'), path: 'api/src/Main.java' }),
    rejectsWith('invalid_params')
  )
})

test('locate says that git cannot be run, rather than that the file is not found', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\n')
  main.commit('first')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])
  const input = describe(main, 'one\n')
  // Windows names the variable Path; Node reads and writes it under either name.
  const before = process.env.PATH
  process.env.PATH = path.join(main.root, 'no-programs-here')
  try {
    await assert.rejects(mounted.request('locate', input), /git could not be run/)
  } finally {
    process.env.PATH = before
  }
})

test('locate passes over a workspace folder that is not a git repository', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\n')
  main.commit('first')
  const mounted = await mount([
    { name: 'Folder', root: folder(), branch: null },
    { name: 'Main', root: main.root, branch: 'main' }
  ])

  const found = await mounted.request('locate', describe(main, 'one\n', null))
  const missing = await mounted.request('locate', describe(main, 'in no repository\n', null))

  assert.deepEqual(
    found.matches.map((match) => match.workspaceName),
    ['Main']
  )
  assert.deepEqual(missing.matches, [])
})

// macOS keeps file names in one Unicode form and git there answers in the other; Windows and Linux
// keep a name exactly as written. Either way the path git gives must open the file.
for (const form of ['NFC', 'NFD'] as const) {
  test(`locate and blame work for a file with a Korean name written in ${form}`, async () => {
    const name = '한글 파일'.normalize(form)
    const main = repo()
    main.write(`src/${name}.ts`, 'one\n')
    main.commit('first')
    const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

    const { matches } = await mounted.request('locate', describe(main, 'one\n'))
    const blame = await mounted.request('blame', { root: main.root, path: matches[0]?.path })

    assert.deepEqual(
      matches.map((match) => match.path.normalize('NFC')),
      ['src/한글 파일.ts']
    )
    assert.equal(blame.commits[blame.lines[0]].summary, 'first')
  })
}

/** A file whose second line is rewritten twice, with commits in between that leave the line alone. */
function repoWithLineHistory(): { main: TestRepo; first: string; reworded: string; renamed: string } {
  const main = repo()
  main.write('src/old.ts', 'one\ntwo\nthree\n')
  const first = main.commit('write the file')
  main.write('src/old.ts', 'one\nTWO\nthree\n')
  const reworded = main.commit('reword line two')
  main.write('src/old.ts', 'zero\none\nTWO\nthree\n')
  main.commit('add a line above')
  main.git('mv', 'src/old.ts', 'src/new.ts')
  main.write('src/new.ts', 'zero\none\nTwo!\nthree\n')
  const renamed = main.commit('rename the file and reword line two again')
  main.write('src/new.ts', 'zero\none\nTwo!\nthree\nfour\n')
  main.commit('add a line below')
  return { main, first, reworded, renamed }
}

test('history lists the commits that changed a line, newest first, and none that only moved it', async () => {
  const { main, first, reworded, renamed } = repoWithLineHistory()
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  const { entries } = await mounted.request('history', { root: main.root, revision: { sha: renamed, path: 'src/new.ts' }, line: 3 })

  assert.deepEqual(
    entries.map((entry) => ({ sha: entry.commit.sha, summary: entry.commit.summary, line: entry.sourceLine })),
    [
      { sha: renamed, summary: 'rename the file and reword line two again', line: 3 },
      { sha: reworded, summary: 'reword line two', line: 2 },
      { sha: first, summary: 'write the file', line: 2 }
    ]
  )
})

test('history follows the line into the name the file had before, and each entry opens in detail', async () => {
  const { main, reworded, renamed } = repoWithLineHistory()
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])
  const { entries } = await mounted.request('history', { root: main.root, revision: { sha: renamed, path: 'src/new.ts' }, line: 3 })

  const newest = await mounted.request('detail', { root: main.root, commit: entries[0].commit, line: entries[0].sourceLine })
  const earlier = await mounted.request('detail', { root: main.root, commit: entries[1].commit, line: entries[1].sourceLine })
  const oldest = await mounted.request('detail', { root: main.root, commit: entries[2].commit, line: entries[2].sourceLine })

  assert.equal(entries[1].commit.sha, reworded)
  assert.equal(entries[1].commit.path, 'src/old.ts')
  assert.deepEqual([newest.change?.removed, newest.change?.added], [['TWO'], ['Two!']])
  assert.deepEqual([earlier.change?.removed, earlier.change?.added], [['two'], ['TWO']])
  assert.deepEqual(oldest.change?.removed, [])
  assert.equal(oldest.message, 'write the file')
})

test('history refuses a revision that is not a full commit id', async () => {
  const main = repo()
  main.write('src/a.ts', 'one\n')
  main.commit('first')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  await assert.rejects(
    mounted.request('history', { root: main.root, revision: { sha: 'HEAD', path: 'src/a.ts' }, line: 1 }),
    rejectsWith('invalid_params')
  )
})

test('history opens a commit that changed only the second of two lines later joined into one', async () => {
  const main = repo()
  main.write('src/a.ts', 'head\nshipping = 1\ntotal = 1\n')
  main.commit('write the file')
  main.write('src/a.ts', 'head\nshipping = 1\ntotal = 2\n')
  const totalOnly = main.commit('change the total only')
  main.write('src/a.ts', 'head\nboth = 3\n')
  const joined = main.commit('join the two lines')
  const mounted = await mount([{ name: 'Main', root: main.root, branch: 'main' }])

  const { entries } = await mounted.request('history', { root: main.root, revision: { sha: joined, path: 'src/a.ts' }, line: 2 })
  const entry = entries.find((each) => each.commit.sha === totalOnly)
  const detail = await mounted.request('detail', { root: main.root, commit: entry!.commit, line: entry!.sourceLine })

  assert.deepEqual([detail.change?.removed, detail.change?.added], [['total = 1'], ['total = 2']])
})
