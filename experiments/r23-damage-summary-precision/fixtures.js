function score({ dice, critical, skill = 0, yousei = 0, shihai = 0 }) {
  return { dice, critical, skill, yousei, shihai }
}

function attack({
  actionScore,
  reactionScore,
  attackDice,
  attackValue,
  kazanari = 0,
  defenceDice = 0,
  defenceValue = 0,
}) {
  return {
    action: {
      score: actionScore,
      damage: { dice: attackDice, value: attackValue, kazanari },
    },
    reaction: {
      mode: 'ドッジ',
      score: reactionScore,
      damage: { dice: defenceDice, value: defenceValue },
    },
  }
}

export const DAMAGE_PRECISION_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'public-v3-1-default',
    label: 'public v3.1 default attack',
    category: 'public-reference',
    reference: Object.freeze({
      expectedDamageExpectation: 3.1,
      source: 'public reference screenshot',
    }),
    params: attack({
      actionScore: score({ dice: 1, critical: 10 }),
      reactionScore: score({ dice: 1, critical: 10 }),
      attackDice: 0,
      attackValue: 0,
      defenceDice: 0,
      defenceValue: 0,
    }),
  }),
  Object.freeze({
    id: 'ordinary-attack',
    label: 'ordinary attack',
    category: 'ordinary',
    params: attack({
      actionScore: score({ dice: 4, critical: 8, skill: 2 }),
      reactionScore: score({ dice: 3, critical: 9, skill: 1 }),
      attackDice: 3,
      attackValue: 10,
      defenceDice: 2,
      defenceValue: 5,
    }),
  }),
  Object.freeze({
    id: 'yousei-action',
    label: 'action score with 《妖精の手》',
    category: 'yousei-action',
    params: attack({
      actionScore: score({ dice: 1, critical: 10, skill: 2, yousei: 1 }),
      reactionScore: score({ dice: 0, critical: 11 }),
      attackDice: 2,
      attackValue: 5,
      defenceDice: 0,
      defenceValue: 0,
    }),
  }),
  Object.freeze({
    id: 'higher-score',
    label: 'higher score',
    category: 'higher-score',
    params: attack({
      actionScore: score({ dice: 12, critical: 7, skill: 4 }),
      reactionScore: score({ dice: 8, critical: 8, skill: 2 }),
      attackDice: 4,
      attackValue: 12,
      defenceDice: 1,
      defenceValue: 4,
    }),
  }),
  Object.freeze({
    id: 'one-damage-die',
    label: 'one damage die',
    category: 'attack-dice-1',
    params: attack({
      actionScore: score({ dice: 4, critical: 10 }),
      reactionScore: score({ dice: 0, critical: 11 }),
      attackDice: 1,
      attackValue: 0,
    }),
  }),
  Object.freeze({
    id: 'finite-score',
    label: 'finite critical-11 score',
    category: 'finite-score',
    params: attack({
      actionScore: score({ dice: 0, critical: 11, skill: 2 }),
      reactionScore: score({ dice: 0, critical: 11, skill: 1 }),
      attackDice: 3,
      attackValue: 8,
      defenceDice: 1,
      defenceValue: 2,
    }),
  }),
  Object.freeze({
    id: 'several-damage-dice',
    label: 'several damage dice',
    category: 'attack-dice-several',
    params: attack({
      actionScore: score({ dice: 4, critical: 10 }),
      reactionScore: score({ dice: 0, critical: 11 }),
      attackDice: 8,
      attackValue: 4,
    }),
  }),
  Object.freeze({
    id: 'positive-fixed-difference',
    label: 'positive fixed difference',
    category: 'positive-fixed-difference',
    params: attack({
      actionScore: score({ dice: 5, critical: 9, skill: 2 }),
      reactionScore: score({ dice: 2, critical: 10 }),
      attackDice: 4,
      attackValue: 15,
      defenceValue: 2,
    }),
  }),
  Object.freeze({
    id: 'negative-fixed-difference',
    label: 'negative fixed difference',
    category: 'negative-fixed-difference',
    params: attack({
      actionScore: score({ dice: 5, critical: 9, skill: 2 }),
      reactionScore: score({ dice: 2, critical: 10 }),
      attackDice: 4,
      attackValue: 0,
      defenceDice: 2,
      defenceValue: 8,
    }),
  }),
  Object.freeze({
    id: 'defence-dice',
    label: 'defence dice',
    category: 'defence-dice',
    params: attack({
      actionScore: score({ dice: 5, critical: 9, skill: 2 }),
      reactionScore: score({ dice: 3, critical: 10 }),
      attackDice: 3,
      attackValue: 6,
      defenceDice: 2,
      defenceValue: 1,
    }),
  }),
  Object.freeze({
    id: 'kazanari-one',
    label: '風鳴りの爪 with one rerollable die',
    category: 'kazanari-1',
    params: attack({
      actionScore: score({ dice: 6, critical: 8, skill: 2 }),
      reactionScore: score({ dice: 3, critical: 9, skill: 1 }),
      attackDice: 5,
      attackValue: 8,
      kazanari: 1,
      defenceDice: 1,
      defenceValue: 2,
    }),
  }),
  Object.freeze({
    id: 'kazanari-several',
    label: '風鳴りの爪 with several rerollable dice',
    category: 'kazanari-several',
    params: attack({
      actionScore: score({ dice: 8, critical: 7, skill: 3 }),
      reactionScore: score({ dice: 4, critical: 9, skill: 1 }),
      attackDice: 7,
      attackValue: 10,
      kazanari: 3,
      defenceDice: 2,
      defenceValue: 3,
    }),
  }),
  Object.freeze({
    id: 'large-accepted',
    label: 'large accepted attack',
    category: 'large-accepted',
    params: attack({
      actionScore: score({ dice: 16, critical: 7, skill: 4 }),
      reactionScore: score({ dice: 12, critical: 8, skill: 2 }),
      attackDice: 10,
      attackValue: 12,
      kazanari: 4,
      defenceDice: 4,
      defenceValue: 5,
    }),
  }),
])

export const COMBO_TOTAL_FIXTURE_IDS = Object.freeze([
  'ordinary-attack',
  'higher-score',
  'kazanari-one',
  'large-accepted',
])
