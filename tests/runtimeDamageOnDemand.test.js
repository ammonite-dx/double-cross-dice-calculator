import { describe, expect, it, vi } from 'vitest'

import {
  calculateDamageOnDemand,
  createDamageRollRequest,
  generateMixedDamageDistribution,
} from '../src/calculation'
import { getDamage } from '../src/data/DamageCalculator'
import {
  OUTPUT_DISTRIBUTION_SIZE,
  getUpperTailProbability,
} from '../src/data/Distribution'
import {
  getD10Distribution as getRepositoryD10Distribution,
  registerD10Asset,
  registerDrAsset,
} from '../src/data/PrecomputedDataRepository'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import drKazanari0 from '../public/data/schema-v2/revision-1/dr/kazanari-0.json'
import drKazanari3 from '../public/data/schema-v2/revision-1/dr/kazanari-3.json'
import drKazanari9 from '../public/data/schema-v2/revision-1/dr/kazanari-9.json'

const COMPARISON_TOLERANCE = 2e-6
const drAssets = new Map([
  [0, drKazanari0],
  [3, drKazanari3],
  [9, drKazanari9],
])

registerD10Asset(d10)

function probabilityResult(entries) {
  const distribution = Array(OUTPUT_DISTRIBUTION_SIZE).fill(0)
  for (const [value, probability] of entries) {
    distribution[value] = probability
  }
  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
  }
}

function expectDistributionsClose(actual, expected) {
  expect(actual).toHaveLength(expected.length)
  let maxDifference = 0
  for (let value = 0; value < actual.length; value += 1) {
    maxDifference = Math.max(
      maxDifference,
      Math.abs(actual[value] - expected[value])
    )
  }
  expect(maxDifference).toBeLessThanOrEqual(COMPARISON_TOLERANCE)
}

const score = {
  action: probabilityResult([
    [0, 0.1],
    [9, 0.2],
    [10, 0.15],
    [23, 0.35],
    [47, 0.2],
  ]),
  reaction: probabilityResult([
    [5, 0.4],
    [20, 0.6],
  ]),
}

const productionProvider = async (weights, kazanari) =>
  generateMixedDamageDistribution(weights, kazanari)

const productionDependencies = {
  getDamageRollDistribution: productionProvider,
  getD10Distribution: getRepositoryD10Distribution,
}

describe('on-demand damage calculation', () => {
  it('aggregates hit probabilities by damage dice count', () => {
    const request = createDamageRollRequest(score, {
      dice: 4,
      value: 0,
      kazanari: 0,
    })

    expect(request.failureProbability).toBeCloseTo(0.31, 12)
    expect(request.weights[5]).toBeCloseTo(0.08, 12)
    expect(request.weights[6]).toBeCloseTo(0.06, 12)
    expect(request.weights[7]).toBeCloseTo(0.35, 12)
    expect(request.weights[9]).toBeCloseTo(0.2, 12)
    expect(request.weights.reduce((sum, weight) => sum + weight, 0))
      .toBeCloseTo(0.69, 12)
  })

  it('aggregates hits that produce the same damage dice count', () => {
    const aggregationScore = {
      action: probabilityResult([
        [9, 0.2],
        [8, 0.3],
      ]),
      reaction: probabilityResult([
        [5, 0.4],
        [20, 0.6],
      ]),
    }
    const request = createDamageRollRequest(aggregationScore, {
      dice: 0,
      value: 0,
      kazanari: 0,
    })

    expect(request.failureProbability).toBeCloseTo(0.3, 12)
    expect(request.weights[1]).toBeCloseTo(0.2, 12)
    expect(request.weights.reduce((sum, weight) => sum + weight, 0))
      .toBeCloseTo(0.2, 12)
  })

  it.each([
    [0, { dice: 0, value: 0 }, { dice: 0, value: 0 }],
    [3, { dice: 4, value: 12 }, { dice: 2, value: 5 }],
    [9, { dice: 8, value: -4 }, { dice: 3, value: 7 }],
  ])(
    'matches the current final damage calculation for kazanari=%i',
    async (kazanari, attackValues, defence) => {
      registerDrAsset(drAssets.get(kazanari))
      const attack = { ...attackValues, kazanari }
      const current = getDamage(score, attack, defence)
      const onDemand = await calculateDamageOnDemand(
        score,
        attack,
        defence,
        productionDependencies
      )

      expectDistributionsClose(onDemand.distribution, current.distribution)
      expectDistributionsClose(
        onDemand.upperTailProbability,
        current.upperTailProbability
      )
    }
  )

  it('rejects damage dice beyond the current supported range', () => {
    expect(() => createDamageRollRequest(score, {
      dice: 203,
      value: 0,
      kazanari: 0,
    })).toThrow('outside the supported range')
  })

  it('passes provider arguments and options through unchanged', async () => {
    const options = {
      signal: new AbortController().signal,
      requestId: 'damage-request',
    }
    const provider = vi.fn(productionProvider)
    const request = createDamageRollRequest(score, {
      dice: 0,
      value: 0,
      kazanari: 3,
    })

    await calculateDamageOnDemand(
      score,
      { dice: 0, value: 0, kazanari: 3 },
      { dice: 0, value: 0 },
      {
        getDamageRollDistribution: provider,
        getD10Distribution: getRepositoryD10Distribution,
      },
      options
    )

    expect(provider).toHaveBeenCalledOnce()
    expect(provider).toHaveBeenCalledWith(
      request.weights,
      3,
      options
    )
  })

  it('requires the explicit dependency object and defaults options to an empty object', async () => {
    const provider = vi.fn(productionProvider)
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const request = createDamageRollRequest(score, attack)

    await calculateDamageOnDemand(
      score,
      attack,
      { dice: 0, value: 0 },
      {
        getDamageRollDistribution: provider,
        getD10Distribution: getRepositoryD10Distribution,
      }
    )

    expect(provider).toHaveBeenCalledWith(
      request.weights,
      0,
      {}
    )

    await expect(
      calculateDamageOnDemand(
        score,
        attack,
        { dice: 0, value: 0 },
        { provider: productionProvider }
      )
    ).rejects.toThrow('getDamageRollDistribution')
  })

  it('propagates provider rejection', async () => {
    const error = new Error('runtime provider failed')
    const provider = vi.fn(async () => {
      throw error
    })

    await expect(
      calculateDamageOnDemand(
        score,
        { dice: 0, value: 0, kazanari: 0 },
        { dice: 0, value: 0 },
        { getDamageRollDistribution: provider }
      )
    ).rejects.toBe(error)
  })

  it('rejects a damage-roll distribution with the wrong length', async () => {
    const provider = vi.fn(async () => new Float64Array(2047))

    await expect(
      calculateDamageOnDemand(
        score,
        { dice: 0, value: 0, kazanari: 0 },
        { dice: 0, value: 0 },
        { getDamageRollDistribution: provider }
      )
    ).rejects.toThrow('2048 entries')
  })
})
