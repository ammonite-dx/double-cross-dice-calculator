import { describe, expect, it, vi } from 'vitest'

import {
  CalculationRangeError,
  createCalculationClient,
} from '../src/application/CalculationClient'
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
  calculateDamageOnDemand,
  getCanonicalDamageSummary,
} from '../src/calculation/DamageCalculator'
import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import { generateMixedDamageDistribution } from '../src/calculation/RuntimeDamageRollCalculator'
import { getFinalEncroachment } from '../src/data/BacktrackCalculator'
import {
  getDamage,
  getDamageSummary,
  getTotalDamage,
} from '../src/data/DamageCalculator'
import {
  getD10Distribution,
  loadD10Asset,
  loadLivingdeadAsset,
  registerD10Asset,
  registerDrAsset,
  registerDxAsset,
  registerLivingdeadAsset,
} from '../src/data/PrecomputedDataRepository'
import {
  calculateScore,
  getScore,
  getScoreSummary,
} from '../src/data/ScoreCalculator'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import drKazanari0 from '../public/data/schema-v2/revision-1/dr/kazanari-0.json'
import drKazanari3 from '../public/data/schema-v2/revision-1/dr/kazanari-3.json'
import drKazanari9 from '../public/data/schema-v2/revision-1/dr/kazanari-9.json'
import dxShihai0 from '../public/data/schema-v2/revision-1/dx/shihai-0.json'
import dxShihai3 from '../public/data/schema-v2/revision-1/dx/shihai-3.json'
import dxShihai19 from '../public/data/schema-v2/revision-1/dx/shihai-19.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerD10Asset(d10)
registerDrAsset(drKazanari0)
registerDrAsset(drKazanari3)
registerDrAsset(drKazanari9)
registerDxAsset(dxShihai0)
registerDxAsset(dxShihai3)
registerDxAsset(dxShihai19)
registerLivingdeadAsset(livingdead)

const calculationClient = createCalculationClient({
  calculateCanonicalDamageOnDemand,
  calculateDamageOnDemand,
  calculateDxDistribution,
  calculateScore,
  getD10Distribution,
  getDamageRollDistribution: generateMixedDamageDistribution,
  getFinalEncroachment,
  getScore,
  getScoreSummary,
  getTotalDamage,
  getDamageSummary,
  getCanonicalDamageSummary,
  loadD10Asset,
  loadLivingdeadAsset,
})

function createIntegrationClient(overrides = {}) {
  return createCalculationClient({
    calculateDamageOnDemand,
    calculateDxDistribution,
    calculateScore,
    getD10Distribution,
    getDamageRollDistribution: generateMixedDamageDistribution,
    getFinalEncroachment,
    getScore,
    getScoreSummary,
    getTotalDamage,
    getDamageSummary,
    loadD10Asset,
    loadLivingdeadAsset,
    ...overrides,
  })
}

const scoreParams = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

