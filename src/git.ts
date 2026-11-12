import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'

const OUTPUT_LIMIT = 256 * 1024 * 1024

/**
 * Why git gave no answer. `not-a-repository`: the folder is not one, or is gone, which is ordinary
 * for a folder workspace. `git-missing`: git itself could not be started. `git-error`: git refused.
 */
export type GitFailure = Error & { reason: 'not-a-repository' | 'git-missing' | 'git-error' }

function failure(reason: GitFailure['reason'], message: string): GitFailure {
  return Object.assign(new Error(message), { reason })
}

/** Runs git in `cwd` and resolves with what it printed; rejects with a `GitFailure`. */
export function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      // Paths print as they are: quoted octal escapes would never match a real file name.
      ['-c', 'core.quotepath=false', ...args],
      {
        cwd,
        maxBuffer: OUTPUT_LIMIT,
        windowsHide: true,
        encoding: 'utf8',
        // Git's messages in English whatever the user's language: one of them is read below.
        env: { ...process.env, LC_ALL: 'C' }
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout)
          return
        }
        const said = String(stderr).trim() || error.message
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // The same error code whether git or the folder to run it in is the thing missing.
          reject(
            existsSync(cwd)
              ? failure('git-missing', 'git could not be run: install git, or add it to the PATH Orca starts with')
              : failure('not-a-repository', `${cwd} does not exist`)
          )
        } else if (/not a git repository/i.test(said)) {
          reject(failure('not-a-repository', said))
        } else {
          reject(failure('git-error', said))
        }
      }
    )
  })
}

/** The id git gives a file with exactly these bytes. */
export function blobId(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

/** The id of the same text with LF line endings and no BOM: what the frame sends as `canonicalId`. */
export function canonicalBlobId(bytes: Buffer): string {
  let text = bytes.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  return blobId(Buffer.from(text.replace(/\r\n?/g, '\n'), 'utf8'))
}
