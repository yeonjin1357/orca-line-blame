const BOM = String.fromCharCode(0xfeff)

/** The lines of `text`, whatever its line endings, without a byte order mark. */
export function toLines(text: string): string[] {
  return (text.startsWith(BOM) ? text.slice(1) : text).replace(/\r\n?/g, '\n').split('\n')
}

/** The id git gives a file with exactly this text. */
async function blobId(text: string): Promise<string> {
  const body = new TextEncoder().encode(text)
  const head = new TextEncoder().encode(`blob ${body.length}\0`)
  const bytes = new Uint8Array(head.length + body.length)
  bytes.set(head)
  bytes.set(body, head.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Orca gives an editor the text of a file but never its path, so the worker finds the file by
 * the ids git would give that text: one per line-ending and BOM form it may be stored in, and
 * `canonicalId` for the LF form that changed files on disk are compared by.
 */
export async function describeText(text: string): Promise<{ blobIds: string[]; canonicalId: string }> {
  const lf = toLines(text).join('\n')
  const crlf = lf.replace(/\n/g, '\r\n')
  const forms = [...new Set([lf, text, crlf, BOM + lf, BOM + crlf])]
  const blobIds = await Promise.all(forms.map(blobId))
  return { blobIds, canonicalId: blobIds[0] }
}
