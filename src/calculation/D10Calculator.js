/**
 * Runtime probability primitive for sums of ordinary ten-sided dice.
 *
 * Unlike the historical d10 JSON asset this module exposes complete finite
 * support: n dice has support 0..10n.  The safety limits below protect the
 * browser from accidental unbounded allocation; they are not game-input
 * ceilings and callers should perform their own resource admission first.
 */

const NEGATIVE_PROBABILITY_TOLERANCE = 1e-12
export const D10_MAX_GENERATION_LENGTH = 1 << 20
export const D10_MAX_GENERATION_OPERATIONS = 100_000_000
export const D10_ABORT_CHECK_INTERVAL = 4_096

function createAbortError() {
  const error = new Error('D10 calculation was aborted')
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
      if (pendingChecks >= D10_ABORT_CHECK_INTERVAL) {
        pendingChecks = 0
        throwIfAborted(runtimeOptions)
      }
    },
  }
}

function normalizeDiceCounts(diceCounts) {
  if (
    !Array.isArray(diceCounts)
    && !(ArrayBuffer.isView(diceCounts) && typeof diceCounts.length === 'number')
  ) {
    throw new TypeError('D10 diceCounts must be an array')
  }
  if (diceCounts.length === 0) {
    throw new RangeError('D10 diceCounts must not be empty')
  }

  const normalized = Array.from(diceCounts)
  normalized.forEach((dice, index) => {
    if (!Number.isSafeInteger(dice) || dice < 0) {
      throw new TypeError(
        `D10 diceCounts[${index}] must be a non-negative safe integer`
      )
    }
  })
  return normalized
}

function normalizeSize(size, maxDice) {
  const maxGeneratedDice = Math.floor((D10_MAX_GENERATION_LENGTH - 1) / 10)
  if (maxDice > maxGeneratedDice) {
    throw new RangeError(
      `D10 dice exceeds the absolute safety limit of ${maxGeneratedDice} for a complete support`
    )
  }
  const requiredLength = maxDice > Number.MAX_SAFE_INTEGER / 10
    ? Number.MAX_SAFE_INTEGER
    : maxDice * 10 + 1
  const normalized = size === undefined ? requiredLength : size
  if (!Number.isSafeInteger(normalized)) {
    throw new TypeError('D10 size must be a safe integer')
  }
  if (normalized <= 0) {
    throw new RangeError('D10 size must be positive')
  }
  if (normalized < requiredLength) {
    throw new RangeError('D10 size does not contain the complete finite support')
  }
  if (normalized > D10_MAX_GENERATION_LENGTH) {
    throw new RangeError(
      `D10 size exceeds the absolute safety limit of ${D10_MAX_GENERATION_LENGTH}`
    )
  }
  return normalized
}

function normalizeGeneratedDistribution(distribution, label, abortChecker) {
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

function validateOperationEstimate(maxDice, size) {
  if (maxDice !== 0 && size > D10_MAX_GENERATION_OPERATIONS / maxDice) {
    throw new RangeError(
      `D10 generation exceeds the absolute safety limit of ${D10_MAX_GENERATION_OPERATIONS} operations`
    )
  }
}

/**
 * Generate several ordinary D10 sums in one forward dynamic-programming pass.
 * Every returned array contains complete finite support and no overflow bucket.
 */
export function calculateD10Distributions(
  diceCounts,
  size,
  runtimeOptions = {}
) {
  const requestedDice = normalizeDiceCounts(diceCounts)
  const maxDice = Math.max(...requestedDice)
  const normalizedSize = normalizeSize(size, maxDice)
  validateOperationEstimate(maxDice, normalizedSize)
  const abortChecker = createAbortChecker(runtimeOptions)
  abortChecker.force()

  const result = new Map()
  let current = new Float64Array(normalizedSize)
  current[0] = 1
  if (requestedDice.includes(0)) {
    result.set(0, current.slice())
  }

  for (let dice = 1; dice <= maxDice; dice += 1) {
    abortChecker.force()
    const next = new Float64Array(normalizedSize)
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

/** Generate one complete ordinary D10 sum distribution. */
export function calculateD10Distribution(dice, options = {}) {
  if (!Number.isSafeInteger(dice) || dice < 0) {
    throw new TypeError('D10 dice must be a non-negative safe integer')
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('D10 options must be an object')
  }
  const size = options.size ?? options.workingLength
  const runtimeOptions = options.signal === undefined
    ? options
    : { signal: options.signal }
  return calculateD10Distributions([dice], size, runtimeOptions).get(dice)
}

/** Create a small LRU provider suitable for a CalculationClient lifetime. */
export function createD10DistributionProvider({ cacheSize = 8 } = {}) {
  if (!Number.isSafeInteger(cacheSize) || cacheSize < 0) {
    throw new RangeError('D10 cacheSize must be a non-negative safe integer')
  }
  const cache = new Map()

  return (dice, size, runtimeOptions = {}) => {
    if (!Number.isSafeInteger(dice) || dice < 0) {
      throw new TypeError('D10 dice must be a non-negative safe integer')
    }
    const normalizedSize = size ?? (
      dice <= Math.floor((D10_MAX_GENERATION_LENGTH - 1) / 10)
        ? dice * 10 + 1
        : D10_MAX_GENERATION_LENGTH + 1
    )
    const key = `${dice}:${normalizedSize}`
    if (cache.has(key)) {
      const distribution = cache.get(key)
      cache.delete(key)
      cache.set(key, distribution)
      return distribution.slice()
    }
    const distribution = calculateD10Distribution(
      dice,
      { size: normalizedSize, ...runtimeOptions }
    )
    if (cacheSize > 0) {
      cache.set(key, distribution)
      while (cache.size > cacheSize) {
        cache.delete(cache.keys().next().value)
      }
    }
    return distribution.slice()
  }
}
