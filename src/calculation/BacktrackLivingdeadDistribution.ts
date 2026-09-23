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
const D10_FACE_COUNT = 10
const MAXIMUM_FACE = 10

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
    abortChecker.tick()
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
    abortChecker.tick()
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
): { requestedDice: number[]; maxDice: number; rawSumLength: number } {
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
  const rawSumLength = D10_FACE_COUNT * maxDice + 1
  if (!Number.isSafeInteger(rawSumLength)) {
    throw new RangeError('livingdead raw sum length must be a safe integer')
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
  return { requestedDice, maxDice, rawSumLength }
}

function updateBoundedSums(
  boundedSums: Float64Array[],
  dice: number,
  abortChecker: AbortChecker,
): void {
  for (let maximum = 1; maximum <= MAXIMUM_FACE; maximum += 1) {
    const state = boundedSums[maximum - 1]
    const previousMax = (dice - 1) * maximum
    const newMin = dice
    const newMax = dice * maximum
    let window = state[previousMax]

    for (let sum = newMax; sum >= newMin; sum -= 1) {
      abortChecker.tick()
      state[sum] = window / D10_FACE_COUNT

      if (sum > newMin) {
        // Descending order keeps these entries at their previous-dice values.
        window -= state[sum - 1]
        const entering = sum - maximum - 1
        if (entering >= 0) {
          window += state[entering]
        }
      }
    }

    // This is the only lower endpoint that became invalid in this update.
    state[dice - 1] = 0
  }
}

function projectLivingdeadDistribution(
  boundedSums: Float64Array[],
  dice: number,
  size: number,
  abortChecker: AbortChecker,
): Float64Array {
  const distribution = new Float64Array(size)
  for (let maximum = 1; maximum <= MAXIMUM_FACE; maximum += 1) {
    const upper = boundedSums[maximum - 1]
    const lower = maximum === 1 ? null : boundedSums[maximum - 2]
    const sumMax = dice * maximum

    for (let sum = dice; sum <= sumMax; sum += 1) {
      abortChecker.tick()
      const probability = upper[sum] - (lower?.[sum] ?? 0)
      const value = sum - maximum + 1
      distribution[value] += probability
    }
  }
  return distribution
}

/** Generate the complete finite 《屍人》 PMF with bounded-sum distributions. */
export function calculateLivingdeadDistributions(
  diceCounts: DiceCounts,
  size: number,
  runtimeOptions: BacktrackRuntimeOptions = {},
): Map<number, Float64Array> {
  const { requestedDice, maxDice, rawSumLength } = validateLivingdeadInputs(
    diceCounts,
    size,
  )
  const abortChecker = createAbortChecker(runtimeOptions)
  abortChecker.force()

  const result = new Map<number, Float64Array>()
  if (requestedDice.includes(0)) {
    const zero = new Float64Array(size)
    zero[0] = 1
    result.set(0, zero)
  }
  if (maxDice === 0) {
    abortChecker.force()
    return result
  }

  const boundedSums = Array.from(
    { length: MAXIMUM_FACE },
    () => new Float64Array(rawSumLength),
  )
  for (const state of boundedSums) {
    state[0] = 1
  }
  const requestedDiceSet = new Set(requestedDice)

  for (let dice = 1; dice <= maxDice; dice += 1) {
    abortChecker.force()
    updateBoundedSums(boundedSums, dice, abortChecker)
    if (requestedDiceSet.has(dice)) {
      const distribution = projectLivingdeadDistribution(
        boundedSums,
        dice,
        size,
        abortChecker,
      )
      result.set(
        dice,
        normalizeGeneratedDistribution(
          distribution,
          `livingdead[${dice}]`,
          abortChecker,
        ),
      )
    }
  }
  abortChecker.force()
  return result
}
