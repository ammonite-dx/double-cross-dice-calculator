import { describe, expect, it, vi } from 'vitest'

import { createCalculationClient } from '../src/application/CalculationClient'
import {
  ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS,
  createAttackCanonicalDisplayPresentation,
} from '../src/application/AttackCanonicalPresentation'
import {
  ATTACK_DISPLAY_MODES,
  createAttackRangePolicy,
} from '../src/application/AttackDisplayRequestSnapshot'
import {
  calculateCanonicalDamageOnDemand,
  getCanonicalDamageSummary,
} from '../src/calculation/DamageCalculator'
import { createDistributionResult } from '../src/calculation/DistributionResult'
import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import { generateMixedDamageDistribution } from '../src/calculation/RuntimeDamageRollCalculator'
import {
  getD10Distribution,
  loadD10Asset,
  registerD10Asset,
} from '../src/data/PrecomputedDataRepository'
import {
  calculateScoreCanonical,
  getCanonicalScoreSummary,
} from '../src/data/ScoreCalculator'
import d10 from '../public/data/schema-v2/revision-1/d10.json'

registerD10Asset(d10)

const calculationClient = createCalculationClient({
  calculateCanonicalDamageOnDemand,
  calculateDxDistribution,
  calculateScoreCanonical,
  getCanonicalScoreSummary,
  getD10Distribution,
  getDamageRollDistribution: generateMixedDamageDistribution,
  getCanonicalDamageSummary,
  loadD10Asset,
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
      const batch = await calculationClient.calculateAttackCanonicalBatch(
        [{ id: 0, params }],
        {
          rangePolicy: createAttackRangePolicy(
            displayRequest,
            {},
            displayRequest
          ),
          onRangePlan: (plan) => rangePlans.push(plan),
        }
      )
      const presentation = createAttackCanonicalDisplayPresentation(batch, {
        displayRequest,
        scoreDisplayRequest: displayRequest,
        rangePlans,
      })

      expect(batch.combos[0].canonicalDamage.metadata.scorePropagation)
        .toBe('full-tail')
      expect(batch.combos[0].canonicalDamage.result.values)
        .toBeInstanceOf(Float64Array)
      expect(batch.canonicalTotalDamage.result.values)
        .toBeInstanceOf(Float64Array)

      expect(presentation.combos[0].decision).not.toBe(
        ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      )
      expect(presentation.total.decision).not.toBe(
        ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
      )
      expect(presentation.total.status).toBe('ready')
      expect(presentation.combos[0].chart).not.toBeNull()
      expect(presentation.total.chart).not.toBeNull()
    }
  )

  it.each([100, 1200])(
    'projects the 99D critical=2 Damage window through the canonical path (0..$0)',
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
      const batch = await calculationClient.calculateAttackCanonicalBatch(
        [{ id: `99d-${max}`, params }],
        {
          rangePolicy: createAttackRangePolicy(
            displayRequest,
            {},
            displayRequest
          ),
          onRangePlan: (plan) => rangePlans.push(plan),
        }
      )
      const presentation = createAttackCanonicalDisplayPresentation(batch, {
        displayRequest,
        scoreDisplayRequest: displayRequest,
        rangePlans,
      })

      expect(rangePlans[0].accepted).toBe(true)
      expect(presentation.combos[0].status).toBe('ready')
      expect(presentation.combos[0].chart).not.toBeNull()
    }
  )

  it('keeps published comparison explicit while full-tail uses resource limits', () => {
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
    const attackPlan = calculationClient.planAttackCombo(
      attackParams,
      { scorePropagation: 'published-bucket' }
    )
    const fullTailAttackPlan = calculationClient.planAttackCombo(attackParams)
    const backtrackPlan = calculationClient.planBacktrack({
      encroachment: 100,
      lois: 7,
      elois: 99,
      dice: 99,
      value: 999,
      dlois: 'なし',
    })

    expect(checkPlan.accepted).toBe(true)
    expect(attackPlan.accepted).toBe(true)
    expect(attackPlan.damage.scoreValueMode).toBe('published-bucket')
    expect(attackPlan.damage.scoreValueUpperBound).toBe(1023)
    expect(fullTailAttackPlan.damage.scoreValueMode).toBe('full-tail')
    expect(fullTailAttackPlan.damage.scoreValueUpperBound).toBeGreaterThan(1023)
    expect(fullTailAttackPlan.accepted).toBe(false)
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
      metadata: { modeledDistribution: true, failureProbability: 0 },
    })
    const planCalculationRanges = vi.fn((_params, policy) => {
      observedPolicies.push(policy)
      return {
        accepted: true,
        operation: 'attack',
        propagation: { score: 'full-tail' },
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
          scoreValueMode: 'full-tail',
        },
      }
    })
    const getDamageRollDistribution = vi.fn((weights, kazanari, options) => {
      observedWeights.push(weights.slice())
      return generateMixedDamageDistribution(weights, kazanari, options)
    })
    const client = createCalculationClient({
      calculateCanonicalDamageOnDemand,
      calculateScoreCanonical: vi.fn(() => {
        scoreCall += 1
        return scoreEnvelope(scoreCall === 1 ? 1030 : 0)
      }),
      getCanonicalDamageSummary,
      getDamageRollDistribution,
      getD10Distribution,
      loadD10Asset: vi.fn(async () => {}),
      planCalculationRanges,
      resourceGuard: {
        acquirePlan: vi.fn(() => ({ release: vi.fn() })),
      },
    })

    const result = await client.calculateAttackCanonicalBatch([{
      id: 'tail-combo',
      params: {
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
    }])

    expect(observedPolicies).toEqual([{ scorePropagation: 'full-tail' }])
    expect(observedWeights[0]).toHaveLength(105)
    expect(observedWeights[0][104]).toBeCloseTo(1, 12)
    expect(observedWeights[0][102]).toBe(0)
    expect(result.combos[0].score.action.result.values[1030]).toBe(1)
    expect(result.combos[0].canonicalDamage.metadata.scorePropagation)
      .toBe('full-tail')
    expect(result.canonicalTotalDamage.result).toBeDefined()
  })

})
