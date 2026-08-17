import { describe, expect, it } from 'vitest'

import {
  createCanonicalDistributionDisplay,
  formatCanonicalComboName,
  formatCanonicalExpectedValue,
  formatCanonicalOverflow,
} from '../src/components/Attack/CanonicalAttackPanel.js'

describe('CanonicalAttackPanel display helpers', () => {
  it('copies a non-empty combo name and falls back for empty or non-string names', () => {
    expect(formatCanonicalComboName('強攻撃', 0)).toBe('強攻撃')
    expect(formatCanonicalComboName('', 1)).toBe('コンボ 2')
    expect(formatCanonicalComboName('  ', 2)).toBe('コンボ 3')
    expect(formatCanonicalComboName(null, 3)).toBe('コンボ 4')
  })

  it('distinguishes exact, bounded, and lower-bound expected values', () => {
    expect(formatCanonicalExpectedValue({ kind: 'exact', value: 12.5 }))
      .toBe('期待値（正確値）: 12.5')
    expect(formatCanonicalExpectedValue({
      kind: 'bounded',
      lowerBound: 3,
      upperBound: 5,
    })).toBe('期待値（範囲）: 3 ～ 5')
    expect(formatCanonicalExpectedValue({ kind: 'lower-bound', lowerBound: 8 }))
      .toBe('期待値（下限）: 8 以上')
  })

  it('keeps exact and upper-bound overflow visibly distinct', () => {
    expect(formatCanonicalOverflow({
      kind: 'exact',
      lowerBound: 1024,
      probability: 0.25,
    })).toContain('オーバーフロー: 正確値（1,024以上、確率 25%）')
    expect(formatCanonicalOverflow({
      kind: 'upper-bound',
      lowerBound: 2048,
      probabilityUpperBound: 0.5,
    })).toContain('オーバーフロー: 上限値（2,048以上、確率上限 50%）')
  })

  it('returns safe Japanese placeholders for missing or non-finite values', () => {
    const display = createCanonicalDistributionDisplay({
      expectedValue: { kind: 'exact', value: Number.POSITIVE_INFINITY },
      explicitMax: Number.NaN,
      support: { kind: 'finite', max: Number.POSITIVE_INFINITY },
      overflow: {
        kind: 'exact',
        lowerBound: Number.NaN,
        probability: Number.POSITIVE_INFINITY,
      },
    })

    expect(display.expectedValue).toContain('不明')
    expect(display.explicitMax).toContain('不明')
    expect(display.support).toContain('不明')
    expect(display.overflow).toContain('不明')
    expect(createCanonicalDistributionDisplay(null)).toEqual({
      expectedValue: '期待値（不明）',
      explicitMax: '明示分布上限: 不明',
      support: 'support: 不明',
      overflow: 'オーバーフロー: 不明',
    })
  })
})
