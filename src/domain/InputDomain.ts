/**
 * Canonical input-domain predicates shared by the application boundary and
 * calculation planner. These checks describe values that can be represented
 * safely; they deliberately do not encode historical JSON or UI ceilings.
 */

export const INPUT_DOMAIN = Object.freeze({
  critical: Object.freeze({ min: 2, max: 11 }),
  remainingLois: Object.freeze({ min: 0, max: 7 }),
})

export interface ScoreInput {
  dice: number
  critical: number
  skill: number
  yousei: number
  shihai: number
}

export interface ScoreFeatureInput {
  yousei?: number
  shihai?: number
}

export function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value)
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0
}

export function isCriticalValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= INPUT_DOMAIN.critical.min
    && value <= INPUT_DOMAIN.critical.max
}

export function isRemainingLois(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= INPUT_DOMAIN.remainingLois.min
    && value <= INPUT_DOMAIN.remainingLois.max
}

export function assertSafeInteger(value: unknown, label: string): number {
  if (!isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer`)
  }
  return value
}

export function assertNonNegativeSafeInteger(
  value: unknown,
  label: string,
): number {
  const integer = assertSafeInteger(value, label)
  if (integer < 0) {
    throw new RangeError(`${label} must be non-negative`)
  }
  return integer
}

export function assertCriticalValue(
  value: unknown,
  label = 'critical',
): number {
  if (!isCriticalValue(value)) {
    throw new RangeError(`${label} must be an integer between 2 and 11`)
  }
  return value
}

export function assertRemainingLois(
  value: unknown,
  label = 'lois',
): number {
  if (!isRemainingLois(value)) {
    throw new RangeError(`${label} must be an integer between 0 and 7`)
  }
  return value
}

export function assertSupportedScoreFeatures({
  yousei = 0,
  shihai = 0,
}: ScoreFeatureInput = {}): true {
  assertNonNegativeSafeInteger(yousei, 'score.yousei')
  assertNonNegativeSafeInteger(shihai, 'score.shihai')
  if (yousei > 0 && shihai > 0) {
    throw new RangeError(
      'score.yousei and score.shihai cannot both be non-zero in the current supported feature set'
    )
  }
  return true
}
