import { describe, expect, it } from 'vitest'

import {
  ATTACK_DISPLAY_MODES,
  ATTACK_DISPLAY_REQUEST_ERROR_CODES,
  createAttackRangePolicy,
  createAttackDisplayRequestSnapshot,
} from '../src/application/AttackDisplayRequestSnapshot'
import { planCalculationRanges } from '../src/calculation/RangePlanner'

describe('Attack display request snapshot', () => {
  it.each([
    { label: '0..100', min: 0, max: 100 },
    { label: '0..999', min: 0, max: 999 },
    { label: '0..1000', min: 0, max: 1000 },
    { label: '0..1023', min: 0, max: 1023 },
    { label: '0..1024', min: 0, max: 1024 },
    { label: '0..1200', min: 0, max: 1200 },
    { label: '1000..1200', min: 1000, max: 1200 },
    { label: '0..20000', min: 0, max: 20000 },
  ])('accepts the arbitrary safe display window $label', ({ min, max }) => {
    const request = {
      min,
      max,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }

    expect(createAttackDisplayRequestSnapshot(request)).toEqual(request)
  })

  it('accepts a single-point window when min equals max', () => {
    expect(createAttackDisplayRequestSnapshot({
      min: 1200,
      max: 1200,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })).toEqual({
      min: 1200,
      max: 1200,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })
  })

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

  it('creates a frozen calculation policy that expands with the display window', () => {
    const suppliedPolicy = {
      calculationMax: 100,
      display: { maxPoints: 2 },
      limits: { hard: { workingLength: 20 } },
    }
    const policy = createAttackRangePolicy({
      min: 10,
      max: 1200,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }, suppliedPolicy)

    expect(policy.calculationMax).toBe(1200)
    expect(policy.display).toMatchObject({
      defaultMin: 10,
      defaultMax: 1200,
      maxPoints: 1191,
    })
    expect(policy.limits).toEqual(suppliedPolicy.limits)
    expect(policy).not.toBe(suppliedPolicy)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.display)).toBe(true)

    suppliedPolicy.calculationMax = 9999
    suppliedPolicy.display.maxPoints = 1
    expect(policy.calculationMax).toBe(1200)
    expect(policy.display.maxPoints).toBe(1191)
  })

  it('passes the expanded display boundary through the existing RangePlanner', () => {
    const policy = createAttackRangePolicy({
      min: 0,
      max: 1200,
      mode: ATTACK_DISPLAY_MODES.PMF,
    })
    const plan = planCalculationRanges({
      operation: 'attack',
      score: {
        action: {
          dice: 1,
          critical: 10,
          skill: 0,
          yousei: 0,
          shihai: 0,
        },
        reaction: {
          dice: 1,
          critical: 10,
          skill: 0,
          yousei: 0,
          shihai: 0,
        },
      },
      attack: { dice: 0, value: 1, kazanari: 0 },
      defence: { dice: 0, value: 0 },
    }, policy)

    expect(plan.display).toMatchObject({ min: 0, max: 1200, points: 1201 })
    expect(plan.propagation.calculationMax).toBe(1200)
    expect(plan.damage.workingMax).toBeGreaterThanOrEqual(1200)
  })

  it('composes Damage and Score display windows without shrinking either range', () => {
    const policy = createAttackRangePolicy(
      {
        min: 0,
        max: 300,
        mode: ATTACK_DISPLAY_MODES.PMF,
      },
      { calculationMax: 100 },
      {
        min: 900,
        max: 1200,
        mode: ATTACK_DISPLAY_MODES.UPPER_TAIL,
      }
    )

    expect(policy.calculationMax).toBe(1200)
    expect(policy.display).toMatchObject({
      defaultMin: 0,
      defaultMax: 1200,
      maxPoints: 1201,
    })
    expect(policy.calculationMax).toBeGreaterThanOrEqual(300)
    expect(policy.calculationMax).toBeGreaterThanOrEqual(1200)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.display)).toBe(true)
  })
})
