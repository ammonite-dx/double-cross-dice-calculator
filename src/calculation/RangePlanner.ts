import { planBacktrack } from './planning/BacktrackRangePlanner'
import { planDamage } from './planning/DamageRangePlanner'
import { getScoreValueUpperBound } from './planning/ScoreRangePlanner'
import { planScoreResolution } from './planning/ScoreResolutionPlanner'
import {
  applyLimits,
  backtrackResources,
  planResources,
  scoreOnlyResources,
} from './planning/ResourcePlan'
import {
  DEFAULT_POLICY,
  mergePolicy,
  normalizeDisplay,
} from './planning/RangePolicy'
import { object, positiveInteger } from './planning/PlanningMath'
import type { ScoreInput } from '../domain/InputDomain'
import type { ScoreResolution } from '../domain/ScoreResolution'
import type {
  AttackCalculationRangePlan,
  AttackRangePlannerInput,
  BacktrackCalculationRangePlan,
  BacktrackRangePlan,
  BacktrackRangePlannerInput,
  CalculationRangePlan,
  CalculationRangePlanBase,
  CheckCalculationRangePlan,
  CheckRangePlannerInput,
  DamageRangePlan,
  RangeDisplayPlan,
  RangeOverflowInfoSet,
  RangePlannerParams,
  RangePolicy,
  RangePolicyInput,
  RolledScoreRangePlan,
  ScoreCalculationRangePlan,
  ScoreRangePlan,
  ScoreRangePlannerInput,
} from './planning/RangePlannerTypes'

export { DEFAULT_POLICY }

interface RangePlanOverflowShape {
  readonly display: RangeDisplayPlan
  readonly scores: readonly ScoreRangePlan[]
  readonly damage: DamageRangePlan | null
  readonly backtrack: BacktrackRangePlan | null
}

function makeOverflowInfo(plan: RangePlanOverflowShape): RangeOverflowInfoSet {
  const tailScores = plan.scores.filter(
    (item): item is RolledScoreRangePlan =>
      item.kind === 'rolled-score' && !item.finiteSupport
  )
  const singleTail = tailScores.length === 1 ? tailScores[0] : undefined
  const score = plan.scores.length > 0
    ? tailScores.length === 0
      ? {
          type: 'finite-support',
          finiteSupport: true,
          lowerBound: null,
          bound: 0,
          meaning: 'score values have finite mathematical support',
        }
      : {
          type: 'dx-tail',
          finiteSupport: false,
          lowerBound: singleTail ? singleTail.workingMax + 1 : null,
          bound: tailScores.reduce((sum, item) => sum + item.tail.bound, 0),
          meaning: singleTail
            ? 'DX values above the modeled range are represented by a tail certificate'
            : 'DX values above each modeled range are represented by tail certificates; for multiple scores, bound is the sum and lowerBound is null because each score has its own boundary',
        }
    : null
  const damage = plan.damage
    ? {
        type: 'finite-support',
        finiteSupport: true,
        lowerBound: plan.damage.workingMax + 1,
        bound: 0,
        meaning: 'pre-defence damage values above workingMax use an explicit overflow bucket; raw DR support remains finite before fixed differences',
      }
    : null
  const display = {
    type: 'display-bucket',
    finiteSupport: false,
    lowerBound: plan.display.overflowLowerBound,
    bound: null,
    meaning: 'values at or above the display overflow boundary are grouped for presentation only',
  }
  const backtrack = plan.backtrack
    ? {
        type: 'finite-support',
        finiteSupport: true,
        lowerBound: null,
        bound: null,
        meaning: 'backtrack values have finite support and this plan generates the complete support on demand',
      }
    : null

  return { score, damage, display, backtrack }
}

function createPlanMetadata(
  policy: RangePolicy,
  operation: CalculationRangePlan['operation'],
  scoreCount: number,
): Pick<
  CalculationRangePlanBase,
  'accepted' | 'errorBudget' | 'overflow' | 'warnings' | 'rejectionReasons'
> {
  const scoreTail = operation === 'backtrack'
    ? 0
    : policy.errorBudget.scoreTail
  return {
    accepted: true,
    errorBudget: {
      total: policy.errorBudget.total,
      scoreTail,
      scorePerSide: scoreCount === 0 ? 0 : scoreTail / scoreCount,
      finiteDamageTail: 0,
    },
    overflow: {
      score: 'values above the modeled cutoff are omitted only within tail error budget',
      damage: 'finite modeled values above display.max are an explicit display overflow bucket',
      totalDamage: 'once a value is aggregated above display.max, later operations must not subtract from it',
      backtrack: 'backtrack values have finite support; this plan generates the complete support on demand',
    },
    warnings: [],
    rejectionReasons: undefined,
  }
}

function applyPlanLimits(
  plan: ScoreCalculationRangePlan,
  policy: RangePolicy,
): ScoreCalculationRangePlan
function applyPlanLimits(
  plan: CheckCalculationRangePlan,
  policy: RangePolicy,
): CheckCalculationRangePlan
function applyPlanLimits(
  plan: AttackCalculationRangePlan,
  policy: RangePolicy,
): AttackCalculationRangePlan
function applyPlanLimits(
  plan: BacktrackCalculationRangePlan,
  policy: RangePolicy,
): BacktrackCalculationRangePlan
function applyPlanLimits(
  plan: CalculationRangePlan,
  policy: RangePolicy,
): CalculationRangePlan {
  const result = applyLimits(plan, policy)
  const rejectionReasons = result.accepted
    ? undefined
    : Array.from(new Set(
        result.warnings
          .filter((warning) => warning.severity === 'reject')
          .map((warning) => warning.code)
      ))
  return {
    ...plan,
    accepted: result.accepted,
    warnings: [...result.warnings],
    rejectionReasons,
  }
}

