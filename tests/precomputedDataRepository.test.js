import { describe, expect, it, vi } from 'vitest'

import {
  createDxRepository,
  getD10Distribution,
  getLivingdeadDistribution,
  registerD10Asset,
  registerLivingdeadAsset,
} from '../src/data/PrecomputedDataRepository'
import dxShihai0 from '../public/data/schema-v2/revision-1/dx/shihai-0.json'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerD10Asset(d10)
registerLivingdeadAsset(livingdead)

function createJsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe('dx repository', () => {
  it('loads, validates, and caches a shard', async () => {
    const fetchAsset = vi.fn(async () => createJsonResponse(dxShihai0))
    const repository = createDxRepository(fetchAsset)

    const [first, second] = await Promise.all([
      repository.loadDxAsset(0),
      repository.loadDxAsset(0),
    ])

    expect(fetchAsset).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect(repository.getDxDistribution(0, 1, 10)).toEqual(
      dxShihai0.distributions[1][8]
    )
  })

  it('rejects an incompatible data revision', async () => {
    const incompatibleAsset = {
      ...dxShihai0,
      dataRevision: dxShihai0.dataRevision + 1,
    }
    const repository = createDxRepository(
      async () => createJsonResponse(incompatibleAsset)
    )

    await expect(repository.loadDxAsset(0)).rejects.toThrow('revision mismatch')
  })

  it('allows retrying after a failed request', async () => {
    const fetchAsset = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(null, { ok: false, status: 503 }))
      .mockResolvedValueOnce(createJsonResponse(dxShihai0))
    const repository = createDxRepository(fetchAsset)

    await expect(repository.loadDxAsset(0)).rejects.toThrow('HTTP 503')
    await expect(repository.loadDxAsset(0)).resolves.toBe(dxShihai0)
    expect(fetchAsset).toHaveBeenCalledTimes(2)
  })
})

describe('finite backtrack distributions', () => {
  it('expands only distributions whose complete support survives the asset boundary', () => {
    const d10 = getD10Distribution(102, 1021)
    expect(d10).toHaveLength(1021)
    expect(d10.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12)
    expect(() => getD10Distribution(103, 1031)).toThrow(
      'cannot be expanded after overflow aggregation'
    )

    const livingdead = getLivingdeadDistribution(103, 1031)
    expect(livingdead).toHaveLength(1031)
    expect(livingdead.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12)
    expect(() => getLivingdeadDistribution(104, 1041)).toThrow(
      'cannot be expanded after overflow aggregation'
    )
  })
})
