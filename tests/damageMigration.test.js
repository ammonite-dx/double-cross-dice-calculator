import { describe, expect, it } from 'vitest'

import {
  getDamage as getLegacyDamage,
  getDamageSummary as getLegacyDamageSummary,
  getTotalDamage as getLegacyTotalDamage,
} from './legacy/LegacyCalculator'
import {
  getDamage,
  getDamageSummary,
  getTotalDamage,
} from '../src/data/DamageCalculator'
import {
  registerD10Asset,
  registerDrAsset,
  registerDxAsset,
} from '../src/data/PrecomputedDataRepository'
import { getScore } from '../src/data/ScoreCalculator'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import drKazanari0 from '../public/data/schema-v2/revision-1/dr/kazanari-0.json'
import drKazanari3 from '../public/data/schema-v2/revision-1/dr/kazanari-3.json'
import drKazanari9 from '../public/data/schema-v2/revision-1/dr/kazanari-9.json'
import dxShihai0 from '../public/data/schema-v2/revision-1/dx/shihai-0.json'

registerD10Asset(d10)
registerDrAsset(drKazanari0)
registerDrAsset(drKazanari3)
registerDrAsset(drKazanari9)
registerDxAsset(dxShihai0)

const MIGRATION_TOLERANCE = 1e-6 + 1e-12

function expectProbabilityResultClose(actual, expected) {
  for (const field of ['distribution', 'upperTailProbability']) {
    expect(actual[field]).toHaveLength(expected[field].length)
    for (let index = 0; index < expected[field].length; index += 1) {
      expect(
        Math.abs(actual[field][index] - expected[field][index])
      ).toBeLessThanOrEqual(MIGRATION_TOLERANCE)
    }
  }
}

const score = {
  action: getScore({
    dice: 4,
    critical: 8,
    skill: 3,
    yousei: 0,
    shihai: 0,
  }),
  reaction: getScore({
    dice: 2,
    critical: 10,
    skill: 1,
    yousei: 0,
    shihai: 0,
  }),
}

const damageParameters = [
  {
    attack: { dice: 0, value: 5, kazanari: 0 },
    defence: { dice: 0, value: 3 },
  },
  {
    attack: { dice: 4, value: 0, kazanari: 3 },
    defence: { dice: 2, value: 0 },
  },
  {
    attack: { dice: 0, value: -3, kazanari: 9 },
    defence: { dice: 1, value: 2 },
  },
]

describe('damage calculator migration', () => {
  it.each(damageParameters)(
    'matches the legacy result for $attack',
    ({ attack, defence }) => {
      const legacyDamage = getLegacyDamage(score, attack, defence)
      const damage = getDamage(score, attack, defence)

      expectProbabilityResultClose(damage, legacyDamage)
      expect(
        Math.abs(
          getDamageSummary(damage).expectedValue -
            getLegacyDamageSummary(legacyDamage).expectedValue
        )
      ).toBeLessThanOrEqual(MIGRATION_TOLERANCE)
    }
  )

  it('matches the legacy total damage result', () => {
    const damages = damageParameters.slice(0, 2).map(({ attack, defence }) =>
      getDamage(score, attack, defence)
    )
    const combos = damages.map((damage) => ({ data: { damage } }))

    expectProbabilityResultClose(
      getTotalDamage(combos),
      getLegacyTotalDamage(combos)
    )
  })
})
