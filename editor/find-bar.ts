import { button, element } from './dom'
import { findMatches, type Match } from './find'

/** Matches coloured at once; past this only the count and the stepping keep up. */
const MAX_PAINTED_MATCHES = 2000
const ALL_MATCHES = 'lb-find'
const CURRENT_MATCH = 'lb-find-current'

export type FindHost = {
  lines(): string[]
  /** The element holding the text of line `line` (from 0), or null when it is not drawn. */
  codeOf(line: number): Element | null
  /** The line the reader is on (from 0), so a search starts from there. */
  currentLine(): number
  /** Makes `line` the current line and scrolls it into view. */
  reveal(line: number): void
  /** What scrolls sideways, to bring a match on a long line into view. */
  scroller: HTMLElement
}

export type FindBar = {
  readonly element: HTMLElement
  /** Opens the bar with `seed` (the selected text) as the query, or the last query without one. */
  open(seed: string): void
  close(): void
  /** Searches again and repaints: the lines were redrawn or the file changed. */
  refresh(): void
}

/** The range covering columns `start` to `end` of the text under `code`, across its spans. */
function rangeIn(code: Element, start: number, end: number): Range | null {
  const range = document.createRange()
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
  let offset = 0
  let started = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = (node as Text).length
    if (!started && start < offset + length) {
      range.setStart(node, start - offset)
      started = true
    }
    if (started && end <= offset + length) {
      range.setEnd(node, end - offset)
      return range
    }
    offset += length
  }
  return null
}

/** Find in file: counts matches, colours them, and steps through them line by line. */
export function createFindBar(host: FindHost): FindBar {
  const bar = element('div')
  bar.id = 'find'
  bar.hidden = true
  const input = element('input')
  input.type = 'text'
  input.placeholder = '찾기'
  input.spellcheck = false
  const count = element('span', 'count')
  const caseButton = button('Aa', '대소문자 구분', () => {
    caseSensitive = !caseSensitive
    caseButton.classList.toggle('on', caseSensitive)
    search()
  })
  bar.append(
    input,
    count,
    caseButton,
    button('↑', '이전 (Shift+Enter)', () => step(-1)),
    button('↓', '다음 (Enter)', () => step(1)),
    button('✕', '닫기 (Esc)', () => close())
  )

  let caseSensitive = false
  let matches: Match[] = []
  let current = -1
  // Chromium has had the highlight API since 105; without it stepping still works, uncoloured.
  const highlights = 'highlights' in CSS ? CSS.highlights : null

  function rangeOf(match: Match): Range | null {
    const code = host.codeOf(match.line)
    return code ? rangeIn(code, match.start, match.end) : null
  }

  function paint(): void {
    count.textContent = matches.length === 0 ? (input.value ? '결과 없음' : '') : `${current + 1}/${matches.length}`
    bar.classList.toggle('empty', input.value !== '' && matches.length === 0)
    if (!highlights) {
      return
    }
    const ranges = matches.slice(0, MAX_PAINTED_MATCHES).map(rangeOf).filter((range) => range !== null)
    highlights.set(ALL_MATCHES, new Highlight(...ranges))
    const currentRange = matches[current] ? rangeOf(matches[current]) : null
    highlights.set(CURRENT_MATCH, currentRange ? new Highlight(currentRange) : new Highlight())
  }

  function showCurrent(): void {
    const match = matches[current]
    if (!match) {
      return
    }
    host.reveal(match.line)
    const box = rangeOf(match)?.getBoundingClientRect()
    const view = host.scroller.getBoundingClientRect()
    if (box && (box.left < view.left + 80 || box.right > view.right - 40)) {
      host.scroller.scrollLeft += box.left - view.left - view.width / 3
    }
  }

  function search(): void {
    matches = findMatches(host.lines(), input.value, caseSensitive)
    const from = host.currentLine()
    current = matches.length === 0 ? -1 : Math.max(0, matches.findIndex((match) => match.line >= from))
    showCurrent()
    paint()
  }

  function step(delta: number): void {
    if (matches.length === 0) {
      return
    }
    current = (current + delta + matches.length) % matches.length
    showCurrent()
    paint()
  }

  function close(): void {
    bar.hidden = true
    matches = []
    current = -1
    highlights?.delete(ALL_MATCHES)
    highlights?.delete(CURRENT_MATCH)
    host.scroller.focus()
  }

  input.addEventListener('input', search)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      step(event.shiftKey ? -1 : 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  })

  return {
    element: bar,
    open(seed) {
      bar.hidden = false
      if (seed) {
        input.value = seed
      }
      input.focus()
      input.select()
      search()
    },
    close,
    refresh() {
      if (!bar.hidden) {
        matches = findMatches(host.lines(), input.value, caseSensitive)
        current = Math.min(current, matches.length - 1)
        paint()
      }
    }
  }
}
