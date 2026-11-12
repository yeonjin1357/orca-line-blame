import { tmpdir } from 'node:os'
import { afterEach, assert, mockHost, mountWorker, test } from 'orca/testing'
import type { LocateInput } from './protocol'
import { createRepo, type TestRepo } from './test-repo'
import * as worker from './worker'

const repos: TestRepo[] = []

function repo(): TestRepo {
  const created = createRepo()
  repos.push(created)
  return created
}

afterEach(() => {
  for (const created of repos.splice(0)) {
    created.dispose()
  }
})

type ListedWorkspace = { name: string; root: string; branch: string; hostId?: string }

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
