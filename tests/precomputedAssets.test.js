import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const assetDirectory = fileURLToPath(
  new URL('../public/data/schema-v1/revision-1/', import.meta.url)
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
      dataRevision: 1,
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
      dataRevision: 1,
      dataset,
      distributionSize: 1024,
      shard,
    })
  })
})
