import { describe, expect, it } from 'vitest'

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
  getScoreSummary,
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
  getScoreSummary,
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

})
