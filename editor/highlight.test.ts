import { assert, test } from 'orca/testing'
import { fileTypeOf, guessFileType, highlightLines } from './highlight'

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
  assert.equal(guessFileType(VUE_FILE), 'vue')
  assert.equal(guessFileType(['export const a = 1']), 'ts')
})

test('colours languages beyond the web ones', () => {
  assert.match(highlightLines(['def area(r):', '    return r'], 'py')[0], /hljs-keyword">def</)
  assert.match(highlightLines(['public class Shop {}'], 'java')[0], /hljs-keyword">public</)
})

test('colours languages the common highlight.js build leaves out', () => {
  assert.match(highlightLines(['final int x = 1;'], 'dart')[0], /hljs-keyword">final</)
  assert.match(highlightLines(['FROM node:22'], 'dockerfile')[0], /hljs-keyword">FROM</)
})

test('colours a Svelte file block by block, like a Vue file', () => {
  const html = highlightLines(
    ['<script lang="ts">', 'const a: number = 1', '</script>', '<h1>{a}</h1>', '<style>', '.a { color: red; }', '</style>'],
    'svelte'
  )

  assert.match(html[1], /hljs-keyword">const</)
  assert.match(html[3], /hljs-name">h1</)
  assert.match(html[5], /hljs-selector-class">\.a</)
})

test('takes the type of a file from the end of its name, whatever its case', () => {
  assert.equal(fileTypeOf('src/app/Main.JAVA'), 'java')
  assert.equal(fileTypeOf('src/shop.service.ts'), 'ts')
})

test('gives a file without a suffix no type', () => {
  assert.equal(fileTypeOf('a.b/notes'), '')
  assert.equal(fileTypeOf('.gitignore'), '')
})

test('knows a file that is named rather than suffixed, such as a Dockerfile', () => {
  assert.equal(fileTypeOf('docker/Dockerfile'), 'dockerfile')
  assert.equal(fileTypeOf('native/CMakeLists.txt'), 'cmakelists.txt')
  assert.match(highlightLines(['FROM node:22'], fileTypeOf('docker/Dockerfile'))[0], /hljs-keyword">FROM</)
})
