import { assert, test } from 'orca/testing'
import { relativeTime } from './format'

const NOW = 1_800_000_000
const MINUTE = 60
const HOUR = 3_600
const DAY = 86_400

test('says how long ago in the largest unit that fits', () => {
  assert.equal(relativeTime(NOW - 10 * MINUTE, NOW, 'ko'), '10분 전')
  assert.equal(relativeTime(NOW - 2 * HOUR, NOW, 'ko'), '2시간 전')
  assert.equal(relativeTime(NOW - 5 * DAY, NOW, 'ko'), '5일 전')
  assert.equal(relativeTime(NOW - 21 * DAY, NOW, 'ko'), '3주 전')
  assert.equal(relativeTime(NOW - 61 * DAY, NOW, 'ko'), '2개월 전')
  assert.equal(relativeTime(NOW - 731 * DAY, NOW, 'ko'), '2년 전')
})

test('calls anything under a minute just now', () => {
  assert.equal(relativeTime(NOW - 59, NOW, 'ko'), '방금 전')
  assert.equal(relativeTime(NOW, NOW, 'ko'), '방금 전')
})

test('says it in English for an English reader', () => {
  assert.equal(relativeTime(NOW - 21 * DAY, NOW, 'en'), '3 weeks ago')
  assert.equal(relativeTime(NOW - 1 * HOUR, NOW, 'en'), '1 hour ago')
  assert.equal(relativeTime(NOW - 30, NOW, 'en'), 'just now')
})
