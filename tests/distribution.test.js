import { describe, expect, it } from 'vitest'

import {
  shiftDistribution,
} from '../src/core/probability/Distribution'

const TEST_DISTRIBUTION_SIZE = 4096

function pointMass(size, value) {
  const distribution = Array(size).fill(0)
  distribution[value] = 1
  return distribution
}

describe('working distributions', () => {
  it('shifts values by the requested amount', () => {
    const distribution = pointMass(TEST_DISTRIBUTION_SIZE, 1500)
    const shifted = shiftDistribution(distribution, -999)

    expect(shifted[501]).toBe(1)
  })
})
