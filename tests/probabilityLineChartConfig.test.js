import { describe, expect, it } from 'vitest'

import {
  getCheckChartOptions,
} from '../src/features/check/ui/ChartSetter'
import {
  getAttackDamageChartOptions,
  getAttackScoreChartOptions,
} from '../src/features/attack/ui/ChartSetter'
import { getProbabilityLineChartStyle } from '../src/shared/chart/ProbabilityLineChartConfig'
import {
  toChartPercentage,
  toChartPercentages,
} from '../src/presentation/ChartPercentages'

function expectCommonLineOptions(options, xAxisTitle) {
  expect(options.responsive).toBe(true)
  expect(options.maintainAspectRatio).toBe(false)
  expect(options.scales).toEqual({
    x: { title: { display: true, text: xAxisTitle } },
    y: { suggestedMin: 0, title: { display: true, text: '確率 [%]' } },
  })
  expect(options.plugins.datalabels).toEqual({ display: false })
  expect(options.plugins.tooltip.mode).toBe('index')
  expect(options.plugins.tooltip.callbacks.label({
    dataset: { label: 'コンボ1' },
    formattedValue: '12.3',
  })).toBe('コンボ1: 12.3%')
}

describe('probability line chart behavior baseline', () => {
  it('keeps Check opposed options without an annotation line', () => {
    const options = getCheckChartOptions({ opposed: true, target: 17 })

    expectCommonLineOptions(options, '達成値')
    expect(options.plugins.annotation.annotations).toEqual({})
    expect(options.plugins.tooltip.callbacks.title([{ label: 20 }]))
      .toBe('達成値20')
  })

  it('keeps the Check difficulty annotation for non-opposed checks', () => {
    const options = getCheckChartOptions({ opposed: false, target: 17 })
    const line = options.plugins.annotation.annotations.line1

    expectCommonLineOptions(options, '達成値')
    expect(line).toEqual({
      type: 'line',
      scaleID: 'x',
      value: 17,
      borderColor: '#FF7F0E',
      borderWidth: 3,
      label: {
        display: true,
        backgroundColor: '#FF7F0E',
        borderColor: '#FF7F0E',
        borderRadius: 10,
        borderWidth: 2,
        content: '難易度: 17',
        rotation: 0,
      },
    })
  })

  it('keeps Attack Score and Damage line options distinct only by x-axis title', () => {
    const scoreOptions = getAttackScoreChartOptions()
    const damageOptions = getAttackDamageChartOptions()

    expectCommonLineOptions(scoreOptions, '達成値')
    expectCommonLineOptions(damageOptions, 'ダメージ')
    expect(scoreOptions.plugins).not.toHaveProperty('annotation')
    expect(damageOptions.plugins).not.toHaveProperty('annotation')
    expect(scoreOptions.plugins.tooltip.callbacks.title([{ label: 20 }]))
      .toBe('達成値20')
    expect(damageOptions.plugins.tooltip.callbacks.title([{ label: 20 }]))
      .toBe('ダメージ20')
  })

  it('keeps the responsive chart styles at both breakpoints', () => {
    expect(getProbabilityLineChartStyle(true))
      .toEqual({ height: '400px', position: 'relative' })
    expect(getProbabilityLineChartStyle(false))
      .toEqual({ height: '300px', position: 'relative' })
  })

  it('keeps the one-decimal percentage conversion and owned arrays', () => {
    expect(toChartPercentage(0.12349)).toBe(12.3)
    expect(toChartPercentage(0.1235)).toBe(12.4)
    expect(toChartPercentage(0.12351)).toBe(12.4)

    const input = Float64Array.from([0.12349, 0.1235])
    const output = toChartPercentages(input)
    expect(output).toEqual([12.3, 12.4])
    expect(output).not.toBe(input)
  })
})
