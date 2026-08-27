import { describe, expect, it, vi } from 'vitest'

import {
  calculateDamageOnDemand,
  createDamageRollRequest,
} from '../src/calculation/DamageCalculator'
import { generateMixedDamageDistribution } from '../src/calculation/RuntimeDamageRollCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import { getDamage } from '../src/data/DamageCalculator'
import {
  OUTPUT_DISTRIBUTION_SIZE,
  getUpperTailProbability,
} from '../src/data/Distribution'
import {
  getD10Distribution as getRepositoryD10Distribution,
  registerD10Asset,
} from '../src/data/D10PrecomputedDataRepository'
import { registerDrAsset } from '../src/data/ReferencePrecomputedDataRepository'
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

const productionProvider = async (weights, kazanari, options) =>
  generateMixedDamageDistribution(weights, kazanari, options)

const productionDependencies = {
  getDamageRollDistribution: productionProvider,
  getD10Distribution: getRepositoryD10Distribution,
}

function createDamagePlan(attack, defence) {
  return planCalculationRanges({
    operation: 'attack',
    score: {
      action: { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
      reaction: { dice: 0, critical: 11, skill: 0, yousei: 0, shihai: 0 },
    },
    attack,
    defence,
  }).damage
}

function certainHitScore() {
  return {
    action: probabilityResult([[1, 1]]),
    reaction: probabilityResult([[0, 1]]),
  }
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

  it.each([
    ['positive fixed value without defence', { dice: 0, value: 4 }, { dice: 0, value: 0 }],
    ['zero fixed difference with defence', { dice: 4, value: 0 }, { dice: 2, value: 0 }],
    ['negative fixed difference with defence', { dice: 8, value: -4 }, { dice: 3, value: 7 }],
    ['negative fixed difference without defence', { dice: 4, value: 0 }, { dice: 0, value: 5 }],
  ])(
    'matches the legacy and planned damage paths for %s',
    async (_label, attackValues, defence) => {
      const attack = { ...attackValues, kazanari: 3 }
      const plan = createDamagePlan(attack, defence)
      const legacy = await calculateDamageOnDemand(
        score,
        attack,
        defence,
        productionDependencies
      )
      const planned = await calculateDamageOnDemand(
        score,
        attack,
        defence,
        productionDependencies,
        { requestId: 'planned-damage' },
        plan
      )

      expectDistributionsClose(planned.distribution, legacy.distribution)
      expectDistributionsClose(
        planned.upperTailProbability,
        legacy.upperTailProbability
      )
      expect(planned.distribution).toHaveLength(OUTPUT_DISTRIBUTION_SIZE)
    }
  )

  it('matches the legacy path at the current maximum attack and defence inputs', async () => {
    const attack = { dice: 99, value: 999, kazanari: 9 }
    const defence = { dice: 99, value: -999 }
    const plan = planCalculationRanges({
      operation: 'attack',
      score: {
        action: { dice: 99, critical: 2, skill: 0, yousei: 0, shihai: 0 },
        reaction: { dice: 99, critical: 2, skill: 0, yousei: 0, shihai: 0 },
      },
      attack,
      defence,
    }).damage
    const legacy = await calculateDamageOnDemand(
      certainHitScore(),
      attack,
      defence,
      productionDependencies
    )
    const planned = await calculateDamageOnDemand(
      certainHitScore(),
      attack,
      defence,
      productionDependencies,
      {},
      plan
    )

    expectDistributionsClose(planned.distribution, legacy.distribution)
    expectDistributionsClose(
      planned.upperTailProbability,
      legacy.upperTailProbability
    )
  })

  it('keeps the raw support endpoint explicit when it is the planned maximum', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const defence = { dice: 0, value: 0 }
    const plan = {
      fixedDifference: 0,
      rawSupportMax: 10,
      rawMax: 10,
      workingMax: 10,
      workingLength: 12,
      defenceMax: 0,
      fftLength: 16,
      defenceFftLength: 0,
    }
    const provider = vi.fn(async (_weights, _kazanari, options) => {
      const distribution = new Float64Array(options.distributionLength)
      distribution[distribution.length - 1] = 1
      return distribution
    })
    const result = await calculateDamageOnDemand(
      certainHitScore(),
      attack,
      defence,
      {
        getDamageRollDistribution: provider,
      },
      {},
      plan
    )

    expect(result.distribution[10]).toBeCloseTo(1, 12)
    expect(result.distribution[OUTPUT_DISTRIBUTION_SIZE - 1]).toBe(0)
    expect(provider).toHaveBeenCalledWith(
      expect.any(Float64Array),
      0,
      expect.objectContaining({
        fftLength: 16,
        distributionLength: 11,
        rawSupportMax: 10,
      })
    )
  })

  it('does not shift a non-point raw overflow bucket into a published value', async () => {
    const plan = {
      fixedDifference: 0,
      rawSupportMax: 10,
      rawMax: 10,
      workingMax: 5,
      workingLength: 7,
      defenceMax: 0,
      fftLength: 16,
      defenceFftLength: 0,
    }
    const result = await calculateDamageOnDemand(
      certainHitScore(),
      { dice: 0, value: 0, kazanari: 0 },
      { dice: 0, value: 0 },
      {
        getDamageRollDistribution: vi.fn(async (_weights, _kazanari, options) => {
          const distribution = new Float64Array(options.distributionLength)
          distribution[distribution.length - 1] = 1
          return distribution
        }),
      },
      {},
      plan
    )

    expect(result.distribution[5]).toBe(0)
    expect(result.distribution[OUTPUT_DISTRIBUTION_SIZE - 1]).toBeCloseTo(1, 12)
  })

  it('passes the planned defence FFT length to the subtraction callback', async () => {
    const attack = { dice: 0, value: 2, kazanari: 0 }
    const defence = { dice: 1, value: 0 }
    const plan = {
      fixedDifference: 2,
      rawSupportMax: 10,
      rawMax: 10,
      workingMax: 12,
      workingLength: 14,
      defenceMax: 10,
      fftLength: 16,
      defenceFftLength: 32,
    }
    const observedFftLengths = []
    const getD10Distribution = vi.fn(() => {
      const distribution = Array(11).fill(0)
      distribution[0] = 1
      return distribution
    })
    const result = await calculateDamageOnDemand(
      certainHitScore(),
      attack,
      defence,
      {
        getDamageRollDistribution: vi.fn(async (_weights, _kazanari, options) => {
          const distribution = new Float64Array(options.distributionLength)
          distribution[distribution.length - 1] = 1
          return distribution
        }),
        getD10Distribution,
        onFftLength: (length) => observedFftLengths.push(length),
      },
      {},
      plan
    )

    expect(result.distribution[12]).toBeCloseTo(1, 12)
    expect(observedFftLengths).toEqual([32])
    expect(getD10Distribution).toHaveBeenCalledWith(1, 11)
  })

  it('keeps all-zero hit mass compatible across legacy and planned paths', async () => {
    const zeroScore = {
      action: probabilityResult([]),
      reaction: probabilityResult([]),
    }
    const attack = { dice: 0, value: 0, kazanari: 9 }
    const defence = { dice: 2, value: 0 }
    const plan = createDamagePlan(attack, defence)
    const legacy = await calculateDamageOnDemand(
      zeroScore,
      attack,
      defence,
      productionDependencies
    )
    const planned = await calculateDamageOnDemand(
      zeroScore,
      attack,
      defence,
      productionDependencies,
      {},
      plan
    )

    expect(planned.distribution).toEqual(legacy.distribution)
    expect(planned.upperTailProbability).toEqual(legacy.upperTailProbability)
  })

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

  it.each([
    ['a non-finite probability', (distribution) => { distribution[0] = Number.NaN }, 'non-finite'],
    ['a negative probability', (distribution) => { distribution[0] = -1 }, 'negative'],
    ['an invalid probability total', (distribution) => { distribution[0] = 0.5 }, 'total'],
  ])('rejects provider output containing %s', async (_label, mutate, message) => {
    const provider = vi.fn(async () => {
      const distribution = new Float64Array(2048)
      mutate(distribution)
      return distribution
    })

    await expect(
      calculateDamageOnDemand(
        score,
        { dice: 0, value: 0, kazanari: 0 },
        { dice: 0, value: 0 },
        { getDamageRollDistribution: provider }
      )
    ).rejects.toThrow(message)
  })
})
