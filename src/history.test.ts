import { assert, test } from 'orca/testing'
import { parseLineHistory } from './history'

const NEWEST = 'c'.repeat(40)
const MIDDLE = 'b'.repeat(40)
const OLDEST = 'a'.repeat(40)
const NUL = String.fromCharCode(0)
const UNIT = String.fromCharCode(31)

/** One commit as `git log -L` prints it with the format `history.ts` asks for. */
function logged(sha: string, parent: string, author: string, time: number, summary: string, diff: string[]): string {
  const head = [sha, parent, author, `${author.toLowerCase()}@example.com`, String(time), summary].join(UNIT)
  return `${NUL}${head}\n\n${diff.join('\n')}\n`
}

const THREE_COMMITS = [
  logged(NEWEST, MIDDLE, 'Lee', 1720000000, 'rename the file and reword the line', [
    'diff --git a/src/old.ts b/src/new.ts',
    '--- a/src/old.ts',
    '+++ b/src/new.ts',
    '@@ -3,1 +5,1 @@',
    '-const a = 1',
    '+const a = 2'
  ]),
  logged(MIDDLE, OLDEST, 'Kim', 1710000000, 'split the line in two', [
    'diff --git a/src/old.ts b/src/old.ts',
    '--- a/src/old.ts',
    '+++ b/src/old.ts',
    '@@ -2,1 +3,2 @@',
    '-const a = 0',
    '+const a = 1',
    '+const b = 1'
  ]),
  logged(OLDEST, '', 'Kim', 1700000000, 'first commit', [
    'diff --git a/src/old.ts b/src/old.ts',
    '--- /dev/null',
    '+++ b/src/old.ts',
    '@@ -0,0 +2,1 @@',
    '+const a = 0'
  ])
].join('')

test('reads the commits that changed a line, newest first, with who and when', () => {
  const entries = parseLineHistory(THREE_COMMITS)

  assert.deepEqual(
    entries.map(({ commit }) => ({ sha: commit.sha, author: commit.author, mail: commit.mail, time: commit.time, summary: commit.summary })),
    [
      { sha: NEWEST, author: 'Lee', mail: 'lee@example.com', time: 1720000000, summary: 'rename the file and reword the line' },
      { sha: MIDDLE, author: 'Kim', mail: 'kim@example.com', time: 1710000000, summary: 'split the line in two' },
      { sha: OLDEST, author: 'Kim', mail: 'kim@example.com', time: 1700000000, summary: 'first commit' }
    ]
  )
})

test("gives the line's number in each commit's own version of the file", () => {
  assert.deepEqual(
    parseLineHistory(THREE_COMMITS).map((entry) => entry.sourceLine),
    [5, 3, 2]
  )
})

test('names the file as each commit knew it, and the revision the commit changed it from', () => {
  const [newest, middle] = parseLineHistory(THREE_COMMITS).map((entry) => entry.commit)

  assert.equal(newest.path, 'src/new.ts')
  assert.deepEqual(newest.previous, { sha: MIDDLE, path: 'src/old.ts' })
  assert.equal(middle.path, 'src/old.ts')
  assert.deepEqual(middle.previous, { sha: OLDEST, path: 'src/old.ts' })
})

test('gives the commit that added the file nothing before it', () => {
  const oldest = parseLineHistory(THREE_COMMITS)[2].commit

  assert.equal(oldest.previous, null)
})

test('reads a file name that git had to quote', () => {
  const output = logged(NEWEST, MIDDLE, 'Lee', 1720000000, 'edit', [
    'diff --git "a/src/a\\tb.ts" "b/src/a\\tb.ts"',
    '--- "a/src/a\\tb.ts"',
    '+++ "b/src/a\\tb.ts"',
    '@@ -1,1 +1,1 @@',
    '-one',
    '+two'
  ])

  assert.equal(parseLineHistory(output)[0].commit.path, 'src/a\tb.ts')
})

test('reads nothing from no output', () => {
  assert.deepEqual(parseLineHistory(''), [])
})

// When one line replaced two, git follows both older lines. A commit that changed only the second
// is listed with the whole range, the untouched first line included.
test('points at the first line the commit wrote, not at an untouched line the range starts with', () => {
  const output = logged(MIDDLE, OLDEST, 'Kim', 1710000000, 'change the total only', [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -11,2 +12,2 @@',
    ' const shipping = 5',
    '-const total = 1',
    '+const total = 2'
  ])

  assert.equal(parseLineHistory(output)[0].sourceLine, 13)
})

test('points at where lines were removed, when the commit wrote none in the range', () => {
  const output = logged(MIDDLE, OLDEST, 'Kim', 1710000000, 'drop a line', [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -11,3 +11,2 @@',
    ' const shipping = 5',
    '-const unused = 0',
    ' const total = 1'
  ])

  assert.equal(parseLineHistory(output)[0].sourceLine, 12)
})
