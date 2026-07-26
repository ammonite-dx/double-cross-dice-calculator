import { describe, expect, it } from 'vitest'

import d10 from '../src/data/d10.json'
import dx from '../src/data/dx.json'
import livingdead from '../src/data/livingdead.json'

const DATA_TOLERANCE = 2e-4

function expectNormalizedDistribution (distribution) {
  if (distribution.length === 0) {
    throw new Error('Distribution must not be empty')
  }

  for (const probability of distribution) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error(`Invalid probability: ${probability}`)
    }
  }

  const total = distribution.reduce((sum, probability) => sum + probability, 0)
  if (Math.abs(total - 1) >= DATA_TOLERANCE) {
    throw new Error(`Distribution total is ${total}`)
  }
}

describe('precomputed score distributions', () => {
  it('contains the expected dimensions and normalized values', () => {
    expect(dx).toHaveLength(20)

    for (const controlledDiceDistributions of dx) {
      if (controlledDiceDistributions.length !== 100) {
        throw new Error('Expected 100 dice-count entries')
      }

      for (const diceDistributions of controlledDiceDistributions) {
        if (diceDistributions.length !== 10) {
          throw new Error('Expected 10 critical-value entries')
        }

        for (const distributionInfo of diceDistributions) {
          const expandedLength =
            distributionInfo.pre + distributionInfo.val.length + distributionInfo.post
          if (
            distributionInfo.pre < 0 ||
            distributionInfo.post < 0 ||
            expandedLength !== 1024
          ) {
            throw new Error(`Invalid compressed distribution shape: ${expandedLength}`)
          }
          expectNormalizedDistribution(distributionInfo.val)
        }
      }
    }
  })
})

describe.each([
  ['d10', d10, 104],
  ['livingdead', livingdead, 100],
])('%s precomputed distributions', (name, distributions, expectedLength) => {
  it(`contains ${expectedLength} normalized distributions`, () => {
    expect(distributions).toHaveLength(expectedLength)

    for (const distribution of distributions) {
      if (distribution.length !== 1024) {
        throw new Error(`Expected distribution length 1024, got ${distribution.length}`)
      }
      expectNormalizedDistribution(distribution)
    }
  })
})
