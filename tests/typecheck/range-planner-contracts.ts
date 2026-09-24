import { expectTypeOf } from 'vitest'

import { planCalculationRanges } from '../../src/calculation/RangePlanner'
import type {
  AttackCalculationRangePlan,
  BacktrackCalculationRangePlan,
  CheckCalculationRangePlan,
  ScoreCalculationRangePlan,
  ScoreRangePlannerInput,
} from '../../src/calculation/planning/RangePlannerTypes'

const score: ScoreRangePlannerInput = {
  operation: 'score',
  score: { dice: 2, critical: 10, skill: 1, yousei: 0, shihai: 0 },
}
const check = {
  operation: 'check',
  score: {
    action: score.score,
    reaction: score.score,
  },
} as const
const attack = {
  operation: 'attack',
  score: check.score,
  attack: { dice: 2, value: 3, kazanari: 0 },
  defence: { dice: 1, value: 0 },
} as const
const backtrack = {
  operation: 'backtrack',
  backtrack: {
    encroachment: 79,
    lois: 1,
    elois: 0,
    dice: 1,
    value: 0,
    dlois: 'なし',
  },
} as const

expectTypeOf(planCalculationRanges(score))
  .toEqualTypeOf<ScoreCalculationRangePlan>()
expectTypeOf(planCalculationRanges(check))
  .toEqualTypeOf<CheckCalculationRangePlan>()
expectTypeOf(planCalculationRanges(attack))
  .toEqualTypeOf<AttackCalculationRangePlan>()
expectTypeOf(planCalculationRanges(backtrack))
  .toEqualTypeOf<BacktrackCalculationRangePlan>()

// Operation and its matching payload are required at the public boundary.
// @ts-expect-error: planner inputs must include a recognized operation.
planCalculationRanges({ score: score.score })
// @ts-expect-error: attack requires both score sides and damage inputs.
planCalculationRanges({ operation: 'attack', score: score.score })
// @ts-expect-error: backtrack payloads cannot be supplied to another operation.
planCalculationRanges({ operation: 'score', backtrack: backtrack.backtrack })
