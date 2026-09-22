import {
  BACKTRACK_ABORT_CHECK_INTERVAL,
  BACKTRACK_MAX_GENERATED_DICE,
  BACKTRACK_MAX_GENERATION_LENGTH,
  BACKTRACK_MAX_GENERATION_OPERATIONS,
  getBacktrackGenerationOperationEstimate,
} from './BacktrackLimits'
import {
  getBacktrackSupportMax,
  LIVINGDEAD_DLOIS,
} from '../domain/BacktrackRules'

const NEGATIVE_PROBABILITY_TOLERANCE = 1e-12

interface BacktrackRuntimeOptions {
  readonly signal?: AbortSignal
}

type DiceCounts = readonly number[] | ArrayLike<number>

interface AbortChecker {
  force: () => void
  tick: () => void
}

function throwIfAborted(runtimeOptions: BacktrackRuntimeOptions): void {
  if (runtimeOptions?.signal?.aborted) {
    const error = new Error('Backtrack calculation was aborted')
    error.name = 'AbortError'
    throw error
  }
}

function createAbortChecker(runtimeOptions: BacktrackRuntimeOptions): AbortChecker {
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
  distribution: Float64Array,
  label: string,
  abortChecker: AbortChecker,
): Float64Array {
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

function normalizeDiceCounts(diceCounts: DiceCounts, label: string): number[] {
  if (
    !Array.isArray(diceCounts) &&
    !(ArrayBuffer.isView(diceCounts) && typeof diceCounts.length === 'number')
  ) {
    throw new TypeError(`${label} diceCounts must be an array`)
  }
  if (diceCounts.length === 0) {
    throw new RangeError(`${label} diceCounts must not be empty`)
  }
  const normalized = Array.from(diceCounts as ArrayLike<number>)
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

function validateLivingdeadInputs(
  diceCounts: DiceCounts,
  size: number,
): { requestedDice: number[]; maxDice: number } {
  const requestedDice = normalizeDiceCounts(diceCounts, 'livingdead distribution')
  if (!Number.isSafeInteger(size)) {
    throw new TypeError('livingdead distribution size must be a safe integer')
  }
  if (size <= 0) {
    throw new RangeError('livingdead distribution size must be positive')
  }
  if (size > BACKTRACK_MAX_GENERATION_LENGTH) {
    throw new RangeError(
      `livingdead distribution size exceeds the absolute safety limit of ${BACKTRACK_MAX_GENERATION_LENGTH}`
    )
  }
  const maxDice = Math.max(...requestedDice)
  const supportMax = getBacktrackSupportMax(LIVINGDEAD_DLOIS, maxDice)
  if (supportMax + 1 > size) {
    throw new RangeError(
      'livingdead distribution size does not contain the complete finite support'
    )
  }
  const operationEstimate = getBacktrackGenerationOperationEstimate(
    maxDice,
    size,
    true
  )
  if (
    !Number.isSafeInteger(operationEstimate)
    || operationEstimate > BACKTRACK_MAX_GENERATION_OPERATIONS
  ) {
    throw new RangeError(
      `livingdead distribution exceeds the absolute generation safety limit of ${BACKTRACK_MAX_GENERATION_OPERATIONS} operations`
    )
  }
  return { requestedDice, maxDice }
}

/** Generate the complete finite 《屍人》 PMF using max/sum-minus-max DP. */
export function calculateLivingdeadDistributions(
  diceCounts: DiceCounts,
  size: number,
  runtimeOptions: BacktrackRuntimeOptions = {},
): Map<number, Float64Array> {
  const { requestedDice, maxDice } = validateLivingdeadInputs(diceCounts, size)
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

  // states[max][value] stores P(current max=max, sum-max+1=value).
  let states = Array.from({ length: 11 }, () => new Float64Array(size))
  for (let face = 1; face <= 10; face += 1) {
    states[face][1] = 0.1
  }
  if (requestedDice.includes(1)) {
    result.set(1, sumLivingdeadStates(states, size, 'livingdead[1]', abortChecker))
  }

  for (let dice = 2; dice <= maxDice; dice += 1) {
    abortChecker.force()
    const nextStates = Array.from({ length: 11 }, () => new Float64Array(size))
    const previousValueMax = getBacktrackSupportMax(LIVINGDEAD_DLOIS, dice - 1)
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
        sumLivingdeadStates(states, size, `livingdead[${dice}]`, abortChecker)
      )
    }
  }
  abortChecker.force()
  return result
}

function sumLivingdeadStates(
  states: Float64Array[],
  size: number,
  label: string,
  abortChecker: AbortChecker,
): Float64Array {
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
