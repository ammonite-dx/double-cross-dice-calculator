import { describe, expect, it, vi } from 'vitest'

import {
  createCalculationClient,
} from '../src/application/CalculationClient'
import {
  createResourceGuard,
} from '../src/application/ResourceGuard'
import {
  createDistributionResult,
  getCanonicalTotalDamageSummary,
} from '../src/calculation/DistributionResult'
import {
  planCanonicalDamageAggregation,
  sumCanonicalDamage,
} from '../src/calculation/CanonicalDamageAggregation'

function createEnvelope(values, options = {}) {
  return {
    result: createDistributionResult({
      values,
      offset: options.offset ?? 0,
      support: options.support ?? { kind: 'finite', max: values.length - 1 },
      overflow: options.overflow ?? null,
    }),
    metadata: {
      modeledDistribution: true,
      sourceSupport: options.sourceSupport ?? { kind: 'finite', max: values.length - 1 },
    },
  }
}

function createDependencies(overrides = {}) {
  return {
    getCanonicalTotalDamageSummary,
    planCanonicalDamageAggregation,
    sumCanonicalDamage,
    ...overrides,
  }
}

describe('CalculationClient canonical total damage', () => {
  it('snapshots input, reserves the published plan, executes it, and summarizes after execution', async () => {
    const events = []
    const plan = Object.freeze({
      operation: 'canonical-damage-aggregation',
      estimates: Object.freeze({ float64Bytes: 128, operations: 4, timeMs: null }),
    })
    const aggregate = Object.freeze({
      result: Object.freeze({ values: [1] }),
      metadata: Object.freeze({ modeledDistribution: true }),
    })
    const input = [createEnvelope([1])]
    const planCanonicalDamageAggregation = vi.fn((snapshot) => {
      events.push('plan')
      expect(snapshot).not.toBe(input)
      return plan
    })
    const sumCanonicalDamage = vi.fn((snapshot, options) => {
      events.push('sum')
      expect(snapshot).not.toBe(input)
      expect(options.plan).toBe(plan)
      return aggregate
    })
    const getCanonicalTotalDamageSummary = vi.fn(() => {
      events.push('summary')
      return 'canonical total summary'
    })
    const release = vi.fn(() => events.push('release'))
    const resourceGuard = {
      acquirePlan: vi.fn((passedPlan, options) => {
        events.push('lease')
        expect(passedPlan).toBe(plan)
        expect(options).toMatchObject({
          requestId: 'canonical-total-1',
          operation: 'canonical-total-damage',
        })
        return { release }
      }),
    }
    const client = createCalculationClient(createDependencies({
      getCanonicalTotalDamageSummary,
      planCanonicalDamageAggregation,
      resourceGuard,
      sumCanonicalDamage,
    }))

    await expect(client.calculateCanonicalTotalDamage(input, {
      requestId: 'canonical-total-1',
    })).resolves.toEqual({
      canonicalTotalDamage: aggregate,
      canonicalTotalDamageSummary: 'canonical total summary',
    })
    expect(events).toEqual(['plan', 'lease', 'sum', 'summary', 'release'])
    expect(resourceGuard.acquirePlan).toHaveBeenCalledWith(plan, {
      signal: undefined,
      requestId: 'canonical-total-1',
      operation: 'canonical-total-damage',
    })
  })

  it('rejects before lease admission when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const acquirePlan = vi.fn()
    const client = createCalculationClient(createDependencies({
      resourceGuard: { acquirePlan },
    }))

    await expect(client.calculateCanonicalTotalDamage([], {
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'aborted' })
    expect(acquirePlan).not.toHaveBeenCalled()
  })

  it('releases a lease when abort occurs after admission', async () => {
    const controller = new AbortController()
    const release = vi.fn()
    const plan = Object.freeze({
      operation: 'canonical-damage-aggregation',
      estimates: Object.freeze({ float64Bytes: 128 }),
    })
    const sumCanonicalDamage = vi.fn()
    const resourceGuard = {
      acquirePlan: vi.fn(() => {
        controller.abort()
        return { release }
      }),
    }
    const client = createCalculationClient(createDependencies({
      planCanonicalDamageAggregation: vi.fn(() => plan),
      resourceGuard,
      sumCanonicalDamage,
    }))

    await expect(client.calculateCanonicalTotalDamage([], {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(sumCanonicalDamage).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })

  it.each([
    ['aggregation', { sumCanonicalDamage: vi.fn(() => { throw new Error('aggregate') }) }],
    ['summary', { getCanonicalTotalDamageSummary: vi.fn(() => { throw new Error('summary') }) }],
  ])('releases a lease when %s fails', async (_label, overrides) => {
    const release = vi.fn()
    const plan = Object.freeze({
      operation: 'canonical-damage-aggregation',
      estimates: Object.freeze({ float64Bytes: 128 }),
    })
    const client = createCalculationClient(createDependencies({
      planCanonicalDamageAggregation: vi.fn(() => plan),
      resourceGuard: { acquirePlan: vi.fn(() => ({ release })) },
      ...overrides,
    }))

    await expect(client.calculateCanonicalTotalDamage([])).rejects.toThrow()
    expect(release).toHaveBeenCalledOnce()
  })

  it('passes onFftLength through the same plan and prevents result aliasing', async () => {
    const first = createEnvelope([0.5, 0.5])
    const second = createEnvelope([0.25, 0.75])
    const input = [first, second]
    const before = input.slice()
    const observedFftLengths = []
    const client = createCalculationClient(createDependencies({
      resourceGuard: createResourceGuard(),
    }))

    const output = await client.calculateCanonicalTotalDamage(input, {
      onFftLength: (length) => observedFftLengths.push(length),
    })

    expect(input).toEqual(before)
    expect(output.canonicalTotalDamage.result).not.toBe(first.result)
    expect(output.canonicalTotalDamage.result.values)
      .not.toBe(first.result.values)
    expect(observedFftLengths).toEqual([4])
    expect(output.canonicalTotalDamageSummary).toEqual({
      expectedValue: { kind: 'exact', value: 1.25 },
      mass: expect.objectContaining({ totalMass: 1 }),
    })
  })
})
