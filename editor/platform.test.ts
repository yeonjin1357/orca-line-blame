import { assert, test } from 'orca/testing'
import { findShortcut } from './platform'

test('names the find shortcut ⌘F on a Mac and Ctrl+F elsewhere', () => {
  assert.equal(findShortcut('MacIntel'), '⌘F')
  assert.equal(findShortcut('Win32'), 'Ctrl+F')
  assert.equal(findShortcut('Linux x86_64'), 'Ctrl+F')
})
