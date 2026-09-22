import { planBacktrack } from './planning/BacktrackRangePlanner'
import { planDamage } from './planning/DamageRangePlanner'
import {
  getScoreValueUpperBound,
} from './planning/ScoreRangePlanner'
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
import {
  object,
  positiveInteger,
} from './planning/PlanningMath'
import type { ScoreInput } from '../domain/InputDomain'
import type { ScoreResolution } from '../domain/ScoreResolution'
import type { DamageInput, DefenceDamageInput } from '../domain/CalculationInputs'
import type {
  CalculationRangePlan,
  DamageRangePlan,
  RangeOverflowInfoSet,
  RangePlannerParams,
  RangePlanWarning,
  RangePolicyInput,
  RolledScoreRangePlan,
  ScoreRangePlan,
} from './planning/RangePlannerTypes'

export { DEFAULT_POLICY }

/**
 * The façade coordinates operation-specific planners and combines their
 * resource estimates. It does not contain DX, damage, or backtrack formulas.
 *
 * The detailed result typedefs remain documented in the operation planner
 * modules and in docs/architecture.md; this function intentionally preserves
 * the existing RangePlan shape for callers.
 */

/**
 * @param {Object} plan
 * @returns {Object}
 */
function makeOverflowInfo(plan: CalculationRangePlan): RangeOverflowInfoSet {
  const tailScores = plan.scores.filter(
    (item): item is RolledScoreRangePlan =>
      item.kind === 'rolled-score' && !item.finiteSupport
  )
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
          lowerBound: tailScores.length === 1
            ? (tailScores[0] as RolledScoreRangePlan).workingMax + 1
            : null,
          bound: tailScores.reduce(
            (sum, item) => sum + item.tail.bound,
            0
          ),
          meaning: tailScores.length === 1
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

/**
 * Plan the ranges and resources required by a calculation.
 *
 * This function only returns a plan. It does not allocate calculator arrays,
 * invoke a calculator, alter UI limits, or select a production data path.
 */
/**
 * @param {RangePlannerParams} params
 * @param {RangePolicyInput} [policy]
 * @returns {CalculationRangePlan}
 */
export function planCalculationRanges(
  params: RangePlannerParams,
  policy: RangePolicyInput = {},
): CalculationRangePlan {
  const effectivePolicy = mergePolicy(policy)
  object(params, 'params')

  const operation = params.operation ?? 'attack'
  if (!['score', 'check', 'attack', 'backtrack'].includes(operation)) {
    throw new RangeError(
      'operation must be score, check, attack, or backtrack'
    )
  }
  const display = normalizeDisplay(params.display)
  const comboCount = params.comboCount ?? 1
  positiveInteger(comboCount, 'comboCount')

  let scores: ScoreRangePlan[] = []
  let damage: DamageRangePlan | null = null
  let backtrack: ReturnType<typeof planBacktrack> | null = null
  let tailBudget = 0

  if (operation === 'backtrack') {
    backtrack = planBacktrack(params.backtrack ?? params, display)
  } else {
    const scorePair = params.score && typeof params.score === 'object'
      && 'action' in params.score
      ? params.score
      : undefined
    const scoreParams = operation === 'score'
      ? [params.score ?? params]
      : [
          scorePair?.action ?? params.action,
          scorePair?.reaction ?? params.reaction,
        ]

    if (scoreParams.some((value) => !value)) {
      throw new TypeError('score parameters are required')
    }
    tailBudget = effectivePolicy.errorBudget.scoreTail / scoreParams.length
    scores = scoreParams.map((score) => {
      const candidate = score as ScoreResolution | ScoreInput
      const resolution: ScoreResolution = 'kind' in candidate
        ? candidate
        : { kind: 'rolled-score', params: candidate }
      return planScoreResolution(resolution, display, tailBudget)
    })

    if (operation === 'attack') {
      if (!params.attack || !params.defence) {
        throw new TypeError('attack and defence damage parameters are required')
      }
      damage = planDamage(
        { attack: params.attack, defence: params.defence },
        display,
        getScoreValueUpperBound(scores)
      )
    }
  }

  const estimates = backtrack
    ? backtrackResources(backtrack)
    : damage
      ? planResources(scores, damage, comboCount)
      : scoreOnlyResources(scores)

  const result = {
    accepted: true,
    operation,
    display,
    scores,
    damage,
    backtrack,
    estimates,
    errorBudget: {
      total: effectivePolicy.errorBudget.total,
      scoreTail: operation === 'backtrack'
        ? 0
        : effectivePolicy.errorBudget.scoreTail,
      scorePerSide: tailBudget,
      finiteDamageTail: 0,
    },
    // Keep the reference planner's human-readable meanings for callers that
    // only need to display a short explanation. Structured details live in
    // overflowInfo so the kind and finite/infinite distinction are explicit.
    overflow: {
      score: 'values above the modeled cutoff are omitted only within tail error budget',
      damage: 'finite modeled values above display.max are an explicit display overflow bucket',
      totalDamage: 'once a value is aggregated above display.max, later operations must not subtract from it',
      backtrack: 'backtrack values have finite support; this plan generates the complete support on demand',
    },
    overflowInfo: null as RangeOverflowInfoSet | null,
    warnings: [] as RangePlanWarning[],
    rejectionReasons: undefined as readonly string[] | undefined,
  }
  const typedResult = result as unknown as CalculationRangePlan
  result.overflowInfo = makeOverflowInfo(typedResult)

  const limitResult = applyLimits(typedResult, effectivePolicy)
  result.accepted = limitResult.accepted
  result.warnings = [...limitResult.warnings]
  if (!result.accepted) {
    result.rejectionReasons = Array.from(
      new Set(
        result.warnings
          .filter((warning) => warning.severity === 'reject')
          .map((warning) => warning.code)
      )
    )
  }
  return result as unknown as CalculationRangePlan
}
