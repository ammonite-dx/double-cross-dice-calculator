import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { createCalculationClient } from '../src/runtime/CalculationClient'
import { createDistributionResult } from '../src/calculation/DistributionResult'
import { planCalculationRanges } from '../src/calculation/RangePlanner'

const calculationClientSource = readFileSync(
  new URL('../src/runtime/CalculationClient.js', import.meta.url),
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

function createDamage() {
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
    calculateDamageOnDemand: vi.fn(async () => createDamage()),
    calculateDxDistribution: vi.fn(() => new Float64Array([1])),
    calculateScore: vi.fn(createScoreEnvelope),
    getDamageSummary: vi.fn(() => 'canonical damage summary'),
    getScoreSummary: vi.fn(() => 'canonical score summary'),
    getTotalDamageSummary: vi.fn(() => 'canonical total summary'),
    getDamageRollDistribution: vi.fn(async () => new Float64Array([1])),
    getD10Distribution: vi.fn(),
    getFinalEncroachment: vi.fn(() => 'canonical backtrack'),
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
      /from ['"]\.\.\/data\/(?:score|Backtrack)Calculator['"]/
    )
    expect(calculationClientSource).not.toContain(
      'toPublishedBucketDistribution'
    )
    expect(calculationClientSource).not.toContain(
      'createPublishedScoreFromEnvelope'
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

    const check = await client.calculateCheck({
      action: score,
      reaction: { ...score },
    }, { opposed: false, target: 0 })
    expect(check.score.action).toMatchObject({
      result: expect.objectContaining({ values: expect.any(Float64Array) }),
      metadata: expect.objectContaining({ modeledDistribution: true }),
    })

    const backtrack = await client.calculateBacktrack({
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

    expect(client.calculateCheck).toEqual(expect.any(Function))
    expect(client.calculateAttackBatch).toEqual(expect.any(Function))
    expect(client.calculateTotalDamage).toEqual(expect.any(Function))
    expect(client.calculateBacktrack).toEqual(expect.any(Function))
    expect(client).not.toHaveProperty('calculateCheckCanonical')
    expect(client).not.toHaveProperty('calculateAttackCombo')
    expect(client).not.toHaveProperty('calculateAttackCanonical')
    expect(client).not.toHaveProperty('calculateAttackCanonicalBatch')
    expect(client).not.toHaveProperty('calculateCanonicalTotalDamage')
    expect(client).not.toHaveProperty('calculateBacktrackCanonical')
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

    await expect(client.calculateBacktrack(params, {
      onRangePlan: (plan) => executionPlans.push(plan),
    })).resolves.toBe('canonical backtrack')

    expect(executionPlans).toHaveLength(1)
    expect(planned).toEqual(executionPlans[0])
    expect(planned.backtrack).toMatchObject({
      calculationMode: 'complete-support',
      distributionMode: 'on-demand',
    })
    expect(planned.estimates).toEqual(executionPlans[0].estimates)
    expect(planned.estimates.float64Bytes).toBeGreaterThan(0)
    expect(planCalculationRangesSpy).toHaveBeenCalledTimes(2)
    expect(planCalculationRangesSpy.mock.calls[0][0]).toEqual(
      planCalculationRangesSpy.mock.calls[1][0]
    )
    expect(planCalculationRangesSpy.mock.calls[0][0].completeSupportBacktrack)
      .toBe(true)
  })

  it('runs canonical Attack through the runtime D10 provider and canonical damage only', async () => {
    const damage = createDamage()
    const planCalculationRangesSpy = vi.fn(planCalculationRanges)
    const calculateDamageOnDemand = vi.fn(async (score) => {
      expect(score.action).toHaveProperty('result')
      expect(score.reaction).toHaveProperty('result')
      expect(score.action).not.toHaveProperty('distribution')
      expect(score.reaction).not.toHaveProperty('distribution')
      return damage
    })
    const dependencies = createDependencies({
      calculateDamageOnDemand,
      planCalculationRanges: planCalculationRangesSpy,
    })
    const client = createCalculationClient(dependencies)

    const result = await client.calculateAttack(attackParams())

    expect(result).toMatchObject({
      scoreSummary: 'canonical score summary',
      damage,
      damageSummary: 'canonical damage summary',
    })
    expect(result.damage).toBe(damage)
    expect(result.damageSummary).toBe('canonical damage summary')
    expect(dependencies.calculateScore).toHaveBeenCalledTimes(2)
    expect(dependencies.calculateDamageOnDemand).toHaveBeenCalledOnce()
    expect(dependencies.getScoreSummary).toHaveBeenCalledOnce()
    expect(planCalculationRangesSpy.mock.calls[0][1]).toMatchObject({
      scorePropagation: 'full-tail',
    })

    await client.calculateAttack(attackParams(), {
      rangePolicy: { scorePropagation: 'published-bucket' },
    })
    expect(planCalculationRangesSpy.mock.calls[1][1]).toMatchObject({
      scorePropagation: 'published-bucket',
    })
  })

  it('keeps canonical Check compatibility summary without a legacy score call', async () => {
    const dependencies = createDependencies()
    const client = createCalculationClient(dependencies)

    const result = await client.calculateCheck(
      {
        action: { ...scoreParams },
        reaction: { ...scoreParams, skill: 2 },
      },
      { opposed: true, target: 10 }
    )

    expect(result.scoreSummary).toBe('canonical score summary')
    expect(dependencies.getScoreSummary).toHaveBeenCalledWith(
      result.score,
      { opposed: true, target: 10 }
    )
    expect(dependencies.calculateScore).toHaveBeenCalledTimes(2)
  })
})
