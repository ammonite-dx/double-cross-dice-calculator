import { describe, expect, it } from 'vitest'

import {
  applyBundleReplacement,
  validateBundleReplacementStats,
} from '../experiments/r23-ui-review/bundle-replacement.mjs'

describe('R23 prototype bundle replacement contract', () => {
  it('replaces one target occurrence and reports count', () => {
    const result = applyBundleReplacement('prefix t?12:6 suffix', {
      from: 't?12:6',
      to: 't?12:8',
    })

    expect(result).toEqual({
      source: 'prefix t?12:8 suffix',
      replacementCount: 1,
    })
    expect(validateBundleReplacementStats(result, {
      variantId: 'backtrack-label-8',
      scenarioId: 'backtrack-mobile',
    })).toBe(result)
  })

  it.each([
    ['zero matches', 'bundle', 0],
    ['multiple matches', 't?12:6 t?12:6', 2],
  ])('rejects %s', (_label, source, expectedCount) => {
    const result = applyBundleReplacement(source, {
      from: 't?12:6',
      to: 't?12:8',
    })

    expect(result.replacementCount).toBe(expectedCount)
    expect(() => validateBundleReplacementStats(result, {
      variantId: 'backtrack-label-8',
      scenarioId: 'backtrack-mobile',
    })).toThrow(
      `backtrack-label-8 / backtrack-mobile: expected exactly 1 bundle replacement, got ${expectedCount}`,
    )
  })

  it('does not validate the baseline variant without a replacement', () => {
    expect(validateBundleReplacementStats(null)).toBeNull()
  })
})
