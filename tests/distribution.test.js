import { describe, expect, it } from 'vitest'

import {
  OUTPUT_DISTRIBUTION_SIZE,
  WORKING_DISTRIBUTION_SIZE,
  collapseDistribution,
  shiftDistribution,
} from '../src/data/Distribution'

function pointMass(size, value) {
  const distribution = Array(size).fill(0)
  distribution[value] = 1
  return distribution
}

describe('working distributions', () => {
  it('collapses values above the output range into the final bucket', () => {
    const distribution = pointMass(WORKING_DISTRIBUTION_SIZE, 1500)
    const collapsed = collapseDistribution(distribution)

    expect(collapsed).toHaveLength(OUTPUT_DISTRIBUTION_SIZE)
    expect(collapsed.at(-1)).toBe(1)
  })

  it('shifts values above 1023 before collapsing', () => {
    const distribution = pointMass(WORKING_DISTRIBUTION_SIZE, 1500)
    const shifted = shiftDistribution(distribution, -999)
    const collapsed = collapseDistribution(shifted)

    expect(collapsed[501]).toBe(1)
  })
})
