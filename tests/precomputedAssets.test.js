import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const assetDirectory = fileURLToPath(
  new URL('../public/data/schema-v1/revision-3/', import.meta.url)
)
const manifestPath = path.join(assetDirectory, 'manifest.json')

async function readAsset(relativePath) {
  return readFile(path.join(assetDirectory, relativePath))
}

describe('generated precomputed data assets', () => {
  it('contains every expected shard', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const filenames = Object.keys(manifest.files)

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      dataRevision: 3,
      distributionSize: 1024,
    })
    expect(filenames).toHaveLength(32)
    expect(filenames.filter((filename) => filename.startsWith('dx/'))).toHaveLength(20)
    expect(filenames.filter((filename) => filename.startsWith('dr/'))).toHaveLength(10)
    expect(filenames).toContain('d10.json')
    expect(filenames).toContain('livingdead.json')
  })

  it('matches the recorded byte lengths and SHA-256 hashes', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

    for (const [filename, expected] of Object.entries(manifest.files)) {
      const content = await readAsset(filename)
      const sha256 = createHash('sha256').update(content).digest('hex')

      expect(content.byteLength, filename).toBe(expected.bytes)
      expect(sha256, filename).toBe(expected.sha256)
    }
  })

  it.each([
    ['dx/shihai-0.json', 'dx', { shihai: 0 }],
    ['dr/kazanari-0.json', 'dr', { kazanari: 0 }],
    ['d10.json', 'd10', {}],
    ['livingdead.json', 'livingdead', {}],
  ])('has valid metadata in %s', async (filename, dataset, shard) => {
    const asset = JSON.parse(await readFile(path.join(assetDirectory, filename), 'utf8'))

    expect(asset).toMatchObject({
      schemaVersion: 1,
      dataRevision: 3,
      dataset,
      distributionSize: 1024,
      shard,
    })
  })

  it.each(['d10.json', 'livingdead.json'])(
    'covers every accepted backtrack dice count in %s',
    async (filename) => {
      const asset = JSON.parse(
        await readFile(path.join(assetDirectory, filename), 'utf8')
      )
      const largestDistribution = asset.distributions.at(-1)
      const total = largestDistribution.values.reduce(
        (sum, probability) => sum + probability,
        0
      )

      expect(asset.index.dice).toEqual({ start: 0, count: 224 })
      expect(asset.distributions).toHaveLength(224)
      expect(
        largestDistribution.offset + largestDistribution.values.length
      ).toBe(1024)
      expect(total).toBeCloseTo(1, 10)
      expect(largestDistribution.values.at(-1)).toBeGreaterThan(0)
    }
  )

  it('normalizes dr and aggregates the maximum input overflow', async () => {
    const asset = JSON.parse(
      await readFile(path.join(assetDirectory, 'dr/kazanari-9.json'), 'utf8')
    )
    const largestDistribution = asset.distributions.at(-1)
    const total = largestDistribution.values.reduce(
      (sum, probability) => sum + probability,
      0
    )

    expect(total).toBeCloseTo(1, 10)
    expect(
      largestDistribution.offset + largestDistribution.values.length
    ).toBe(1024)
    expect(largestDistribution.values.at(-1)).toBeGreaterThan(0.99)
  })
})
