import { assert, test } from 'orca/testing'
import { describeText, toLines } from './identify'

// Reference ids are git's own: `printf '<text>' | git hash-object --stdin`.
const HELLO_LF = 'ce013625030ba8dba906f756967f9e9ca394464a'
const HELLO_CRLF = 'ef0493b275aa2080237f676d2ef6559246f56636'
const HELLO_BOM_CRLF = 'ad3a9a389a67fed3081f0079c859b1e5c190df53'
const BOM = String.fromCharCode(0xfeff)

test('names a text by the blob id of its LF form, whatever line endings it arrived with', async () => {
  assert.equal((await describeText('hello\r\n')).canonicalId, HELLO_LF)
  assert.equal((await describeText('hello\n')).canonicalId, HELLO_LF)
  assert.equal((await describeText(`${BOM}hello\n`)).canonicalId, HELLO_LF)
})

test('offers the ids of every form the file may be committed in', async () => {
  const { blobIds } = await describeText('hello\n')

  assert.ok(blobIds.includes(HELLO_LF), 'LF')
  assert.ok(blobIds.includes(HELLO_CRLF), 'CRLF')
  assert.ok(blobIds.includes(HELLO_BOM_CRLF), 'BOM + CRLF')
})

test('splits lines on any line ending and drops a byte order mark', () => {
  assert.deepEqual(toLines(`${BOM}a\r\nb\rc\nd`), ['a', 'b', 'c', 'd'])
})
