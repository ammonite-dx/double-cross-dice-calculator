import { describe, expect, it } from 'vitest'

import {
  CHECK_DISPLAY_MODES,
} from '../src/features/check/model/CheckDisplayRequestSnapshot'
import { createCheckRangePolicy } from '../src/runtime/CheckRangePolicy'

function validDisplayRequest(overrides = {}) {
  return {
    min: 0,
    max: 30,
    mode: CHECK_DISPLAY_MODES.PMF,
    ...overrides,
  }
}

function captureError(callback) {
  try {
    callback()
  } catch (error) {
    return error
  }
  throw new Error('Expected callback to throw')
}

describe('CheckRangePolicy runtime boundary', () => {
  it('creates a detached deeply frozen policy snapshot', () => {
    const shared = { workingLength: 4096 }
    const suppliedPolicy = {
      display: { maxPoints: 100 },
      limits: shared,
      errorBudget: { total: 0.1, scoreTail: 0.01 },
    }

    const snapshot = createCheckRangePolicy(
      validDisplayRequest({ min: 2, max: 40 }),
      suppliedPolicy,
    )

    expect(snapshot).not.toBe(suppliedPolicy)
    expect(snapshot.display).not.toBe(suppliedPolicy.display)
    expect(snapshot.limits).not.toBe(suppliedPolicy.limits)
    expect(snapshot.limits.workingLength).toBe(4096)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.display)).toBe(true)
    expect(Object.isFrozen(snapshot.limits)).toBe(true)

    suppliedPolicy.display.maxPoints = 1
    suppliedPolicy.limits.workingLength = 1
    suppliedPolicy.errorBudget.total = 0.2

    expect(snapshot.display.maxPoints).toBe(100)
    expect(snapshot.limits.workingLength).toBe(4096)
    expect(snapshot.errorBudget.total).toBe(0.1)
    expect(snapshot).not.toHaveProperty('min')
    expect(snapshot).not.toHaveProperty('max')
    expect(snapshot).not.toHaveProperty('mode')
  })

  it('preserves cycles and shared aliases in the detached snapshot', () => {
    const suppliedPolicy = {
      display: null,
    }
    suppliedPolicy.display = suppliedPolicy

    const snapshot = createCheckRangePolicy(
      validDisplayRequest(),
      suppliedPolicy,
    )

    expect(snapshot.display).toBe(snapshot)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.extraA)).toBe(true)
  })

  it.each(['min', 'max', 'mode'])('rejects a display coordinate or mode inherited from the prototype (%s)', (property) => {
      const prototype = { [property]: property === 'mode' ? 'pmf' : 0 }
      const request = validDisplayRequest()
      delete request[property]
      Object.setPrototypeOf(request, prototype)

      const error = captureError(() => createCheckRangePolicy(request))
      expect(error).toBeInstanceOf(TypeError)
      expect(error.code).toBe('invalid-display-request')
      expect(error.details.path).toBe(`displayRequest.${property}`)
      expect(Object.isFrozen(error.details)).toBe(true)
    })

  it('rejects a display range whose inclusive point count is unsafe', () => {
    const error = captureError(() => createCheckRangePolicy(
      validDisplayRequest({ max: Number.MAX_SAFE_INTEGER }),
    ))

    expect(error).toBeInstanceOf(TypeError)
    expect(error.code).toBe('invalid-display-request')
    expect(error.details.path).toBeUndefined()
    expect(error.details.min).toBe(0)
    expect(error.details.max).toBe(Number.MAX_SAFE_INTEGER)
    expect(Object.isFrozen(error.details)).toBe(true)
  })

  it('uses the display validation error code for unsupported modes', () => {
    const error = captureError(() => createCheckRangePolicy(
      validDisplayRequest({ mode: 'cdf' }),
    ))

    expect(error).toBeInstanceOf(TypeError)
    expect(error.code).toBe('invalid-display-mode')
    expect(error.details.path).toBe('displayRequest.mode')
    expect(Object.isFrozen(error.details)).toBe(true)
  })

  it.each([
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects an invalid display.maxPoints value: %s', (maxPoints) => {
    const error = captureError(() => createCheckRangePolicy(
      validDisplayRequest(),
      { display: { maxPoints } },
    ))

    expect(error).toBeInstanceOf(TypeError)
    expect(error.code).toBe('invalid-check-range-policy')
    expect(error.details.path).toBe('rangePolicy.display.maxPoints')
    expect(Object.isFrozen(error.details)).toBe(true)
  })

  it.each([
    { calculationMax: undefined },
    { display: { defaultMin: undefined } },
    { display: { defaultMax: undefined } },
  ])('rejects retired policy fields even when undefined: %o', (policy) => {
    const error = captureError(() => createCheckRangePolicy(
      validDisplayRequest(),
      policy,
    ))

    expect(error).toBeInstanceOf(TypeError)
    expect(error.code).toBe('invalid-check-range-policy')
    expect(error.message).toContain('not a supported range policy key')
    expect(Object.isFrozen(error.details)).toBe(true)
  })

  it('keeps display:null as a nullish empty display policy', () => {
    const snapshot = createCheckRangePolicy(
      validDisplayRequest(),
      { display: null },
    )

    expect(snapshot.display).toBeNull()
    expect(Object.isFrozen(snapshot)).toBe(true)
  })

  it.each([null, [], 1, 'policy'])('rejects a malformed supplied policy root: %o', (policy) => {
      const error = captureError(() => createCheckRangePolicy(
        validDisplayRequest(),
        policy,
      ))

      expect(error).toBeInstanceOf(TypeError)
      expect(error.code).toBe('invalid-check-range-policy')
      expect(error.details.path).toBe('rangePolicy')
    })
})
