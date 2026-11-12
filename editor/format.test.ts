import { assert, test } from 'orca/testing'
import { relativeTime } from './format'

const NOW = 1_800_000_000
const MINUTE = 60
const HOUR = 3_600
const DAY = 86_400

test('says how long ago in the largest unit that fits', () => {
  assert.equal(relativeTime(NOW - 10 * MINUTE, NOW), '10분 전')
  assert.equal(relativeTime(NOW - 2 * HOUR, NOW), '2시간 전')
  assert.equal(relativeTime(NOW - 5 * DAY, NOW), '5일 전')
  assert.equal(relativeTime(NOW - 21 * DAY, NOW), '3주 전')
  assert.equal(relativeTime(NOW - 61 * DAY, NOW), '2개월 전')
  assert.equal(relativeTime(NOW - 731 * DAY, NOW), '2년 전')
})

test('calls anything under a minute just now', () => {
  assert.equal(relativeTime(NOW - 59, NOW), '방금 전')
  assert.equal(relativeTime(NOW, NOW), '방금 전')
})
