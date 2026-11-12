const SECONDS_PER_UNIT: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_557_600],
  ['month', 2_629_800],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60]
]

const relativeFormat = new Intl.RelativeTimeFormat('ko', { numeric: 'always' })
const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

/** How long before `nowSeconds` the moment `seconds` was, in the largest unit that fits. */
export function relativeTime(seconds: number, nowSeconds: number): string {
  const delta = seconds - nowSeconds
  for (const [unit, size] of SECONDS_PER_UNIT) {
    if (Math.abs(delta) >= size) {
      return relativeFormat.format(Math.round(delta / size), unit)
    }
  }
  return '방금 전'
}

/** The date and time of `seconds` since the epoch, for the reader's own time zone. */
export function dateTime(seconds: number): string {
  return dateFormat.format(seconds * 1000)
}
