import { describe, expect, it } from 'vitest'

import {
  getDamage,
  getDamageSummary,
  getTotalDamage,
} from '../src/data/DamageCalculator'
import { getFinalEncroachment } from '../src/data/BacktrackCalculator'
import {
  registerD10Asset,
  registerDrAsset,
  registerDxAsset,
  registerLivingdeadAsset,
} from '../src/data/PrecomputedDataRepository'
import { getScore, getScoreSummary } from '../src/data/ScoreCalculator'
import d10 from '../public/data/schema-v1/revision-2/d10.json'
import drKazanari0 from '../public/data/schema-v1/revision-2/dr/kazanari-0.json'
import dxShihai0 from '../public/data/schema-v1/revision-2/dx/shihai-0.json'
import dxShihai19 from '../public/data/schema-v1/revision-2/dx/shihai-19.json'
import livingdead from '../public/data/schema-v1/revision-2/livingdead.json'
import { expectProbabilityResult } from './probabilityAssertions'

const defaultScoreParams = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

registerDxAsset(dxShihai0)
registerDxAsset(dxShihai19)
registerD10Asset(d10)
registerDrAsset(drKazanari0)
registerLivingdeadAsset(livingdead)

describe('getScore', () => {
  it.each([
    defaultScoreParams,
    { ...defaultScoreParams, dice: 0 },
    { ...defaultScoreParams, dice: 99, critical: 2 },
    { ...defaultScoreParams, skill: -999 },
    { ...defaultScoreParams, skill: 999 },
    { ...defaultScoreParams, yousei: 2 },
    { ...defaultScoreParams, dice: 20, shihai: 19 },
  ])('returns a valid probability result for %o', (params) => {
    expectProbabilityResult(getScore(params))
  })

  it('returns a point mass when the score is fixed', () => {
    const result = getScore({ ...defaultScoreParams, skill: 42 }, true)

    expectProbabilityResult(result)
    expect(result.distribution[42]).toBe(1)
    expect(result.distribution.filter((probability) => probability !== 0)).toEqual([1])
    expect(result.upperTailProbability[42]).toBe(1)
    expect(result.upperTailProbability[43]).toBe(0)
  })

  it('keeps the established expectation for a basic one-die check', () => {
    const score = {
      action: getScore(defaultScoreParams),
      reaction: getScore(defaultScoreParams),
    }
    const summary = getScoreSummary(score, { opposed: false, target: 10 })

    expect(summary.action.expectedValue).toBe(6)
    expect(summary.action.successRate).toBe(10)
  })

  it('awards ties to the reaction side in opposed checks', () => {
    const fixedAction = getScore({ ...defaultScoreParams, skill: 10 }, true)
    const fixedReaction = getScore({ ...defaultScoreParams, skill: 10 }, true)
    const summary = getScoreSummary({
      action: fixedAction,
      reaction: fixedReaction,
    })

    expect(summary.action.successRate).toBe(0)
    expect(summary.reaction.successRate).toBe(100)
  })
})

describe('damage calculations', () => {
  it('returns a valid damage probability result', () => {
    const score = {
      action: getScore(defaultScoreParams),
      reaction: getScore(defaultScoreParams),
    }
    const damage = getDamage(
      score,
      { dice: 0, value: 5, kazanari: 0 },
      { dice: 0, value: 3 }
    )

    expectProbabilityResult(damage)
    expect(Number.isFinite(getDamageSummary(damage).expectedValue)).toBe(true)
  })

  it('combines combo damage distributions', () => {
    const firstDamage = getScore({ ...defaultScoreParams, skill: 3 }, true)
    const secondDamage = getScore({ ...defaultScoreParams, skill: 7 }, true)
    const total = getTotalDamage([
      { data: { damage: firstDamage } },
      { data: { damage: secondDamage } },
    ])

    expectProbabilityResult(total)
    expect(total.distribution[10]).toBeCloseTo(1)
  })
})

describe('getFinalEncroachment', () => {
  it.each([
    'なし',
    '戦闘用人格・生きる伝説',
    '生還者',
    '不死者・悪夢',
    '屍人',
    '戦友(通常)',
    '戦友(強化)',
  ])('returns finite percentages for %s', (dlois) => {
    const result = getFinalEncroachment({
      encroachment: 100,
      lois: 7,
      elois: 0,
      dice: 0,
      value: 0,
      dlois,
    })

    for (const probabilities of Object.values(result)) {
      for (const probability of probabilities) {
        expect(Number.isFinite(probability)).toBe(true)
        expect(probability).toBeGreaterThanOrEqual(0)
        expect(probability).toBeLessThanOrEqual(100)
      }

      const total = probabilities.reduce((sum, probability) => sum + probability, 0)
      expect(Math.abs(total - 100)).toBeLessThanOrEqual(0.2)
    }
  })

  it.each([
    ['戦友(強化)', 223],
    ['屍人', 219],
  ])('supports the maximum %s backtrack dice count (%i)', (dlois) => {
    const result = getFinalEncroachment({
      encroachment: 2000,
      lois: 7,
      elois: 99,
      dice: 99,
      value: 0,
      dlois,
    })

    for (const probabilities of Object.values(result)) {
      const total = probabilities.reduce((sum, probability) => sum + probability, 0)
      expect(Math.abs(total - 100)).toBeLessThanOrEqual(0.2)
    }
  })
})
