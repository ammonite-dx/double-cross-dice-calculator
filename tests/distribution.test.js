import { describe, expect, it } from 'vitest'

import {
  shiftDistribution,
} from '../src/core/probability/Distribution'
import { REFERENCE_WORKING_DISTRIBUTION_SIZE } from '../tooling/reference-data/ReferenceDataConstants'

function pointMass(size, value) {
  const distribution = Array(size).fill(0)
  distribution[value] = 1
  return distribution
}

describe('working distributions', () => {
  it('shifts values by the requested amount', () => {
    const distribution = pointMass(REFERENCE_WORKING_DISTRIBUTION_SIZE, 1500)
    const shifted = shiftDistribution(distribution, -999)

    expect(shifted[501]).toBe(1)
  })
})
