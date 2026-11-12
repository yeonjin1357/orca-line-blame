// A stand-in for the part of `orca/testing` this plugin's tests use, so they run under plain Node
// where Orca is not installed: the machines of .github/workflows/tests.yml. `orca plugin test .`
// with the real thing stays the reference; a test that needs more of `orca/testing` needs it here too.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

export { afterEach, assert, beforeEach, describe, test }

/** A host that answers each method with the result listed for it. */
export function mockHost({ results = {} } = {}) {
  return {
    async call(method, params) {
      if (!(method in results)) {
        throw Object.assign(new Error(`the stand-in host has no result for ${method}`), { code: 'unavailable' })
      }
      const result = results[method]
      return typeof result === 'function' ? result(params) : result
    }
  }
}

/** Activates the worker as Orca does and hands requests to the handlers it registers. */
export async function mountWorker(worker, { host } = {}) {
  const handlers = new Map()
  await worker.default({
    host,
    panels: { handle: (name, handler) => handlers.set(name, handler) },
    log() {}
  })
  return {
    request(name, input) {
      const handler = handlers.get(name)
      return handler ? handler(input, {}) : Promise.reject(new Error(`the worker handles no ${name}`))
    }
  }
}
