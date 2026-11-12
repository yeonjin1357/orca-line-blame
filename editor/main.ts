import type { BlameCommit, BlameOutput, FileMatch } from '../src/protocol'
import { createCard } from './card'
import { button, element } from './dom'
import { createFindBar } from './find-bar'
import { relativeTime } from './format'
import { guessExtension, highlightLines } from './highlight'
import { describeText, toLines } from './identify'
import { STYLE } from './style'

/** The id git blame gives lines that are not committed yet. */
const UNCOMMITTED_SHA = '0'.repeat(40)

function nowSeconds(): number {
  return Date.now() / 1000
}

// ---------------------------------------------------------------------------
// View

const sheet = new CSSStyleSheet()
sheet.replaceSync(STYLE)
document.adoptedStyleSheets = [sheet]

const bar = element('div')
bar.id = 'bar'
const scroller = element('div')
scroller.id = 'scroll'
scroller.tabIndex = 0
const linesEl = element('div')
linesEl.id = 'lines'
const annotation = element('span', 'ann')
scroller.append(linesEl)

let generation = 0
let lines: string[] = []
let shownExtension = ''
let matches: FileMatch[] = []
let match: FileMatch | null = null
let blame: BlameOutput | null = null
/** Shown in the bar and beside the line while there is no blame to show. */
let notice = ''
/** Whether `notice` reports a failure rather than progress. */
let noticeIsError = false
let currentLine = 0

const card = createCard({
  anchor: () => annotation.getBoundingClientRect(),
  topLimit: () => bar.getBoundingClientRect().bottom
})
const findBar = createFindBar({
  lines: () => lines,
  codeOf: (line) => linesEl.children[line]?.querySelector('.code') ?? null,
  currentLine: () => currentLine,
  reveal: (line) => selectLine(line, 'center'),
  scroller
})
document.body.append(bar, scroller, findBar.element, card.element)

function renderLines(extension: string): void {
  shownExtension = extension
  const html = highlightLines(lines, extension)
  linesEl.innerHTML = html
    .map(
      (code, index) =>
        `<div class="line" data-i="${index}"><span class="ln">${index + 1}</span><span class="code">${code}</span></div>`
    )
    .join('')
  const width = `${String(lines.length).length}ch`
  for (const cell of linesEl.querySelectorAll<HTMLElement>('.ln')) {
    cell.style.width = width
  }
  selectLine(Math.min(currentLine, lines.length - 1))
  findBar.refresh()
}

function commitAt(line: number): BlameCommit | null {
  return blame?.commits[blame.lines[line]] ?? null
}

function isCommitted(commit: BlameCommit | null): commit is BlameCommit {
  return commit !== null && commit.sha !== UNCOMMITTED_SHA
}

function updateAnnotation(): void {
  const commit = commitAt(currentLine)
  annotation.textContent = !commit
    ? notice
    : isCommitted(commit)
      ? `${commit.author}, ${relativeTime(commit.time, nowSeconds())} • ${commit.summary}`
      : '아직 커밋되지 않은 변경'
}

/** Makes line `index` (from 0) the current one; `reveal` says where to scroll it to, if at all. */
function selectLine(index: number, reveal?: ScrollLogicalPosition): void {
  card.hide()
  linesEl.querySelector('.line.current')?.classList.remove('current')
  currentLine = index
  const row = linesEl.children[index]
  if (!row) {
    annotation.remove()
    return
  }
  row.classList.add('current')
  row.append(annotation)
  updateAnnotation()
  if (reveal) {
    row.scrollIntoView({ block: reveal })
  }
}

function summarize(result: BlameOutput): string {
  const committed = result.commits.filter(isCommitted)
  const latest = committed.reduce<BlameCommit | null>(
    (newest, commit) => (!newest || commit.time > newest.time ? commit : newest),
    null
  )
  const authors = new Set(committed.map((commit) => commit.mail || commit.author)).size
  const parts = [`작성자 ${authors}명`]
  if (latest) {
    parts.push(`마지막 변경 ${latest.author}, ${relativeTime(latest.time, nowSeconds())}`)
  }
  if (committed.length < result.commits.length) {
    parts.push('커밋 전 변경 있음')
  }
  return parts.join(' · ')
}

