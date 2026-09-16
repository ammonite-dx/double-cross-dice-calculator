import { describe, expect, it, vi } from 'vitest'

import {
  normalizeRuntimeDamageRollWorkerRequest,
} from '../src/runtime/RuntimeDamageRollProtocol'

describe('runtime damage-roll Worker protocol', () => {
  it.each([
    null,
    [],
    'request',
    1,
    true,
  ])('rejects a non-object message: %j', (value) => {
    expect(() => normalizeRuntimeDamageRollWorkerRequest(value))
      .toThrow('must be an object')
  })

  it.each([
    undefined,
    null,
    -1,
    1.5,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects an invalid request id: %j', (id) => {
    expect(() => normalizeRuntimeDamageRollWorkerRequest({ id }))
      .toThrow('id must be a non-negative safe integer')
  })

  it('accepts the id and leaves numerical payload validation to the kernel', () => {
    const request = normalizeRuntimeDamageRollWorkerRequest({ id: 4 })

    expect(request).toEqual({
      id: 4,
      weights: undefined,
      kazanari: undefined,
      options: undefined,
    })
  })

  it('correlates a valid-id payload error and keeps the Worker listener usable', async () => {
    const messages = []
    const listeners = []
    vi.stubGlobal('self', {
      addEventListener: (type, listener) => {
        if (type === 'message') {
          listeners.push(listener)
        }
      },
      postMessage: (message, transfer = []) => {
        messages.push({ message, transfer })
      },
    })

    try {
      await import('../src/runtime/RuntimeDamageRollWorker.js?protocol-test')
      expect(listeners).toHaveLength(1)

      listeners[0]({ data: { id: 7, weights: null } })
      expect(messages[0].message).toMatchObject({
        id: 7,
        error: { name: expect.any(String), message: expect.any(String) },
      })

      listeners[0]({
        data: {
          id: 8,
          weights: [1],
          kazanari: 0,
          options: { fftLength: 16, distributionLength: 16 },
        },
      })
      expect(messages[1].message).toMatchObject({
        id: 8,
        distribution: expect.any(Float64Array),
      })
      expect(messages[1].transfer).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('raises protocol corruption without an id instead of fabricating a response', async () => {
    const listeners = []
    vi.stubGlobal('self', {
      addEventListener: (type, listener) => {
        if (type === 'message') {
          listeners.push(listener)
        }
      },
      postMessage: vi.fn(),
    })

    try {
      await import('../src/runtime/RuntimeDamageRollWorker.js?protocol-invalid-id-test')
      expect(() => listeners[0]({ data: null }))
        .toThrow('must be an object')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
