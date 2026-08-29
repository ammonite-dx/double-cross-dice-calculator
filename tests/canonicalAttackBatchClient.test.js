import { describe, expect, it, vi } from 'vitest'

import {
  CalculationBatchInputError,
  createCalculationClient,
} from '../src/application/CalculationClient'
import {
  createDistributionResult,
  getCanonicalTotalDamageSummary,
} from '../src/calculation/DistributionResult'
import {
  planCanonicalDamageAggregation,
  sumCanonicalDamage,
} from '../src/calculation/CanonicalDamageAggregation'
import { createResourceGuard } from '../src/application/ResourceGuard'

const score = {
  dice: 1,
  critical: 10,
  skill: 0,
  yousei: 0,
  shihai: 0,
}

function attackParams(seed = 0) {
  return {
    action: {
      score: { ...score, dice: score.dice + seed, shihai: 2 },
      damage: { dice: 0, value: 3 + seed, kazanari: 4 },
    },
    reaction: {
      mode: 'normal',
      score: { ...score, shihai: 1 },
      damage: { dice: 0, value: 1 },
    },
  }
}

function canonicalEnvelope(value = 0) {
  return Object.freeze({
    result: createDistributionResult({
      values: [1],
      offset: value,
      support: { kind: 'finite', max: value },
      overflow: null,
    }),
    metadata: Object.freeze({
      modeledDistribution: true,
      sourceSupport: { kind: 'finite', max: value },
    }),
  })
}

function canonicalScoreEnvelope(
  params,
  _getDistribution,
  _scoreRangePlan,
  fix = false
) {
  const value = fix ? Math.max(0, params.skill) : 0
  return Object.freeze({
    result: createDistributionResult({
      values: [1],
      offset: value,
      support: { kind: 'finite', max: value },
      overflow: null,
    }),
    metadata: Object.freeze({
      modeledDistribution: true,
      failureProbability: 0,
    }),
  })
}

function createRecordingResourceGuard(events = []) {
  return {
    acquirePlan: vi.fn((plan, options) => {
      events.push({ type: 'acquire', plan, options })
      const release = vi.fn(() => events.push({ type: 'release', plan }))
      return { release }
    }),
  }
}

function createDependencies(overrides = {}) {
  let canonicalCall = 0
  return {
    calculateCanonicalDamageOnDemand: vi.fn(async () => {
      canonicalCall += 1
      return canonicalEnvelope(canonicalCall - 1)
    }),
    calculateScoreCanonical: vi.fn(canonicalScoreEnvelope),
    getCanonicalDamageSummary: vi.fn((damage) => damage),
    getCanonicalTotalDamageSummary,
    getD10Distribution: vi.fn(),
    planCalculationRanges: vi.fn(() => ({
      accepted: true,
      operation: 'attack',
    })),
    planCanonicalDamageAggregation,
    resourceGuard: createResourceGuard(),
    sumCanonicalDamage,
    ...overrides,
  }
}

