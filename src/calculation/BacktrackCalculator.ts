import {
  getBacktrackRule,
  getBacktrackSupportMin,
  getBacktrackSupportMax,
} from '../domain/BacktrackRules'
import { normalizeBacktrackParams } from '../domain/CalculationInputNormalization'
import { createDistributionResult } from './DistributionResult'
import {
  calculateD10Distributions,
  calculateLivingdeadDistributions,
  generateBacktrackDistributions,
  throwIfAborted,
} from './BacktrackDistributionGenerator'
import { validateBacktrackRangePlan } from './BacktrackPlanValidation'
import type { BacktrackParams } from '../domain/BacktrackRules'
import type { BacktrackRangePlan } from './planning/RangePlannerTypes'

interface BacktrackRuntimeOptions {
  readonly signal?: AbortSignal
}

type BacktrackLabel = 'single' | 'double' | 'second'

interface PlannedBacktrackDistributions {
  readonly normalizedParams: BacktrackParams
  readonly diceCounts: readonly number[]
  readonly distributions: readonly Float64Array[]
}

export {
  calculateD10Distributions,
  calculateLivingdeadDistributions,
}

function subtractSafeInteger(left: number, right: number, label: string): number {
  const result = left - right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must be a safe integer`)
  }
  return result
}

function getPlannedBacktrackDistributions(
  params: BacktrackParams,
  runtimeOptions: BacktrackRuntimeOptions,
  backtrackRangePlan: BacktrackRangePlan | undefined,
): PlannedBacktrackDistributions {
  if (!backtrackRangePlan) {
    throw new TypeError(
      'backtrack calculation requires a range plan'
    )
  }
  const normalizedParams = normalizeBacktrackParams(params)
  const planInfo = validateBacktrackRangePlan(
    normalizedParams,
    backtrackRangePlan
  )
  const effectiveParams = planInfo.normalizedParams
  const rule = getBacktrackRule(effectiveParams.dlois)
  const { diceCounts } = planInfo
  const size = backtrackRangePlan.workingLength
  const generatedDistributions = generateBacktrackDistributions(
    diceCounts,
    size,
    rule.livingdead === true,
    runtimeOptions
  )
  const label = rule.livingdead ? 'livingdead distribution' : 'D10 distribution'
  const distributions = diceCounts.map((dice) => {
    throwIfAborted(runtimeOptions)
    const distribution = generatedDistributions.get(dice)
    if (!distribution) {
      throw new RangeError(`${label} is unavailable for dice=${dice}`)
    }
    throwIfAborted(runtimeOptions)
    return distribution
  })

  return {
    normalizedParams: effectiveParams,
    diceCounts,
    distributions,
  }
}

function createFinalEncroachmentDistributionResult(
  distribution: Float64Array,
  params: BacktrackParams,
  dice: number,
  label: string,
) {
  const rawSupportMax = getBacktrackSupportMax(params.dlois, dice)
  const rawSupportMin = getBacktrackSupportMin(params.dlois, dice)
  if (distribution.length <= rawSupportMax) {
    throw new RangeError(
      `${label} does not contain the complete finite support`
    )
  }

  const base = subtractSafeInteger(
    params.encroachment,
    params.value,
    'backtrack final encroachment base'
  )
  const offset = subtractSafeInteger(
    base,
    rawSupportMax,
    'backtrack final encroachment offset'
  )
  const supportMax = subtractSafeInteger(
    base,
    rawSupportMin,
    'backtrack final encroachment support.max'
  )
  const values = new Float64Array(rawSupportMax - rawSupportMin + 1)

  // The providers model the decrease S. The result random variable is
  // the actual final encroachment F = base - S, so reverse the dense PMF
  // while preserving every probability without category aggregation.
  for (
    let decrease = rawSupportMin;
    decrease <= rawSupportMax;
    decrease += 1
  ) {
    values[rawSupportMax - decrease] = distribution[decrease]
  }

  return createDistributionResult({
    values,
    offset,
    support: { kind: 'finite', max: supportMax },
    overflow: null,
  })
}

/**
 * Calculate complete final-encroachment distributions.
 *
 * Each returned DistributionResult is keyed by the actual final encroachment
 * value, not by the intermediate decrease amount used for category
 * aggregation. The production plan generates the complete finite support on
 * demand.
 */
export function calculateFinalEncroachment(
  params: BacktrackParams,
  runtimeOptions: BacktrackRuntimeOptions = {},
  backtrackRangePlan?: BacktrackRangePlan,
) {
  throwIfAborted(runtimeOptions)

  const {
    normalizedParams,
    diceCounts,
    distributions,
  } = getPlannedBacktrackDistributions(
    params,
    runtimeOptions,
    backtrackRangePlan
  )

  const labels: readonly BacktrackLabel[] = ['single', 'double', 'second']
  const result = {} as Record<BacktrackLabel, ReturnType<typeof createFinalEncroachmentDistributionResult>>
  for (let index = 0; index < labels.length; index += 1) {
    throwIfAborted(runtimeOptions)
    const label = labels[index]
    result[label] = createFinalEncroachmentDistributionResult(
      distributions[index],
      normalizedParams,
      diceCounts[index],
      `${label} backtrack distribution`
    )
  }
  throwIfAborted(runtimeOptions)
  return Object.freeze(result)
}
