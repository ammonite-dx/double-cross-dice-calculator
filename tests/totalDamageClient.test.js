import { describe, expect, it, vi } from 'vitest'

import {
  createCalculationClient,
} from '../src/runtime/CalculationClient'
import {
  createResourceGuard,
} from '../src/runtime/ResourceGuard'
import {
  createDistributionResult,
  getTotalDamageSummary,
} from '../src/calculation/DistributionResult'
import {
  planDamageAggregation,
  sumDamage,
} from '../src/calculation/DamageAggregation'

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
    getTotalDamageSummary,
    planDamageAggregation,
    sumDamage,
    ...overrides,
  }
}

describe('CalculationClient canonical total damage', () => {
  it('snapshots input, reserves the published plan, executes it, and summarizes after execution', async () => {
    const events = []
    const plan = Object.freeze({
      operation: 'damage-aggregation',
      estimates: Object.freeze({ float64Bytes: 128, operations: 4, timeMs: null }),
    })
    const aggregate = Object.freeze({
      result: Object.freeze({ values: [1] }),
      metadata: Object.freeze({ modeledDistribution: true }),
    })
    const input = [createEnvelope([1])]
    const planDamageAggregation = vi.fn((snapshot) => {
      events.push('plan')
      expect(snapshot).not.toBe(input)
      return plan
    })
    const sumDamage = vi.fn((snapshot, options) => {
      events.push('sum')
      expect(snapshot).not.toBe(input)
      expect(options.plan).toBe(plan)
      return aggregate
    })
    const getTotalDamageSummary = vi.fn(() => {
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
          operation: 'total-damage',
        })
        return { release }
      }),
    }
    const client = createCalculationClient(createDependencies({
      getTotalDamageSummary,
      planDamageAggregation,
      resourceGuard,
      sumDamage,
    }))

    await expect(client.calculateTotalDamage(input, {
      requestId: 'canonical-total-1',
    })).resolves.toEqual({
      totalDamage: aggregate,
      totalDamageSummary: 'canonical total summary',
    })
    expect(events).toEqual(['plan', 'lease', 'sum', 'summary', 'release'])
    expect(resourceGuard.acquirePlan).toHaveBeenCalledWith(plan, {
      signal: undefined,
      requestId: 'canonical-total-1',
      operation: 'total-damage',
    })
  })

  it('rejects before lease admission when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const acquirePlan = vi.fn()
    const client = createCalculationClient(createDependencies({
      resourceGuard: { acquirePlan },
    }))

    await expect(client.calculateTotalDamage([], {
      signal: controller.signal,
    })).rejects.toMatchObject({ code: 'aborted' })
    expect(acquirePlan).not.toHaveBeenCalled()
  })

  it('releases a lease when abort occurs after admission', async () => {
    const controller = new AbortController()
    const release = vi.fn()
    const plan = Object.freeze({
      operation: 'damage-aggregation',
      estimates: Object.freeze({ float64Bytes: 128 }),
    })
    const sumDamage = vi.fn()
    const resourceGuard = {
      acquirePlan: vi.fn(() => {
        controller.abort()
        return { release }
      }),
    }
    const client = createCalculationClient(createDependencies({
      planDamageAggregation: vi.fn(() => plan),
      resourceGuard,
      sumDamage,
    }))

    await expect(client.calculateTotalDamage([], {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(sumDamage).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledOnce()
  })

  it.each([
    ['aggregation', { sumDamage: vi.fn(() => { throw new Error('aggregate') }) }],
    ['summary', { getTotalDamageSummary: vi.fn(() => { throw new Error('summary') }) }],
  ])('releases a lease when %s fails', async (_label, overrides) => {
    const release = vi.fn()
    const plan = Object.freeze({
      operation: 'damage-aggregation',
      estimates: Object.freeze({ float64Bytes: 128 }),
    })
    const client = createCalculationClient(createDependencies({
      planDamageAggregation: vi.fn(() => plan),
      resourceGuard: { acquirePlan: vi.fn(() => ({ release })) },
      ...overrides,
    }))

    await expect(client.calculateTotalDamage([])).rejects.toThrow()
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

    const output = await client.calculateTotalDamage(input, {
      onFftLength: (length) => observedFftLengths.push(length),
    })

    expect(input).toEqual(before)
    expect(output.totalDamage.result).not.toBe(first.result)
    expect(output.totalDamage.result.values)
      .not.toBe(first.result.values)
    expect(observedFftLengths).toEqual([4])
    expect(output.totalDamageSummary).toEqual({
      expectedValue: { kind: 'exact', value: 1.25 },
      mass: expect.objectContaining({ totalMass: 1 }),
    })
  })
})
