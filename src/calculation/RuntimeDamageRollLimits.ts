export const RUNTIME_DAMAGE_MIN_FFT_SIZE = 2
export const RUNTIME_DAMAGE_MAX_FFT_SIZE = 1 << 20
export const RUNTIME_DAMAGE_MIN_DISTRIBUTION_SIZE = 2
// A non-zero coefficient at index n needs raw support through 10n. Keep the
// coefficient-length guard derived from the existing absolute FFT limit so a
// caller cannot request an unhandleable polynomial while leaving the
// historical 202-dice asset boundary out of runtime input validation.
export const RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH =
  Math.floor((RUNTIME_DAMAGE_MAX_FFT_SIZE - 1) / 10) + 1
// The reroll algorithm is quadratic in the effective reroll count and is
// evaluated at every FFT frequency. This is an absolute computation guard,
// not a game-rule input ceiling; the planner normally rejects much smaller
// requests from its application-wide resource policy.
export const RUNTIME_DAMAGE_MAX_OPERATION_ESTIMATE = 2_000_000_000

export interface RuntimeDamageRollOptions {
  readonly signal?: AbortSignal
  readonly fftLength?: number
  readonly distributionLength?: number
  readonly rawSupportMax?: number
}

export interface NormalizedRuntimeDamageRollOptions {
  readonly fftLength: number
  readonly distributionLength: number
  readonly rawSupportMax: number
}

/**
 * Estimate the mixed damage-roll kernel work using device-independent units.
 * The planner and runtime must use this exact formula so admission cannot
 * disagree with the absolute runtime safety check.
 */
export function getRuntimeDamageRollOperationEstimate(
  weightLength: number,
  effectiveKazanari: number,
  fftLength: number,
): number {
  if (!Number.isFinite(weightLength) || weightLength < 0) {
    throw new RangeError('weightLength must be a non-negative finite number')
  }
  if (!Number.isFinite(effectiveKazanari) || effectiveKazanari < 0) {
    throw new RangeError(
      'effectiveKazanari must be a non-negative finite number'
    )
  }
  if (!Number.isFinite(fftLength) || fftLength < 0) {
    throw new RangeError('fftLength must be a non-negative finite number')
  }
  const estimate = (fftLength / 2 + 1) * (
    weightLength * (1 + 3 * effectiveKazanari) +
    5 * effectiveKazanari * (effectiveKazanari + 1) / 2
  )
  if (!Number.isFinite(estimate) || estimate < 0) {
    throw new RangeError('runtime damage operation estimate is not finite')
  }
  return estimate
}

function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0
}

function nextPowerOfTwoAtLeast(value: number): number {
  let result = 1
  while (result < value) {
    result *= 2
  }
  return Math.max(RUNTIME_DAMAGE_MIN_FFT_SIZE, result)
}

export function getRuntimeDamageRollRawSupportMax(weights: ArrayLike<number>): number {
  for (let damageDice = weights.length - 1; damageDice >= 0; damageDice -= 1) {
    if (weights[damageDice] !== 0) {
      return damageDice * 10
    }
  }
  return 0
}

export function normalizeRuntimeDamageRollOptions(
  options: RuntimeDamageRollOptions | undefined,
  requiredRawSupportMax = 0,
): NormalizedRuntimeDamageRollOptions {
  if (options === undefined) {
  options = {}
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(
      'runtime damage roll options must be an object when supplied'
    )
  }
  if (
    !Number.isSafeInteger(requiredRawSupportMax) ||
    requiredRawSupportMax < 0
  ) {
    throw new TypeError('requiredRawSupportMax must be a non-negative safe integer')
  }

  const defaultFftLength = nextPowerOfTwoAtLeast(requiredRawSupportMax + 1)
  const fftLength = options.fftLength === undefined
    ? Math.min(defaultFftLength, RUNTIME_DAMAGE_MAX_FFT_SIZE)
    : options.fftLength
  if (!Number.isSafeInteger(fftLength)) {
    throw new TypeError('fftLength must be a safe integer')
  }
  if (fftLength < RUNTIME_DAMAGE_MIN_FFT_SIZE) {
    throw new RangeError(
      `fftLength must be at least ${RUNTIME_DAMAGE_MIN_FFT_SIZE}`
    )
  }
  if (fftLength > RUNTIME_DAMAGE_MAX_FFT_SIZE) {
    throw new RangeError(
      `fftLength must not exceed ${RUNTIME_DAMAGE_MAX_FFT_SIZE}`
    )
  }
  if (!isPowerOfTwo(fftLength)) {
    throw new RangeError('fftLength must be a power of two')
  }

  const distributionLength = options.distributionLength === undefined
    ? Math.max(
        RUNTIME_DAMAGE_MIN_DISTRIBUTION_SIZE,
        requiredRawSupportMax + 1
      )
    : options.distributionLength
  if (!Number.isSafeInteger(distributionLength)) {
    throw new TypeError('distributionLength must be a safe integer')
  }
  if (distributionLength < RUNTIME_DAMAGE_MIN_DISTRIBUTION_SIZE) {
    throw new RangeError(
      `distributionLength must be at least ${RUNTIME_DAMAGE_MIN_DISTRIBUTION_SIZE}`
    )
  }
  if (distributionLength > fftLength) {
    throw new RangeError('distributionLength must not exceed fftLength')
  }

  const rawSupportMax = options.rawSupportMax === undefined
    ? requiredRawSupportMax
    : options.rawSupportMax
  if (!Number.isSafeInteger(rawSupportMax) || rawSupportMax < 0) {
    throw new TypeError('rawSupportMax must be a non-negative safe integer')
  }
  if (rawSupportMax < requiredRawSupportMax) {
    throw new RangeError(
      `rawSupportMax must be at least ${requiredRawSupportMax} for the supplied weights`
    )
  }
  if (rawSupportMax >= fftLength) {
    throw new RangeError(
      'fftLength must be greater than rawSupportMax to avoid circular support'
    )
  }

  return {
    fftLength,
    distributionLength,
    rawSupportMax,
  }
}

export function validateRuntimeDamageRollInputs(
  weights: ArrayLike<number>,
  kazanari: number,
): { rawSupportMax: number; total: number; effectiveKazanari: number } {
  if (
    !Array.isArray(weights) &&
    !(weights instanceof Float64Array)
  ) {
    throw new TypeError('weights must be an Array or Float64Array')
  }
  if (!Number.isSafeInteger(weights.length) || weights.length < 1) {
    throw new RangeError(
      'weights length must be a positive safe integer'
    )
  }
  if (weights.length > RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH) {
    throw new RangeError(
      `weights length exceeds the absolute safety limit of ${RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH}`
    )
  }
  let total = 0
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index]
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError('weights must contain finite non-negative values')
    }
    total += weight
  }
  if (!Number.isFinite(total)) {
    throw new RangeError('weights total must be finite')
  }
  if (!Number.isSafeInteger(kazanari) || kazanari < 0) {
    throw new RangeError('kazanari must be a non-negative safe integer')
  }

  const rawSupportMax = getRuntimeDamageRollRawSupportMax(weights)
  const maxDamageDice = Math.floor(rawSupportMax / 10)
  const effectiveKazanari = Math.min(kazanari, maxDamageDice)

  return {
    rawSupportMax,
    total,
    effectiveKazanari,
  }
}
