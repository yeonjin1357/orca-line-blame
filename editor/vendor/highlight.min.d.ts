// Only what this plugin uses of highlight.js 11 (the copied ESM build beside this file).
declare const hljs: {
  highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): { value: string }
}
export default hljs
