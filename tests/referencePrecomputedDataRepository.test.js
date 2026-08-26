import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  createDxRepository,
  getLivingdeadDistribution,
  registerLivingdeadAsset,
  clearReferencePrecomputedDataCache,
} from '../src/data/ReferencePrecomputedDataRepository'
import dxShihai0 from '../public/data/schema-v2/revision-1/dx/shihai-0.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

function createJsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe('reference precomputed repository', () => {
  beforeEach(() => {
    clearReferencePrecomputedDataCache()
  })

  it('keeps DX shard loading and retry behavior in the reference module', async () => {
    const fetchAsset = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(null, { ok: false, status: 503 }))
      .mockResolvedValueOnce(createJsonResponse(dxShihai0))
    const repository = createDxRepository(fetchAsset)

    await expect(repository.loadDxAsset(0)).rejects.toThrow('HTTP 503')
    await expect(repository.loadDxAsset(0)).resolves.toBe(dxShihai0)
    expect(repository.getDxDistribution(0, 1, 10)).toEqual(
      dxShihai0.distributions[1][8]
    )
    expect(fetchAsset).toHaveBeenCalledTimes(2)
  })

  it('retains finite-support expansion for livingdead reference data', () => {
    registerLivingdeadAsset(livingdead)

    const distribution = getLivingdeadDistribution(103, 1031)
    expect(distribution).toHaveLength(1031)
    expect(distribution.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      1,
      12
    )
    expect(() => getLivingdeadDistribution(104, 1041)).toThrow(
      'cannot be expanded after overflow aggregation'
    )
  })
})
