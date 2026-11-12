import hljs from './vendor/highlight.min.js'

/** Past this, colouring would stall the tab: the text is shown plain. */
const MAX_HIGHLIGHTED_CHARS = 1_500_000

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  scss: 'scss',
  css: 'css',
  json: 'json',
  md: 'markdown',
  html: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash'
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightBlock(code: string, language: string): string {
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}

/** Splits highlighted HTML at newlines, closing and reopening the spans a line break cuts. */
function splitHighlighted(html: string): string[] {
  const lines: string[] = []
  const open: string[] = []
  const token = /<span[^>]*>|<\/span>|\n/g
  let line = ''
  let last = 0
  for (let match = token.exec(html); match; match = token.exec(html)) {
    line += html.slice(last, match.index)
    last = token.lastIndex
    if (match[0] === '\n') {
      lines.push(line + '</span>'.repeat(open.length))
      line = open.join('')
    } else {
      if (match[0] === '</span>') {
        open.pop()
      } else {
        open.push(match[0])
      }
      line += match[0]
    }
  }
  lines.push(line + html.slice(last) + '</span>'.repeat(open.length))
  return lines
}

function highlightLinesAs(lines: string[], language: string): string[] {
  return lines.length === 0 ? [] : splitHighlighted(highlightBlock(lines.join('\n'), language))
}

function blockLanguage(tag: string, attributes: string): string {
  const lang = /\blang=["']?([\w-]+)/.exec(attributes)?.[1] ?? ''
  if (tag === 'template') {
    return 'xml'
  }
  if (tag === 'script') {
    return lang.startsWith('ts') ? 'typescript' : 'javascript'
  }
  return lang === 'scss' || lang === 'sass' ? 'scss' : lang === 'less' ? 'less' : 'css'
}

/** A Vue file is three languages: each top-level block is coloured as its own. */
function highlightVue(lines: string[]): string[] {
  const out: string[] = []
  let index = 0
  while (index < lines.length) {
    const open = /^<(template|script|style)\b([^>]*)>\s*$/.exec(lines[index])
    if (!open) {
      out.push(...highlightLinesAs([lines[index]], 'xml'))
      index++
      continue
    }
    const closing = `</${open[1]}>`
    let close = -1
    if (open[1] === 'template') {
      // Nested <template> tags are indented; the block ends at the last unindented closing tag
      // before the next top-level block.
      for (let i = index + 1; i < lines.length; i++) {
        if (/^<(script|style)\b/.test(lines[i])) {
          break
        }
        if (lines[i].startsWith(closing)) {
          close = i
        }
      }
    } else {
      close = lines.findIndex((line, i) => i > index && line.startsWith(closing))
    }
    if (close < 0) {
      close = lines.length
    }
    out.push(...highlightLinesAs([lines[index]], 'xml'))
    out.push(...highlightLinesAs(lines.slice(index + 1, close), blockLanguage(open[1], open[2])))
    if (close < lines.length) {
      out.push(...highlightLinesAs([lines[close]], 'xml'))
    }
    index = close + 1
  }
  return out
}

const VUE_BLOCK = /^<(template|script|style)\b[^>]*>\s*$/

/** Orca does not say which file is open: until it is found, colour by what the text looks like. */
export function guessExtension(lines: string[]): string {
  return lines.some((line) => VUE_BLOCK.test(line)) ? 'vue' : 'ts'
}

/** One HTML string per line of `lines`, coloured for the file's extension (no dot). */
export function highlightLines(lines: string[], extension: string): string[] {
  const size = lines.reduce((total, line) => total + line.length + 1, 0)
  const plain = () => lines.map(escapeHtml)
  const language = extension === 'vue' ? 'vue' : LANGUAGE_BY_EXTENSION[extension]
  if (!language || size > MAX_HIGHLIGHTED_CHARS) {
    return plain()
  }
  const html = language === 'vue' ? highlightVue(lines) : highlightLinesAs(lines, language)
  // A highlighter that lost or gained a line would put every blame on the wrong row.
  return html.length === lines.length ? html : plain()
}
