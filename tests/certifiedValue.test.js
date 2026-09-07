import {
  createBoundedCertifiedValue,
  createBoundedProbability,
  createExactCertifiedValue,
  createExactProbability,
  createLowerBoundCertifiedValue,
} from '../src/domain/CertifiedValue'
import { describe, expect, it } from 'vitest'

describe('CertifiedValue constructors', () => {
  it('creates immutable exact, bounded, and lower-bound values', () => {
    const exact = createExactCertifiedValue(5.5)
    const bounded = createBoundedCertifiedValue(1, 2)
    const lowerBound = createLowerBoundCertifiedValue(3)

    expect(exact).toEqual({ kind: 'exact', value: 5.5 })
    expect(bounded).toEqual({ kind: 'bounded', lowerBound: 1, upperBound: 2 })
    expect(lowerBound).toEqual({ kind: 'lower-bound', lowerBound: 3 })
    expect(Object.isFrozen(exact)).toBe(true)
    expect(Object.isFrozen(bounded)).toBe(true)
    expect(Object.isFrozen(lowerBound)).toBe(true)
  })

  it('keeps an equal generic interval bounded', () => {
    expect(createBoundedCertifiedValue(2, 2)).toEqual({
      kind: 'bounded',
      lowerBound: 2,
      upperBound: 2,
    })
  })

  it.each([
    [createExactCertifiedValue, Number.NaN],
    [createExactCertifiedValue, Number.POSITIVE_INFINITY],
    [createBoundedCertifiedValue, Number.NaN, 1],
    [createBoundedCertifiedValue, 0, Number.NEGATIVE_INFINITY],
    [createLowerBoundCertifiedValue, Number.NaN],
  ])('rejects non-finite certified values', (constructor, ...values) => {
    expect(() => constructor(...values)).toThrow(TypeError)
  })

  it('rejects inverted bounded values', () => {
    expect(() => createBoundedCertifiedValue(2, 1)).toThrow(RangeError)
  })
})

describe('CertifiedProbability constructors', () => {
  it('uses fractions in the closed unit interval', () => {
    const exact = createExactProbability(0.25)
    const bounded = createBoundedProbability(0.2, 0.8)

    expect(exact).toEqual({ kind: 'exact', value: 0.25 })
    expect(bounded).toEqual({
      kind: 'bounded',
      lowerBound: 0.2,
      upperBound: 0.8,
    })
    expect(Object.isFrozen(exact)).toBe(true)
    expect(Object.isFrozen(bounded)).toBe(true)
  })

  it.each([
    [createExactProbability, -0.01],
    [createExactProbability, 1.01],
    [createExactProbability, Number.NaN],
    [createBoundedProbability, -0.01, 0.5],
    [createBoundedProbability, 0.1, 1.01],
    [createBoundedProbability, 0.8, 0.2],
  ])('rejects invalid probabilities', (constructor, ...values) => {
    expect(() => constructor(...values)).toThrow()
  })
})
