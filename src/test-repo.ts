// Test utility: a throwaway git repository on disk, so worker tests run real git.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export type TestRepo = {
  root: string
  git(...args: string[]): string
  /** Writes `text` byte for byte to `file` (a path inside the repository). */
  write(file: string, text: string): void
  /** Stages everything and commits; returns the new commit id. */
  commit(message: string): string
  /** The blob id git gives `text`, computed by git itself. */
  blobId(text: string): string
  dispose(): void
}

export function createRepo(): TestRepo {
  const root = mkdtempSync(path.join(tmpdir(), 'line-blame-test-'))
  let commits = 0
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Tester')
  git('config', 'user.email', 'tester@example.com')
  git('config', 'commit.gpgsign', 'false')
  // The tests write exact bytes: git must not rewrite line endings behind them.
  git('config', 'core.autocrlf', 'false')
  return {
    root,
    git,
    write(file, text) {
      const absolute = path.join(root, file)
      mkdirSync(path.dirname(absolute), { recursive: true })
      writeFileSync(absolute, text)
    },
    commit(message) {
      // One second apart, so "the commit before" is never a tie.
      const date = `2026-01-01T00:00:${String(commits++).padStart(2, '0')}Z`
      git('add', '-A')
      execFileSync('git', ['commit', '-q', '-m', message], {
        cwd: root,
        windowsHide: true,
        env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
      })
      return git('rev-parse', 'HEAD')
    },
    blobId(text) {
      return execFileSync('git', ['hash-object', '--stdin'], { cwd: root, input: text, encoding: 'utf8' }).trim()
    },
    dispose() {
      rmSync(root, { recursive: true, force: true })
    }
  }
}
