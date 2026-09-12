import { describe, expect, it } from 'vitest'

import {
  getFinalEncroachmentChartOptions,
} from '../src/features/backtrack/ui/ChartSetter'

function getDatalabels(smAndUp) {
  return getFinalEncroachmentChartOptions('single', smAndUp)
    .plugins.datalabels
}

function createFormatterContext() {
  return {
    chart: {
      data: {
        labels: ['100%〜'],
      },
    },
    dataIndex: 0,
  }
}

describe('Backtrack final encroachment chart options', () => {
  it.each([
    [true, 12],
    [false, 8],
  ])('uses the %s breakpoint label font size %i', (smAndUp, expected) => {
    expect(getDatalabels(smAndUp).labels.title.font.size).toBe(expected)
  })

  it('keeps the formatter threshold at 10 percent', () => {
    const { formatter, textAlign } = getDatalabels(false)
    const context = createFormatterContext()

    expect(formatter(9, context)).toBe('')
    expect(formatter(10, context)).toBe('100%〜\n10%')
    expect(textAlign).toBe('center')
  })
})
