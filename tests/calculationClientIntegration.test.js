import { describe, expect, it, vi } from 'vitest'

import { createCalculationClient } from '../src/runtime/CalculationClient'
import {
  ATTACK_DISPLAY_PRESENTATION_DECISIONS,
  createAttackDisplayPresentation,
} from '../src/features/attack/model/AttackPresentation'
import {
  ATTACK_DISPLAY_MODES,
  createAttackRangePolicy,
} from '../src/features/attack/model/AttackDisplayRequestSnapshot'
import {
  calculateDamageOnDemand,
  getDamageStatistics,
} from '../src/calculation/DamageCalculator'
import { createDistributionResult } from '../src/calculation/DistributionResult'
import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import { generateMixedDamageDistribution } from '../src/calculation/RuntimeDamageRollCalculator'
import {
  calculateScore,
} from '../src/calculation/ScoreCalculator'
import { getScoreStatistics } from '../src/calculation/ScoreStatistics'
import { createD10DistributionProvider } from '../src/calculation/D10Calculator'

function calculateScoreWithProvider(
  params,
  getDistribution,
  scoreRangePlan,
  fix = false
) {
  return calculateScore(
    params,
    { getDxDistribution: getDistribution },
    scoreRangePlan,
    fix
  )
}

async function calculateSingleAttackResult(client, id, params, options = {}) {
  const combo = await client.calculateAttack(params, options)
  const total = await client.calculateTotalDamage([combo.damage], options)
  return {
    combos: [{ id, ...combo }],
    ...total,
  }
}

const getD10Distribution = createD10DistributionProvider()

const calculationClient = createCalculationClient({
  calculateDamageOnDemand,
  calculateDxDistribution,
  calculateScore: calculateScoreWithProvider,
  getScoreStatistics,
  getD10Distribution,
  getDamageRollDistribution: generateMixedDamageDistribution,
  getDamageStatistics,
})

const scoreParams = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

