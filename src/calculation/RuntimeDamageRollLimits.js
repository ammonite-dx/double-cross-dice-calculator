export const RUNTIME_DAMAGE_FFT_SIZE = 4096
export const RUNTIME_DAMAGE_DISTRIBUTION_SIZE = 2048
export const RUNTIME_DAMAGE_MAX_DAMAGE_DICE = 202
export const RUNTIME_DAMAGE_MAX_KAZANARI = 9

export const MAX_DAMAGE_DICE = RUNTIME_DAMAGE_MAX_DAMAGE_DICE
export const MAX_KAZANARI = RUNTIME_DAMAGE_MAX_KAZANARI

export function validateRuntimeDamageRollInputs(weights, kazanari) {
  if (
    !Array.isArray(weights) &&
    !(weights instanceof Float64Array)
  ) {
    throw new TypeError('weights must be an Array or Float64Array')
  }
  if (
    weights.length === 0 ||
    weights.length > MAX_DAMAGE_DICE + 1
  ) {
    throw new RangeError(
      `weights must contain 1 to ${MAX_DAMAGE_DICE + 1} entries`
    )
  }
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError('weights must contain finite non-negative values')
    }
  }
  if (
    !Number.isInteger(kazanari) ||
    kazanari < 0 ||
    kazanari > MAX_KAZANARI
  ) {
    throw new RangeError(
      `kazanari must be an integer between 0 and ${MAX_KAZANARI}`
    )
  }
}
