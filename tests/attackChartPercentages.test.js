import { describe, expect, it } from 'vitest'
import {
  toChartPercentage,
  toChartPercentages,
} from '../src/presentation/ChartPercentages'

describe('Attack chart percentage formatter', () => {
  it.each([
    [0, 0],
    [0.12349, 12.3],
    [0.1235, 12.4],
    [0.12351, 12.4],
    [1, 100],
  ])('rounds %s to %s percent', (probability, expected) => {
    expect(toChartPercentage(probability)).toBe(expected)
  })

  it('returns an owned Array for typed-array input', () => {
    const input = Float64Array.from([0.12349, 0.1235])
    const output = toChartPercentages(input)

    expect(output).toEqual([12.3, 12.4])
    expect(output).not.toBe(input)
  })
})
