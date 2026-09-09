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
      damage: { dice: attackDice, value: attackValue, kazanari },
    },
    reaction: {
      mode: reactionMode,
      score: { ...reactionScore },
      damage: { dice: defenceDice, value: defenceValue },
    },
  }
}

function clone(value) {
  if (Array.isArray(value)) {
    return value.map(clone)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clone(entry)])
    )
  }
  return value
}

export const SHIHAI_STRESS_CANDIDATES = Object.freeze([
  Object.freeze({ dice: 99, critical: 2, shihai: 19 }),
  Object.freeze({ dice: 75, critical: 2, shihai: 15 }),
  Object.freeze({ dice: 50, critical: 2, shihai: 10 }),
  Object.freeze({ dice: 36, critical: 5, shihai: 9 }),
  Object.freeze({ dice: 24, critical: 5, shihai: 5 }),
  Object.freeze({ dice: 12, critical: 8, shihai: 3 }),
])

export const YOUSEI_STRESS_CANDIDATES = Object.freeze([
  Object.freeze({ dice: 99, critical: 2, yousei: 9 }),
  Object.freeze({ dice: 75, critical: 2, yousei: 7 }),
  Object.freeze({ dice: 50, critical: 2, yousei: 5 }),
  Object.freeze({ dice: 24, critical: 5, yousei: 3 }),
  Object.freeze({ dice: 8, critical: 8, yousei: 2 }),
])

export const DX_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'dx-ordinary',
    operation: 'dx',
    label: 'ordinary DX',
    params: score({ dice: 10, critical: 8, skill: 3 }),
    kind: 'accepted',
  }),
  Object.freeze({
    id: 'dx-low-critical',
    operation: 'dx',
    label: 'low-critical DX',
    params: score({ dice: 12, critical: 5 }),
    kind: 'accepted',
  }),
])

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
    label: 'tail-heavy Check',
    params: {
      action: score({ dice: 12, critical: 5 }),
      reaction: score({ dice: 10, critical: 6 }),
    },
    difficulty: { opposed: true, target: 25 },
  }),
  Object.freeze({
    id: 'check-yousei',
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
    id: 'attack-fixed-evasion',
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
  Object.freeze({
    id: 'backtrack-high-input',
    operation: 'backtrack',
    label: 'high-input Backtrack regression case',
    params: {
      encroachment: 180,
      lois: 3,
      elois: 5,
      dice: 100,
      value: 40,
      dlois: 'なし',
    },
  }),
])

export const D10_FIXTURES = Object.freeze([
  Object.freeze({ id: 'd10-3', operation: 'd10', label: '3D10', dice: 3 }),
  Object.freeze({ id: 'd10-12', operation: 'd10', label: '12D10', dice: 12 }),
  Object.freeze({ id: 'd10-99', operation: 'd10', label: '99D10', dice: 99 }),
  Object.freeze({ id: 'd10-197', operation: 'd10', label: '197D10', dice: 197 }),
  Object.freeze({ id: 'd10-272', operation: 'd10', label: '272D10', dice: 272 }),
])

function createNormalizedDistribution(length, seed) {
  const values = new Float64Array(length)
  let total = 0
  for (let index = 0; index < length; index += 1) {
    const distance = index - (length - 1) / 2
    const value = Math.exp(-(distance * distance) / (length * 0.7))
      * (1 + ((index + seed) % 7) / 20)
    values[index] = value
    total += value
  }
  for (let index = 0; index < length; index += 1) {
    values[index] /= total
  }
  return values
}

export const FFT_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'fft-1024',
    operation: 'fft',
    label: 'FFT convolution length 1024',
    left: createNormalizedDistribution(512, 1),
    right: createNormalizedDistribution(512, 3),
    fftLength: 1024,
  }),
  Object.freeze({
    id: 'fft-4096',
    operation: 'fft',
    label: 'FFT convolution length 4096',
    left: createNormalizedDistribution(2048, 5),
    right: createNormalizedDistribution(2048, 7),
    fftLength: 4096,
  }),
  Object.freeze({
    id: 'fft-16384',
    operation: 'fft',
    label: 'FFT convolution length 16384',
    left: createNormalizedDistribution(8192, 9),
    right: createNormalizedDistribution(8192, 11),
    fftLength: 16384,
  }),
])

