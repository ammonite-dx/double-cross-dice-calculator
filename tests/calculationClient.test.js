import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { createCalculationClient } from '../src/application/CalculationClient'
import { createDistributionResult } from '../src/calculation/DistributionResult'
import { planCalculationRanges } from '../src/calculation/RangePlanner'

const calculationClientSource = readFileSync(
  new URL('../src/application/CalculationClient.js', import.meta.url),
  'utf8'
)

function createScoreEnvelope(params, _getDistribution, _plan, fix = false) {
  const offset = fix ? Math.max(0, params.skill) : 0
  return {
    result: createDistributionResult({
      values: [1],
      offset,
      support: { kind: 'finite', max: offset },
      overflow: null,
    }),
    metadata: {
      modeledDistribution: true,
      failureProbability: 0,
    },
  }
}

function createCanonicalDamage() {
  return Object.freeze({
    result: createDistributionResult({
      values: [1],
      offset: 0,
      support: { kind: 'finite', max: 0 },
      overflow: null,
    }),
    metadata: Object.freeze({ modeledDistribution: true }),
  })
}

function createDependencies(overrides = {}) {
  return {
    calculateCanonicalDamageOnDemand: vi.fn(async () => createCanonicalDamage()),
    calculateDxDistribution: vi.fn(() => new Float64Array([1])),
    calculateScoreCanonical: vi.fn(createScoreEnvelope),
    getCanonicalDamageSummary: vi.fn(() => 'canonical damage summary'),
    getCanonicalScoreSummary: vi.fn(() => 'canonical score summary'),
    getCanonicalTotalDamageSummary: vi.fn(() => 'canonical total summary'),
    getDamageRollDistribution: vi.fn(async () => new Float64Array([1])),
    getD10Distribution: vi.fn(),
    getFinalEncroachmentCanonical: vi.fn(() => 'canonical backtrack'),
    ...overrides,
  }
}

const scoreParams = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

function attackParams() {
  return {
    action: {
      score: { ...scoreParams, shihai: 2 },
      damage: { dice: 0, value: 3, kazanari: 4 },
    },
    reaction: {
      mode: '《イベイジョン》',
      score: { ...scoreParams, shihai: 1 },
      damage: { dice: 2, value: 1 },
    },
  }
}