function renderBar(): void {
  bar.replaceChildren()
  if (matches.length > 1) {
    const picker = element('select')
    picker.title = '내용이 같은 파일이 여러 개예요. 보고 있는 파일을 골라 주세요.'
    for (const [index, candidate] of matches.entries()) {
      const option = element('option', undefined, `${candidate.path} — ${candidate.workspaceName}`)
      option.value = String(index)
      option.selected = candidate === match
      picker.append(option)
    }
    picker.addEventListener('change', () => void useMatch(matches[Number(picker.value)], generation))
    bar.append(picker)
  } else if (match) {
    bar.append(element('span', 'path', match.path))
  }
  if (notice) {
    bar.append(element('span', noticeIsError ? 'summary warn' : 'summary', notice))
  } else if (blame) {
    bar.append(element('span', 'summary', summarize(blame)))
  }
  bar.append(element('span', 'grow'), button('찾기', '파일 안에서 찾기 (Ctrl+F)', openFind))
}

function setNotice(text: string, isError = false): void {
  notice = text
  noticeIsError = isError
  renderBar()
  updateAnnotation()
}

function openFind(): void {
  const selected = window.getSelection()?.toString() ?? ''
  findBar.open(selected.includes('\n') ? '' : selected)
}

function showCard(): void {
  const commit = commitAt(currentLine)
  if (isCommitted(commit) && match && blame) {
    card.show(match.root, commit, blame.sourceLines[currentLine])
  }
}

// ---------------------------------------------------------------------------
// Loading

async function useMatch(next: FileMatch, run: number): Promise<void> {
  match = next
  blame = null
  const extension = next.path.includes('.') ? next.path.slice(next.path.lastIndexOf('.') + 1).toLowerCase() : ''
  if (extension !== shownExtension) {
    renderLines(extension)
  }
  setNotice('blame 불러오는 중…')
  try {
    const result = await orca.plugin.request('blame', { root: next.root, path: next.path })
    if (run !== generation || match !== next) {
      return
    }
    blame = result
    setNotice('')
  } catch (error) {
    if (run === generation && match === next) {
      setNotice(`blame 실패: ${(error as Error).message}`, true)
    }
  }
}

async function show(text: string): Promise<void> {
  const run = ++generation
  lines = toLines(text)
  matches = []
  match = null
  blame = null
  renderLines(guessExtension(lines))
  setNotice('파일 찾는 중…')
  try {
    const context = await orca.host.call('workspace.readContext').catch(() => null)
    const located = await orca.plugin.request('locate', {
      context: context && { branch: context.branch, displayName: context.displayName },
      ...(await describeText(text))
    })
    if (run !== generation) {
      return
    }
    matches = located.matches
  } catch (error) {
    if (run === generation) {
      setNotice(`파일 찾기 실패: ${(error as Error).message}`, true)
    }
    return
  }
  if (matches.length === 0) {
    setNotice('워크스페이스에서 이 파일을 찾지 못했어요', true)
    return
  }
  await useMatch(matches[0], run)
}

linesEl.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  if (annotation.contains(target)) {
    return
  }
  const row = target.closest<HTMLElement>('.line')
  if (row) {
    selectLine(Number(row.dataset.i))
  }
})
scroller.addEventListener('keydown', (event) => {
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (step === 0 || lines.length === 0) {
    return
  }
  event.preventDefault()
  selectLine(Math.max(0, Math.min(lines.length - 1, currentLine + step)), 'nearest')
})
scroller.addEventListener('scroll', () => card.hideUnlessPinned())
annotation.addEventListener('mouseenter', showCard)
annotation.addEventListener('mouseleave', () => card.hideSoon())
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    openFind()
  } else if (event.key === 'Escape') {
    card.hide()
  }
})
// A press outside a pinned card closes it, as it would a menu.
window.addEventListener('mousedown', (event) => {
  if (!card.element.contains(event.target as Node) && !annotation.contains(event.target as Node)) {
    card.hide()
  }
})

if (!orca.document) {
  throw new Error('this file runs as a custom editor')
}
// Read-only: the view never posts an edit, it only follows the file as agents change it.
orca.document.onDidChange((next) => {
  if (next.content.kind === 'text') {
    void show(next.content.text)
  }
})
