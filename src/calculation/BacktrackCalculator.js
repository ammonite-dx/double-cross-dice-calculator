import { DISTRIBUTION_SIZE } from '../data/Distribution'
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
  getBacktrackSupportMax,
  LIVINGDEAD_DLOIS,
} from '../domain/BacktrackRules'

const PROBABILITY_TOLERANCE = 1e-8
const NEGATIVE_PROBABILITY_TOLERANCE = 1e-12

function isProbabilityArray(value) {
  return Array.isArray(value) || value instanceof Float64Array
}

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

function validatePlannedDistribution(distribution, expectedLength, label) {
  if (!isProbabilityArray(distribution) || distribution.length !== expectedLength) {
    throw new RangeError(
      `${label} must have ${expectedLength} entries for the backtrack range plan`
    )
  }

  const normalized = new Float64Array(expectedLength)
  let total = 0
  for (let index = 0; index < distribution.length; index += 1) {
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

  if (!Number.isFinite(total) || Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
    throw new RangeError(`${label} probability total is not approximately one`)
  }
  for (let index = 0; index < normalized.length; index += 1) {
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

/**
 * Generate the requested ordinary D10 sums in one forward DP.
 *
 * The returned arrays contain every finite support value explicitly. They do
 * not have an overflow bucket, so they are safe to use before the backtrack
 * thresholds are applied.
 */
export function calculateD10Distributions(diceCounts, size, runtimeOptions = {}) {
  const { requestedDice, maxDice } = validateGenerationInputs(
    diceCounts,
    size,
    'D10 distribution',
    false
  )
  const abortChecker = createAbortChecker(runtimeOptions)
  abortChecker.force()

  const result = new Map()
  let current = new Float64Array(size)
  current[0] = 1
  if (requestedDice.includes(0)) {
    result.set(0, current.slice())
  }

  for (let dice = 1; dice <= maxDice; dice += 1) {
    abortChecker.force()
    const next = new Float64Array(size)
    const currentMax = 10 * (dice - 1)
    for (let value = 0; value <= currentMax; value += 1) {
      abortChecker.tick()
      const probability = current[value]
      if (probability === 0) {
        continue
      }
      const faceProbability = probability / 10
      for (let face = 1; face <= 10; face += 1) {
        next[value + face] += faceProbability
      }
    }
    current = next
    if (requestedDice.includes(dice)) {
      result.set(
        dice,
        normalizeGeneratedDistribution(current, `D10[${dice}]`, abortChecker)
      )
    }
  }

  abortChecker.force()
  return result
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

function getBoundary(params, threshold) {
  return Math.max(0, params.encroachment - params.value - threshold)
}

function toPercentage(distribution, start, end) {
  const probability = distribution
    .slice(start, end)
    .reduce((sum, value) => sum + value, 0)

  return Math.round(probability * 1000) / 10
}

function getStandardSingleResult(
  distribution,
  params,
  distributionEnd = DISTRIBUTION_SIZE
) {
  const boundaries = [99, 70, 50, 30]
    .map((threshold) => getBoundary(params, threshold))
  const ranges = [
    [0, boundaries[0]],
    [boundaries[0], boundaries[1]],
    [boundaries[1], boundaries[2]],
    [boundaries[2], boundaries[3]],
    [boundaries[3], distributionEnd],
  ]

  return ranges.map(([start, end]) =>
    toPercentage(distribution, start, end)
  )
}

function getNightmareSingleResult(
  distribution,
  params,
  distributionEnd = DISTRIBUTION_SIZE
) {
  const boundaries = [119, 99, 70, 50, 30]
    .map((threshold) => getBoundary(params, threshold))
  const ranges = [
    [0, boundaries[0]],
    [boundaries[0], boundaries[1]],
    [boundaries[1], boundaries[2]],
    [boundaries[2], boundaries[3]],
    [boundaries[3], boundaries[4]],
    [boundaries[4], distributionEnd],
  ]

  return ranges.map(([start, end]) =>
    toPercentage(distribution, start, end)
  )
}

function getBinaryResult(
  distribution,
  params,
  threshold,
  distributionEnd = DISTRIBUTION_SIZE
) {
  const boundary = getBoundary(params, threshold)

  return [
    toPercentage(distribution, 0, boundary),
    toPercentage(distribution, boundary, distributionEnd),
  ]
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
  const expectedDistributionMode = expectedAssetOverflow
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

function getPlannedDistribution(
  provider,
  dice,
  size,
  label,
  generatedDistributions
) {
  if (generatedDistributions) {
    const generated = generatedDistributions.get(dice)
    if (!generated) {
      throw new RangeError(`${label} is unavailable for dice=${dice}`)
    }
    return generated
  }

  if (typeof provider !== 'function') {
    throw new TypeError(`${label} provider must provide a function`)
  }
  return validatePlannedDistribution(
    provider(dice, size),
    size,
    label
  )
}

export function calculateFinalEncroachment(
  params,
  dependencies,
  runtimeOptions = {},
  backtrackRangePlan
) {
  throwIfAborted(runtimeOptions)

  // Accepting a plan as the third argument keeps a small compatibility path
  // for direct callers while the public client always passes runtime options
  // and the plan as separate arguments.
  if (
    backtrackRangePlan === undefined &&
    runtimeOptions &&
    typeof runtimeOptions === 'object' &&
    Number.isSafeInteger(runtimeOptions.workingLength) &&
    Number.isSafeInteger(runtimeOptions.workingMax)
  ) {
    backtrackRangePlan = runtimeOptions
    runtimeOptions = {}
  }

  const normalizedParams = normalizeBacktrackParams(params)
  const planInfo = backtrackRangePlan
    ? validateBacktrackRangePlan(normalizedParams, backtrackRangePlan)
    : null
  const effectiveParams = planInfo?.normalizedParams ?? normalizedParams
  const rule = getBacktrackRule(effectiveParams.dlois)
  const { getD10Distribution, getLivingdeadDistribution } = dependencies ?? {}
  const getDistribution = rule.livingdead
    ? getLivingdeadDistribution
    : getD10Distribution
  const threshold = rule.nightmare ? 119 : 99

  if (!planInfo) {
    if (typeof getDistribution !== 'function') {
      throw new TypeError(
        `${rule.livingdead ? 'livingdead' : 'D10'} distribution provider must provide a function`
      )
    }
    const diceCounts = normalizeDiceCounts(
      getDiceCounts(effectiveParams),
      'backtrack'
    )
    const distributions = diceCounts.map((dice) => {
      throwIfAborted(runtimeOptions)
      return getDistribution(dice)
    })
    throwIfAborted(runtimeOptions)

    return {
      single: rule.nightmare
        ? getNightmareSingleResult(distributions[0], effectiveParams)
        : getStandardSingleResult(distributions[0], effectiveParams),
      double: getBinaryResult(distributions[1], effectiveParams, threshold),
      second: getBinaryResult(distributions[2], effectiveParams, threshold),
    }
  }

  const { diceCounts } = planInfo
  const size = backtrackRangePlan.workingLength
  const generatedDistributions = backtrackRangePlan.distributionMode === 'on-demand'
    ? rule.livingdead
      ? calculateLivingdeadDistributions(diceCounts, size, runtimeOptions)
      : calculateD10Distributions(diceCounts, size, runtimeOptions)
    : null
  const plannedGetDistribution = (dice) => {
    throwIfAborted(runtimeOptions)
    const distribution = getPlannedDistribution(
      getDistribution,
      dice,
      size,
      rule.livingdead ? 'livingdead distribution' : 'D10 distribution',
      generatedDistributions
    )
    throwIfAborted(runtimeOptions)
    return distribution
  }

  const singleDistribution = plannedGetDistribution(
    diceCounts[0]
  )
  const doubleDistribution = plannedGetDistribution(
    diceCounts[1]
  )
  const secondDistribution = plannedGetDistribution(
    diceCounts[2]
  )
  throwIfAborted(runtimeOptions)

  return {
    single: rule.nightmare
      ? getNightmareSingleResult(
          singleDistribution,
          normalizedParams,
          size
        )
      : getStandardSingleResult(singleDistribution, normalizedParams, size),
    double: getBinaryResult(
      doubleDistribution,
      normalizedParams,
      threshold,
      size
    ),
    second: getBinaryResult(
      secondDistribution,
      normalizedParams,
      threshold,
      size
    ),
  }
}
