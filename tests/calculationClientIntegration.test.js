import { describe, expect, it } from 'vitest'

import {
  createCalculationClient,
} from '../src/application/CalculationClient'
import { calculateDamageOnDemand } from '../src/calculation/DamageCalculator'
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
  loadDxAsset,
  loadLivingdeadAsset,
  registerD10Asset,
  registerDrAsset,
  registerDxAsset,
  registerLivingdeadAsset,
} from '../src/data/PrecomputedDataRepository'
import {
  getScore,
  getScoreSummary,
} from '../src/data/ScoreCalculator'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import drKazanari0 from '../public/data/schema-v2/revision-1/dr/kazanari-0.json'
import drKazanari3 from '../public/data/schema-v2/revision-1/dr/kazanari-3.json'
import drKazanari9 from '../public/data/schema-v2/revision-1/dr/kazanari-9.json'
import dxShihai0 from '../public/data/schema-v2/revision-1/dx/shihai-0.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerD10Asset(d10)
registerDrAsset(drKazanari0)
registerDrAsset(drKazanari3)
registerDrAsset(drKazanari9)
registerDxAsset(dxShihai0)
registerLivingdeadAsset(livingdead)

const calculationClient = createCalculationClient({
  calculateDamageOnDemand,
  getD10Distribution,
  getDamageRollDistribution: generateMixedDamageDistribution,
  getFinalEncroachment,
  getScore,
  getScoreSummary,
  getTotalDamage,
  getDamageSummary,
  loadD10Asset,
  loadDxAsset,
  loadLivingdeadAsset,
})

const scoreParams = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

describe('CalculationClient integration', () => {
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

    await expect(
      calculationClient.calculateCheck(params, difficulty)
    ).resolves.toEqual({
      score,
      scoreSummary: getScoreSummary(score, difficulty),
    })
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

      expect(result.score).toEqual(score)
      expect(result.scoreSummary).toEqual(getScoreSummary(score))
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
