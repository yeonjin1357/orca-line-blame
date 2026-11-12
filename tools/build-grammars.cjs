// Builds editor/vendor/highlight-languages.min.js: the highlight.js grammars its common build leaves
// out, copied unchanged from @highlightjs/cdn-assets (es/languages) into one module. To colour one
// more language, add its name to GRAMMARS, run this, and map its file types in editor/highlight.ts.
//   npm pack @highlightjs/cdn-assets@11.11.1 && tar -xzf highlightjs-cdn-assets-11.11.1.tgz
//   node tools/build-grammars.cjs package editor/vendor/highlight-languages.min.js
const fs = require('fs')
const path = require('path')

const GRAMMARS = [
  'ada', 'applescript', 'arduino', 'asciidoc', 'awk', 'clojure', 'cmake', 'coffeescript', 'crystal',
  'd', 'dart', 'delphi', 'django', 'dockerfile', 'dos', 'elixir', 'elm', 'erb', 'erlang', 'fortran',
  'fsharp', 'gherkin', 'glsl', 'gradle', 'groovy', 'haml', 'handlebars', 'haskell', 'haxe', 'http',
  'julia', 'latex', 'lisp', 'llvm', 'nginx', 'nim', 'nix', 'ocaml', 'pgsql', 'powershell',
  'properties', 'protobuf', 'puppet', 'qml', 'scala', 'scheme', 'sml', 'stylus', 'tcl', 'thrift',
  'twig', 'vala', 'vbscript', 'verilog', 'vhdl', 'vim', 'x86asm'
]

const [, , packageDir, outFile] = process.argv
const version = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version

const HEAD = /^\/\*![^*]*\*\/\s*var hljsGrammar=/
const TAIL = /;\s*export default hljsGrammar;\s*$/

const entries = GRAMMARS.map((name) => {
  const source = fs.readFileSync(path.join(packageDir, 'es', 'languages', `${name}.min.js`), 'utf8')
  if (!HEAD.test(source) || !TAIL.test(source)) {
    throw new Error(`${name}: not the shape this script expects`)
  }
  return `${JSON.stringify(name)}:${source.replace(HEAD, '').replace(TAIL, '').trim()}`
})

const banner = `/*!
  Grammars for Highlight.js v${version} that its common build leaves out:
  ${GRAMMARS.join(', ')}.
  Each is copied unchanged from @highlightjs/cdn-assets@${version} (es/languages).
  (c) 2006-2024 Josh Goebel <hello@joshgoebel.com> and other contributors
  License: BSD-3-Clause
 */
`
fs.writeFileSync(outFile, `${banner}export default {\n${entries.join(',\n')}\n};\n`)
console.log(`${GRAMMARS.length} grammars, ${fs.statSync(outFile).size} bytes -> ${outFile}`)