describe('canonical CalculationClient surface', () => {
  it('keeps production canonical imports on calculation cores', () => {
    expect(calculationClientSource).toContain(
      "from '../calculation/ScoreCalculator'"
    )
    expect(calculationClientSource).toContain(
      "from '../calculation/BacktrackCalculator'"
    )
    expect(calculationClientSource).not.toMatch(
      /from ['"]\.\.\/data\/(?:Score|Backtrack)Calculator['"]/
    )
    expect(calculationClientSource).not.toContain(
      'toPublishedBucketDistribution'
    )
    expect(calculationClientSource).not.toContain(
      'createPublishedScoreFromCanonicalEnvelope'
    )
  })

  it('runs default Check and Backtrack canonical adapters without data wrappers', async () => {
    const client = createCalculationClient()
    const score = {
      dice: 1,
      critical: 10,
      skill: 0,
      yousei: 0,
      shihai: 0,
    }

    const check = await client.calculateCheckCanonical({
      action: score,
      reaction: { ...score },
    }, { opposed: false, target: 0 })
    expect(check.score.action).toMatchObject({
      result: expect.objectContaining({ values: expect.any(Float64Array) }),
      metadata: expect.objectContaining({ modeledDistribution: true }),
    })

    const backtrack = await client.calculateBacktrackCanonical({
      encroachment: 79,
      lois: 1,
      elois: 2,
      dice: 1,
      value: 20,
      dlois: 'なし',
    })
    expect(backtrack).toEqual(expect.objectContaining({
      single: expect.objectContaining({ values: expect.any(Float64Array) }),
      double: expect.objectContaining({ values: expect.any(Float64Array) }),
      second: expect.objectContaining({ values: expect.any(Float64Array) }),
    }))
  })

  it('exposes canonical operations and no legacy calculation or prepare methods', () => {
    const client = createCalculationClient(createDependencies())

    expect(client.calculateCheckCanonical).toEqual(expect.any(Function))
    expect(client.calculateAttackCanonicalBatch).toEqual(expect.any(Function))
    expect(client.calculateCanonicalTotalDamage).toEqual(expect.any(Function))
    expect(client.calculateBacktrackCanonical).toEqual(expect.any(Function))
    expect(client).not.toHaveProperty('calculateCheck')
    expect(client).not.toHaveProperty('calculateAttackCombo')
    expect(client).not.toHaveProperty('calculateTotalDamage')
    expect(client).not.toHaveProperty('calculateBacktrack')
    expect(client).not.toHaveProperty('prepare')
  })

  it('keeps planner methods snapshotted for all canonical routes', () => {
    const plan = { accepted: true }
    const planCalculationRanges = vi.fn(() => plan)
    const client = createCalculationClient(createDependencies({
      planCalculationRanges,
    }))
    const params = attackParams()
    const policy = { limits: { hard: { estimatedTimeMs: 1 } } }

    expect(client.planCheck({
      action: { ...scoreParams },
      reaction: { ...scoreParams },
    }, { opposed: true, target: 9 }, policy)).toBe(plan)
    expect(client.planAttackCombo(params, policy)).toBe(plan)
    expect(client.planBacktrack({ dlois: '屍人', lois: 2 }, policy)).toBe(plan)

    expect(planCalculationRanges).toHaveBeenCalledTimes(3)
    expect(planCalculationRanges.mock.calls.map(([request]) => request.operation))
      .toEqual(['check', 'attack', 'backtrack'])
  })

  it('uses the canonical Backtrack plan for public planning and execution', async () => {
    const planCalculationRangesSpy = vi.fn(planCalculationRanges)
    const dependencies = createDependencies({
      planCalculationRanges: planCalculationRangesSpy,
    })
    const client = createCalculationClient(dependencies)
    const params = {
      encroachment: 100,
      lois: 1,
      elois: 2,
      dice: 3,
      value: 20,
      dlois: 'なし',
    }
    const planned = client.planBacktrack(params)
    const executionPlans = []

    await expect(client.calculateBacktrackCanonical(params, {
      onRangePlan: (plan) => executionPlans.push(plan),
    })).resolves.toBe('canonical backtrack')

    expect(executionPlans).toHaveLength(1)
    expect(planned).toEqual(executionPlans[0])
    expect(planned.backtrack).toMatchObject({
      calculationMode: 'canonical',
      distributionMode: 'on-demand',
    })
    expect(planned.estimates).toEqual(executionPlans[0].estimates)
    expect(planned.estimates.float64Bytes).toBeGreaterThan(0)
    expect(planCalculationRangesSpy).toHaveBeenCalledTimes(2)
    expect(planCalculationRangesSpy.mock.calls[0][0]).toEqual(
      planCalculationRangesSpy.mock.calls[1][0]
    )
    expect(planCalculationRangesSpy.mock.calls[0][0].canonicalBacktrack)
      .toBe(true)
  })

  it('runs canonical Attack through D10 lazy loading and canonical damage only', async () => {
    const canonicalDamage = createCanonicalDamage()
    const planCalculationRangesSpy = vi.fn(planCalculationRanges)
    const calculateCanonicalDamageOnDemand = vi.fn(async (score) => {
      expect(score.action).toHaveProperty('result')
      expect(score.reaction).toHaveProperty('result')
      expect(score.action).not.toHaveProperty('distribution')
      expect(score.reaction).not.toHaveProperty('distribution')
      return canonicalDamage
    })
    const dependencies = createDependencies({
      calculateCanonicalDamageOnDemand,
      planCalculationRanges: planCalculationRangesSpy,
    })
    const client = createCalculationClient(dependencies)

    const result = await client.calculateAttackCanonical(attackParams())

    expect(result).toMatchObject({
      scoreSummary: 'canonical score summary',
      canonicalDamage,
      canonicalDamageSummary: 'canonical damage summary',
    })
    expect(result).not.toHaveProperty('damage')
    expect(result).not.toHaveProperty('damageSummary')
    expect(dependencies.calculateScoreCanonical).toHaveBeenCalledTimes(2)
    expect(dependencies.calculateCanonicalDamageOnDemand).toHaveBeenCalledOnce()
    expect(dependencies.getCanonicalScoreSummary).toHaveBeenCalledOnce()
    expect(planCalculationRangesSpy.mock.calls[0][1]).toMatchObject({
      scorePropagation: 'full-tail',
    })

    await client.calculateAttackCanonical(attackParams(), {
      rangePolicy: { scorePropagation: 'published-bucket' },
    })
    expect(planCalculationRangesSpy.mock.calls[1][1]).toMatchObject({
      scorePropagation: 'published-bucket',
    })
  })

  it('keeps canonical Check compatibility summary without a legacy score call', async () => {
    const dependencies = createDependencies()
    const client = createCalculationClient(dependencies)

    const result = await client.calculateCheckCanonical(
      {
        action: { ...scoreParams },
        reaction: { ...scoreParams, skill: 2 },
      },
      { opposed: true, target: 10 }
    )

    expect(result.scoreSummary).toBe('canonical score summary')
    expect(dependencies.getCanonicalScoreSummary).toHaveBeenCalledWith(
      result.score,
      { opposed: true, target: 10 }
    )
    expect(dependencies.calculateScoreCanonical).toHaveBeenCalledTimes(2)
  })
})
