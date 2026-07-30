import { describe, expect, it } from 'vitest'

import {
  subDistribution,
  sumDistribution,
} from '../src/data/FFT'

function pointMass(size, value) {
  const distribution = Array(size).fill(0)
  distribution[value] = 1
  return distribution
}

describe('FFT distribution operations', () => {
  it.each([1024, 2048])(
    'supports sums and differences with %i elements',
    (size) => {
      const firstValue = Math.floor(0.7 * size)
      const secondValue = Math.floor(0.2 * size)
      const first = pointMass(size, firstValue)
      const second = pointMass(size, secondValue)
      const expectedSum = firstValue + secondValue
      const expectedDifference = firstValue - secondValue

      expect(sumDistribution(first, second)[expectedSum]).toBeCloseTo(1, 12)
      expect(
        subDistribution(first, second)[expectedDifference]
      ).toBeCloseTo(1, 12)
    }
  )

  it.each([1024, 2048])(
    'aggregates overflow into the final bucket with %i elements',
    (size) => {
      const first = pointMass(size, Math.floor(0.8 * size))
      const second = pointMass(size, Math.floor(0.4 * size))

      expect(sumDistribution(first, second).at(-1)).toBeCloseTo(1, 12)
    }
  )
})
