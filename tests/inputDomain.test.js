import { describe, expect, it } from 'vitest'

import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
  assertRemainingLois,
  assertSafeInteger,
  assertSupportedScoreFeatures,
  INPUT_DOMAIN,
  isCriticalValue,
  isNonNegativeSafeInteger,
  isRemainingLois,
  isSafeInteger,
} from '../src/domain/InputDomain'

describe('canonical input domain', () => {
  it('keeps only the rule-level finite domains finite', () => {
    expect(INPUT_DOMAIN.critical).toEqual({ min: 2, max: 11 })
    expect(INPUT_DOMAIN.remainingLois).toEqual({ min: 0, max: 7 })
    expect(isCriticalValue(2)).toBe(true)
    expect(isCriticalValue(11)).toBe(true)
    expect(isCriticalValue(12)).toBe(false)
    expect(isRemainingLois(7)).toBe(true)
    expect(isRemainingLois(8)).toBe(false)
  })

  it('accepts safe integers without historical ceilings', () => {
    expect(isSafeInteger(-1000)).toBe(true)
    expect(isSafeInteger(1000)).toBe(true)
    expect(isNonNegativeSafeInteger(1000)).toBe(true)
    expect(isNonNegativeSafeInteger(-1)).toBe(false)
    expect(() => assertSafeInteger(Number.MAX_SAFE_INTEGER, 'value')).not.toThrow()
    expect(() => assertNonNegativeSafeInteger(100, 'value')).not.toThrow()
    expect(() => assertSafeInteger(Number.MAX_SAFE_INTEGER + 1, 'value')).toThrow()
  })

  it('rejects unsupported simultaneous score effects explicitly', () => {
    expect(() => assertSupportedScoreFeatures({ yousei: 10, shihai: 0 })).not.toThrow()
    expect(() => assertSupportedScoreFeatures({ yousei: 0, shihai: 20 })).not.toThrow()
    expect(() => assertSupportedScoreFeatures({ yousei: 1, shihai: 1 })).toThrow(
      /cannot both be non-zero/
    )
  })

  it('provides throwing validators for rule domains', () => {
    expect(() => assertCriticalValue(1)).toThrow()
    expect(() => assertRemainingLois(8)).toThrow()
    expect(() => assertNonNegativeSafeInteger(-1, 'value')).toThrow()
  })
})

