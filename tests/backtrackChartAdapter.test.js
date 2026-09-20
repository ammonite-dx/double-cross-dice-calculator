import { describe, expect, it } from 'vitest'

import {
  getBacktrackChartData,
  getBacktrackChartOptions,
  getBacktrackChartStyle,
} from '../src/features/backtrack/ui/BacktrackChartAdapter'

const chart = {
  key: 'single',
  labels: ['100%〜', '0〜30%'],
  probabilities: [90, 10],
  backgroundColors: ['#EC1D2C', '#5EBB68'],
  title: '一倍振り',
  accessibleName: '最終侵蝕率分布 一倍振り',
}

describe('Backtrack chart adapter', () => {
  it('maps model-owned chart metadata without reinterpreting it', () => {
    const data = getBacktrackChartData(chart)

    expect(data.labels).toBe(chart.labels)
    expect(data.datasets).toHaveLength(1)
    expect(data.datasets[0].data).toBe(chart.probabilities)
    expect(data.datasets[0].backgroundColor).toBe(chart.backgroundColors)
  })

  it('uses chart metadata for title, tooltip, and datalabels', () => {
    const options = getBacktrackChartOptions(chart, false)
    const context = {
      chart: { data: { labels: chart.labels } },
      dataIndex: 0,
    }

    expect(options.plugins.title.text).toBe('一倍振り')
    expect(options.plugins.title.display).toBe(true)
    expect(options.plugins.legend.display).toBe(false)
    expect(options.plugins.tooltip.callbacks.title()).toBeNull()
    expect(options.plugins.tooltip.callbacks.label({
      label: '100%〜',
      formattedValue: '90',
    })).toBe('100%〜: 90%')
    expect(options.plugins.datalabels.formatter(9, context)).toBe('')
    expect(options.plugins.datalabels.formatter(10, context))
      .toBe('100%〜\n10%')
    expect(options.plugins.datalabels.labels.title.font.size).toBe(8)
  })

  it('keeps the responsive chart and breakpoint styles', () => {
    const options = getBacktrackChartOptions(chart, true)

    expect(options.responsive).toBe(true)
    expect(options.maintainAspectRatio).toBe(false)
    expect(options.plugins.datalabels.labels.title.font.size).toBe(12)
    expect(getBacktrackChartStyle(true)).toEqual({
      height: '300px',
      position: 'relative',
    })
    expect(getBacktrackChartStyle(false)).toEqual({
      height: '200px',
      position: 'relative',
    })
  })
})
