function scoreParams(overrides = {}) {
  return {
    dice: 99,
    critical: 2,
    skill: 0,
    yousei: 0,
    shihai: 0,
    ...overrides,
  }
}

function makeEntry(id, {
  actionScore,
  reactionScore = actionScore,
  attackDice,
  attackValue = 999,
  kazanari,
  defenceDice = 99,
  defenceValue = -999,
}) {
  return {
    id,
    params: {
      action: {
        score: { ...actionScore },
        damage: {
          dice: attackDice,
          value: attackValue,
          kazanari,
        },
      },
      reaction: {
        mode: 'ガード・リアクション放棄',
        score: { ...reactionScore },
        damage: {
          dice: defenceDice,
          value: defenceValue,
        },
      },
    },
  }
}

function makeCase({
  id,
  label,
  targetMaxDamageDice,
  actionScore,
  attackDice,
  kazanari,
  note,
}) {
  return Object.freeze({
    id,
    label,
    targetMaxDamageDice,
    entries: Object.freeze([
      makeEntry(`${id}-entry`, {
        actionScore,
        attackDice,
        kazanari,
      }),
    ]),
    note,
  })
}

const SCORE_FOR_202_DAMAGE_DICE = scoreParams({
  critical: 11,
  skill: 1010,
})
const SCORE_FOR_400_OR_600_DAMAGE_DICE = scoreParams({
  critical: 11,
  skill: 3260,
})

// This policy widens only RangePlanner resource thresholds. Production
// display coverage, cost model, and runtime safety caps remain the defaults
// supplied by CalculationClient and its dependencies.
export const FULL_TAIL_ATTACK_BENCHMARK_POLICY = Object.freeze({
  limits: Object.freeze({
    maxCpuWork: Number.MAX_SAFE_INTEGER,
    estimatedMemoryBytes: Number.MAX_SAFE_INTEGER,
    workingLength: Number.MAX_SAFE_INTEGER,
    fftLength: Number.MAX_SAFE_INTEGER,
  }),
})

const MATRIX_CASES = [
  ...[0, 1, 9].map((kazanari) => makeCase({
    id: `matrix-202d-kazanari${kazanari}`,
    label: `full-tail Attack 202D, kazanari=${kazanari}`,
    targetMaxDamageDice: 202,
    actionScore: SCORE_FOR_202_DAMAGE_DICE,
    attackDice: 99,
    kazanari,
    note: 'critical=11 skill=1010 action score and attackDice=99 produce maxDamageDice=202',
  })),
  ...[0, 1, 9].map((kazanari) => makeCase({
    id: `matrix-400d-kazanari${kazanari}`,
    label: `full-tail Attack 400D, kazanari=${kazanari}`,
    targetMaxDamageDice: 400,
    actionScore: SCORE_FOR_400_OR_600_DAMAGE_DICE,
    attackDice: 72,
    kazanari,
    note: 'critical=11 skill=3260 action score and attackDice=72 produce maxDamageDice=400',
  })),
  ...[0, 1, 9].map((kazanari) => makeCase({
    id: `matrix-600d-kazanari${kazanari}`,
    label: `full-tail Attack 600D, kazanari=${kazanari}`,
    targetMaxDamageDice: 600,
    actionScore: SCORE_FOR_400_OR_600_DAMAGE_DICE,
    attackDice: 272,
    kazanari,
    note: 'critical=11 skill=3260 action score and attackDice=272 produce maxDamageDice=600',
  })),
]

export const FULL_TAIL_ATTACK_CASES = Object.freeze([
  ...MATRIX_CASES,
  makeCase({
    id: 'stress-critical10-yousei9',
    label: 'full-tail Attack stress: critical=10, yousei=9, kazanari=9',
    targetMaxDamageDice: 649,
    actionScore: scoreParams({ critical: 10, skill: 5250, yousei: 9 }),
    attackDice: 99,
    kazanari: 9,
    note: 'production resource hard threshold is expected to reject; benchmark policy executes canonical batch',
  }),
  makeCase({
    id: 'stress-critical11-shihai19',
    label: 'full-tail Attack stress: critical=11, shihai=19, kazanari=9',
    targetMaxDamageDice: 427,
    actionScore: scoreParams({ critical: 11, skill: 3260, shihai: 19 }),
    attackDice: 99,
    kazanari: 9,
    note: 'production resource hard threshold is expected to reject; benchmark policy executes canonical batch',
  }),
])

export const FULL_TAIL_ATTACK_CASE_IDS = Object.freeze(
  FULL_TAIL_ATTACK_CASES.map((testCase) => testCase.id)
)