function toScoreResolution(
  score: ScoreInput | ScoreResolution,
): ScoreResolution {
  return 'kind' in score
    ? score
    : { kind: 'rolled-score', params: score }
}

function planScore(
  params: ScoreRangePlannerInput,
  policy: RangePolicy,
): ScoreCalculationRangePlan {
  const display = normalizeDisplay(params.display)
  const scoreTail = policy.errorBudget.scoreTail
  const scores = [
    planScoreResolution(toScoreResolution(params.score), display, scoreTail),
  ] as const
  const shape = {
    operation: 'score' as const,
    display,
    scores,
    damage: null,
    backtrack: null,
    estimates: scoreOnlyResources(scores),
  }
  const plan = {
    ...shape,
    ...createPlanMetadata(policy, 'score', 1),
    overflowInfo: makeOverflowInfo(shape),
  } satisfies ScoreCalculationRangePlan
  return applyPlanLimits(plan, policy)
}

function planCheck(
  params: CheckRangePlannerInput,
  policy: RangePolicy,
): CheckCalculationRangePlan {
  const display = normalizeDisplay(params.display)
  const scoreTail = policy.errorBudget.scoreTail / 2
  const scores = [
    planScoreResolution(
      toScoreResolution(params.score.action),
      display,
      scoreTail,
    ),
    planScoreResolution(
      toScoreResolution(params.score.reaction),
      display,
      scoreTail,
    ),
  ] as const
  const shape = {
    operation: 'check' as const,
    display,
    scores,
    damage: null,
    backtrack: null,
    estimates: scoreOnlyResources(scores),
  }
  const plan = {
    ...shape,
    ...createPlanMetadata(policy, 'check', 2),
    overflowInfo: makeOverflowInfo(shape),
  } satisfies CheckCalculationRangePlan
  return applyPlanLimits(plan, policy)
}

function planAttack(
  params: AttackRangePlannerInput,
  policy: RangePolicy,
): AttackCalculationRangePlan {
  const display = normalizeDisplay(params.display)
  const scoreTail = policy.errorBudget.scoreTail / 2
  const scores = [
    planScoreResolution(
      toScoreResolution(params.score.action),
      display,
      scoreTail,
    ),
    planScoreResolution(
      toScoreResolution(params.score.reaction),
      display,
      scoreTail,
    ),
  ] as const
  const damage = planDamage(
    { attack: params.attack, defence: params.defence },
    display,
    getScoreValueUpperBound(scores),
  )
  const comboCount = params.comboCount ?? 1
  positiveInteger(comboCount, 'comboCount')
  const shape = {
    operation: 'attack' as const,
    display,
    scores,
    damage,
    backtrack: null,
    estimates: planResources(scores, damage, comboCount),
  }
  const plan = {
    ...shape,
    ...createPlanMetadata(policy, 'attack', 2),
    overflowInfo: makeOverflowInfo(shape),
  } satisfies AttackCalculationRangePlan
  return applyPlanLimits(plan, policy)
}

function planBacktrackCalculation(
  params: BacktrackRangePlannerInput,
  policy: RangePolicy,
): BacktrackCalculationRangePlan {
  const display = normalizeDisplay(params.display)
  const backtrack = planBacktrack(params.backtrack, display)
  const shape = {
    operation: 'backtrack' as const,
    display,
    scores: [] as const,
    damage: null,
    backtrack,
    estimates: backtrackResources(backtrack),
  }
  const plan = {
    ...shape,
    ...createPlanMetadata(policy, 'backtrack', 0),
    overflowInfo: makeOverflowInfo(shape),
  } satisfies BacktrackCalculationRangePlan
  return applyPlanLimits(plan, policy)
}

/**
 * Plan the ranges and resources required by a calculation.
 *
 * This function only returns a plan. It does not allocate calculator arrays,
 * invoke a calculator, alter UI limits, or select a production data path.
 */
export function planCalculationRanges(
  params: ScoreRangePlannerInput,
  policy?: RangePolicyInput,
): ScoreCalculationRangePlan
export function planCalculationRanges(
  params: CheckRangePlannerInput,
  policy?: RangePolicyInput,
): CheckCalculationRangePlan
export function planCalculationRanges(
  params: AttackRangePlannerInput,
  policy?: RangePolicyInput,
): AttackCalculationRangePlan
export function planCalculationRanges(
  params: BacktrackRangePlannerInput,
  policy?: RangePolicyInput,
): BacktrackCalculationRangePlan
export function planCalculationRanges(
  params: RangePlannerParams,
  policy: RangePolicyInput = {},
): CalculationRangePlan {
  const effectivePolicy = mergePolicy(policy)
  object(params, 'params')

  switch (params.operation) {
    case 'score':
      return planScore(params, effectivePolicy)
    case 'check':
      return planCheck(params, effectivePolicy)
    case 'attack':
      return planAttack(params, effectivePolicy)
    case 'backtrack':
      return planBacktrackCalculation(params, effectivePolicy)
    default:
      throw new RangeError(
        'operation must be score, check, attack, or backtrack'
      )
  }
}
