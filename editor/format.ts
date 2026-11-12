import type { Language } from './messages'

const SECONDS_PER_UNIT: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_557_600],
  ['month', 2_629_800],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60]
]
const JUST_NOW: Record<Language, string> = { ko: '방금 전', en: 'just now' }
const DATE_LOCALE: Record<Language, string> = { ko: 'ko-KR', en: 'en-US' }

const relativeFormats = new Map<Language, Intl.RelativeTimeFormat>()
const dateFormats = new Map<Language, Intl.DateTimeFormat>()

/** How long before `nowSeconds` the moment `seconds` was, in the largest unit that fits. */
export function relativeTime(seconds: number, nowSeconds: number, language: Language): string {
  const delta = seconds - nowSeconds
  let format = relativeFormats.get(language)
  if (!format) {
    format = new Intl.RelativeTimeFormat(language, { numeric: 'always' })
    relativeFormats.set(language, format)
  }
  for (const [unit, size] of SECONDS_PER_UNIT) {
    if (Math.abs(delta) >= size) {
      return format.format(Math.round(delta / size), unit)
    }
  }
  return JUST_NOW[language]
}

/** The date and time of `seconds` since the epoch, in the reader's own time zone. */
export function dateTime(seconds: number, language: Language): string {
  let format = dateFormats.get(language)
  if (!format) {
    format = new Intl.DateTimeFormat(DATE_LOCALE[language], { dateStyle: 'medium', timeStyle: 'short' })
    dateFormats.set(language, format)
  }
  return format.format(seconds * 1000)
}
