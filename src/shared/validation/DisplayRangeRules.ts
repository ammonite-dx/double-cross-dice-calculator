import { isNonNegativeSafeInteger } from '@/domain/InputDomain'

import type { ValidationRule } from './IntegerRules'

export interface DisplayRange {
  min: unknown
  max: unknown
}

export interface DisplayRangeRulesOptions {
  getRange: () => DisplayRange
}

export interface DisplayRangeRules {
  min: ValidationRule[]
  max: ValidationRule[]
}

/** Return whether a display coordinate can be represented safely. */
export function isDisplayCoordinate(value: unknown): value is number {
  return isNonNegativeSafeInteger(value)
}

/** Return whether a display request uses one of the supported projections. */
export function isDisplayMode(
  value: unknown,
): value is 'pmf' | 'upper-tail' {
  return value === 'pmf' || value === 'upper-tail'
}

/**
 * Compute the number of points in an inclusive display window. Returning
 * null keeps ordering and overflow checks in one reusable pure helper while
 * allowing each caller to preserve its own error code and message.
 */
export function getDisplayRangePointCount(
  min: unknown,
  max: unknown,
): number | null {
  if (!isDisplayCoordinate(min) || !isDisplayCoordinate(max) || min > max) {
    return null
  }
  const pointCount = max - min + 1
  return Number.isSafeInteger(pointCount) ? pointCount : null
}

type DisplayRangeRuleSource = DisplayRangeRulesOptions | (() => DisplayRange)

function resolveGetter(source: DisplayRangeRuleSource): () => DisplayRange {
  return typeof source === 'function' ? source : source.getRange
}

/**
 * Build mutually-aware display coordinate rules without imposing a display
 * ceiling. Resource limits are evaluated later by DisplayRangePlanner.
 */
export function createDisplayRangeRules(
  source: DisplayRangeRuleSource,
): DisplayRangeRules {
  const getRange = resolveGetter(source)

  return {
    min: [
      (value) => value !== '' || '最小値を入力して下さい。',
      (value) => isDisplayCoordinate(value)
        || '最小値は0以上の安全な整数値として下さい。',
      (value) => {
        const range = getRange()
        return (isDisplayCoordinate(value)
          && isDisplayCoordinate(range.max)
          && value <= range.max)
          || '最小値は最大値以下にして下さい'
      },
    ],
    max: [
      (value) => value !== '' || '最大値を入力して下さい。',
      (value) => isDisplayCoordinate(value)
        || '最大値は0以上の安全な整数値として下さい。',
      (value) => {
        const range = getRange()
        return (isDisplayCoordinate(value)
          && isDisplayCoordinate(range.min)
          && value >= range.min)
          || '最大値は最小値以上にして下さい'
      },
    ],
  }
}
