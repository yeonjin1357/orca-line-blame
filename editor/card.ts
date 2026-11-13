import type { BlameCommit, DetailOutput, LineChange } from '../src/protocol'
import { button, element } from './dom'
import { dateTime, relativeTime } from './format'
import { language, text } from './language'

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
    element('div', 'label', change.previousLine === null ? text.addedInCommit : text.changedInCommit)
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
    view.append(element('div', 'label', text.moreLinesChanged(hidden)))
  }
  return view
}

/**
 * The commit card: who changed the line, the whole message, what the commit did to the line,
 * buttons that walk back through the commits that changed the line before, and a list of them all.
 */
export function createCard(host: CardHost): Card {
  const card = element('div')
  card.id = 'card'
  card.hidden = true

  let root = ''
  /** The line's history walked so far, newest first; `position` is the step on show. */
  let trail: Step[] = []
  let position = 0
  /** True once the worker listed every commit that changed the line: the trail is then that list. */
  let complete = false
  /** The list of the trail is on show, rather than one step of it. */
  let listing = false
  let listError = ''
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
    complete = false
    listing = false
    listError = ''
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

  /** Shows one step of the trail, loading what its commit did to the line if that is not known yet. */
  function open(index: number): void {
    position = index
    listing = false
    render()
    if (!trail[position].detail && !trail[position].error) {
      void load(trail[position])
    }
  }

  /** Lists every commit that changed the line; the first time, asks the worker for them. */
  async function showAll(): Promise<void> {
    listing = true
    listError = ''
    render()
    if (complete) {
      return
    }
    const mine = session
    const newest = trail[0]
    try {
      const { entries } = await orca.plugin.request('history', {
        root,
        revision: { sha: newest.commit.sha, path: newest.commit.path },
        line: newest.line
      })
      if (mine !== session) {
        return
      }
      if (entries.length === 0) {
        throw new Error('git listed no commit for this line')
      }
      // Git follows the line itself, more surely than stepping back by likeness does: its list
      // replaces the steps walked so far, keeping what was already loaded for the same commit.
      const walked = new Map(trail.map((step) => [`${step.commit.sha} ${step.line}`, step]))
      const shown = trail[position].commit.sha
      trail = entries.map(
        (entry) =>
          walked.get(`${entry.commit.sha} ${entry.sourceLine}`) ?? {
            commit: entry.commit,
            line: entry.sourceLine,
            detail: null,
            error: ''
          }
      )
      position = Math.max(
        0,
        trail.findIndex((step) => step.commit.sha === shown)
      )
      complete = true
    } catch (error) {
      if (mine !== session) {
        return
      }
      listError = (error as Error).message
    }
    render()
  }

  async function older(): Promise<void> {
    if (complete) {
      if (position < trail.length - 1) {
        open(position + 1)
      }
      return
    }
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

  function closeButton(): HTMLButtonElement {
    // Drawn always and shown by the `pinned` class: redrawing the card on the press that pins
    // it would swallow that press.
    return Object.assign(button('✕', text.close, hide), { className: 'close' })
  }

  function renderList(): void {
    const now = Date.now() / 1000
    const head = element('div', 'head')
    head.append(
      element('span', 'who', complete ? text.changesOfLine(trail.length) : text.allChanges),
      element('span', 'grow'),
      closeButton()
    )
    const parts: HTMLElement[] = [head]
    if (listError) {
      parts.push(element('div', 'label warn', text.loadFailed(listError)))
    } else if (!complete) {
      parts.push(element('div', 'label', text.loadingHistory))
    } else {
      const list = element('div', 'history')
      for (const [index, { commit }] of trail.entries()) {
        // The list cuts a long title short: the tooltip has all of it, with the exact time and the commit.
        const tip = [commit.summary, `${dateTime(commit.time, language)} · ${commit.sha.slice(0, 8)}`].join('\n')
        const row = button('', tip, () => open(index))
        row.className = index === position ? 'current' : ''
        row.append(
          element('span', 'when', relativeTime(commit.time, now, language)),
          element('span', 'who', commit.author),
          element('span', 'summary', commit.summary)
        )
        list.append(row)
      }
      parts.push(list)
    }
    const foot = element('div', 'foot')
    foot.append(
      element('span', 'grow'),
      button(text.backToChange, text.backToLaterChange, () => {
        listing = false
        render()
      })
    )
    parts.push(foot)
    card.replaceChildren(...parts)
    card.hidden = false
    place()
  }

  function render(): void {
    const step = trail[position]
    if (!step) {
      return
    }
    if (listing) {
      renderList()
      return
    }
    const { commit, detail } = step
    const now = Date.now() / 1000

    const head = element('div', 'head')
    head.append(
      element('span', 'who', commit.author),
      element('span', 'when', `${relativeTime(commit.time, now, language)} (${dateTime(commit.time, language)})`),
      element('span', 'grow'),
      closeButton()
    )
    const parts: HTMLElement[] = [head]
    if (position > 0) {
      parts.push(element('div', 'label', text.earlierChangeNumber(position)))
    }
    parts.push(element('div', 'message', detail?.message ?? commit.summary))

    if (step.error) {
      parts.push(element('div', 'label warn', text.loadFailed(step.error)))
    } else if (!detail) {
      parts.push(element('div', 'label', text.loadingChange))
    } else if (!detail.change) {
      parts.push(element('div', 'label', text.lineNotInCommit))
    } else {
      parts.push(changeView(detail.change))
    }

    const canGoOlder = complete
      ? position < trail.length - 1
      : commit.previous !== null && (detail?.change?.previousLine ?? null) !== null
    const foot = element('div', 'foot')
    foot.append(
      element('span', 'sha', commit.sha.slice(0, 8)),
      element('span', 'mail', commit.mail),
      element('span', 'grow'),
      button(text.allChanges, text.showAllChanges, () => void showAll()),
      Object.assign(
        button(
          text.earlierChange,
          canGoOlder ? text.showEarlierChange : text.firstWrittenHere,
          () => void older()
        ),
        { disabled: !canGoOlder }
      ),
      Object.assign(
        button(text.laterChange, text.backToLaterChange, () => {
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
      complete = false
      listing = false
      listError = ''
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
