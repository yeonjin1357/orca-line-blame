# Line Blame

See who changed a line of code, when and why, without leaving [Orca](https://orca.dev).

Click a line and the answer appears at the end of it, the way GitLens shows it in VS Code. The view is read-only: it is for finding out when a problem got in, not for editing.

[한국어 안내](README.ko.md)

![A line of code with its author, date and commit title at the end, and a card showing what the commit changed](images/screenshot-blame.png)

## What you can do

**1. See who changed a line.** Click any line. Its author, how long ago and the commit title appear at the end of the line.

**2. See what that commit changed.** Hover over that text. A card shows the whole commit message, and the line before and after the change.

**3. Go back in time.** Press **◀ Earlier change** in the card to see the commit that changed the line before that. Keep pressing to reach the commit that first wrote the line.

![The card showing an earlier change of the same line](images/screenshot-history.png)

**4. Find in the file.** Press Ctrl+F or the **Find** button. As you move between matches, each line shows its blame.

![Find in file, with every match highlighted](images/screenshot-find.png)

## Install

1. In Orca, open **Settings → Plugins → Install plugin → From a Git URL…**
2. Enter `yeonjin1357/orca-line-blame` and install.
3. Press **Enable plugin** in the approval window.

Or run this in a terminal and follow what it prints:

```sh
orca plugin install yeonjin1357/orca-line-blame
```

It needs Orca 1.4.248 or later, and git.

## Use

Open a file as usual, then pick **Blame** in the editor's view switch, next to **Source**. To edit the file, switch back to **Source**.

It works for `.vue`, TypeScript, JavaScript, `.scss`, `.css`, `.json`, `.md`, `.html`, YAML and `.sh` files.

## About the "Full access" warning

Orca shows this warning when you install the plugin, because Line Blame starts its own program to run git. That program only runs git commands that read (`blame`, `diff`, `show`, `status`, `ls-files`). It never changes your files or your repository, and it sends nothing over the network.

## Good to know

- **Two files with the same content.** Orca does not tell a plugin which file is open, so Line Blame finds the file by its content. If two files are identical, pick the right one at the top of the view.
- **"Earlier change" is a best guess.** Git does not record which old line became which new line, so the plugin follows the most similar one. For a line that was rewritten from scratch it can follow the wrong line.
- **Language.** The view is in Korean when Orca is, and in English otherwise.
- **Local workspaces only.** Git runs on the computer Orca runs on.

<details>
<summary>For contributors</summary>

```sh
orca plugin test .          # tests; the worker tests run real git in throwaway repositories
orca plugin check .         # static check of the editor
orca plugin dev load .      # load this folder into Orca (the first time needs --approve)
orca plugin dev reload .    # after a change
```

Orca loads `.ts` files as written and never type-checks them. Run `tsc -p .` from a place that has `typescript` and `@types/node`; this repository keeps no `node_modules`.

| Path | What it holds |
| --- | --- |
| `src/worker.ts` | The background program: answers the view's requests and checks their input |
| `src/locate.ts` | Finding which file an open text belongs to |
| `src/blame.ts` | Reading `git blame --porcelain` |
| `src/change.ts` | Reading `git diff -U0`: what a commit did to one line and which line it replaced |
| `src/protocol.ts` | The types the view and the background program exchange |
| `editor/main.ts` | The view: code lines, the blame text, the summary bar |
| `editor/card.ts` | The commit card and stepping through a line's history |
| `editor/find-bar.ts`, `editor/find.ts` | Find in file |
| `editor/messages.ts` | Everything the view says, in Korean and in English |
| `editor/highlight.ts` | Syntax colours, with highlight.js |

The screenshots show a made-up project, not real code.

</details>

## License

MIT, see [LICENSE](LICENSE). Syntax colours come from [highlight.js](https://highlightjs.org/) (BSD-3-Clause, [license](editor/vendor/HIGHLIGHTJS-LICENSE.txt)). The icon is drawn from [Lucide](https://lucide.dev)'s "git-commit-horizontal" (ISC).
