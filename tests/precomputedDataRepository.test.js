import { describe, expect, it, vi } from 'vitest'

import {
  createDxRepository,
} from '../src/data/PrecomputedDataRepository'
import dxShihai0 from '../public/data/schema-v1/revision-3/dx/shihai-0.json'

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
