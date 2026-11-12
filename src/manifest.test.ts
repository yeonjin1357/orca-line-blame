import { readFileSync } from 'node:fs'
import { assert, test } from 'orca/testing'

type Editor = {
  id: string
  title: string
  entry: string
  priority: string
  frame: string
  extensions?: string[]
  filenames?: string[]
}

const manifest = JSON.parse(readFileSync(new URL('../orca-plugin.json', import.meta.url), 'utf8'))
const editors: Editor[] = manifest.contributes.customEditors

/** Everything in `values` that is there more than once, ignoring case as Orca does. */
function repeated(values: string[]): string[] {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const value of values.map((each) => each.toLowerCase())) {
    if (seen.has(value)) {
      twice.add(value)
    }
    seen.add(value)
  }
  return [...twice]
}

// Orca has no "every file" editor: file types are listed, 32 to an editor. Two editors listing the
// same type would put two Blame buttons on that file.
test('lists each file type for one Blame editor only', () => {
  assert.deepEqual(repeated(editors.flatMap((editor) => editor.extensions ?? [])), [])
  assert.deepEqual(repeated(editors.flatMap((editor) => editor.filenames ?? [])), [])
})

test('opens every listed file type in the same view', () => {
  const views = editors.map(({ title, entry, priority, frame }) => ({ title, entry, priority, frame }))

  assert.deepEqual(new Set(views.map((view) => JSON.stringify(view))).size, 1)
  assert.equal(views[0].title, 'Blame')
})

// Blame is read-only. A file has to open in the editor people can type in; Blame is one click away.
test('leaves files opening in Source, and offers Blame beside it', () => {
  assert.deepEqual([...new Set(editors.map((editor) => editor.priority))], ['option'])
})

test('opens files of languages beyond the web ones, and files known by name', () => {
  const extensions = editors.flatMap((editor) => editor.extensions ?? [])
  const filenames = editors.flatMap((editor) => editor.filenames ?? [])

  for (const extension of ['.vue', '.tsx', '.py', '.java', '.go', '.rs', '.kt', '.cs', '.cpp', '.rb', '.php', '.swift', '.dart', '.sql']) {
    assert.ok(extensions.includes(extension), extension)
  }
  assert.ok(filenames.includes('Dockerfile'))
  assert.ok(filenames.includes('Makefile'))
})
