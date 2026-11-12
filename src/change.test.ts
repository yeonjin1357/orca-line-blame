import { assert, test } from 'orca/testing'
import { lineChange, parseHunks } from './change'

/** `git diff -U0` of one file: an insertion, a one-line edit, a deletion and an uneven edit. */
const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index aa25e43..4de597f 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -7,0 +8,2 @@ function before() {',
  '+added one',
  '+added two',
  '@@ -15 +17 @@ const context = 1',
  '-old fifteen',
  '+new seventeen',
  '@@ -46 +50,0 @@ const context = 2',
  '-deleted line',
  '@@ -60,3 +63,2 @@',
  '-r1',
  '-r2',
  '-r3',
  '+a1',
  '+a2',
  '\\ No newline at end of file',
  ''
].join('\n')

test('reads each hunk with where it starts on both sides and the lines it removed and added', () => {
  assert.deepEqual(parseHunks(DIFF), [
    { oldStart: 7, oldLines: [], newStart: 8, newLines: ['added one', 'added two'] },
    { oldStart: 15, oldLines: ['old fifteen'], newStart: 17, newLines: ['new seventeen'] },
    { oldStart: 46, oldLines: ['deleted line'], newStart: 50, newLines: [] },
    { oldStart: 60, oldLines: ['r1', 'r2', 'r3'], newStart: 63, newLines: ['a1', 'a2'] }
  ])
})

test('keeps removed and added lines whose own text begins with dashes or pluses', () => {
  const hunks = parseHunks(
    ['--- a/q.sql', '+++ b/q.sql', '@@ -3,2 +3,2 @@', '--- old comment', '-x', '+++ counter', '+y', ''].join('\n')
  )

  assert.deepEqual(hunks, [
    { oldStart: 3, oldLines: ['-- old comment', 'x'], newStart: 3, newLines: ['++ counter', 'y'] }
  ])
})

test('shows what an edited line replaced and where that was in the parent revision', () => {
  assert.deepEqual(lineChange(parseHunks(DIFF), 17), {
    removed: ['old fifteen'],
    added: ['new seventeen'],
    focus: 0,
    removedFocus: 0,
    hiddenRemoved: 0,
    hiddenAdded: 0,
    previousLine: 15
  })
})

test('reports no earlier line for a line the commit inserted', () => {
  const change = lineChange(parseHunks(DIFF), 9)

  assert.deepEqual(change?.removed, [])
  assert.deepEqual(change?.added, ['added one', 'added two'])
  assert.equal(change?.focus, 1)
  assert.equal(change?.removedFocus, null)
  assert.equal(change?.previousLine, null)
})

test('maps a line to the removed line at the same position in its hunk', () => {
  assert.equal(lineChange(parseHunks(DIFF), 63)?.previousLine, 60)
  assert.equal(lineChange(parseHunks(DIFF), 64)?.previousLine, 61)
})

test('takes a line added past the end of the removed lines for a new line', () => {
  const hunks = [{ oldStart: 10, oldLines: ['o1', 'o2'], newStart: 10, newLines: ['n1', 'n2', 'n3', 'n4', 'n5'] }]

  const change = lineChange(hunks, 14)

  assert.equal(change?.previousLine, null)
  assert.deepEqual(change?.removed, [])
})

test('finds the earlier form of a line the commit moved, in another hunk of the same file', () => {
  const hunks = [
    { oldStart: 7, oldLines: ["import { setup } from '@/cart/cartSummary.setup';"], newStart: 6, newLines: [] },
    {
      oldStart: 9,
      oldLines: ["import { formatPrice } from '../../../shared/format';"],
      newStart: 8,
      newLines: [
        "import { formatPrice } from '@/shared/format';",
        "import { setup, Props } from '@/cart/cartSummary.setup';"
      ]
    }
  ]

  const change = lineChange(hunks, 9)

  assert.equal(change?.previousLine, 7)
  assert.deepEqual(change?.removed, ["import { setup } from '@/cart/cartSummary.setup';"])
  assert.equal(change?.removedFocus, 0)
})

test('answers nothing for a line the diff did not touch', () => {
  assert.equal(lineChange(parseHunks(DIFF), 30), null)
  // Line 50 sits where the third hunk only deleted: nothing was added there.
  assert.equal(lineChange(parseHunks(DIFF), 50), null)
})

test('shows only the lines near the asked line of a long hunk, and counts the rest', () => {
  const hunks = [
    {
      oldStart: 1,
      oldLines: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8'],
      newStart: 1,
      newLines: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10']
    }
  ]

  assert.deepEqual(lineChange(hunks, 6, 2), {
    removed: ['o4', 'o5', 'o6', 'o7', 'o8'],
    added: ['n4', 'n5', 'n6', 'n7', 'n8'],
    focus: 2,
    removedFocus: 2,
    hiddenRemoved: 3,
    hiddenAdded: 5,
    previousLine: 6
  })
})

test('follows the removed line most like the asked line, not merely the one at its position', () => {
  const hunks = [
    {
      oldStart: 5,
      oldLines: [
        "import { formatPrice } from '@/shared/format';",
        "import { setup, Props } from '@/cart/cartSummary.setup';"
      ],
      newStart: 5,
      newLines: [
        "import { setup } from '@/cart/cartSummary.setup';",
        "import { CartSummaryProps } from '@/cart/cartSummary.types';"
      ]
    }
  ]

  const change = lineChange(hunks, 5)

  assert.equal(change?.previousLine, 6)
  assert.equal(change?.removedFocus, 1)
})

test('falls back to the same position when no removed line resembles the asked line', () => {
  const hunks = [{ oldStart: 10, oldLines: ['aaaa', 'bbbb', 'cccc'], newStart: 10, newLines: ['xxxx', 'yyyy', 'zzzz'] }]

  assert.equal(lineChange(hunks, 11)?.previousLine, 11)
})
