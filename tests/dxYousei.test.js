import { describe, expect, it } from 'vitest'

import {
  calculateDxDistribution,
  DX_CRITICAL_MAX,
} from '../src/calculation/DxCalculator'

function totalMass(distribution) {
  return distribution.reduce((sum, probability) => sum + probability, 0)
}

function assertValid(distribution) {
  expect(distribution).toBeInstanceOf(Float64Array)
  expect(totalMass(distribution)).toBeCloseTo(1, 12)
  for (const probability of distribution) {
    expect(Number.isFinite(probability)).toBe(true)
    expect(probability).toBeGreaterThanOrEqual(0)
  }
}

function createFiniteOneDie(critical, length) {
  const result = new Float64Array(length)
  const overflow = length - 1
  const criticalProbability = (11 - critical) / 10

  for (let remainder = 1; remainder < critical; remainder += 1) {
    let value = remainder
    let probability = 0.1
    while (value < overflow) {
      result[value] += probability
      value += 10
      probability *= criticalProbability
    }
    result[overflow] += probability
  }

  return result
}

function createFiniteMaximum(dice, critical, length) {
  if (dice === 0) {
    const result = new Float64Array(length)
    result[0] = 1
    return result
  }

  const oneDie = createFiniteOneDie(critical, length)
  const result = new Float64Array(length)
  const overflow = length - 1
  let cumulative = 0
  let previous = 0
  for (let value = 0; value < overflow; value += 1) {
    cumulative += oneDie[value]
    const current = cumulative ** dice
    result[value] = current - previous
    previous = current
  }
  result[overflow] = 1 - previous
  return result
}

function oldStyleYousei({ dice, critical, yousei }, length) {
  const overflow = length - 1
  const oneDie = createFiniteOneDie(critical, length)
  let current = createFiniteMaximum(dice, critical, length)

  for (let count = 0; count < yousei; count += 1) {
    const rounded = new Float64Array(length)
    for (let value = 0; value < overflow; value += 1) {
      const target = value === 0
        ? 0
        : Math.min(overflow, Math.ceil(value / 10) * 10)
      rounded[target] += current[value]
    }
    rounded[overflow] = 1 - rounded.slice(0, overflow)
      .reduce((sum, probability) => sum + probability, 0)

    const next = new Float64Array(length)
    for (let left = 0; left < length; left += 1) {
      if (current[left] === 0 && rounded[left] === 0) {
        continue
      }
      for (let right = 0; right < length; right += 1) {
        if (oneDie[right] === 0) {
          continue
        }
        const value = Math.min(overflow, left + right)
        next[value] += rounded[left] * oneDie[right]
      }
    }
    current = next
  }

  return current
}

describe('runtime DX distribution with Yousei integrated', () => {
  it.each([
    { dice: 0, critical: 2, yousei: 0 },
    { dice: 0, critical: 2, yousei: 1 },
    { dice: 0, critical: 10, yousei: 10 },
    { dice: 0, critical: 11, yousei: 100 },
  ])('keeps zero dice as a point mass at zero: %o', (params) => {
    const distribution = calculateDxDistribution({
      ...params,
      shihai: 0,
    }, { workingLength: 128, rounding: 'unrounded' })

    assertValid(distribution)
    expect(distribution[0]).toBe(1)
    expect(distribution.slice(1).every((probability) => probability === 0))
      .toBe(true)
  })

  it.each([
    { dice: 1, critical: DX_CRITICAL_MAX, yousei: 1 },
    { dice: 10, critical: DX_CRITICAL_MAX, yousei: 1 },
    { dice: 10, critical: DX_CRITICAL_MAX, yousei: 9 },
  ])('turns critical=11 and a Yousei use into a point mass at ten: %o', (params) => {
    const distribution = calculateDxDistribution({
      ...params,
      shihai: 0,
    }, { workingLength: 128, rounding: 'unrounded' })

    assertValid(distribution)
    expect(distribution[10]).toBe(1)
    expect(distribution.slice(0, 10).every((probability) => probability === 0))
      .toBe(true)
    expect(distribution.slice(11).every((probability) => probability === 0))
      .toBe(true)
  })

  it.each([
    { dice: 1, critical: 2, yousei: 1 },
    { dice: 2, critical: 3, yousei: 2 },
    { dice: 3, critical: 7, yousei: 1 },
    { dice: 10, critical: 10, yousei: 3 },
  ])('matches the old round-and-convolution semantics: %o', (params) => {
    const length = 4098
    const actual = calculateDxDistribution({
      ...params,
      shihai: 0,
    }, { workingLength: length, rounding: 'unrounded' })
    const expected = oldStyleYousei(params, length)

    assertValid(actual)
    for (let value = 0; value < length; value += 1) {
      expect(actual[value]).toBeCloseTo(expected[value], 10)
    }
  })

  it.each([
    { dice: 99, critical: 2, yousei: 9 },
    { dice: 100, critical: 2, yousei: 10 },
    { dice: 300, critical: 2, yousei: 30 },
    { dice: 500, critical: 5, yousei: 40 },
  ])('remains finite and normalized for larger supported inputs: %o', (params) => {
    const distribution = calculateDxDistribution({
      ...params,
      shihai: 0,
    }, { workingLength: 4172, rounding: 'unrounded' })

    assertValid(distribution)
    expect(distribution.at(-1)).toBeGreaterThanOrEqual(0)
  })

  it('rejects unsupported simultaneous shihai and yousei', () => {
    expect(() => calculateDxDistribution({
      dice: 10,
      critical: 7,
      shihai: 1,
      yousei: 1,
    })).toThrow('cannot both be non-zero')
  })
})
