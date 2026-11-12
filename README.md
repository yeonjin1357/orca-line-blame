# Line Blame

A read-only code view for [Orca](https://github.com/stablyai/orca) that answers "who changed this line, when, and in which commit?" without leaving Orca. Click a line and the answer appears at the end of it, the way GitLens shows it in VS Code.

It is made for reading, not editing: tracing when a problem was introduced while agents do the writing.

The view speaks Korean when Orca's interface language is Korean, and English otherwise.

## What it does

- **Click a line, or move with ↑ / ↓.** The end of the line shows `author, how long ago • commit title`.
- **Hover that text.** A card shows the whole commit message and what that commit did to the line: the lines it removed and added.
- **◀ Earlier change.** Steps back to the commit that changed the line before that, down to the commit that first wrote it. **Later change ▶** steps forward again. Press anywhere in the card to pin it; Esc or a press outside closes it.
- **Ctrl+F, or the Find button.** Find in file. Enter and Shift+Enter move between matches, and the line you land on shows its blame.

It registers as the `Blame` view for `.vue`, TypeScript, JavaScript, `.scss`, `.css`, `.json`, `.md`, `.html`, YAML and `.sh` files. To edit a file, switch the view back to Source.

## Install

```sh
orca plugin install yeonjin1357/orca-line-blame
```

Orca asks you to approve the access below before it runs.

## What it is allowed to do

Line Blame is a full-access plugin: it runs its own Node.js process with your user account's access, because it has to run git. That process only ever runs read-only git commands (`ls-files`, `status`, `blame`, `diff`, `show`) in workspaces Orca itself lists, and reads changed files to compare them. It never writes a file, never changes a repository and makes no network request.

## Limits

- **Orca does not tell an editor plugin which file is open.** Line Blame finds the file by the git blob id of the text it was given. When two files have the same text, pick the right one at the top of the view.
- **"Earlier change" is a judgement.** Git does not pair the lines of a change, so the plugin follows the removed line most like the one you asked about (also when the commit moved it elsewhere in the file), and otherwise the removed line at the same position. A line rewritten beyond recognition can lead it astray.
- Local workspaces only: git runs on the machine Orca runs on.

## Develop

```sh
orca plugin test .          # tests; the worker tests run real git in throwaway repositories
orca plugin check .         # static check of the editor
orca plugin dev load .      # load this folder into Orca (the first time needs --approve)
orca plugin dev reload .    # after a change
```

Orca loads `.ts` files as written and never type-checks them. Run `tsc -p .` from a place that has `typescript` and `@types/node`; this repository keeps no `node_modules`.

| Path | What it holds |
| --- | --- |
| `src/worker.ts` | The background process: answers the view's requests and checks their input |
| `src/locate.ts` | Finding which file an open text belongs to |
| `src/blame.ts` | Reading `git blame --porcelain` |
| `src/change.ts` | Reading `git diff -U0`; what a commit did to one line and which line it replaced |
| `src/protocol.ts` | The types the view and the worker exchange |
| `editor/main.ts` | The view: code lines, the blame text, the summary bar |
| `editor/card.ts` | The commit card and stepping through a line's history |
| `editor/find-bar.ts`, `editor/find.ts` | Find in file |
| `editor/messages.ts` | Everything the view says, in Korean and in English |
| `editor/highlight.ts` | Syntax colours, with [highlight.js](https://highlightjs.org/) (BSD-3-Clause, copied into `editor/vendor/`) |

## 한국어

Orca 안에서 "이 줄을 누가, 언제, 어떤 커밋으로 고쳤는지" 바로 보는 읽기 전용 코드 보기입니다. Orca 언어가 한국어면 한국어로, 그 외에는 영어로 표시됩니다.

- **줄 클릭 / ↑↓:** 줄 끝에 `사람, 얼마 전 • 커밋 제목`이 뜹니다.
- **그 글씨에 마우스 올리기:** 커밋 메시지 전체와, 그 커밋이 그 줄을 어떻게 바꿨는지(변경 전/후)를 보여주는 카드가 뜹니다.
- **`◀ 이전 변경`:** 그 줄을 그 전에 고친 커밋으로 거슬러 갑니다. 줄이 처음 생긴 커밋까지 갈 수 있고 `다음 변경 ▶`으로 돌아옵니다. 카드 안을 누르면 고정되고 Esc나 바깥 클릭으로 닫힙니다.
- **Ctrl+F 또는 `찾기`:** 파일 안에서 찾기.

편집은 하지 않습니다. 고치려면 보기 전환에서 Source를 고르세요. "이전 변경"은 git이 줄끼리 짝을 지어주지 않아 추정으로 따라가며, 완전히 새로 쓴 줄에서는 어긋날 수 있습니다.

## License

MIT. See [LICENSE](LICENSE). highlight.js is BSD-3-Clause, see [editor/vendor/HIGHLIGHTJS-LICENSE.txt](editor/vendor/HIGHLIGHTJS-LICENSE.txt).
