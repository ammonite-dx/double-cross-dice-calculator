import { planBacktrack } from './planning/BacktrackRangePlanner'
import { planDamage } from './planning/DamageRangePlanner'
import {
  getScoreValueUpperBound,
  planScore,
} from './planning/ScoreRangePlanner'
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
  nextPowerOfTwo,
  object,
  positiveInteger,
} from './planning/PlanningMath'

export { DEFAULT_POLICY }
// Kept as a compatibility export for existing internal consumers; new code
// should import shared arithmetic from PlanningMath directly.
export { nextPowerOfTwo }

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
function makeOverflowInfo(plan) {
  const score = plan.scores.length > 0
    ? {
        type: 'dx-tail',
        finiteSupport: false,
        lowerBound: plan.scores.length === 1
          ? plan.scores[0].workingMax + 1
          : null,
        bound: plan.scores.reduce(
          (sum, item) => sum + item.tail.bound,
          0
        ),
        meaning: 'DX values above each modeled range are represented by tail certificates; for multiple scores, bound is the sum and lowerBound is null because each score has its own boundary',
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
        type: plan.backtrack.assetOverflow &&
            plan.backtrack.distributionMode !== 'on-demand'
          ? 'asset'
          : 'finite-support',
        finiteSupport: true,
        lowerBound: plan.backtrack.assetOverflow &&
            plan.backtrack.distributionMode !== 'on-demand'
          ? plan.backtrack.assetOverflowLowerBound
          : null,
        bound: null,
        meaning: plan.backtrack.distributionMode === 'on-demand'
          ? 'backtrack values have finite support and this plan generates the complete support on demand; assetOverflow only describes static asset coverage'
          : 'backtrack values have finite support within the selected asset',
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
export function planCalculationRanges(params, policy = {}) {
  const effectivePolicy = mergePolicy(policy)
  object(params, 'params')

  const operation = params.operation ?? 'attack'
  if (!['score', 'check', 'attack', 'backtrack'].includes(operation)) {
    throw new RangeError(
      'operation must be score, check, attack, or backtrack'
    )
  }
  const display = normalizeDisplay(params.display, effectivePolicy)
  const comboCount = params.comboCount ?? 1
  positiveInteger(comboCount, 'comboCount')

  let scores = []
  let damage = null
  let backtrack = null
  let tailBudget = 0

  if (operation === 'backtrack') {
    backtrack = planBacktrack(
      params.backtrack ?? params,
      display,
      params.completeSupportBacktrack === true
    )
  } else {
    const scoreParams = operation === 'score'
      ? [params.score ?? params]
      : [
          params.score?.action ?? params.action,
          params.score?.reaction ?? params.reaction,
        ]

    if (scoreParams.some((value) => !value)) {
      throw new TypeError('score parameters are required')
    }
    tailBudget = effectivePolicy.errorBudget.scoreTail / scoreParams.length
    scores = scoreParams.map((score) =>
      planScore(score, display, effectivePolicy, tailBudget)
    )

    if (operation === 'attack') {
      damage = planDamage(
        params,
        display,
        effectivePolicy,
        getScoreValueUpperBound(scores, effectivePolicy)
      )
    }
  }

  const estimates = backtrack
    ? backtrackResources(backtrack, effectivePolicy)
    : damage
      ? planResources(scores, damage, comboCount, effectivePolicy)
      : scoreOnlyResources(scores, effectivePolicy)

  const result = {
    accepted: true,
    operation,
    propagation: {
      score: effectivePolicy.scorePropagation,
      calculationMax: effectivePolicy.calculationMax,
    },
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
      backtrack: 'backtrack values have finite support; on-demand plans generate the complete support, while static asset coverage is reported separately',
    },
    overflowInfo: null,
    warnings: [],
  }
  result.overflowInfo = makeOverflowInfo(result)

  const limitResult = applyLimits(result, effectivePolicy)
  result.accepted = limitResult.accepted
  result.warnings = limitResult.warnings
  if (!result.accepted) {
    result.rejectionReasons = Array.from(
      new Set(
        result.warnings
          .filter((warning) => warning.severity === 'reject')
          .map((warning) => warning.code)
      )
    )
  }
  return result
}
