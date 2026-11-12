import { assert, test } from 'orca/testing'
import { languageOf, messagesFor } from './messages'

test('speaks Korean when Orca does, and English for every other language', () => {
  assert.equal(languageOf('ko'), 'ko')
  assert.equal(languageOf('ko-KR'), 'ko')
  assert.equal(languageOf('KO_kr'), 'ko')
  assert.equal(languageOf('en-US'), 'en')
  assert.equal(languageOf('ja'), 'en')
  assert.equal(languageOf(''), 'en')
  // Konkani's tag starts with the same two letters; it is not Korean.
  assert.equal(languageOf('kok'), 'en')
})

test('counts authors in the singular and the plural in English', () => {
  assert.equal(messagesFor('en').authors(1), '1 author')
  assert.equal(messagesFor('en').authors(3), '3 authors')
  assert.equal(messagesFor('ko').authors(3), '작성자 3명')
})

test('counts the other changed lines in the singular and the plural in English', () => {
  assert.equal(messagesFor('en').moreLinesChanged(1), '1 more line changed in the same place')
  assert.equal(messagesFor('en').moreLinesChanged(4), '4 more lines changed in the same place')
  assert.equal(messagesFor('ko').moreLinesChanged(4), '같은 자리에서 4줄이 더 바뀌었어요')
})
