import { assert, test } from 'orca/testing'
import { parseBlame } from './blame'

const FIRST = 'a'.repeat(40)
const SECOND = 'b'.repeat(40)
const MOVED = 'c'.repeat(40)

function details(author: string, time: number, summary: string): string[] {
  return [
    `author ${author}`,
    `author-mail <${author.toLowerCase()}@example.com>`,
    `author-time ${time}`,
    'author-tz +0900',
    `committer ${author}`,
    `committer-mail <${author.toLowerCase()}@example.com>`,
    `committer-time ${time}`,
    'committer-tz +0900',
    `summary ${summary}`
  ]
}

/** `git blame --porcelain` of a four-line file: line 2 from a later commit, the rest from the first. */
const TWO_COMMITS = [
  `${FIRST} 1 1 1`,
  ...details('Kim', 1700000000, 'first commit'),
  'filename src/a.ts',
  '\tline one',
  `${SECOND} 5 2 1`,
  ...details('Lee', 1710000000, 'second commit'),
  `previous ${FIRST} src/old-a.ts`,
  'filename src/a.ts',
  '\tline two',
  `${FIRST} 2 3 2`,
  '\tline three',
  `${FIRST} 3 4`,
  '\tline four',
  ''
].join('\n')

test('attributes every line to its commit, reusing a commit seen before', () => {
  const blame = parseBlame(TWO_COMMITS)

  assert.deepEqual(blame.lines, [0, 1, 0, 0])
  assert.deepEqual(
    blame.commits.map(({ sha, author, mail, time, summary }) => ({ sha, author, mail, time, summary })),
    [
      { sha: FIRST, author: 'Kim', mail: 'kim@example.com', time: 1700000000, summary: 'first commit' },
      { sha: SECOND, author: 'Lee', mail: 'lee@example.com', time: 1710000000, summary: 'second commit' }
    ]
  )
})

test('records the line number each line had in its own commit', () => {
  assert.deepEqual(parseBlame(TWO_COMMITS).sourceLines, [1, 5, 2, 3])
})

test('records the revision a commit changed the file from, and none for the commit that added it', () => {
  const [first, second] = parseBlame(TWO_COMMITS).commits

  assert.equal(first.previous, null)
  assert.deepEqual(second.previous, { sha: FIRST, path: 'src/old-a.ts' })
  assert.equal(second.path, 'src/a.ts')
})

test('keeps apart the lines one commit wrote under two file names', () => {
  const blame = parseBlame(
    [
      `${MOVED} 1 1 1`,
      ...details('Park', 1720000000, 'split a file'),
      'filename src/x.ts',
      '\tfrom x',
      `${MOVED} 7 2 1`,
      'filename src/y.ts',
      '\tfrom y',
      `${MOVED} 2 3 1`,
      'filename src/x.ts',
      '\tfrom x again',
      ''
    ].join('\n')
  )

  assert.deepEqual(blame.lines, [0, 1, 0])
  assert.deepEqual(
    blame.commits.map(({ sha, path, author }) => ({ sha, path, author })),
    [
      { sha: MOVED, path: 'src/x.ts', author: 'Park' },
      { sha: MOVED, path: 'src/y.ts', author: 'Park' }
    ]
  )
})

test('reads file text that looks like a blame header as text', () => {
  const blame = parseBlame(
    [
      `${FIRST} 1 1 2`,
      ...details('Kim', 1700000000, 'first commit'),
      'filename src/a.ts',
      '\tauthor Mallory',
      `${FIRST} 2 2`,
      `\t${SECOND} 9 9 1`,
      ''
    ].join('\n')
  )

  assert.deepEqual(blame.lines, [0, 0])
  assert.equal(blame.commits.length, 1)
  assert.equal(blame.commits[0].author, 'Kim')
})

test('unquotes a file name git quoted', () => {
  const blame = parseBlame(
    [
      `${FIRST} 1 1 1`,
      ...details('Kim', 1700000000, 'first commit'),
      'filename "src/say \\"hi\\".ts"',
      '\ttext',
      ''
    ].join('\n')
  )

  assert.equal(blame.commits[0].path, 'src/say "hi".ts')
})
