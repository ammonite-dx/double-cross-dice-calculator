import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  calculateD10Distribution,
  calculateD10Distributions,
  createD10DistributionProvider,
  D10_MAX_GENERATION_LENGTH,
} from '../src/calculation/D10Calculator'

function enumerate(dice) {
  const result = new Float64Array(dice * 10 + 1)
  const outcomes = 10 ** dice
  const visit = (index, sum) => {
    if (index === dice) {
      result[sum] += 1 / outcomes
      return
    }
    for (let face = 1; face <= 10; face += 1) {
      visit(index + 1, sum + face)
    }
  }
  visit(0, 0)
  return result
}

const assetDirectory = fileURLToPath(
  new URL('../public/data/schema-v2/revision-1/', import.meta.url)
)

async function readPublishedD10Asset() {
  const source = await readFile(path.join(assetDirectory, 'd10.json'), 'utf8')
  return JSON.parse(source)
}

function projectToPublishedBuckets(distribution) {
  const projected = new Float64Array(1024)
  for (let index = 0; index < 1023; index += 1) {
    projected[index] = distribution[index] ?? 0
  }
  for (let index = 1023; index < distribution.length; index += 1) {
    projected[1023] += distribution[index]
  }
  return projected
}

function expandPublishedDistribution(distribution) {
  const expanded = new Float64Array(1024)
  for (let index = 0; index < distribution.values.length; index += 1) {
    const target = distribution.offset + index
    if (target < expanded.length) {
      expanded[target] = distribution.values[index]
    }
  }
  return expanded
}

describe('runtime D10 calculator', () => {
  it('returns complete finite support, including zero dice', () => {
    expect(Array.from(calculateD10Distribution(0))).toEqual([1])
    const actual = calculateD10Distribution(2)
    const expected = enumerate(2)
    expect(actual).toHaveLength(21)
    for (let index = 0; index < actual.length; index += 1) {
      expect(actual[index]).toBeCloseTo(expected[index], 14)
    }
  })

  it('snapshots requested dice counts from one forward pass', () => {
    const result = calculateD10Distributions([0, 2, 4], 41)
    expect([...result.keys()]).toEqual([0, 2, 4])
    expect(result.get(2)).toHaveLength(41)
    expect(result.get(4)).toHaveLength(41)
    expect(result.get(4).slice(0, 4).every((value) => value === 0)).toBe(true)
  })

  it('supports dice counts beyond historical asset coverage', () => {
    const distribution = calculateD10Distribution(224)
    expect(distribution).toHaveLength(2241)
    let total = 0
    for (const probability of distribution) {
      expect(Number.isFinite(probability)).toBe(true)
      expect(probability).toBeGreaterThanOrEqual(0)
      total += probability
    }
    expect(total).toBeCloseTo(1, 12)
  })

  it('matches every published D10 bucket within the asset rounding tolerance', async () => {
    const asset = await readPublishedD10Asset()
    const runtime = calculateD10Distributions(
      Array.from({ length: asset.distributions.length }, (_, dice) => dice)
    )
    let maximumAbsoluteError = 0

    for (let dice = 0; dice < asset.distributions.length; dice += 1) {
      const expected = expandPublishedDistribution(asset.distributions[dice])
      const actual = projectToPublishedBuckets(runtime.get(dice))
      for (let index = 0; index < expected.length; index += 1) {
        maximumAbsoluteError = Math.max(
          maximumAbsoluteError,
          Math.abs(actual[index] - expected[index])
        )
      }
    }

    expect(maximumAbsoluteError).toBeLessThanOrEqual(1e-6)
  })

  it('does not allocate when the complete support exceeds the safety policy', () => {
    expect(() => calculateD10Distribution(
      Math.floor((D10_MAX_GENERATION_LENGTH - 1) / 10) + 1
    )).toThrow(/absolute safety limit/)
  })

  it('memoizes only a bounded number of provider entries', () => {
    const provider = createD10DistributionProvider({ cacheSize: 1 })
    expect(provider(1, 11)).toHaveLength(11)
    expect(provider(2, 21)).toHaveLength(21)
    expect(provider(1, 11)).toHaveLength(11)
  })
})
