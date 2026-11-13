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

test('names the find shortcut it is given, since a Mac has another', () => {
  assert.equal(messagesFor('en').findInFile('⌘F'), 'Find in file (⌘F)')
  assert.equal(messagesFor('ko').findInFile('Ctrl+F'), '파일 안에서 찾기 (Ctrl+F)')
})

test('counts the commits that changed a line in the singular and the plural in English', () => {
  assert.equal(messagesFor('en').changesOfLine(1), '1 commit changed this line')
  assert.equal(messagesFor('en').changesOfLine(4), '4 commits changed this line')
  assert.equal(messagesFor('ko').changesOfLine(4), '이 줄을 바꾼 커밋 4개')
})
