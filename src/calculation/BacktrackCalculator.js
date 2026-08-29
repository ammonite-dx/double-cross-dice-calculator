import {
  BACKTRACK_ABORT_CHECK_INTERVAL,
  BACKTRACK_ASSET_SUPPORT_MAX,
  BACKTRACK_MAX_GENERATED_DICE,
  BACKTRACK_MAX_GENERATION_LENGTH,
  BACKTRACK_MAX_GENERATION_OPERATIONS,
  getBacktrackGenerationOperationEstimate,
} from './BacktrackLimits'
import {
  getBacktrackDiceCounts,
  getBacktrackRule,
  getBacktrackSupportMin,
  getBacktrackSupportMax,
  LIVINGDEAD_DLOIS,
} from '../domain/BacktrackRules'
import { createDistributionResult } from './DistributionResult'
import { calculateD10Distributions as calculateSharedD10Distributions } from './D10Calculator'

const NEGATIVE_PROBABILITY_TOLERANCE = 1e-12

function createAbortError() {
  const error = new Error('Backtrack calculation was aborted')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(runtimeOptions) {
  if (runtimeOptions?.signal?.aborted) {
    throw createAbortError()
  }
}

function createAbortChecker(runtimeOptions) {
  let pendingChecks = 0
  return {
    force() {
      pendingChecks = 0
      throwIfAborted(runtimeOptions)
    },
    tick() {
      pendingChecks += 1
      if (pendingChecks >= BACKTRACK_ABORT_CHECK_INTERVAL) {
        pendingChecks = 0
        throwIfAborted(runtimeOptions)
      }
    },
  }
}

function normalizeGeneratedDistribution(
  distribution,
  label,
  abortChecker
) {
  const normalized = new Float64Array(distribution.length)
  let total = 0

  for (let index = 0; index < distribution.length; index += 1) {
    abortChecker?.tick()
    const probability = distribution[index]
    if (!Number.isFinite(probability)) {
      throw new RangeError(`${label} contains a non-finite probability`)
    }
    if (probability < -NEGATIVE_PROBABILITY_TOLERANCE) {
      throw new RangeError(`${label} contains a negative probability`)
    }
    const nonNegative = probability < 0 ? 0 : probability
    normalized[index] = nonNegative
    total += nonNegative
  }

  if (!Number.isFinite(total) || total <= 0) {
    throw new RangeError(`${label} probability total is invalid`)
  }

  for (let index = 0; index < normalized.length; index += 1) {
    abortChecker?.tick()
    normalized[index] /= total
  }
  return normalized
}

function getDiceCounts(params) {
  return getBacktrackDiceCounts(params)
}

function normalizeDiceCounts(diceCounts, label) {
  if (
    !Array.isArray(diceCounts) &&
    !(ArrayBuffer.isView(diceCounts) && typeof diceCounts.length === 'number')
  ) {
    throw new TypeError(`${label} diceCounts must be an array`)
  }
  if (diceCounts.length === 0) {
    throw new RangeError(`${label} diceCounts must not be empty`)
  }

  const normalized = Array.from(diceCounts)
  normalized.forEach((dice, index) => {
    if (!Number.isSafeInteger(dice) || dice < 0) {
      throw new TypeError(
        `${label} diceCounts[${index}] must be a non-negative safe integer`
      )
    }
    if (dice > BACKTRACK_MAX_GENERATED_DICE) {
      throw new RangeError(
        `${label} diceCounts[${index}] exceeds the absolute safety limit of ${BACKTRACK_MAX_GENERATED_DICE}`
      )
    }
  })
  return normalized
}

function validateGenerationInputs(diceCounts, size, label, livingdead) {
  const requestedDice = normalizeDiceCounts(diceCounts, label)
  if (!Number.isSafeInteger(size)) {
    throw new TypeError(`${label} size must be a safe integer`)
  }
  if (size <= 0) {
    throw new RangeError(`${label} size must be positive`)
  }
  if (size > BACKTRACK_MAX_GENERATION_LENGTH) {
    throw new RangeError(
      `${label} size exceeds the absolute safety limit of ${BACKTRACK_MAX_GENERATION_LENGTH}`
    )
  }

  const maxDice = Math.max(...requestedDice)
  const supportMax = livingdead
    ? getBacktrackSupportMax(LIVINGDEAD_DLOIS, maxDice)
    : getBacktrackSupportMax('なし', maxDice)
  if (supportMax + 1 > size) {
    throw new RangeError(
      `${label} size does not contain the complete finite support`
    )
  }

  const operationEstimate = getBacktrackGenerationOperationEstimate(
    maxDice,
    size,
    livingdead
  )
  if (
    !Number.isSafeInteger(operationEstimate) ||
    operationEstimate > BACKTRACK_MAX_GENERATION_OPERATIONS
  ) {
    throw new RangeError(
      `${label} exceeds the absolute generation safety limit of ${BACKTRACK_MAX_GENERATION_OPERATIONS} operations`
    )
  }

  return { requestedDice, maxDice, supportMax }
}

// Keep the Backtrack API's stricter generation policy while delegating the
// ordinary D10 arithmetic to the shared runtime primitive.
export function calculateD10Distributions(diceCounts, size, runtimeOptions = {}) {
  validateGenerationInputs(diceCounts, size, 'D10 distribution', false)
  return calculateSharedD10Distributions(diceCounts, size, runtimeOptions)
}

/**
 * Generate the 《屍人》 distribution. For n >= 1 the rule's result is
 * `sum(d10) - max(d10) + 1`, which is not an ordinary D10 sum.
 */
export function calculateLivingdeadDistributions(
  diceCounts,
  size,
  runtimeOptions = {}
) {
  const { requestedDice, maxDice } = validateGenerationInputs(
    diceCounts,
    size,
    'livingdead distribution',
    true
  )
  const abortChecker = createAbortChecker(runtimeOptions)
  abortChecker.force()

  const result = new Map()
  if (requestedDice.includes(0)) {
    const zero = new Float64Array(size)
    zero[0] = 1
    result.set(0, zero)
  }

  if (maxDice === 0) {
    abortChecker.force()
    return result
  }

  // states[max][value] stores P(current maximum=max,
  // sum(current dice)-max+1=value).
  let states = Array.from(
    { length: 11 },
    () => new Float64Array(size)
  )
  for (let face = 1; face <= 10; face += 1) {
    states[face][1] = 0.1
  }
  if (requestedDice.includes(1)) {
    result.set(
      1,
      sumLivingdeadStates(states, size, 'livingdead[1]', abortChecker)
    )
  }

  for (let dice = 2; dice <= maxDice; dice += 1) {
    abortChecker.force()
    const nextStates = Array.from(
      { length: 11 },
      () => new Float64Array(size)
    )
    const previousValueMax = getBacktrackSupportMax(
      LIVINGDEAD_DLOIS,
      dice - 1
    )

    for (let maximum = 1; maximum <= 10; maximum += 1) {
      const state = states[maximum]
      for (let value = 0; value <= previousValueMax; value += 1) {
        abortChecker.tick()
        const probability = state[value]
        if (probability === 0) {
          continue
        }
        const faceProbability = probability / 10
        for (let face = 1; face <= 10; face += 1) {
          if (face <= maximum) {
            nextStates[maximum][value + face] += faceProbability
          } else {
            nextStates[face][value + maximum] += faceProbability
          }
        }
      }
    }

    states = nextStates
    if (requestedDice.includes(dice)) {
      result.set(
        dice,
        sumLivingdeadStates(
          states,
          size,
          `livingdead[${dice}]`,
          abortChecker
        )
      )
    }
  }

  abortChecker.force()
  return result
}

function sumLivingdeadStates(states, size, label, abortChecker) {
  const distribution = new Float64Array(size)
  for (let maximum = 1; maximum <= 10; maximum += 1) {
    const state = states[maximum]
    for (let value = 0; value < size; value += 1) {
      abortChecker?.tick()
      distribution[value] += state[value]
    }
  }
  return normalizeGeneratedDistribution(distribution, label, abortChecker)
}

function normalizeBacktrackParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('backtrack parameters must be an object')
  }
  const normalized = {
    encroachment: params.encroachment ?? 0,
    lois: params.lois ?? 0,
    elois: params.elois ?? 0,
    dice: params.dice ?? 0,
    value: params.value ?? 0,
    dlois: params.dlois ?? 'なし',
  }
  if (!Number.isSafeInteger(normalized.encroachment)) {
    throw new TypeError('backtrack.encroachment must be a safe integer')
  }
  for (const field of ['lois', 'elois', 'dice', 'value']) {
    if (!Number.isSafeInteger(normalized[field])) {
      throw new TypeError(`backtrack.${field} must be a safe integer`)
    }
    if (normalized[field] < 0) {
      throw new RangeError(`backtrack.${field} must be non-negative`)
    }
  }
  if (typeof normalized.dlois !== 'string') {
    throw new TypeError('backtrack.dlois must be a string')
  }
  return normalized
}