export function selectFirstAcceptedCandidate(candidates, planScore) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new RangeError('stress candidates must not be empty')
  }
  if (typeof planScore !== 'function') {
    throw new TypeError('planScore must be a function')
  }

  const attempts = candidates.map((candidate) => {
    const params = score(candidate)
    let plan
    let error = null
    try {
      plan = planScore(params)
    } catch (caught) {
      error = String(caught?.message ?? caught)
    }
    return {
      params,
      accepted: error === null && plan?.accepted === true,
      plan: error === null ? plan : null,
      error,
    }
  })
  const selected = attempts.find(({ accepted }) => accepted)
  if (!selected) {
    return Object.freeze({ selected: null, attempts })
  }
  return Object.freeze({ selected, attempts })
}

export function createFittingFixture(
  id,
  label,
  params,
  plan,
  kind
) {
  return Object.freeze({
    id,
    operation: 'dx',
    label,
    params: clone(params),
    plan,
    kind,
  })
}

export function createTotalDamageFixtures(damages) {
  if (!Array.isArray(damages) || damages.length < 2) {
    throw new RangeError('at least two damage envelopes are required')
  }
  return Object.freeze([2, 4, 8].map((componentCount) => Object.freeze({
    id: `total-damage-${componentCount}`,
    operation: 'totalDamage',
    label: `Total Damage from ${componentCount} production envelopes`,
    componentCount,
    damages: Array.from(
      { length: componentCount },
      (_, index) => damages[index % damages.length]
    ),
  })))
}

export function createStatisticsFixture(scorePair) {
  return Object.freeze({
    id: 'score-statistics',
    operation: 'statistics',
    label: 'Score statistics',
    score: scorePair,
    difficulty: { opposed: true, target: 15 },
  })
}

export function createRangeFixture(params, policy = {}) {
  return Object.freeze({
    id: 'range-planning',
    operation: 'range',
    label: 'range planning',
    params,
    policy,
  })
}

export function createFixtureSet({
  shihaiSelection,
  youseiSelection,
  totalDamages,
  scorePair,
}) {
  const selectedDx = []
  if (shihaiSelection?.selected) {
    selectedDx.push(createFittingFixture(
      'dx-shihai-stress',
      'selected 《絶対支配》 stress DX',
      shihaiSelection.selected.params,
      shihaiSelection.selected.plan,
      'shihai-stress'
    ))
  }
  if (youseiSelection?.selected) {
    selectedDx.push(createFittingFixture(
      'dx-yousei-stress',
      'selected 《妖精の手》 stress DX',
      { ...youseiSelection.selected.params },
      youseiSelection.selected.plan,
      'yousei-stress'
    ))
  }

  return Object.freeze([
    ...DX_FIXTURES,
    ...selectedDx,
    ...D10_FIXTURES,
    ...FFT_FIXTURES,
    ...CHECK_FIXTURES,
    ...ATTACK_FIXTURES,
    ...BACKTRACK_FIXTURES,
    createStatisticsFixture(scorePair),
    createRangeFixture({
      operation: 'check',
      score: {
        action: CHECK_FIXTURES[0].params.action,
        reaction: CHECK_FIXTURES[0].params.reaction,
      },
    }),
    ...createTotalDamageFixtures(totalDamages),
  ])
}

export function createAttackPlannerParams(params) {
  return {
    operation: 'attack',
    score: {
      action: { ...params.action.score },
      reaction: { ...params.reaction.score },
    },
    attack: { ...params.action.damage },
    defence: { ...params.reaction.damage },
  }
}

export function createScorePlannerParams(params) {
  return { operation: 'score', score: { ...params } }
}
