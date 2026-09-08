import { createDistributionResult } from '../../src/calculation/DistributionResult.js'

function score({ dice, critical, skill = 0, yousei = 0, shihai = 0 }) {
  return { dice, critical, skill, yousei, shihai }
}

function attack({
  actionScore,
  reactionScore,
  attackDice,
  attackValue,
  kazanari,
  defenceDice,
  defenceValue,
  reactionMode = 'ドッジ',
}) {
  return {
    action: {
      score: { ...actionScore },
      damage: {
        dice: attackDice,
        value: attackValue,
        kazanari,
      },
    },
    reaction: {
      mode: reactionMode,
      score: { ...reactionScore },
      damage: {
        dice: defenceDice,
        value: defenceValue,
      },
    },
  }
}

function createDamageEnvelope(values, offset = 0) {
  const result = createDistributionResult({
    values,
    offset,
    support: {
      kind: 'finite',
      max: offset + values.length - 1,
    },
    overflow: null,
  })
  return Object.freeze({
    result,
    metadata: Object.freeze({
      modeledDistribution: true,
      sourceSupport: Object.freeze({
        kind: 'finite',
        max: offset + values.length - 1,
      }),
    }),
  })
}

export const CHECK_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'check-ordinary',
    operation: 'check',
    label: 'ordinary Check',
    params: {
      action: score({ dice: 10, critical: 8, skill: 3 }),
      reaction: score({ dice: 8, critical: 9, skill: 1 }),
    },
    difficulty: { opposed: true, target: 15 },
  }),
  Object.freeze({
    id: 'check-tail-heavy',
    operation: 'check',
    label: 'low critical Check',
    params: {
      action: score({ dice: 12, critical: 5, skill: 0 }),
      reaction: score({ dice: 10, critical: 6, skill: 0 }),
    },
    difficulty: { opposed: true, target: 25 },
  }),
  Object.freeze({
    id: 'check-special-effects',
    operation: 'check',
    label: 'Check with 妖精の手',
    params: {
      action: score({ dice: 8, critical: 8, skill: 2, yousei: 2 }),
      reaction: score({ dice: 6, critical: 9, skill: 1 }),
    },
    difficulty: { opposed: false, target: 20 },
  }),
])

export const ATTACK_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'attack-ordinary',
    operation: 'attack',
    label: 'ordinary Attack',
    params: attack({
      actionScore: score({ dice: 10, critical: 8, skill: 3 }),
      reactionScore: score({ dice: 8, critical: 9, skill: 1 }),
      attackDice: 3,
      attackValue: 10,
      kazanari: 0,
      defenceDice: 2,
      defenceValue: 5,
    }),
  }),
  Object.freeze({
    id: 'attack-kazanari',
    operation: 'attack',
    label: 'Attack with 風鳴りの爪',
    params: attack({
      actionScore: score({ dice: 16, critical: 7, skill: 5 }),
      reactionScore: score({ dice: 12, critical: 8, skill: 2 }),
      attackDice: 8,
      attackValue: 12,
      kazanari: 9,
      defenceDice: 4,
      defenceValue: 6,
    }),
  }),
  Object.freeze({
    id: 'attack-defence',
    operation: 'attack',
    label: 'Attack with fixed evasion',
    params: attack({
      actionScore: score({ dice: 12, critical: 8, skill: 4 }),
      reactionScore: score({ dice: 0, critical: 11, skill: 17 }),
      attackDice: 5,
      attackValue: 10,
      kazanari: 3,
      defenceDice: 0,
      defenceValue: 0,
      reactionMode: '《イベイジョン》',
    }),
  }),
  Object.freeze({
    id: 'attack-large-accepted',
    operation: 'attack',
    label: 'large accepted Attack',
    params: attack({
      actionScore: score({ dice: 24, critical: 5, skill: 2 }),
      reactionScore: score({ dice: 18, critical: 7, skill: 1 }),
      attackDice: 12,
      attackValue: 15,
      kazanari: 5,
      defenceDice: 6,
      defenceValue: 4,
    }),
  }),
])

export const TOTAL_DAMAGE_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'total-damage-three-sources',
    operation: 'totalDamage',
    label: 'Total Damage from three sources',
    damages: Object.freeze([
      createDamageEnvelope([0.1, 0.3, 0.6]),
      createDamageEnvelope([0.2, 0.5, 0.3], 1),
      createDamageEnvelope([0.4, 0.4, 0.2], 2),
    ]),
  }),
])

export const BACKTRACK_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'backtrack-ordinary',
    operation: 'backtrack',
    label: 'ordinary Backtrack',
    params: {
      encroachment: 80,
      lois: 1,
      elois: 2,
      dice: 3,
      value: 20,
      dlois: 'なし',
    },
  }),
  Object.freeze({
    id: 'backtrack-livingdead',
    operation: 'backtrack',
    label: 'Backtrack with 屍人',
    params: {
      encroachment: 120,
      lois: 2,
      elois: 3,
      dice: 20,
      value: 30,
      dlois: '屍人',
    },
  }),
])

export const R19_FIXTURES = Object.freeze([
  ...CHECK_FIXTURES,
  ...ATTACK_FIXTURES,
  ...TOTAL_DAMAGE_FIXTURES,
  ...BACKTRACK_FIXTURES,
])

export const R19_FIXTURE_IDS = Object.freeze(
  R19_FIXTURES.map(({ id }) => id)
)

export const SUPERSESSION_FIXTURE = ATTACK_FIXTURES[1]
