import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'

const OUTPUT_LIMIT = 256 * 1024 * 1024

/** Runs git in `cwd` and resolves with what it printed; rejects with git's own error text. */
export function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      // Paths print as they are: quoted octal escapes would never match a real file name.
      ['-c', 'core.quotepath=false', ...args],
      { cwd, maxBuffer: OUTPUT_LIMIT, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr).trim() || error.message))
        } else {
          resolve(stdout)
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