function validateBacktrackRangePlan(params, plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new TypeError('backtrackRangePlan must be an object')
  }

  for (const field of [
    'maxDice',
    'rawSupportMax',
    'workingMax',
    'workingLength',
    'fftLength',
    'assetSupportMax',
  ]) {
    if (!Number.isSafeInteger(plan[field])) {
      throw new TypeError(
        `backtrackRangePlan.${field} must be a safe integer`
      )
    }
  }
  if (plan.maxDice < 0 || plan.rawSupportMax < 0) {
    throw new RangeError('backtrackRangePlan support must be non-negative')
  }
  if (plan.maxDice > BACKTRACK_MAX_GENERATED_DICE) {
    throw new RangeError(
      `backtrackRangePlan.maxDice exceeds the absolute safety limit of ${BACKTRACK_MAX_GENERATED_DICE}`
    )
  }
  if (plan.workingMax !== plan.rawSupportMax) {
    throw new RangeError(
      'backtrackRangePlan.workingMax must equal rawSupportMax'
    )
  }
  if (plan.workingLength !== plan.workingMax + 1) {
    throw new RangeError(
      'backtrackRangePlan.workingLength must equal workingMax + 1'
    )
  }
  if (plan.workingLength > BACKTRACK_MAX_GENERATION_LENGTH) {
    throw new RangeError(
      `backtrackRangePlan.workingLength exceeds the absolute safety limit of ${BACKTRACK_MAX_GENERATION_LENGTH}`
    )
  }
  if (plan.assetSupportMax !== BACKTRACK_ASSET_SUPPORT_MAX) {
    throw new RangeError(
      'backtrackRangePlan.assetSupportMax does not match the repository asset boundary'
    )
  }
  if (plan.fftLength !== 0) {
    throw new RangeError(
      'backtrackRangePlan.fftLength must be zero for backtrack distributions'
    )
  }
  if (plan.finiteSupport !== true) {
    throw new RangeError('backtrackRangePlan must describe finite support')
  }
  if (!['asset', 'on-demand'].includes(plan.distributionMode)) {
    throw new RangeError(
      'backtrackRangePlan.distributionMode must be asset or on-demand'
    )
  }
  if (typeof plan.assetOverflow !== 'boolean') {
    throw new TypeError('backtrackRangePlan.assetOverflow must be boolean')
  }
  if (plan.assetOverflowLowerBound !== undefined) {
    if (!Number.isSafeInteger(plan.assetOverflowLowerBound)) {
      throw new TypeError(
        'backtrackRangePlan.assetOverflowLowerBound must be a safe integer'
      )
    }
    if (plan.assetOverflowLowerBound !== BACKTRACK_ASSET_SUPPORT_MAX + 1) {
      throw new RangeError(
        'backtrackRangePlan.assetOverflowLowerBound does not match the asset boundary'
      )
    }
  }

  const normalizedParams = normalizeBacktrackParams(params)
  const expectedDiceCounts = getDiceCounts(normalizedParams)
  const expectedMaxDice = Math.max(...expectedDiceCounts)
  const expectedRawSupportMax = getBacktrackSupportMax(
    normalizedParams.dlois,
    expectedMaxDice
  )
  const expectedAssetOverflow =
    expectedRawSupportMax > BACKTRACK_ASSET_SUPPORT_MAX
  const canonicalPlan = plan.calculationMode === 'canonical'
  if (
    plan.calculationMode !== undefined
    && !canonicalPlan
  ) {
    throw new RangeError(
      'backtrackRangePlan.calculationMode must be canonical when present'
    )
  }
  const expectedDistributionMode = canonicalPlan || expectedAssetOverflow
    ? 'on-demand'
    : 'asset'
  if (plan.rawSupportMax !== expectedRawSupportMax) {
    throw new RangeError(
      'backtrackRangePlan.rawSupportMax does not match the rule support'
    )
  }
  if (plan.maxDice !== expectedMaxDice) {
    throw new RangeError(
      'backtrackRangePlan.maxDice does not match the request'
    )
  }
  if (plan.assetOverflow !== expectedAssetOverflow) {
    throw new RangeError(
      'backtrackRangePlan.assetOverflow does not match the asset boundary'
    )
  }
  if (plan.distributionMode !== expectedDistributionMode) {
    throw new RangeError(
      'backtrackRangePlan.distributionMode does not match the asset boundary'
    )
  }
  if (
    plan.support?.max !== undefined &&
    plan.support.max !== expectedRawSupportMax
  ) {
    throw new RangeError(
      'backtrackRangePlan.support.max does not match the rule support'
    )
  }
  if (plan.params && typeof plan.params === 'object') {
    for (const field of [
      'encroachment',
      'lois',
      'elois',
      'dice',
      'value',
      'dlois',
    ]) {
      if (plan.params[field] !== normalizedParams[field]) {
        throw new RangeError(
          `backtrackRangePlan.params.${field} does not match the request`
        )
      }
    }
  }
  if (plan.diceCounts) {
    const actual = [
      plan.diceCounts.single,
      plan.diceCounts.double,
      plan.diceCounts.second,
    ]
    if (actual.some((value, index) => value !== expectedDiceCounts[index])) {
      throw new RangeError(
        'backtrackRangePlan.diceCounts do not match the request'
      )
    }
  }
  return {
    normalizedParams,
    diceCounts: expectedDiceCounts,
  }
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
      'canonical backtrack calculation requires a complete range plan'
    )
  }
  if (backtrackRangePlan.calculationMode !== 'canonical') {
    throw new RangeError(
      'canonical backtrack calculation requires a canonical range plan'
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
  const generatedDistributions = rule.livingdead
    ? calculateLivingdeadDistributions(diceCounts, size, runtimeOptions)
    : calculateD10Distributions(diceCounts, size, runtimeOptions)
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

  // The providers model the decrease S. The canonical random variable is
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
 * Calculate complete canonical final-encroachment distributions.
 *
 * Each returned DistributionResult is keyed by the actual final encroachment
 * value, not by the intermediate decrease amount used by the legacy
 * category calculator. A canonical range plan always selects the on-demand
 * generator because the current sparse assets do not prove complete support.
 */
export function calculateFinalEncroachmentCanonical(
  params,
  dependencies,
  runtimeOptions = {},
  backtrackRangePlan
) {
  // Keep the positional dependency argument for the data-layer adapter. The
  // canonical path intentionally does not inspect asset providers.
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
