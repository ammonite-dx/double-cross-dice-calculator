function scoreParams({ dice, critical, skill = 0, yousei = 0, shihai = 0 }) {
  return { dice, critical, skill, yousei, shihai }
}

function makeAttackEntry(
  id,
  { actionScore, reactionScore, attack, defence }
) {
  return {
    id,
    params: {
      action: {
        score: { ...actionScore },
        damage: { ...attack },
      },
      reaction: {
        mode: 'guard',
        score: { ...reactionScore },
        damage: { ...defence },
      },
    },
  }
}

function makeCase({
  id,
  label,
  tier,
  entries,
  iterations = 3,
  warmupIterations = 1,
  execution = 'full',
  executionReason = null,
  plannerPolicy = {},
  note,
}) {
  return Object.freeze({
    id,
    label,
    route: 'attack',
    tier,
    entries: Object.freeze(entries),
    iterations,
    warmupIterations,
    execution,
    executionReason,
    plannerPolicy,
    note,
  })
}

const SMALL_ACTION_SCORE = scoreParams({
  dice: 4,
  critical: 8,
  skill: 3,
})
const SMALL_REACTION_SCORE = scoreParams({
  dice: 3,
  critical: 10,
  skill: 1,
})

// Keep these seven ids and inputs aligned with the Phase 2-H core/browser
// comparison fixtures. This page intentionally sends their params through
// the public CalculationClient batch boundary.
export const BENCHMARK_CASES = Object.freeze([
  makeCase({
    id: 'small-normal-kazanari-0',
    label: '小規模通常: fixed value + defence, kazanari=0',
    tier: 'small',
    entries: [makeAttackEntry('small-1', {
      actionScore: SMALL_ACTION_SCORE,
      reactionScore: SMALL_REACTION_SCORE,
      attack: { dice: 1, value: 8, kazanari: 0 },
      defence: { dice: 1, value: 3 },
    })],
    note: 'CalculationClient.calculateAttackBatchのscore、DR、D10、防御、totalを含む',
  }),
  makeCase({
    id: 'fixed-shift-defence',
    label: '固定値差と防御ダイス: positive shift',
    tier: 'fixed-shift',
    entries: [makeAttackEntry('fixed-1', {
      actionScore: scoreParams({ dice: 6, critical: 9, skill: 2 }),
      reactionScore: scoreParams({ dice: 4, critical: 10 }),
      attack: { dice: 2, value: 18, kazanari: 0 },
      defence: { dice: 3, value: 4 },
    })],
    note: 'attack.value - defence.value が正で、防御畳み込みを含む',
  }),
  makeCase({
    id: 'kazanari-3',
    label: 'runtime DR: kazanari>0',
    tier: 'kazanari',
    entries: [makeAttackEntry('kazanari-3-1', {
      actionScore: scoreParams({ dice: 5, critical: 8 }),
      reactionScore: scoreParams({ dice: 4, critical: 10 }),
      attack: { dice: 3, value: 5, kazanari: 3 },
      defence: { dice: 2, value: 0 },
    })],
    note: 'kazanari=0ケースと同じ公開batch境界で非ゼロ振り直しを測定',
  }),
  makeCase({
    id: 'failure-mass',
    label: '命中失敗massを含むケース',
    tier: 'failure-mass',
    entries: [makeAttackEntry('failure-1', {
      actionScore: scoreParams({ dice: 3, critical: 10 }),
      reactionScore: scoreParams({ dice: 8, critical: 8 }),
      attack: { dice: 2, value: 2, kazanari: 0 },
      defence: { dice: 1, value: 8 },
    })],
    note: 'canonical batchのfailure mass合成を公開API境界から測定',
  }),
  makeCase({
    id: 'combo-total-3',
    label: '複数combo total: mixed fixed shift, defence, kazanari',
    tier: 'multi-combo',
    iterations: 2,
    warmupIterations: 1,
    entries: [
      makeAttackEntry('combo-1', {
        actionScore: scoreParams({ dice: 5, critical: 8 }),
        reactionScore: scoreParams({ dice: 4, critical: 10 }),
        attack: { dice: 2, value: 12, kazanari: 0 },
        defence: { dice: 1, value: 3 },
      }),
      makeAttackEntry('combo-2', {
        actionScore: scoreParams({ dice: 7, critical: 9 }),
        reactionScore: scoreParams({ dice: 5, critical: 10 }),
        attack: { dice: 4, value: 20, kazanari: 3 },
        defence: { dice: 2, value: 8 },
      }),
      makeAttackEntry('combo-3', {
        actionScore: scoreParams({ dice: 6, critical: 8 }),
        reactionScore: scoreParams({ dice: 4, critical: 9 }),
        attack: { dice: 5, value: -3, kazanari: 9 },
        defence: { dice: 2, value: 6 },
      }),
    ],
    note: 'canonical batch内の3 comboとcanonical total aggregationを含む',
  }),
  makeCase({
    id: 'range-warning-boundary',
    label: '現行上限近辺: RangePlanner warning/reject境界',
    tier: 'warning-boundary',
    iterations: 2,
    warmupIterations: 1,
    execution: 'planner-only',
    executionReason: 'current maximum near-warning case is measured only through public planAttackCombo to avoid an intentionally heavy calculation run',
    entries: [makeAttackEntry('boundary-1', {
      actionScore: scoreParams({ dice: 99, critical: 8, shihai: 0 }),
      reactionScore: scoreParams({ dice: 99, critical: 2, shihai: 19 }),
      attack: { dice: 99, value: 999, kazanari: 9 },
      defence: { dice: 99, value: -999 },
    })],
    note: 'public planAttackComboのaccepted/warningsだけを記録し、重いbatch実行はしない',
  }),
  makeCase({
    id: 'range-reject-boundary',
    label: '明示hard reject: public batch preflight rejection',
    tier: 'reject-boundary',
    iterations: 2,
    warmupIterations: 1,
    execution: 'public-rejected',
    plannerPolicy: {
      limits: {
        warning: { estimatedTimeMs: 0 },
        hard: { estimatedTimeMs: 0 },
      },
    },
    executionReason: 'public calculateAttackBatch rejects during preflight before asset, score, or Worker work',
    entries: [makeAttackEntry('reject-boundary-1', {
      actionScore: scoreParams({ dice: 99, critical: 8, shihai: 0 }),
      reactionScore: scoreParams({ dice: 99, critical: 2, shihai: 19 }),
      attack: { dice: 99, value: 999, kazanari: 9 },
      defence: { dice: 99, value: -999 },
    })],
    note: 'planner policyだけを狭め、public batchのreject後にWorkerを起動しないことを記録',
  }),
])

export const BENCHMARK_CASE_IDS = Object.freeze(
  BENCHMARK_CASES.map((testCase) => testCase.id)
)