describe('CalculationClient integration', () => {
  it('covers the default Attack damage display window in the production client', async () => {
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
      mode: ATTACK_DISPLAY_MODES.PMF,
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

    expect(presentation.combos[0].decision).not.toBe(
      ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
    )
    expect(presentation.total.decision).not.toBe(
      ATTACK_CANONICAL_DISPLAY_PRESENTATION_DECISIONS.RECALCULATE
    )
    expect(presentation.total.status).toBe('ready')
    expect(presentation.combos[0].chart).not.toBeNull()
    expect(presentation.total.chart).not.toBeNull()
  })

  it('accepts representative current UI upper bounds with the default policy', () => {
    const checkPlan = calculationClient.planCheck({
      action: { dice: 99, critical: 2, skill: 0, yousei: 9, shihai: 0 },
      reaction: { dice: 99, critical: 2, skill: 0, yousei: 9, shihai: 0 },
    }, { opposed: true, target: 0 })
    const attackPlan = calculationClient.planAttackCombo({
      action: {
        score: { dice: 99, critical: 2, skill: 0, yousei: 9, shihai: 0 },
        damage: { dice: 99, value: 999, kazanari: 9 },
      },
      reaction: {
        mode: 'ドッジ',
        score: { dice: 99, critical: 2, skill: 0, yousei: 0, shihai: 19 },
        damage: { dice: 99, value: -999 },
      },
    })
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
    expect(backtrackPlan.accepted).toBe(true)
  })

  it('passes public overflow support to the runtime provider below calculationMax', async () => {
    let plan
    const result = await calculationClient.calculateAttackCombo({
      action: {
        score: { dice: 99, critical: 2, skill: 0, yousei: 0, shihai: 0 },
        damage: { dice: 0, value: 0, kazanari: 0 },
      },
      reaction: {
        mode: 'non-evasion',
        score: { dice: 0, critical: 11, skill: 0, yousei: 0, shihai: 0 },
        damage: { dice: 0, value: 0 },
      },
    }, {
      rangePolicy: {
        calculationMax: 0,
        display: { defaultMax: 0 },
      },
      onRangePlan: (rangePlan) => {
        plan = rangePlan
      },
    })

    expect(plan.accepted).toBe(true)
    expect(plan.damage.scoreValueUpperBound).toBe(1023)
    expect(plan.damage.rawSupportMax).toBe(1030)
    expect(result.damage.distribution).toHaveLength(1024)
  })

  it('rejects unsupported score combinations before calculation starts', async () => {
    const params = {
      action: { ...scoreParams, shihai: 1, yousei: 1 },
      reaction: { ...scoreParams },
    }

    await expect(
      calculationClient.calculateCheck(params, { opposed: true, target: 0 })
    ).rejects.toBeInstanceOf(CalculationRangeError)
  })

  it('matches the existing check calculation', async () => {
    const params = {
      action: { ...scoreParams },
      reaction: { ...scoreParams, skill: 2 },
    }
    const difficulty = { opposed: true, target: 0 }
    const score = {
      action: getScore(params.action),
      reaction: getScore(params.reaction),
    }

    const result = await calculationClient.calculateCheck(params, difficulty)

    expectScoresClose(result.score, score)
    expect(result.scoreSummary).toEqual(getScoreSummary(result.score, difficulty))
  })

  it.each([
    {
      dice: 99,
      critical: 2,
      skill: -7,
      yousei: 0,
      shihai: 0,
    },
    {
      dice: 20,
      critical: 11,
      skill: 4,
      yousei: 0,
      shihai: 3,
    },
    {
      dice: 20,
      critical: 8,
      skill: 5,
      yousei: 2,
      shihai: 0,
    },
    {
      dice: 20,
      critical: 7,
      skill: 3,
      yousei: 0,
      shihai: 19,
    },
  ])('preserves runtime DX score output for %o', async (actionParams) => {
    const params = {
      action: actionParams,
      reaction: { ...scoreParams, dice: 0 },
    }
    const expected = getScore(actionParams)
    const result = await calculationClient.calculateCheck(params, {
      opposed: false,
      target: 10,
    })

    // The client now uses the planner's full-precision dynamic path. The
    // legacy repository path remains the reference for the default migration
    // tests, while this comparison allows the expected sub-1e-6-bin rounding
    // accumulation across Score's public 1024 buckets.
    expectDistributionsClose(result.score.action, expected, 5e-6)
    expect(result.score.action.failureProbability)
      .toBeCloseTo(expected.failureProbability, 5)
  })

  it.each([
    [0, { dice: 0, value: 3 }, { dice: 0, value: 1 }],
    [3, { dice: 4, value: 12 }, { dice: 2, value: 5 }],
    [9, { dice: 8, value: -4 }, { dice: 3, value: 7 }],
  ])(
    'matches the existing JSON attack calculation for kazanari=%i',
    async (kazanari, attackValues, defence) => {
      const params = {
        action: {
          score: { ...scoreParams },
          damage: { ...attackValues, kazanari },
        },
        reaction: {
          mode: 'ドッジ',
          score: { ...scoreParams },
          damage: { ...defence },
        },
      }
      const score = {
        action: getScore(params.action.score),
        reaction: getScore(params.reaction.score),
      }
      const damage = getDamage(
        score,
        params.action.damage,
        params.reaction.damage
      )
      const result = await calculationClient.calculateAttackCombo(params)

      expectScoresClose(result.score, score)
      expect(result.scoreSummary).toEqual(getScoreSummary(result.score))
      expectDistributionsClose(result.damage, damage)
      expect(result.damageSummary).toEqual(getDamageSummary(damage))
    }
  )

  it('matches the existing backtrack calculation', async () => {
    const params = {
      encroachment: 100,
      lois: 7,
      elois: 0,
      dice: 0,
      value: 0,
      dlois: 'なし',
    }

    await expect(
      calculationClient.calculateBacktrack(params)
    ).resolves.toEqual(getFinalEncroachment(params))
  })

  it('matches the legacy provider at the n=102 asset boundary', async () => {
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 102,
      value: 0,
      dlois: '\u306a\u3057',
    }
    const legacy = getFinalEncroachment(params)

    const result = await calculationClient.calculateBacktrack(params)

    expect(result).toEqual(legacy)
  })

  it('completes ordinary n=103 on demand without a static asset', async () => {
    const loadD10AssetSpy = vi.fn(() => Promise.reject(
      new Error('D10 asset failure must not affect on-demand support')
    ))
    const loadLivingdeadAssetSpy = vi.fn(() => Promise.reject(
      new Error('livingdead asset must not be requested')
    ))
    const client = createIntegrationClient({
      loadD10Asset: loadD10AssetSpy,
      loadLivingdeadAsset: loadLivingdeadAssetSpy,
    })
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 103,
      value: 0,
      dlois: '\u306a\u3057',
    }
    let plan

    const result = await client.calculateBacktrack(params, {
      onRangePlan: (rangePlan) => {
        plan = rangePlan
      },
    })

    expect(plan.backtrack.rawSupportMax).toBe(1030)
    expect(plan.backtrack.workingLength).toBe(1031)
    expect(plan.backtrack.distributionMode).toBe('on-demand')
    expect(loadD10AssetSpy).not.toHaveBeenCalled()
    expect(loadLivingdeadAssetSpy).not.toHaveBeenCalled()
    expect(result.single.reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(100, 10)
  })

  it('uses the livingdead asset at n=103 without an on-demand warning', async () => {
    const loadLivingdeadAssetSpy = vi.fn(async () => {})
    const loadD10AssetSpy = vi.fn(async () => {})
    const client = createIntegrationClient({
      loadD10Asset: loadD10AssetSpy,
      loadLivingdeadAsset: loadLivingdeadAssetSpy,
    })
    const params = {
      encroachment: 100,
      lois: 0,
      elois: 0,
      dice: 103,
      value: 0,
      dlois: '\u5c4d\u4eba',
    }
    let plan

    const result = await client.calculateBacktrack(params, {
      onRangePlan: (rangePlan) => {
        plan = rangePlan
      },
    })

    expect(plan.backtrack.rawSupportMax).toBe(1021)
    expect(plan.backtrack.workingLength).toBe(1022)
    expect(plan.backtrack.distributionMode).toBe('asset')
    expect(plan.warnings).not.toContainEqual(
      expect.objectContaining({ code: 'backtrack-asset-overflow' })
    )
    expect(loadLivingdeadAssetSpy).toHaveBeenCalledOnce()
    expect(loadD10AssetSpy).not.toHaveBeenCalled()
    expect(result.single.reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(100, 10)
  })
})

function expectDistributionsClose(actual, expected, tolerance = 2e-6) {
  expect(actual.distribution).toHaveLength(expected.distribution.length)
  expect(actual.upperTailProbability)
    .toHaveLength(expected.upperTailProbability.length)

  let distributionDifference = 0
  let upperTailDifference = 0
  for (let index = 0; index < actual.distribution.length; index += 1) {
    distributionDifference = Math.max(
      distributionDifference,
      Math.abs(actual.distribution[index] - expected.distribution[index])
    )
    upperTailDifference = Math.max(
      upperTailDifference,
      Math.abs(
        actual.upperTailProbability[index] -
          expected.upperTailProbability[index]
      )
    )
  }

  expect(distributionDifference).toBeLessThanOrEqual(tolerance)
  expect(upperTailDifference).toBeLessThanOrEqual(tolerance)
}

function expectScoresClose(actual, expected) {
  expectDistributionsClose(actual.action, expected.action)
  expectDistributionsClose(actual.reaction, expected.reaction)
  expect(actual.action.failureProbability)
    .toBeCloseTo(expected.action.failureProbability, 6)
  expect(actual.reaction.failureProbability)
    .toBeCloseTo(expected.reaction.failureProbability, 6)
}
