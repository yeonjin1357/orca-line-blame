import type { BlameCommit, DetailOutput, LineChange } from '../src/protocol'
import { button, element } from './dom'
import { dateTime, relativeTime } from './format'

const HIDE_DELAY_MS = 180
const EDGE_GAP = 8

/** One commit's version of the line: `line` counts from 1 in the file as that commit left it. */
type Step = { commit: BlameCommit; line: number; detail: DetailOutput | null; error: string }

export type CardHost = {
  /** Where the blame text the card belongs to is on screen. */
  anchor(): DOMRect
  /** The card never covers what is above this y (the top bar). */
  topLimit(): number
}

export type Card = {
  readonly element: HTMLElement
  /** Shows the commit that last changed a line; `line` counts from 1 in that commit's version. */
  show(root: string, commit: BlameCommit, line: number): void
  hide(): void
  /** Hides shortly, unless the pointer reaches the card first or the card is pinned. */
  hideSoon(): void
  /** Hides unless the reader pinned the card by pressing in it. */
  hideUnlessPinned(): void
}

function changeView(change: LineChange): HTMLElement {
  const view = element('div', 'change')
  view.append(
    element('div', 'label', change.previousLine === null ? '이 커밋에서 새로 추가된 줄' : '이 커밋에서 바뀐 내용')
  )
  const diff = element('div', 'diff')
  for (const [index, text] of change.removed.entries()) {
    const row = element('div', index === change.removedFocus ? 'del focus' : 'del')
    row.append(element('span', 'sign', '-'), element('span', undefined, text))
    diff.append(row)
  }
  for (const [index, text] of change.added.entries()) {
    const row = element('div', index === change.focus ? 'add focus' : 'add')
    row.append(element('span', 'sign', '+'), element('span', undefined, text))
    diff.append(row)
  }
  view.append(diff)
  const hidden = change.hiddenRemoved + change.hiddenAdded
  if (hidden > 0) {
    view.append(element('div', 'label', `같은 자리에서 ${hidden}줄이 더 바뀌었어요`))
  }
  return view
}

/**
 * The commit card: who changed the line, the whole message, what the commit did to the line, and
 * buttons that walk back through the commits that changed the line before.
 */
