export const UI_LIMITS = {
  scoreDice: 99,
  critical: { min: 2, max: 11 },
  yousei: { min: 0, max: 9 },
  shihai: { min: 0, max: 19 },
  attackDice: 99,
  defenceDice: 99,
  kazanari: { min: 0, max: 9 },
  backtrackDice: 99,
  lois: { min: 0, max: 7 },
  elois: { min: 0, max: 99 },
  fixedValue: { min: -999, max: 999 },
  backtrackValue: { min: 0, max: 999 },
}

const SCORE_CURRENT_LIGHT = {
  dice: 99,
  critical: 8,
  shihai: 0,
  yousei: 0,
  skill: 0,
}

const SCORE_CURRENT_HEAVY = {
  dice: 99,
  critical: 2,
  shihai: 19,
  yousei: 0,
  skill: 0,
}

const SCORE_YOUSEI_CURRENT = {
  dice: 99,
  critical: 2,
  shihai: 0,
  yousei: 9,
  skill: 0,
}

function scorePlan(score) {
  return {
    operation: 'score',
    score,
  }
}

function attackRequest({
  actionScore,
  reactionScore,
  attackDice = 99,
  attackValue = 999,
  kazanari = 9,
  defenceDice = 99,
  defenceValue = -999,
}) {
  return {
    action: {
      score: actionScore,
      damage: {
        dice: attackDice,
        value: attackValue,
        kazanari,
      },
    },
    reaction: {
      mode: 'guard',
      score: reactionScore,
      damage: {
        dice: defenceDice,
        value: defenceValue,
      },
    },
  }
}

function attackPlan(request, comboCount = 1) {
  return {
    operation: 'attack',
    score: {
      action: request.action.score,
      reaction: request.reaction.score,
    },
    attack: request.action.damage,
    defence: request.reaction.damage,
    comboCount,
  }
}

const CURRENT_ATTACK = attackRequest({
  actionScore: { ...SCORE_CURRENT_LIGHT, skill: 0 },
  reactionScore: { ...SCORE_CURRENT_HEAVY, skill: 0 },
})

const TWO_X_ATTACK = attackRequest({
  actionScore: {
    dice: 198,
    critical: 2,
    shihai: 0,
    yousei: 0,
    skill: 500,
  },
  reactionScore: {
    dice: 198,
    critical: 2,
    shihai: 19,
    yousei: 0,
    skill: -500,
  },
  attackDice: 198,
  attackValue: 500,
  defenceDice: 198,
  defenceValue: -500,
})

const COMBO_REQUESTS = [
  attackRequest({
    actionScore: { ...SCORE_CURRENT_LIGHT, skill: 0 },
    reactionScore: { ...SCORE_CURRENT_LIGHT, skill: 0 },
    attackDice: 12,
    attackValue: 30,
    kazanari: 0,
    defenceDice: 4,
    defenceValue: 10,
  }),
  attackRequest({
    actionScore: { ...SCORE_CURRENT_HEAVY, skill: 0 },
    reactionScore: { ...SCORE_CURRENT_LIGHT, skill: 0 },
    attackDice: 24,
    attackValue: 45,
    kazanari: 3,
    defenceDice: 8,
    defenceValue: 20,
  }),
  attackRequest({
    actionScore: { ...SCORE_CURRENT_LIGHT, skill: 0 },
    reactionScore: { ...SCORE_CURRENT_LIGHT, skill: 0 },
    attackDice: 36,
    attackValue: 60,
    kazanari: 0,
    defenceDice: 12,
    defenceValue: 25,
  }),
]

function backtrackParams({ dice, lois = 0, elois = 0, dlois = 'なし' }) {
  return {
    encroachment: 100,
    lois,
    elois,
    dice,
    value: 999,
    dlois,
  }
}

function backtrackPlan(params) {
  return {
    operation: 'backtrack',
    backtrack: params,
  }
}

function damageOnlyPlan(maxDamageDice, kazanari) {
  const attackDice = maxDamageDice - 103
  const score = {
    dice: 0,
    critical: 11,
    shihai: 0,
    yousei: 0,
    skill: 0,
  }
  return attackPlan(
    attackRequest({
      actionScore: score,
      reactionScore: score,
      attackDice,
      attackValue: 0,
      kazanari,
      defenceDice: 0,
      defenceValue: 0,
    })
  )
}

