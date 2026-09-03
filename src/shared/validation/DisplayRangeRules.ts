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
      (value) => isNonNegativeSafeInteger(value)
        || '最小値は0以上の安全な整数値として下さい。',
      (value) => {
        const range = getRange()
        return (isNonNegativeSafeInteger(value)
          && isNonNegativeSafeInteger(range.max)
          && value <= range.max)
          || '最小値は最大値以下にして下さい'
      },
    ],
    max: [
      (value) => value !== '' || '最大値を入力して下さい。',
      (value) => isNonNegativeSafeInteger(value)
        || '最大値は0以上の安全な整数値として下さい。',
      (value) => {
        const range = getRange()
        return (isNonNegativeSafeInteger(value)
          && isNonNegativeSafeInteger(range.min)
          && value >= range.min)
          || '最大値は最小値以上にして下さい'
      },
    ],
  }
}
