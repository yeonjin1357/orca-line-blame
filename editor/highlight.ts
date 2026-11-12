import hljs from './vendor/highlight.min.js'
import moreGrammars from './vendor/highlight-languages.min.js'

for (const [name, grammar] of Object.entries(moreGrammars)) {
  hljs.registerLanguage(name, grammar)
}

/** Past this, colouring would stall the tab: the text is shown plain. */
const MAX_HIGHLIGHTED_CHARS = 1_500_000

/**
 * highlight.js language → the file suffixes coloured with it, without the dot.
 * A file type Blame opens (orca-plugin.json) that is not here is shown plain.
 */
const SUFFIXES_BY_LANGUAGE: Record<string, string> = {
  typescript: 'ts tsx mts cts',
  javascript: 'js jsx mjs cjs',
  xml: 'html htm xhtml xml xsd xsl xslt plist xaml csproj fsproj vbproj props targets jsp razor cshtml ejs',
  css: 'css pcss',
  scss: 'scss sass',
  less: 'less',
  stylus: 'styl',
  coffeescript: 'coffee',
  elm: 'elm',
  handlebars: 'hbs handlebars mustache',
  twig: 'twig',
  django: 'njk jinja j2 liquid',
  json: 'json jsonc json5',
  yaml: 'yaml yml',
  ini: 'ini toml cfg',
  properties: 'properties',
  markdown: 'md markdown mdx',
  asciidoc: 'adoc asciidoc',
  latex: 'tex sty',
  gherkin: 'feature',
  bash: 'sh bash zsh ksh fish',
  powershell: 'ps1 psm1 psd1',
  dos: 'bat cmd',
  awk: 'awk',
  tcl: 'tcl',
  vim: 'vim',
  python: 'py pyi pyw pyx bzl bazel',
  ruby: 'rb rake gemspec',
  erb: 'erb',
  haml: 'haml',
  php: 'php phtml',
  perl: 'pl pm',
  lua: 'lua',
  r: 'r',
  julia: 'jl',
  dart: 'dart',
  elixir: 'ex exs',
  erlang: 'erl hrl',
  haskell: 'hs',
  ocaml: 'ml mli',
  sml: 'sml',
  lisp: 'lisp el',
  scheme: 'scm rkt',
  clojure: 'clj cljs cljc edn',
  java: 'java',
  kotlin: 'kt kts',
  scala: 'scala sc',
  groovy: 'groovy',
  gradle: 'gradle',
  csharp: 'cs csx',
  fsharp: 'fs fsx fsi',
  vbnet: 'vb',
  vbscript: 'vbs',
  c: 'c h',
  cpp: 'cpp cc cxx hpp hh hxx',
  arduino: 'ino',
  objectivec: 'm mm',
  swift: 'swift',
  go: 'go',
  rust: 'rs',
  nim: 'nim',
  d: 'd',
  crystal: 'cr',
  delphi: 'pas',
  fortran: 'f90 f95 f for',
  ada: 'adb ads',
  haxe: 'hx',
  vala: 'vala',
  qml: 'qml',
  applescript: 'applescript',
  verilog: 'v sv svh',
  vhdl: 'vhd vhdl',
  x86asm: 'asm',
  llvm: 'll',
  glsl: 'glsl vert frag',
  wasm: 'wat',
  sql: 'sql',
  pgsql: 'pgsql',
  graphql: 'graphql graphqls gql',
  protobuf: 'proto',
  thrift: 'thrift',
  http: 'http rest',
  diff: 'diff patch',
  nix: 'nix',
  cmake: 'cmake',
  makefile: 'mk',
  dockerfile: 'dockerfile',
  nginx: 'nginx',
  puppet: 'pp'
}

/** highlight.js language → files known by their whole name rather than a suffix, in lower case. */
const NAMES_BY_LANGUAGE: Record<string, string> = {
  dockerfile: 'dockerfile containerfile',
  makefile: 'makefile gnumakefile',
  cmake: 'cmakelists.txt',
  groovy: 'jenkinsfile',
  ruby: 'gemfile rakefile podfile fastfile brewfile vagrantfile',
  bash: '.bashrc .zshrc .profile .bash_profile',
  ini: '.editorconfig .gitmodules',
  json: '.babelrc .eslintrc .prettierrc'
}

function byFileType(table: Record<string, string>): Map<string, string> {
  return new Map(
    Object.entries(table).flatMap(([language, fileTypes]) =>
      fileTypes.split(' ').map((fileType): [string, string] => [fileType, language])
    )
  )
}

const LANGUAGE_BY_NAME = byFileType(NAMES_BY_LANGUAGE)
const LANGUAGE_BY_FILE_TYPE = new Map([...byFileType(SUFFIXES_BY_LANGUAGE), ...LANGUAGE_BY_NAME])

/** Markup with `<script>` and `<style>` blocks, each block in a language of its own. */
const BLOCK_FILE_TYPES = new Set(['vue', 'svelte', 'astro'])

/**
 * What kind of file a path names: its whole name in lower case when the file is known by name
 * (`dockerfile`), else its last suffix without the dot (`ts`); empty when it has neither.
 */
export function fileTypeOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (LANGUAGE_BY_NAME.has(name)) {
    return name
  }
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1) : ''
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

/** A Vue file is three languages: each top-level block is coloured as its own. Svelte and Astro files likewise. */
function highlightBlocks(lines: string[]): string[] {
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
export function guessFileType(lines: string[]): string {
  return lines.some((line) => VUE_BLOCK.test(line)) ? 'vue' : 'ts'
}

/** One HTML string per line of `lines`, coloured for the file's type (see `fileTypeOf`). */
export function highlightLines(lines: string[], fileType: string): string[] {
  const size = lines.reduce((total, line) => total + line.length + 1, 0)
  const plain = () => lines.map(escapeHtml)
  const inBlocks = BLOCK_FILE_TYPES.has(fileType)
  const language = LANGUAGE_BY_FILE_TYPE.get(fileType)
  if ((!inBlocks && !language) || size > MAX_HIGHLIGHTED_CHARS) {
    return plain()
  }
  const html = language ? highlightLinesAs(lines, language) : highlightBlocks(lines)
  // A highlighter that lost or gained a line would put every blame on the wrong row.
  return html.length === lines.length ? html : plain()
}