export function createCard(host: CardHost): Card {
  const card = element('div')
  card.id = 'card'
  card.hidden = true

  let root = ''
  /** The line's history walked so far, newest first; `position` is the step on show. */
  let trail: Step[] = []
  let position = 0
  let pinned = false
  let hideTimer = 0
  /** Bumped by every show and hide, so an answer for a card since closed is dropped. */
  let session = 0

  function setPinned(next: boolean): void {
    pinned = next
    card.classList.toggle('pinned', next)
  }

  function hide(): void {
    window.clearTimeout(hideTimer)
    session++
    card.hidden = true
    setPinned(false)
    trail = []
    position = 0
  }

  function place(): void {
    const size = card.getBoundingClientRect()
    if (pinned) {
      // A pinned card stays where the reader left it; it only moves to stay on screen.
      const overflow = size.bottom - (window.innerHeight - EDGE_GAP)
      if (overflow > 0) {
        card.style.top = `${Math.max(host.topLimit() + 4, size.top - overflow)}px`
      }
      return
    }
    const anchor = host.anchor()
    const above = anchor.top - size.height - 6
    const top = above >= host.topLimit() + 4 ? above : anchor.bottom + 6
    const left = Math.max(EDGE_GAP, Math.min(anchor.left, window.innerWidth - size.width - EDGE_GAP))
    card.style.top = `${top}px`
    card.style.left = `${left}px`
  }

  async function load(step: Step): Promise<void> {
    const mine = session
    try {
      step.detail = await orca.plugin.request('detail', { root, commit: step.commit, line: step.line })
    } catch (error) {
      step.error = (error as Error).message
    }
    if (mine === session) {
      render()
    }
  }

  async function older(): Promise<void> {
    const step = trail[position]
    const previousLine = step.detail?.change?.previousLine ?? null
    if (!step.commit.previous || previousLine === null) {
      return
    }
    if (!trail[position + 1]) {
      const mine = session
      try {
        const before = await orca.plugin.request('lineBlame', {
          root,
          revision: step.commit.previous,
          line: previousLine
        })
        if (mine !== session) {
          return
        }
        trail.push({ commit: before.commit, line: before.sourceLine, detail: null, error: '' })
      } catch (error) {
        if (mine === session) {
          step.error = (error as Error).message
          render()
        }
        return
      }
    }
    position++
    render()
    if (!trail[position].detail) {
      void load(trail[position])
    }
  }

  function render(): void {
    const step = trail[position]
    if (!step) {
      return
    }
    const { commit, detail } = step
    const now = Date.now() / 1000

    const head = element('div', 'head')
    head.append(
      element('span', 'who', commit.author),
      element('span', 'when', `${relativeTime(commit.time, now)} (${dateTime(commit.time)})`),
      element('span', 'grow'),
      // Drawn always and shown by the `pinned` class: redrawing the card on the press that pins
      // it would swallow that press.
      Object.assign(button('✕', '닫기 (Esc)', hide), { className: 'close' })
    )
    const parts: HTMLElement[] = [head]
    if (position > 0) {
      parts.push(element('div', 'label', `이 줄의 ${position}번째 이전 변경`))
    }
    parts.push(element('div', 'message', detail?.message ?? commit.summary))

    if (step.error) {
      parts.push(element('div', 'label warn', `불러오지 못했어요: ${step.error}`))
    } else if (!detail) {
      parts.push(element('div', 'label', '변경 내용 불러오는 중…'))
    } else if (!detail.change) {
      parts.push(element('div', 'label', '이 커밋의 변경 내용에서 이 줄을 찾지 못했어요 (병합 커밋일 수 있어요)'))
    } else {
      parts.push(changeView(detail.change))
    }

    const canGoOlder = commit.previous !== null && (detail?.change?.previousLine ?? null) !== null
    const foot = element('div', 'foot')
    foot.append(
      element('span', 'sha', commit.sha.slice(0, 8)),
      element('span', 'mail', commit.mail),
      element('span', 'grow'),
      Object.assign(
        button(
          '◀ 이전 변경',
          canGoOlder ? '이 줄을 그 전에 바꾼 커밋 보기' : '이 줄은 이 커밋에서 처음 생겼어요',
          () => void older()
        ),
        { disabled: !canGoOlder }
      ),
      Object.assign(
        button('다음 변경 ▶', '더 최근 변경으로 돌아가기', () => {
          position--
          render()
        }),
        { disabled: position === 0 }
      )
    )
    parts.push(foot)
    card.replaceChildren(...parts)
    card.hidden = false
    place()
  }

  card.addEventListener('mouseenter', () => window.clearTimeout(hideTimer))
  card.addEventListener('mouseleave', () => hideSoon())
  // Pressing anywhere in the card keeps it open, so the pointer can leave while reading history.
  card.addEventListener('mousedown', () => setPinned(true))

  function hideSoon(): void {
    window.clearTimeout(hideTimer)
    if (!pinned) {
      hideTimer = window.setTimeout(hide, HIDE_DELAY_MS)
    }
  }

  return {
    element: card,
    show(nextRoot, commit, line) {
      window.clearTimeout(hideTimer)
      if (!card.hidden && trail[0]?.commit === commit && trail[0].line === line) {
        return
      }
      session++
      root = nextRoot
      setPinned(false)
      position = 0
      trail = [{ commit, line, detail: null, error: '' }]
      render()
      void load(trail[0])
    },
    hide,
    hideSoon,
    hideUnlessPinned() {
      if (!pinned) {
        hide()
      }
    }
  }
}
