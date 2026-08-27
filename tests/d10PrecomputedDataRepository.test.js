import { describe, expect, it, vi } from 'vitest'

import { createD10Repository } from '../src/data/D10PrecomputedDataRepository'
import d10 from '../public/data/schema-v2/revision-1/d10.json'

function createJsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe('D10 production repository', () => {
  it('deduplicates concurrent loads and expands a cached distribution', async () => {
    const fetchAsset = vi.fn(async () => createJsonResponse(d10))
    const repository = createD10Repository(fetchAsset)

    const [first, second] = await Promise.all([
      repository.loadD10Asset(),
      repository.loadD10Asset(),
    ])

    expect(fetchAsset).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)

    const distribution = repository.getD10Distribution(102, 1021)
    expect(distribution).toHaveLength(1021)
    expect(distribution.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      1,
      12
    )
  })

  it('keeps a successful asset in the cache for later loads', async () => {
    const fetchAsset = vi.fn(async () => createJsonResponse(d10))
    const repository = createD10Repository(fetchAsset)

    await repository.loadD10Asset()
    await repository.loadD10Asset()

    expect(fetchAsset).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed asset request', async () => {
    const fetchAsset = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(null, { ok: false, status: 503 }))
      .mockResolvedValueOnce(createJsonResponse(d10))
    const repository = createD10Repository(fetchAsset)

    await expect(repository.loadD10Asset()).rejects.toThrow('HTTP 503')
    await expect(repository.loadD10Asset()).resolves.toBe(d10)
    expect(fetchAsset).toHaveBeenCalledTimes(2)
  })

  it.each([
    [
      { ...d10, schemaVersion: d10.schemaVersion + 1 },
      'schema mismatch',
    ],
    [{ ...d10, dataset: 'livingdead' }, 'dataset must be d10'],
    [
      { ...d10, distributions: d10.distributions.slice(0, -1) },
      'd10 distribution count mismatch',
    ],
  ])('rejects invalid asset metadata: %s', async (invalidAsset, message) => {
    const repository = createD10Repository(async () =>
      createJsonResponse(invalidAsset)
    )

    await expect(repository.loadD10Asset()).rejects.toThrow(message)
    expect(() => repository.getD10Distribution(1)).toThrow(
      'd10 data has not been loaded'
    )
  })

  it('rejects an invalid probability value', async () => {
    const invalidProbabilityAsset = structuredClone(d10)
    invalidProbabilityAsset.distributions[1].values[0] = -1
    const repository = createD10Repository(async () =>
      createJsonResponse(invalidProbabilityAsset)
    )

    await expect(repository.loadD10Asset()).rejects.toThrow(
      'invalid probability'
    )
  })

  it('rejects expansion past an asset overflow boundary', async () => {
    const repository = createD10Repository(async () => createJsonResponse(d10))
    await repository.loadD10Asset()

    expect(() => repository.getD10Distribution(103, 1031)).toThrow(
      'cannot be expanded after overflow aggregation'
    )
  })
})
