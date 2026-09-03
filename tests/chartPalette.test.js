import { describe, expect, it } from 'vitest'

import { getChartColor } from '../src/shared/theme/ChartPalette'

describe('shared chart palette', () => {
  it('preserves the nine production colors and their id mapping', () => {
    expect(Array.from({ length: 9 }, (_, id) => getChartColor(id))).toEqual([
      '#1E77B4',
      '#FF7F0E',
      '#D72827',
      '#9468BD',
      '#8B564B',
      '#E378C1',
      '#7F7F7F',
      '#BCBD20',
      '#13BECE',
    ])
  })

  it('wraps ids after the ninth color', () => {
    expect(getChartColor(9)).toBe('#1E77B4')
    expect(getChartColor(10)).toBe('#FF7F0E')
  })
})
