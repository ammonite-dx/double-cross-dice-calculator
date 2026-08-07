import { describe, expect, it } from 'vitest'

import {
  calculationClient,
} from '../src/application/CalculationClient'
import { getFinalEncroachment } from '../src/data/BacktrackCalculator'
import {
  getDamage,
  getDamageSummary,
} from '../src/data/DamageCalculator'
import {
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
import dxShihai0 from '../public/data/schema-v2/revision-1/dx/shihai-0.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerD10Asset(d10)
registerDrAsset(drKazanari0)
registerDxAsset(dxShihai0)
registerLivingdeadAsset(livingdead)

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

  it('matches the existing attack calculation', async () => {
    const params = {
      action: {
        score: { ...scoreParams },
        damage: { dice: 0, value: 3, kazanari: 0 },
      },
      reaction: {
        mode: 'ドッジ',
        score: { ...scoreParams },
        damage: { dice: 0, value: 1 },
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

    await expect(
      calculationClient.calculateAttackCombo(params)
    ).resolves.toEqual({
      score,
      scoreSummary: getScoreSummary(score),
      damage,
      damageSummary: getDamageSummary(damage),
    })
  })

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
