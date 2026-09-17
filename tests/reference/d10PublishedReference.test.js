import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { calculateD10Distributions } from '../../src/calculation/D10Calculator'

const assetDirectory = fileURLToPath(
  new URL('../../public/data/schema-v2/revision-1/', import.meta.url)
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

describe('published D10 reference', () => {
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
})