describe('CalculationClient integration', () => {
  it.each([
    ATTACK_DISPLAY_MODES.PMF,
    ATTACK_DISPLAY_MODES.UPPER_TAIL,
  ])(
    'projects the default Attack damage window when score-tail uncertainty is below display precision ($0)',
    async (mode) => {
      const params = {
        action: {
          score: { ...scoreParams },
          damage: { dice: 0, value: 0, kazanari: 0 },
        },
        reaction: {
          mode: 'ドッジ',
          score: { ...scoreParams },
          damage: { dice: 0, value: 0 },
        },
      }
      const displayRequest = {
        min: 0,
        max: 100,
        mode,
      }
      const rangePlans = []
      const batch = await calculateSingleAttackResult(
        calculationClient,
        0,
        params,
        {
          rangePolicy: createAttackRangePolicy(
            displayRequest,
            {},
            displayRequest
          ),
          scoreDisplayRequest: displayRequest,
          onRangePlan: (plan) => rangePlans.push(plan),
        }
      )
      const presentation = createAttackDisplayPresentation(batch, {
        displayRequest,
        scoreDisplayRequest: displayRequest,
        rangePlans,
      })

      expect(batch.combos[0].damage.metadata)
        .not.toHaveProperty('scorePropagation')
      expect(batch.combos[0].damage.result.values)
        .toBeInstanceOf(Float64Array)
      expect(batch.totalDamage.result.values)
        .toBeInstanceOf(Float64Array)

      expect(presentation.combos[0].decision).not.toBe(
        ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      )
      expect(presentation.total.decision).not.toBe(
        ATTACK_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      )
      expect(presentation.total.status).toBe('ready')
      expect(presentation.combos[0].chart).not.toBeNull()
      expect(presentation.total.chart).not.toBeNull()
    }
  )

  it.each([100, 1200])(
    'projects the 99D critical=2 damage window through the canonical path (0..$0)',
    async (max) => {
      const params = {
        action: {
          score: { dice: 99, critical: 2, skill: 0, yousei: 0, shihai: 0 },
          damage: { dice: 0, value: 0, kazanari: 0 },
        },
        reaction: {
          mode: 'ドッジ',
          score: { dice: 99, critical: 2, skill: 0, yousei: 0, shihai: 0 },
          damage: { dice: 0, value: 0 },
        },
      }
      const displayRequest = {
        min: 0,
        max,
        mode: ATTACK_DISPLAY_MODES.PMF,
      }
      const rangePlans = []
      const batch = await calculateSingleAttackResult(
        calculationClient,
        `99d-${max}`,
        params,
        {
          rangePolicy: createAttackRangePolicy(
            displayRequest,
            {},
            displayRequest
          ),
          scoreDisplayRequest: displayRequest,
          onRangePlan: (plan) => rangePlans.push(plan),
        }
      )
      const presentation = createAttackDisplayPresentation(batch, {
        displayRequest,
        scoreDisplayRequest: displayRequest,
        rangePlans,
      })

      expect(rangePlans[0].accepted).toBe(true)
      expect(presentation.combos[0].status).toBe('ready')
      expect(presentation.combos[0].chart).not.toBeNull()
    }
  )

  it('completes the Attack path with an integrated Yousei score', async () => {
    const calculateDx = vi.fn(calculateDxDistribution)
    const client = createCalculationClient({
      calculateDamageOnDemand,
      calculateDxDistribution: calculateDx,
      calculateScore: calculateScoreWithProvider,
      getScoreStatistics,
      getD10Distribution,
      getDamageRollDistribution: generateMixedDamageDistribution,
      getDamageStatistics,
    })
    const params = {
      action: {
        score: {
          dice: 10,
          critical: 7,
          skill: 0,
          yousei: 1,
          shihai: 0,
        },
        damage: { dice: 0, value: 0, kazanari: 0 },
      },
      reaction: {
        mode: 'ドッジ',
        score: { ...scoreParams },
        damage: { dice: 0, value: 0 },
      },
    }
    const displayRequest = {
      min: 0,
      max: 100,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }
    const rangePlans = []
    const batch = await calculateSingleAttackResult(
      client,
      'yousei-attack',
      params,
      {
        rangePolicy: createAttackRangePolicy(
          displayRequest,
          {},
          displayRequest
        ),
        onRangePlan: (plan) => rangePlans.push(plan),
      }
    )
    const presentation = createAttackDisplayPresentation(batch, {
      displayRequest,
      scoreDisplayRequest: displayRequest,
      rangePlans,
    })
    const scoreResult = batch.combos[0].score.action.result
    const scoreMass = Array.from(scoreResult.values)
      .reduce((sum, value) => sum + value, 0)
      + (scoreResult.overflow?.probability ?? 0)

    expect(rangePlans[0].accepted).toBe(true)
    expect(rangePlans[0].scores[0].params.yousei).toBe(1)
    expect(scoreResult.values).toBeInstanceOf(Float64Array)
    expect(scoreMass).toBeCloseTo(1, 10)
    expect(calculateDx.mock.calls.some(([input]) => input.yousei === 1))
      .toBe(true)
    expect(batch.combos[0].damage.result.values)
      .toBeInstanceOf(Float64Array)
    expect(presentation.combos[0].status).toBe('ready')
    expect(presentation.combos[0].chart).not.toBeNull()
  })

  it('uses full-tail production planning with resource limits', () => {
    const checkPlan = calculationClient.planCheck({
      action: { dice: 99, critical: 2, skill: 0, yousei: 9, shihai: 0 },
      reaction: { dice: 99, critical: 2, skill: 0, yousei: 9, shihai: 0 },
    }, { opposed: true, target: 0 })
    const attackParams = {
      action: {
        score: { dice: 99, critical: 2, skill: 0, yousei: 9, shihai: 0 },
        damage: { dice: 99, value: 999, kazanari: 9 },
      },
      reaction: {
        mode: 'ドッジ',
        score: { dice: 99, critical: 2, skill: 0, yousei: 0, shihai: 19 },
        damage: { dice: 99, value: -999 },
      },
    }
    const attackPlan = calculationClient.planAttackCombo(attackParams)
    const backtrackPlan = calculationClient.planBacktrack({
      encroachment: 100,
      lois: 7,
      elois: 99,
      dice: 99,
      value: 999,
      dlois: 'なし',
    })

    expect(checkPlan.accepted).toBe(true)
    expect(attackPlan.damage.scoreValueUpperBound).toBeGreaterThan(1023)
    expect(attackPlan.accepted).toBe(false)
    expect(() => calculationClient.planAttackCombo(
      attackParams,
      { scorePropagation: 'published-bucket' }
    )).toThrow('scorePropagation')
    expect(backtrackPlan.accepted).toBe(true)
  })

  it('passes a 1023-plus canonical score tail to dynamic damage dice and total aggregation', async () => {
    const observedPolicies = []
    const observedWeights = []
    let scoreCall = 0
    const scoreEnvelope = (value) => ({
      result: createDistributionResult({
        values: value === 0 ? [1] : Object.assign(
          new Float64Array(value + 1),
          { [value]: 1 }
        ),
        offset: 0,
        support: { kind: 'finite', max: value },
        overflow: null,
      }),
      metadata: { modeledDistribution: true, forcedFailureProbability: 0 },
    })
    const planCalculationRanges = vi.fn((_params, policy) => {
      observedPolicies.push(policy)
      return {
        accepted: true,
        operation: 'attack',
        scores: [
          { tail: { kind: 'test-tail', bound: 0, modeledMax: 1030 } },
          { tail: { kind: 'test-tail', bound: 0, modeledMax: 0 } },
        ],
        damage: {
          fixedDifference: 0,
          maxDamageDice: 104,
          rawSupportMax: 1040,
          rawMax: 1040,
          workingMax: 1040,
          workingLength: 1042,
          defenceMax: 0,
          fftLength: 2048,
          defenceFftLength: 0,
        },
      }
    })
    const getDamageRollDistribution = vi.fn((weights, kazanari, options) => {
      observedWeights.push(weights.slice())
      return generateMixedDamageDistribution(weights, kazanari, options)
    })
    const client = createCalculationClient({
      calculateDamageOnDemand,
      calculateScore: vi.fn(() => {
        scoreCall += 1
        return scoreEnvelope(scoreCall === 1 ? 1030 : 0)
      }),
      getDamageStatistics,
      getDamageRollDistribution,
      getD10Distribution,
      planCalculationRanges,
      resourceGuard: {
        acquirePlan: vi.fn(() => ({ release: vi.fn() })),
      },
    })

    const result = await calculateSingleAttackResult(
      client,
      'tail-combo',
      {
        action: {
          score: { dice: 0, critical: 11, skill: 0, yousei: 0, shihai: 0 },
          damage: { dice: 0, value: 0, kazanari: 0 },
        },
        reaction: {
          mode: 'ドッジ',
          score: { dice: 0, critical: 11, skill: 0, yousei: 0, shihai: 0 },
          damage: { dice: 0, value: 0 },
        },
      },
    )

    expect(observedPolicies).toEqual([undefined])
    expect(observedWeights[0]).toHaveLength(105)
    expect(observedWeights[0][104]).toBeCloseTo(1, 12)
    expect(observedWeights[0][102]).toBe(0)
    expect(result.combos[0].score.action.result.values[1030]).toBe(1)
    expect(result.combos[0].damage.metadata)
      .not.toHaveProperty('scorePropagation')
    expect(result.totalDamage.result).toBeDefined()
  })

})
