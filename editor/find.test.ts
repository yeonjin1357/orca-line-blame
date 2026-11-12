import { assert, test } from 'orca/testing'
import { findMatches } from './find'

test('finds every occurrence in every line, ignoring case unless asked', () => {
  assert.deepEqual(findMatches(['Foo bar foo', 'nothing', 'FOO'], 'foo', false), [
    { line: 0, start: 0, end: 3 },
    { line: 0, start: 8, end: 11 },
    { line: 2, start: 0, end: 3 }
  ])
})

test('matches only the exact case when case matters', () => {
  assert.deepEqual(findMatches(['Foo bar foo', 'FOO'], 'foo', true), [{ line: 0, start: 8, end: 11 }])
})

test('counts back-to-back occurrences once each, without overlap', () => {
  assert.deepEqual(findMatches(['aaaa'], 'aa', true), [
    { line: 0, start: 0, end: 2 },
    { line: 0, start: 2, end: 4 }
  ])
})

test('finds nothing for an empty query', () => {
  assert.deepEqual(findMatches(['anything'], '', false), [])
})