describe('CalculationClient canonical attack batch', () => {
  it('keeps entry order and performs each attack and total exactly once', async () => {
    const events = []
    const plans = [
      { accepted: true, operation: 'attack', id: 'plan-1' },
      { accepted: true, operation: 'attack', id: 'plan-2' },
    ]
    const totalPlan = { operation: 'canonical-damage-aggregation' }
    const aggregate = { result: 'aggregate', metadata: 'metadata' }
    const planCalculationRanges = vi.fn(() => plans.shift())
    const calculateCanonicalDamageOnDemand = vi.fn(async () => {
      events.push('attack')
      return canonicalEnvelope()
    })
    const planCanonicalDamageAggregation = vi.fn(() => {
      events.push('plan-total')
      return totalPlan
    })
    const sumCanonicalDamage = vi.fn(() => {
      events.push('sum-total')
      return aggregate
    })
    const resourceGuard = createRecordingResourceGuard(events)
    const dependencies = createDependencies({
      calculateCanonicalDamageOnDemand,
      getCanonicalTotalDamageSummary: vi.fn(() => 'total summary'),
      planCalculationRanges,
      planCanonicalDamageAggregation,
      resourceGuard,
      sumCanonicalDamage,
    })
    const client = createCalculationClient(dependencies)

    const result = await client.calculateAttackCanonicalBatch([
      { id: 'first', params: attackParams(1) },
      { id: 42, params: attackParams(2) },
    ])

    expect(result).toEqual({
      combos: [
        expect.objectContaining({ id: 'first' }),
        expect.objectContaining({ id: 42 }),
      ],
      canonicalTotalDamage: aggregate,
      canonicalTotalDamageSummary: 'total summary',
    })
    expect(result.combos.map((combo) => combo.id)).toEqual(['first', 42])
    expect(planCalculationRanges).toHaveBeenCalledTimes(2)
    expect(calculateCanonicalDamageOnDemand).toHaveBeenCalledTimes(2)
    expect(planCanonicalDamageAggregation).toHaveBeenCalledOnce()
    expect(sumCanonicalDamage).toHaveBeenCalledOnce()
    expect(events.filter((event) => event === 'attack')).toHaveLength(2)
    expect(events.indexOf('plan-total')).toBeGreaterThan(
      events.lastIndexOf('attack')
    )
    expect(events.indexOf('sum-total')).toBeGreaterThan(
      events.indexOf('plan-total')
    )
    expect(events.filter((event) => event.type === 'release')).toHaveLength(3)
  })

  it('returns the canonical zero identity for an empty batch', async () => {
    const client = createCalculationClient(createDependencies({
      resourceGuard: createResourceGuard(),
    }))

    const result = await client.calculateAttackCanonicalBatch([])

    expect(result.combos).toEqual([])
    expect(result.canonicalTotalDamage.result.values).toEqual(
      new Float64Array([1])
    )
    expect(result.canonicalTotalDamage.result.offset).toBe(0)
    expect(result.canonicalTotalDamageSummary.expectedValue).toEqual({
      kind: 'exact',
      value: 0,
    })
  })

  it.each([
    ['entries is not an array', 'invalid-entries', null],
    ['entries has a hole', 'invalid-entry', new Array(1)],
    ['entry is malformed', 'invalid-entry', [{}]],
    ['id is invalid', 'invalid-id', [{ id: {}, params: attackParams() }]],
    ['id is not finite', 'invalid-id', [{ id: Infinity, params: attackParams() }]],
    ['id is duplicated', 'duplicate-id', [
      { id: 'same', params: attackParams() },
      { id: 'same', params: attackParams(1) },
    ]],
    ['params are malformed', 'invalid-params', [{ id: 1, params: {} }]],
  ])('rejects %s with a typed input error', async (_label, code, entries) => {
    const planCalculationRanges = vi.fn()
    const client = createCalculationClient(createDependencies({
      planCalculationRanges,
    }))

    await expect(client.calculateAttackCanonicalBatch(entries))
      .rejects.toSatisfy((error) => {
        expect(error).toBeInstanceOf(CalculationBatchInputError)
        expect(error.code).toBe(code)
        return true
      })
    expect(planCalculationRanges).not.toHaveBeenCalled()
  })

  it.each([
    ['null options', null],
    ['non-function onRangePlan', { onRangePlan: true }],
    ['non-function onFftLength', { onFftLength: 1 }],
    ['invalid rangePolicy', { rangePolicy: [] }],
  ])('rejects %s with typed options validation', async (_label, options) => {
    const planCalculationRanges = vi.fn()
    const client = createCalculationClient(createDependencies({
      planCalculationRanges,
    }))

    await expect(client.calculateAttackCanonicalBatch([
      { id: 1, params: attackParams() },
    ], options)).rejects.toMatchObject({
      name: 'CalculationBatchInputError',
      code: 'invalid-options',
    })
    expect(planCalculationRanges).not.toHaveBeenCalled()
  })

  it.each([
    ['entry id accessor', () => {
      const entry = { params: attackParams() }
      Object.defineProperty(entry, 'id', {
        enumerable: true,
        get: () => 'accessor-id',
      })
      return [entry]
    }, 'invalid-id'],
    ['params action accessor', () => {
      const params = attackParams()
      Object.defineProperty(params, 'action', {
        enumerable: true,
        get: () => attackParams().action,
      })
      return [{ id: 1, params }]
    }, 'invalid-params'],
    ['options callback accessor', () => {
      const options = {}
      Object.defineProperty(options, 'onRangePlan', {
        enumerable: true,
        get: () => vi.fn(),
      })
      return options
    }, 'invalid-options'],
  ])('rejects %s without executing accessors', async (_label, createInput, code) => {
    const planCalculationRanges = vi.fn()
    const client = createCalculationClient(createDependencies({
      planCalculationRanges,
    }))
    const input = createInput()
    const entries = code === 'invalid-options' ? [
      { id: 1, params: attackParams() },
    ] : input
    const options = code === 'invalid-options' ? input : undefined

    await expect(client.calculateAttackCanonicalBatch(entries, options))
      .rejects.toMatchObject({
        name: 'CalculationBatchInputError',
        code,
      })
    expect(planCalculationRanges).not.toHaveBeenCalled()
  })

  it.each([
    ['revoked entries proxy', () => {
      const revocable = Proxy.revocable([], {})
      revocable.revoke()
      return revocable.proxy
    }, undefined],
    ['revoked entry proxy', () => {
      const revocable = Proxy.revocable({
        id: 1,
        params: attackParams(),
      }, {})
      revocable.revoke()
      return [revocable.proxy]
    }, undefined],
    ['revoked options proxy', () => {
      const revocable = Proxy.revocable({}, {})
      revocable.revoke()
      return revocable.proxy
    }, 'options'],
  ])('rejects %s as a typed batch error', async (_label, createInput, inputKind) => {
    const planCalculationRanges = vi.fn()
    const client = createCalculationClient(createDependencies({
      planCalculationRanges,
    }))
    const input = createInput()
    const entries = inputKind === 'options'
      ? [{ id: 1, params: attackParams() }]
      : input
    const options = inputKind === 'options' ? input : undefined

    await expect(client.calculateAttackCanonicalBatch(entries, options))
      .rejects.toBeInstanceOf(CalculationBatchInputError)
    expect(planCalculationRanges).not.toHaveBeenCalled()
  })

  it.each([
    ['negative maxValuesLength', { maxValuesLength: -1 }],
    ['negative maxFftLength', { maxFftLength: -1 }],
    ['negative maxResourceBytes', { maxResourceBytes: -1 }],
    ['negative maxComponents', { maxComponents: -1 }],
    ['component count exceeds maxComponents', { maxComponents: 1 }],
  ])('rejects %s before attack calculation', async (_label, options) => {
    const planCalculationRanges = vi.fn()
    const calculateCanonicalDamageOnDemand = vi.fn()
    const client = createCalculationClient(createDependencies({
      calculateCanonicalDamageOnDemand,
      planCalculationRanges,
    }))

    await expect(client.calculateAttackCanonicalBatch([
      { id: 1, params: attackParams() },
      { id: 2, params: attackParams(1) },
    ], options)).rejects.toMatchObject({
      name: 'CalculationBatchInputError',
      code: 'invalid-options',
    })
    expect(planCalculationRanges).not.toHaveBeenCalled()
    expect(calculateCanonicalDamageOnDemand).not.toHaveBeenCalled()
  })

  it('snapshots all entries before calculation and does not alias caller input', async () => {
    let resolveFirst
    const firstCalculation = new Promise((resolve) => {
      resolveFirst = resolve
    })
    const planCalculationRanges = vi.fn(() => ({
      accepted: true,
      operation: 'attack',
    }))
    const calculateCanonicalDamageOnDemand = vi.fn(async (_score, attack) => {
      if (calculateCanonicalDamageOnDemand.mock.calls.length === 1) {
        await firstCalculation
      }
      return canonicalEnvelope(attack.value)
    })
    const dependencies = createDependencies({
      calculateCanonicalDamageOnDemand,
      planCalculationRanges,
      getCanonicalTotalDamageSummary: vi.fn(() => 'total summary'),
      planCanonicalDamageAggregation: vi.fn(() => ({
        operation: 'canonical-damage-aggregation',
      })),
      sumCanonicalDamage: vi.fn(() => ({
        result: 'aggregate',
        metadata: 'metadata',
      })),
    })
    const client = createCalculationClient(dependencies)
    const entries = [
      { id: 'first', params: attackParams(1) },
      { id: 'second', params: attackParams(2) },
    ]
    const originalEntries = structuredClone(entries)
    const originalFirst = structuredClone(entries[0].params)
    const originalSecond = structuredClone(entries[1].params)

    const pending = client.calculateAttackCanonicalBatch(entries)
    entries[0].params.action.score.dice = 99
    entries[0].params.action.damage.value = 999
    entries[1].params.reaction.damage.dice = 99
    entries.splice(0, entries.length)
    resolveFirst()
    const result = await pending

    expect(entries).toEqual([])
    expect(originalEntries[0].params).toEqual(originalFirst)
    expect(originalEntries[1].params).toEqual(originalSecond)
    expect(planCalculationRanges.mock.calls[0][0].score.action.dice)
      .toBe(originalFirst.action.score.dice)
    expect(planCalculationRanges.mock.calls[1][0].score.action.dice)
      .toBe(originalSecond.action.score.dice)
    expect(calculateCanonicalDamageOnDemand.mock.calls[0][1].value)
      .toBe(originalFirst.action.damage.value)
    expect(calculateCanonicalDamageOnDemand.mock.calls[1][1].value)
      .toBe(originalSecond.action.damage.value)
    expect(result.combos).not.toBe(originalEntries)
    expect(result.combos[0]).not.toBe(originalEntries[0])
  })

  it('snapshots options before the first attack, including nested runtime data', async () => {
    let resolveFirst
    const firstCalculation = new Promise((resolve) => {
      resolveFirst = resolve
    })
    let calculationCount = 0
    const planCalculationRanges = vi.fn(() => ({
      accepted: true,
      operation: 'attack',
    }))
    const calculateCanonicalDamageOnDemand = vi.fn(async (
      _score,
      _attack,
      _defence,
      _damageDependencies,
      runtimeOptions
    ) => {
      calculationCount += 1
      if (calculationCount === 1) {
        await firstCalculation
      }
      expect(runtimeOptions.runtimeFlag).toEqual({ mode: 'before' })
      return canonicalEnvelope()
    })
    const client = createCalculationClient(createDependencies({
      calculateCanonicalDamageOnDemand,
      getCanonicalTotalDamageSummary: vi.fn(() => 'total summary'),
      planCalculationRanges,
      planCanonicalDamageAggregation: vi.fn(() => ({
        operation: 'canonical-damage-aggregation',
      })),
      sumCanonicalDamage: vi.fn(() => ({
        result: 'aggregate',
        metadata: 'metadata',
      })),
    }))
    const rangePolicy = { calculationMax: 10 }
    const options = {
      rangePolicy,
      requestId: 'before',
      runtimeFlag: { mode: 'before' },
    }

    const pending = client.calculateAttackCanonicalBatch([
      { id: 1, params: attackParams() },
      { id: 2, params: attackParams(1) },
    ], options)
    rangePolicy.calculationMax = 99
    options.requestId = 'after'
    options.runtimeFlag.mode = 'after'
    resolveFirst()
    await pending

    expect(planCalculationRanges).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operation: 'attack' }),
      { calculationMax: 10, scorePropagation: 'full-tail' }
    )
    expect(planCalculationRanges).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ operation: 'attack' }),
      { calculationMax: 10, scorePropagation: 'full-tail' }
    )
    expect(calculateCanonicalDamageOnDemand).toHaveBeenCalledTimes(2)
  })

  it('does not return partial results when a later attack fails', async () => {
    const release = vi.fn()
    const resourceGuard = {
      acquirePlan: vi.fn(() => ({ release })),
    }
    const failure = new Error('second attack failed')
    let attackCount = 0
    const calculateCanonicalDamageOnDemand = vi.fn(async () => {
      attackCount += 1
      if (attackCount === 2) {
        throw failure
      }
      return canonicalEnvelope()
    })
    const planCanonicalDamageAggregation = vi.fn()
    const client = createCalculationClient(createDependencies({
      calculateCanonicalDamageOnDemand,
      planCanonicalDamageAggregation,
      resourceGuard,
    }))

    await expect(client.calculateAttackCanonicalBatch([
      { id: 1, params: attackParams() },
      { id: 2, params: attackParams(1) },
    ])).rejects.toBe(failure)
    expect(release).toHaveBeenCalledTimes(2)
    expect(planCanonicalDamageAggregation).not.toHaveBeenCalled()
  })

  it('does not return partial results when abort happens between entries', async () => {
    const controller = new AbortController()
    const release = vi.fn()
    const resourceGuard = {
      acquirePlan: vi.fn(() => ({ release })),
    }
    const getCanonicalDamageSummary = vi.fn(() => {
      controller.abort()
      return 'summary'
    })
    const calculateCanonicalDamageOnDemand = vi.fn(async () =>
      canonicalEnvelope()
    )
    const planCanonicalDamageAggregation = vi.fn()
    const client = createCalculationClient(createDependencies({
      calculateCanonicalDamageOnDemand,
      getCanonicalDamageSummary,
      planCanonicalDamageAggregation,
      resourceGuard,
    }))

    await expect(client.calculateAttackCanonicalBatch([
      { id: 1, params: attackParams() },
      { id: 2, params: attackParams(1) },
    ], { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(calculateCanonicalDamageOnDemand).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    expect(planCanonicalDamageAggregation).not.toHaveBeenCalled()
  })

  it('does not start calculation when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const planCalculationRanges = vi.fn()
    const calculateCanonicalDamageOnDemand = vi.fn()
    const resourceGuard = createRecordingResourceGuard()
    const client = createCalculationClient(createDependencies({
      calculateCanonicalDamageOnDemand,
      planCalculationRanges,
      resourceGuard,
    }))

    await expect(client.calculateAttackCanonicalBatch([
      { id: 1, params: attackParams() },
    ], { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(planCalculationRanges).not.toHaveBeenCalled()
    expect(calculateCanonicalDamageOnDemand).not.toHaveBeenCalled()
    expect(resourceGuard.acquirePlan).not.toHaveBeenCalled()
  })

  it('propagates shared options to every attack and the total operation', async () => {
    const plans = [
      { accepted: true, operation: 'attack', id: 1 },
      { accepted: true, operation: 'attack', id: 2 },
    ]
    const rangePolicy = { calculationMax: 10 }
    const signal = new AbortController().signal
    const onRangePlan = vi.fn()
    const onFftLength = vi.fn()
    const planCalculationRanges = vi.fn(() => plans.shift())
    const planCanonicalDamageAggregation = vi.fn(() => ({
      operation: 'canonical-damage-aggregation',
    }))
    const sumCanonicalDamage = vi.fn(() => ({
      result: 'aggregate',
      metadata: 'metadata',
    }))
    const resourceGuard = createRecordingResourceGuard()
    const calculateCanonicalDamageOnDemand = vi.fn(async () =>
      canonicalEnvelope()
    )
    const dependencies = createDependencies({
      calculateCanonicalDamageOnDemand,
      getCanonicalTotalDamageSummary: vi.fn(() => 'total summary'),
      onFftLength,
      planCalculationRanges,
      planCanonicalDamageAggregation,
      resourceGuard,
      sumCanonicalDamage,
    })
    const client = createCalculationClient(dependencies)
    const options = {
      signal,
      requestId: 'batch-request',
      rangePolicy,
      onRangePlan,
      onFftLength,
      runtimeFlag: 'preserve',
    }
    const optionsSnapshot = { ...options }

    await client.calculateAttackCanonicalBatch([
      { id: 1, params: attackParams() },
      { id: 2, params: attackParams(1) },
    ], options)

    expect(options).toEqual(optionsSnapshot)
    expect(planCalculationRanges).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operation: 'attack' }),
      { ...rangePolicy, scorePropagation: 'full-tail' }
    )
    expect(planCalculationRanges).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ operation: 'attack' }),
      { ...rangePolicy, scorePropagation: 'full-tail' }
    )
    expect(onRangePlan).toHaveBeenCalledTimes(2)
    expect(calculateCanonicalDamageOnDemand).toHaveBeenCalledTimes(2)
    for (const call of calculateCanonicalDamageOnDemand.mock.calls) {
      expect(call[4]).toEqual({
        signal,
        requestId: 'batch-request',
        onFftLength,
        runtimeFlag: 'preserve',
      })
    }
    expect(planCanonicalDamageAggregation).toHaveBeenCalledWith(
      expect.any(Array),
      {
      signal,
      onFftLength,
      }
    )
    expect(sumCanonicalDamage).toHaveBeenCalledWith(
      expect.any(Array),
      { signal, onFftLength, plan: expect.any(Object) }
    )
    expect(resourceGuard.acquirePlan).toHaveBeenCalledTimes(3)
    expect(resourceGuard.acquirePlan.mock.calls[0][1]).toMatchObject({
      signal,
      requestId: 'batch-request',
      operation: 'attack',
    })
    expect(resourceGuard.acquirePlan.mock.calls[2][1]).toMatchObject({
      signal,
      requestId: 'batch-request',
      operation: 'canonical-total-damage',
    })
  })

  it('releases attack leases before rejecting on total failure', async () => {
    const events = []
    const resourceGuard = createRecordingResourceGuard(events)
    const sumCanonicalDamage = vi.fn(() => {
      events.push('sum')
      throw new Error('total failed')
    })
    const client = createCalculationClient(createDependencies({
      resourceGuard,
      sumCanonicalDamage,
      planCanonicalDamageAggregation: vi.fn(() => ({
        operation: 'canonical-damage-aggregation',
      })),
    }))

    await expect(client.calculateAttackCanonicalBatch([
      { id: 1, params: attackParams() },
      { id: 2, params: attackParams(1) },
    ])).rejects.toThrow('total failed')
    expect(events.filter((event) => event.type === 'release')).toHaveLength(3)
    expect(events.at(-1)).toMatchObject({ type: 'release' })
    expect(events.at(-2)).toBe('sum')
  })
})
