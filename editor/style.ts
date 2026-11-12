/** The whole stylesheet; colours come from Orca's theme variables so both themes work. */
export const STYLE = `
:root {
  --lb-font: 'Cascadia Code', 'JetBrains Mono', ui-monospace, Consolas, 'D2Coding', monospace;
  --lb-keyword: #cf222e; --lb-string: #0a3069; --lb-comment: #6e7781; --lb-number: #0550ae;
  --lb-function: #8250df; --lb-tag: #116329; --lb-builtin: #953800;
  --lb-current: color-mix(in srgb, var(--orca-accent) 70%, var(--orca-background));
  --lb-removed: rgb(255 129 130 / 0.3); --lb-added: rgb(74 194 107 / 0.3);
  --lb-match: rgb(255 213 0 / 0.45); --lb-match-current: rgb(255 140 0 / 0.75);
}
html.dark {
  --lb-keyword: #ff7b72; --lb-string: #a5d6ff; --lb-comment: #8b949e; --lb-number: #79c0ff;
  --lb-function: #d2a8ff; --lb-tag: #7ee787; --lb-builtin: #ffa657;
  --lb-removed: rgb(248 81 73 / 0.22); --lb-added: rgb(63 185 80 / 0.22);
  --lb-match: rgb(234 179 8 / 0.35); --lb-match-current: rgb(249 115 22 / 0.7);
}
html, body { height: 100%; margin: 0; }
body {
  display: flex; flex-direction: column; overflow: hidden; position: relative;
  background: var(--orca-background); color: var(--orca-foreground);
  font: 12px/1.4 system-ui, 'Pretendard', 'Malgun Gothic', sans-serif;
}
button {
  font: inherit; color: inherit; background: none; cursor: pointer; padding: 2px 8px;
  border: 1px solid var(--orca-border); border-radius: 4px;
}
button:hover:not(:disabled) { background: var(--orca-accent); }
button:disabled { opacity: 0.45; cursor: default; }
.grow { flex: 1; }
.warn { color: var(--orca-destructive); }

#bar {
  flex: none; display: flex; align-items: center; gap: 10px; padding: 4px 12px; min-height: 24px;
  border-bottom: 1px solid var(--orca-border); color: var(--orca-muted-foreground);
  white-space: nowrap;
}
#bar .path { color: var(--orca-foreground); overflow: hidden; text-overflow: ellipsis; }
#bar .summary { overflow: hidden; text-overflow: ellipsis; }
#bar select {
  max-width: 50%; font: inherit; color: var(--orca-foreground);
  background: var(--orca-background); border: 1px solid var(--orca-input); border-radius: 4px;
}

#scroll { flex: 1; overflow: auto; outline: none; }
#lines {
  display: inline-block; min-width: 100%; box-sizing: border-box; padding: 4px 0 40vh;
  font: 13px/20px var(--lb-font); tab-size: 2;
}
.line { display: flex; height: 20px; white-space: pre; cursor: text; }
.line.current { background: var(--lb-current); }
.ln {
  flex: none; box-sizing: content-box; padding: 0 16px 0 12px; text-align: right;
  position: sticky; left: 0; background: var(--orca-background);
  color: color-mix(in srgb, var(--orca-muted-foreground) 70%, var(--orca-background)); user-select: none;
}
.line.current .ln { background: var(--lb-current); color: var(--orca-foreground); }
.ann {
  flex: none; margin-left: 3em; padding-right: 24px; font-style: italic; cursor: default;
  max-width: 72ch; overflow: hidden; text-overflow: ellipsis;
  color: var(--orca-muted-foreground); opacity: 0.75; user-select: none;
}
.ann:hover { opacity: 1; }
::highlight(lb-find) { background-color: var(--lb-match); }
::highlight(lb-find-current) { background-color: var(--lb-match-current); }

#find {
  position: absolute; top: 34px; right: 22px; z-index: 5; display: flex; align-items: center; gap: 4px;
  padding: 5px 6px; border: 1px solid var(--orca-border); border-radius: var(--orca-radius, 6px);
  background: var(--orca-popover); color: var(--orca-popover-foreground);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
}
#find[hidden] { display: none; }
#find input {
  width: 220px; padding: 3px 6px; font: 12px/1.4 var(--lb-font); color: var(--orca-foreground);
  background: var(--orca-background); border: 1px solid var(--orca-input); border-radius: 4px; outline: none;
}
#find input:focus { border-color: var(--orca-ring); }
#find.empty input { border-color: var(--orca-destructive); }
#find .count { min-width: 56px; padding: 0 4px; text-align: center; color: var(--orca-muted-foreground); }
#find button { padding: 2px 6px; border-color: transparent; }
#find button.on { background: var(--orca-accent); border-color: var(--orca-border); }

#card {
  position: fixed; z-index: 10; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;
  width: max-content; min-width: 320px; max-width: min(680px, calc(100vw - 16px));
  max-height: min(70vh, 520px); overflow: auto; padding: 10px 12px;
  border: 1px solid var(--orca-border); border-radius: var(--orca-radius, 6px);
  background: var(--orca-popover); color: var(--orca-popover-foreground);
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.28);
}
#card[hidden] { display: none; }
#card.pinned { border-color: var(--orca-ring); }
#card .head, #card .foot { display: flex; align-items: center; gap: 8px; }
#card .who { font-weight: 600; }
#card .when, #card .label, #card .mail { color: var(--orca-muted-foreground); }
#card .label.warn { color: var(--orca-destructive); }
#card .close { display: none; padding: 0 6px; border-color: transparent; }
#card.pinned .close { display: block; }
#card .message { max-height: 160px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
#card .change { display: flex; flex-direction: column; gap: 4px; }
#card .diff {
  overflow-x: auto; border: 1px solid var(--orca-border); border-radius: 4px;
  font: 12px/18px var(--lb-font); white-space: pre; tab-size: 2;
}
#card .diff > div { display: flex; min-width: max-content; padding-right: 8px; }
#card .diff .del { background: var(--lb-removed); }
#card .diff .add { background: var(--lb-added); }
#card .diff .focus { box-shadow: inset 3px 0 0 var(--orca-ring); font-weight: 600; }
#card .diff .sign { flex: none; width: 18px; text-align: center; user-select: none; opacity: 0.7; }
#card .foot { padding-top: 8px; border-top: 1px solid var(--orca-border); font: 12px/1.4 var(--lb-font); }
#card .sha { user-select: all; }
#card .foot button { font: 12px/1.4 system-ui, 'Pretendard', 'Malgun Gothic', sans-serif; white-space: nowrap; }

.hljs-keyword, .hljs-meta, .hljs-doctag, .hljs-selector-tag, .hljs-template-tag { color: var(--lb-keyword); }
.hljs-string, .hljs-regexp, .hljs-template-string { color: var(--lb-string); }
.hljs-comment, .hljs-quote { color: var(--lb-comment); font-style: italic; }
.hljs-number, .hljs-literal, .hljs-attr, .hljs-attribute, .hljs-variable, .hljs-selector-class,
.hljs-selector-id, .hljs-property { color: var(--lb-number); }
.hljs-title, .hljs-title.function_, .hljs-title.class_, .hljs-section { color: var(--lb-function); }
.hljs-name, .hljs-selector-pseudo { color: var(--lb-tag); }
.hljs-built_in, .hljs-type, .hljs-symbol, .hljs-bullet { color: var(--lb-builtin); }
`
