import {
  BACKTRACK_MAX_GENERATED_DICE,
  BACKTRACK_MAX_GENERATION_LENGTH,
  BACKTRACK_MAX_GENERATION_OPERATIONS,
  getBacktrackGenerationOperationEstimate,
} from './BacktrackLimits'
import { getBacktrackSupportMax, LIVINGDEAD_DLOIS } from '../domain/BacktrackRules'
import { calculateD10Distributions as calculateSharedD10Distributions } from './D10Calculator'
import { calculateLivingdeadDistributions } from './BacktrackLivingdeadDistribution'

function throwIfAborted(runtimeOptions) {
  if (runtimeOptions?.signal?.aborted) {
    const error = new Error('Backtrack calculation was aborted')
    error.name = 'AbortError'
    throw error
  }
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

export { calculateLivingdeadDistributions }

export function generateBacktrackDistributions(
  diceCounts,
  size,
  livingdead,
  runtimeOptions = {}
) {
  return livingdead
    ? calculateLivingdeadDistributions(diceCounts, size, runtimeOptions)
    : calculateD10Distributions(diceCounts, size, runtimeOptions)
}

export { throwIfAborted }
