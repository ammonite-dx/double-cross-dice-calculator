import { describe, expect, it } from 'vitest'

import {
  ATTACK_DISPLAY_MODES,
  ATTACK_DISPLAY_REQUEST_ERROR_CODES,
  createAttackDisplayRequestSnapshot,
} from '../src/application/AttackDisplayRequestSnapshot'

describe('Attack display request snapshot', () => {
  it('creates an alias-free frozen snapshot beyond the legacy 999 boundary', () => {
    const draft = {
      min: 1200,
      max: 1200,
      mode: ATTACK_DISPLAY_MODES.UPPER_TAIL,
    }
    const snapshot = createAttackDisplayRequestSnapshot(draft)

    expect(snapshot).toEqual(draft)
    expect(snapshot).not.toBe(draft)
    expect(Object.isFrozen(snapshot)).toBe(true)

    draft.min = 0
    draft.max = 999
    expect(snapshot).toEqual({
      min: 1200,
      max: 1200,
      mode: ATTACK_DISPLAY_MODES.UPPER_TAIL,
    })
  })

  it('accepts only the canonical PMF and upper-tail modes', () => {
    expect(createAttackDisplayRequestSnapshot({
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })).toEqual({ min: 0, max: 1, mode: ATTACK_DISPLAY_MODES.PMF })
    expect(createAttackDisplayRequestSnapshot({
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.UPPER_TAIL,
    })).toEqual({
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.UPPER_TAIL,
    })
  })

  it.each([
    { min: -1, max: 0, mode: ATTACK_DISPLAY_MODES.PMF },
    { min: 0.5, max: 1, mode: ATTACK_DISPLAY_MODES.PMF },
    { min: 0, max: Number.MAX_SAFE_INTEGER + 1, mode: ATTACK_DISPLAY_MODES.PMF },
    { min: 2, max: 1, mode: ATTACK_DISPLAY_MODES.PMF },
    { min: 0, max: Number.MAX_SAFE_INTEGER, mode: ATTACK_DISPLAY_MODES.PMF },
    { min: 0, max: 1, mode: '達成値がXとなる確率を表示' },
  ])('rejects malformed requests %o', (request) => {
    expect(() => createAttackDisplayRequestSnapshot(request)).toThrow()
  })

  it('reports typed coordinate and mode validation codes', () => {
    expect(() => createAttackDisplayRequestSnapshot({
      min: -1,
      max: 0,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })).toThrow(expect.objectContaining({
      code: ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_MIN,
    }))
    expect(() => createAttackDisplayRequestSnapshot({
      min: 0,
      max: 1,
      mode: 'unknown',
    })).toThrow(expect.objectContaining({
      code: ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_MODE,
    }))
    expect(() => createAttackDisplayRequestSnapshot({
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })).toThrow(expect.objectContaining({
      code: ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_POINT_COUNT,
    }))
  })

  it('does not execute accessor properties', () => {
    let called = false
    const request = { min: 0, max: 1, mode: ATTACK_DISPLAY_MODES.PMF }
    Object.defineProperty(request, 'max', {
      configurable: true,
      enumerable: true,
      get() {
        called = true
        throw new Error('display request getter must not run')
      },
    })

    expect(() => createAttackDisplayRequestSnapshot(request)).toThrow(
      expect.objectContaining({
        code: ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      })
    )
    expect(called).toBe(false)
  })

  it('converts revoked and reflection-failing proxies to typed invalid requests', () => {
    const revoked = Proxy.revocable({
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }, {})
    revoked.revoke()

    expect(() => createAttackDisplayRequestSnapshot(revoked.proxy)).toThrow(
      expect.objectContaining({
        code: ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      })
    )

    const reflectionFailure = new Proxy({
      min: 0,
      max: 1,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }, {
      getOwnPropertyDescriptor() {
        throw new Error('reflection failure')
      },
    })
    expect(() => createAttackDisplayRequestSnapshot(reflectionFailure)).toThrow(
      expect.objectContaining({
        code: ATTACK_DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      })
    )
  })
})
