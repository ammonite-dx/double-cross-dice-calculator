import { describe, expect, it } from 'vitest'

import { formatRangeFeedback } from '../src/components/RangePlanNoticeFormatter'

const warningPlan = {
  accepted: true,
  warnings: [
    { code: 'backtrack-asset-overflow', severity: 'warning' },
  ],
  estimates: {
    cpuWork: 52.5,
    float64Bytes: 2 * 1024 * 1024,
  },
  overflowInfo: {
    display: { lowerBound: 1000 },
    backtrack: { lowerBound: 1024 },
  },
}

const rejectionPlan = {
  accepted: false,
  rejectionReasons: ['estimated-memory'],
  warnings: [
    { code: 'estimated-memory', severity: 'reject' },
  ],
  estimates: {
    float64Bytes: 65 * 1024 * 1024,
  },
  overflowInfo: {
    display: { lowerBound: 1000 },
  },
}

describe('RangePlanNoticeFormatter', () => {
  it('formats accepted warnings with Japanese reasons, resource estimates, and overflow bounds', () => {
    const display = formatRangeFeedback({
      status: 'ready',
      plan: warningPlan,
    })

    expect(display.type).toBe('warning')
    expect(display.reasons).toContain('静的なバックトラック用データのcoverageが不足しています（計算結果のoverflowではありません）。完全supportはオンデマンド計算を使用してください。')
    expect(display.metrics.memory).toBe('2 MiB')
    expect(display.metrics).not.toHaveProperty('time')
    expect(display.overflow).toContain('表示範囲: 1,000以上の値をまとめて扱います。')
    expect(display.overflow).toContain('バックトラックの計算範囲: 1,024以上の値をまとめて扱います。')
    expect(display.reasons.join(' ')).not.toContain('estimated-time')
  })

  it('formats hard rejects as errors and provides a recovery action', () => {
    const display = formatRangeFeedback({
      status: 'rejected',
      plan: rejectionPlan,
      error: { rejectionReasons: rejectionPlan.rejectionReasons },
    })

    expect(display.type).toBe('error')
    expect(display.title).toBe('この入力では計算できません')
    expect(display.reasons).toEqual(['計算に必要なメモリが上限を超えています。'])
    expect(display.action).toContain('入力値を下げる')
  })

  it.each([
    ['cpu-work', '計算量が上限を超えています。'],
    ['score-working-length', '判定計算の作業範囲が上限を超えています。'],
    ['score-fft-length', '判定計算のFFT範囲が上限を超えています。'],
    ['damage-generation', 'ダメージロールの計算量が上限を超えています。'],
    ['damage-working-length', 'ダメージ計算の作業範囲が上限を超えています。'],
    ['damage-fft-length', 'ダメージ計算のFFT範囲が上限を超えています。'],
    ['defence-d10-length', '防御側の10面ダイス計算範囲が上限を超えています。'],
    ['defence-d10-generation', '防御側の10面ダイス生成計算量が上限を超えています。'],
    ['backtrack-working-length', 'バックトラック計算の作業範囲が上限を超えています。'],
    ['backtrack-generation', 'バックトラックの生成計算量が上限を超えています。'],
  ])('formats %s as an explicit hard-limit reason', (code, reason) => {
    const display = formatRangeFeedback({
      status: 'rejected',
      plan: {
        accepted: false,
        rejectionReasons: [code],
        warnings: [{ code, severity: 'reject' }],
      },
    })

    expect(display.reasons).toEqual([reason])
  })

  it('uses a reject-oriented fallback for unknown hard-limit codes', () => {
    const display = formatRangeFeedback({
      status: 'rejected',
      plan: {
        accepted: false,
        rejectionReasons: ['future-resource-limit'],
        warnings: [{ code: 'future-resource-limit', severity: 'reject' }],
      },
    })

    expect(display.reasons).toEqual([
      '計算資源または計算範囲の上限を超えています。',
    ])
  })

  it('formats DisplayRangePlanner resource reasons without exposing internal codes', () => {
    const display = formatRangeFeedback({
      status: 'rejected',
      plan: {
        accepted: false,
        rejectionReasons: [
          'display-point-count',
          'display-float64-memory',
          'chart-point-count',
        ],
        warnings: [
          { code: 'display-point-count', severity: 'reject' },
          { code: 'display-float64-memory', severity: 'reject' },
          { code: 'chart-point-count', severity: 'reject' },
        ],
        estimates: { pointCount: 1201, float64Bytes: 9608, chartPoints: 1201 },
      },
    })

    expect(display.type).toBe('error')
    expect(display.reasons).toEqual([
      '表示する点数が多すぎるため、計算結果を表示できません。',
      '表示用メモリの見積りが大きすぎるため、計算結果を表示できません。',
      'チャートへ描画する点数が多すぎるため、計算結果を表示できません。',
    ])
  })

  it('does not expose AbortError as a display', () => {
    const error = new Error('cancelled')
    error.name = 'AbortError'

    expect(formatRangeFeedback({
      status: 'idle',
      plan: null,
      error,
    })).toBeNull()
  })

  it('formats a generic error without leaking internal details', () => {
    const display = formatRangeFeedback({
      status: 'error',
      plan: null,
      error: new Error('private stack detail'),
    })

    expect(display.type).toBe('error')
    expect(display.reasons.join(' ')).not.toContain('private stack detail')
    expect(display.action).toContain('もう一度')
  })

  it('formats an initial hard reject as user-facing feedback', () => {
    const error = new Error('range rejected')
    error.name = 'CalculationRangeError'
    error.plan = rejectionPlan
    error.rejectionReasons = rejectionPlan.rejectionReasons

    expect(formatRangeFeedback({
      status: 'rejected',
      plan: rejectionPlan,
      error,
    }).type).toBe('error')
  })
})
