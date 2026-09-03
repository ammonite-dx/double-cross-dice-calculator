import { describe, expect, it } from 'vitest'

import {
  convolveDistributions,
  getConvolutionFftLength,
  subDistribution,
  sumDistribution,
} from '../src/core/probability/FFT'
import * as FFT from '../src/core/probability/FFT'

function pointMass(size, value) {
  const distribution = Array(size).fill(0)
  distribution[value] = 1
  return distribution
}

describe('FFT distribution operations', () => {
  it('exposes only the canonical complete-convolution helper name', () => {
    expect(FFT.convolveDistributions).toBeTypeOf('function')
    expect(FFT.convolve).toBeUndefined()
    expect(FFT.linearConvolution).toBeUndefined()
    expect(FFT.convolveDistribution).toBeUndefined()
  })

  it('exposes complete linear convolution for unequal non-empty lengths', () => {
    const result = Array.from(convolveDistributions([0.5, 0.5], [0.25, 0.75, 0]))
    expect(result).toHaveLength(4)
    expect(result[0]).toBeCloseTo(0.125, 12)
    expect(result[1]).toBeCloseTo(0.5, 12)
    expect(result[2]).toBeCloseTo(0.375, 12)
    expect(result[3]).toBeCloseTo(0, 12)
  })

  it.each([1024, 2048])(
    'supports sums and differences with %i elements',
    (size) => {
      const firstValue = Math.floor(0.7 * size)
      const secondValue = Math.floor(0.2 * size)
      const first = pointMass(size, firstValue)
      const second = pointMass(size, secondValue)
      const expectedSum = firstValue + secondValue
      const expectedDifference = firstValue - secondValue

      expect(sumDistribution(first, second)[expectedSum]).toBeCloseTo(1, 12)
      expect(
        subDistribution(first, second)[expectedDifference]
      ).toBeCloseTo(1, 12)
    }
  )

  it.each([1024, 2048])(
    'aggregates overflow into the final bucket with %i elements',
    (size) => {
      const first = pointMass(size, Math.floor(0.8 * size))
      const second = pointMass(size, Math.floor(0.4 * size))

      expect(sumDistribution(first, second).at(-1)).toBeCloseTo(1, 12)
    }
  )

  it('reports and enforces the exact linear-convolution FFT length', () => {
    const size = 4173
    const first = pointMass(size, 10)
    const second = pointMass(size, 20)
    const observed = []
    const expected = getConvolutionFftLength(size)

    expect(sumDistribution(first, second, {
      fftLength: expected,
      onFftLength: (length) => observed.push(length),
    })[30]).toBeCloseTo(1, 12)
    expect(observed).toEqual([expected])
    expect(() => sumDistribution(first, second, {
      fftLength: expected * 2,
    })).toThrow('fftLength')
  })

  it('subtracts unequal-length distributions and clamps negative values', () => {
    const first = pointMass(5, 4)
    const second = pointMass(3, 2)

    expect(subDistribution(first, second)).toEqual([0, 0, 1, 0, 0])
    expect(subDistribution(pointMass(5, 2), pointMass(3, 2))).toEqual(
      [1, 0, 0, 0, 0]
    )
    const clamped = subDistribution(pointMass(5, 1), pointMass(3, 2))
    expect(clamped[0]).toBeCloseTo(1, 12)
    expect(clamped.slice(1).every((value) => Math.abs(value) < 1e-12)).toBe(
      true
    )
  })

  it('uses the exact explicit FFT length for unequal subtraction', () => {
    const first = pointMass(5, 4)
    const second = pointMass(3, 2)
    const expected = getConvolutionFftLength(first.length, second.length)
    const observed = []

    expect(subDistribution(first, second, {
      fftLength: expected,
      onFftLength: (length) => observed.push(length),
    })).toEqual([0, 0, 1, 0, 0])
    expect(observed).toEqual([expected])
    expect(() => subDistribution(first, second, {
      fftLength: expected / 2,
    })).toThrow('fftLength')
    expect(() => subDistribution(first, second, {
      fftLength: expected * 2,
    })).toThrow('fftLength')
    expect(() => subDistribution(first, second, {
      fftLength: expected + 2,
    })).toThrow('fftLength')
  })
})
