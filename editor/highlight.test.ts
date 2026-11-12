import { assert, test } from 'orca/testing'
import { guessExtension, highlightLines } from './highlight'

const VUE_FILE = [
  '<script lang="ts" setup>',
  'const a: number = 1 // note',
  '/* open',
  'still comment */',
  '</script>',
  '',
  '<template>',
  '  <div :class="x && y">{{ a }}</div>',
  '  <template v-if="a">',
  '  </template>',
  '</template>',
  '<style lang="scss">',
  '.a { color: red; }',
  '</style>'
]

/** The text a rendered line shows: its markup dropped and its entities decoded. */
function shownText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
}

function count(text: string, piece: string): number {
  return text.split(piece).length - 1
}

test('shows exactly the text of each line, one rendered line per source line', () => {
  assert.deepEqual(highlightLines(VUE_FILE, 'vue').map(shownText), VUE_FILE)
})

test('carries a colour across a line break, closing every span on the line that opened it', () => {
  const html = highlightLines(['/* open', 'still comment */', 'const a = 1'], 'ts')

  assert.match(html[0], /hljs-comment/)
  assert.match(html[1], /hljs-comment/)
  for (const line of html) {
    assert.equal(count(line, '<span'), count(line, '</span>'), line)
  }
})

test('colours each block of a Vue file as its own language', () => {
  const html = highlightLines(VUE_FILE, 'vue')

  assert.match(html[1], /hljs-keyword">const</)
  assert.match(html[7], /hljs-name">div</)
  assert.match(html[12], /hljs-selector-class">\.a</)
})

test('shows a file of a type it has no colours for as plain text', () => {
  assert.deepEqual(highlightLines(['a < b && c'], 'xyz'), ['a &lt; b &amp;&amp; c'])
})

test('takes a file with Vue blocks for a Vue file until its name is known', () => {
  assert.equal(guessExtension(VUE_FILE), 'vue')
  assert.equal(guessExtension(['export const a = 1']), 'ts')
})