export const BENCHMARK_CASES = [
  {
    id: 'dx-current-light',
    label: 'DX current light: 99D critical 8 shihai 0',
    kind: 'dx',
    tier: 'current',
    params: SCORE_CURRENT_LIGHT,
    planner: scorePlan(SCORE_CURRENT_LIGHT),
    browser: true,
  },
  {
    id: 'dx-current-heavy',
    label: 'DX current heavy: 99D critical 2 shihai 19',
    kind: 'dx',
    tier: 'current-heavy',
    params: SCORE_CURRENT_HEAVY,
    planner: scorePlan(SCORE_CURRENT_HEAVY),
    browser: true,
  },
  {
    id: 'score-current-yousei',
    label: 'Score current wide tail: 99D critical 2 yousei 9',
    kind: 'score',
    tier: 'current-heavy',
    params: SCORE_YOUSEI_CURRENT,
    planner: scorePlan(SCORE_YOUSEI_CURRENT),
    browser: true,
  },
  {
    id: 'dx-two-x-planner-only',
    label: 'DX approximately 2x: 198D critical 2 shihai 19',
    kind: 'dx',
    tier: 'two-x',
    params: { ...SCORE_CURRENT_HEAVY, dice: 198 },
    planner: scorePlan({ ...SCORE_CURRENT_HEAVY, dice: 198 }),
    coreLimit: 'DX_DICE_COUNT=100',
    browser: false,
  },
  {
    id: 'dx-large-planner-only',
    label: 'DX large candidate: 300D critical 2 shihai 19',
    kind: 'dx',
    tier: 'large-candidate',
    params: { ...SCORE_CURRENT_HEAVY, dice: 300 },
    planner: scorePlan({ ...SCORE_CURRENT_HEAVY, dice: 300 }),
    coreLimit: 'DX_DICE_COUNT=100',
    browser: false,
  },
  {
    id: 'dx-hard-reject-planner-only',
    label: 'DX hard planner boundary: 600D critical 2 shihai 19',
    kind: 'dx',
    tier: 'hard-reject',
    params: { ...SCORE_CURRENT_HEAVY, dice: 600 },
    planner: scorePlan({ ...SCORE_CURRENT_HEAVY, dice: 600 }),
    coreLimit: 'DX_DICE_COUNT=100; planner hard reject expected',
    browser: false,
  },
  {
    id: 'dr-current-kazanari-0',
    label: 'DR current maximum: 202 damage dice kazanari 0',
    kind: 'dr',
    tier: 'current',
    params: { maxDamageDice: 202, kazanari: 0 },
    planner: damageOnlyPlan(202, 0),
    browser: true,
  },
  {
    id: 'dr-current-kazanari-9',
    label: 'DR current maximum: 202 damage dice kazanari 9',
    kind: 'dr',
    tier: 'current-heavy',
    params: { maxDamageDice: 202, kazanari: 9 },
    planner: damageOnlyPlan(202, 9),
    browser: true,
  },
  {
    id: 'dr-over-core-cap',
    label: 'DR over direct-core cap: 203 damage dice kazanari 9',
    kind: 'dr',
    tier: 'two-x',
    params: { maxDamageDice: 203, kazanari: 9 },
    planner: damageOnlyPlan(203, 9),
    coreLimit: 'RUNTIME_DAMAGE_MAX_DAMAGE_DICE=202',
    browser: false,
  },
  {
    id: 'attack-current-warning',
    label: 'Attack current maximum and warning-near planner case',
    kind: 'attack',
    tier: 'warning-near',
    params: CURRENT_ATTACK,
    planner: attackPlan(CURRENT_ATTACK),
    browser: true,
  },
  {
    id: 'attack-two-x-planner-only',
    label: 'Attack approximately 2x: score and damage dice 198',
    kind: 'attack',
    tier: 'two-x',
    params: TWO_X_ATTACK,
    planner: attackPlan(TWO_X_ATTACK),
    coreLimit: 'DX_DICE_COUNT=100 and RUNTIME_DAMAGE_MAX_DAMAGE_DICE=202',
    browser: false,
  },
  {
    id: 'attack-combo-3',
    label: 'Attack three-combo sequence with mixed DR and defence',
    kind: 'combos',
    tier: 'current-mixed',
    params: COMBO_REQUESTS,
    planner: attackPlan(COMBO_REQUESTS[0], COMBO_REQUESTS.length),
    browser: true,
  },
  {
    id: 'backtrack-current-asset',
    label: 'Backtrack current field: ordinary D10 asset path',
    kind: 'backtrack',
    tier: 'current',
    params: backtrackParams({ dice: 99 }),
    planner: backtrackPlan(backtrackParams({ dice: 99 })),
    browser: true,
  },
  {
    id: 'backtrack-two-x-on-demand',
    label: 'Backtrack approximately 2x field: ordinary D10 on-demand path',
    kind: 'backtrack',
    tier: 'two-x',
    params: backtrackParams({ dice: 198 }),
    planner: backtrackPlan(backtrackParams({ dice: 198 })),
    browser: true,
  },
  {
    id: 'backtrack-current-on-demand',
    label: 'Backtrack current maximum: ordinary D10 on-demand path',
    kind: 'backtrack',
    tier: 'current-heavy',
    params: backtrackParams({ dice: 99, lois: 7, elois: 99 }),
    planner: backtrackPlan(backtrackParams({ dice: 99, lois: 7, elois: 99 })),
    browser: true,
  },
  {
    id: 'backtrack-current-livingdead',
    label: 'Backtrack current maximum: livingdead on-demand path',
    kind: 'backtrack',
    tier: 'current-heavy',
    params: backtrackParams({
      dice: 99,
      lois: 7,
      elois: 99,
      dlois: '屍人',
    }),
    planner: backtrackPlan(backtrackParams({
      dice: 99,
      lois: 7,
      elois: 99,
      dlois: '屍人',
    })),
    browser: true,
  },
  {
    id: 'backtrack-current-nightmare',
    label: 'Backtrack current maximum: nightmare D-lois on-demand path',
    kind: 'backtrack',
    tier: 'current-heavy',
    params: backtrackParams({
      dice: 99,
      lois: 7,
      elois: 99,
      dlois: '不死者・悪夢',
    }),
    planner: backtrackPlan(backtrackParams({
      dice: 99,
      lois: 7,
      elois: 99,
      dlois: '不死者・悪夢',
    })),
    browser: true,
  },
  {
    id: 'backtrack-large-normal-node-only',
    label: 'Backtrack large candidate: ordinary D10 400 dice',
    kind: 'backtrack',
    tier: 'large-candidate',
    params: backtrackParams({ dice: 400 }),
    planner: backtrackPlan(backtrackParams({ dice: 400 })),
    browser: false,
  },
]

export const BROWSER_CASES = BENCHMARK_CASES.filter((testCase) => testCase.browser)

export function getCaseById(id) {
  return BENCHMARK_CASES.find((testCase) => testCase.id === id)
}
