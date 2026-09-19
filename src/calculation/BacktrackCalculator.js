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

export {
  calculateD10Distributions,
  calculateLivingdeadDistributions,
}

function normalizeBacktrackCalculationArguments(
  runtimeOptions,
  backtrackRangePlan
) {
  // Accepting a plan as the third argument keeps a small compatibility path
  // for direct callers while the public client passes runtime options and
  // the plan as separate arguments.
  if (
    backtrackRangePlan === undefined
    && runtimeOptions
    && typeof runtimeOptions === 'object'
    && Number.isSafeInteger(runtimeOptions.workingLength)
    && Number.isSafeInteger(runtimeOptions.workingMax)
  ) {
    return {
      runtimeOptions: {},
      backtrackRangePlan: runtimeOptions,
    }
  }
  return { runtimeOptions, backtrackRangePlan }
}

function subtractSafeInteger(left, right, label) {
  const result = left - right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} must be a safe integer`)
  }
  return result
}

function getPlannedBacktrackDistributions(
  params,
  runtimeOptions,
  backtrackRangePlan
) {
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
    rule.livingdead,
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
  distribution,
  params,
  dice,
  label
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
 * value, not by the intermediate decrease amount used by the legacy
 * category calculator. The production plan always generates the complete
 * finite support on demand.
 */
export function calculateFinalEncroachment(
  params,
  dependencies,
  runtimeOptions = {},
  backtrackRangePlan
) {
  // Keep the positional dependency argument for the data-layer adapter. The
  // production calculation intentionally does not inspect asset providers.
  void dependencies
  const normalizedArguments = normalizeBacktrackCalculationArguments(
    runtimeOptions,
    backtrackRangePlan
  )
  runtimeOptions = normalizedArguments.runtimeOptions
  backtrackRangePlan = normalizedArguments.backtrackRangePlan
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

  const labels = ['single', 'double', 'second']
  const result = {}
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
