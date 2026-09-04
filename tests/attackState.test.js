import { describe, expect, it, vi } from 'vitest'

import {
  clearAttackState,
  commitAttackResult,
  createAttackState,
  createComboDataState,
  snapshotAttackEntries,
} from '../src/features/attack/model/AttackState'
import { createAttackRunner } from '../src/features/attack/model/AttackRunner'

const legacyScore = { value: 'legacy score' }
const legacyDamage = { value: 'legacy damage' }

function params(seed = 0) {
  return {
    action: {
      score: {
        dice: 1 + seed,
        critical: 10,
        skill: seed,
        yousei: 0,
        shihai: 0,
      },
      damage: { dice: 0, value: 2 + seed, kazanari: 1 },
    },
    reaction: {
      mode: 'normal',
      score: {
        dice: 1,
        critical: 10,
        skill: 0,
        yousei: 0,
        shihai: seed,
      },
      damage: { dice: 0, value: 1 },
    },
  }
}

function combo(id, seed = 0) {
  return {
    id,
    data: {
      params: params(seed),
      ...createComboDataState(),
    },
  }
}

function createState(combos = [combo('first', 0), combo('second', 1)]) {
  return {
    ...createAttackState(),
    combos,
  }
}

function createBatch(ids, suffix = 'result') {
  return {
    combos: ids.map((id, index) => ({
      id,
      score: { value: `score-${suffix}-${index}` },
      scoreSummary: { value: `score-summary-${suffix}-${index}` },
      damage: { value: `damage-${suffix}-${index}` },
      damageSummary: { value: `damage-summary-${suffix}-${index}` },
    })),
    totalDamage: { value: `total-${suffix}` },
    totalDamageSummary: { value: `total-summary-${suffix}` },
  }
}

function createPresentation(batch, plans) {
  return {
    combos: batch.combos.map((entry, index) => ({
      id: entry.id,
      damagePresentation: {
        value: `presentation-${index}`,
      },
      rangePlan: plans[index],
    })),
    totalDamage: batch.totalDamage,
    totalDamageSummary: batch.totalDamageSummary,
    totalDamagePresentation: {
      value: 'total presentation',
    },
  }
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('AttackState', () => {
  it('snapshots params and prevents nested input aliases', () => {
    const sourceParams = params()
    const entries = snapshotAttackEntries([{
      id: 'one',
      data: { params: sourceParams },
    }])

    sourceParams.action.score.dice = 99
    sourceParams.action.damage.value = 999
    sourceParams.reaction.mode = 'changed'

    expect(entries).toEqual([{
      id: 'one',
      params: expect.objectContaining({
        action: expect.objectContaining({
          score: expect.objectContaining({ dice: 1 }),
          damage: expect.objectContaining({ value: 2 }),
        }),
        reaction: expect.objectContaining({ mode: 'normal' }),
      }),
    }])
    expect(entries[0].params).not.toBe(sourceParams)
    expect(entries[0].params.action.score).not.toBe(sourceParams.action.score)
  })

  it('keeps combo order and ids for add/remove/reorder snapshots', () => {
    const state = createState([combo('a'), combo('b'), combo('c')])
    state.combos.splice(1, 1)
    state.combos.push(combo('copy', 4))
    state.combos.reverse()

    expect(snapshotAttackEntries(state.combos).map((entry) => entry.id))
      .toEqual(['copy', 'c', 'a'])
  })

  it('commits complete batch and presentation payloads atomically', () => {
    const state = createState()
    const generation = state.generation
    const batch = createBatch(['first', 'second'])
    const plans = [{ id: 'first-plan' }, { id: 'second-plan' }]
    const presentation = createPresentation(batch, plans)

    expect(commitAttackResult(
      state,
      generation,
      batch,
      presentation
    )).toBe(true)
    expect(state.combos.map(({ data }) => data.resultReady))
      .toEqual([true, true])
    expect(state.combos[0].data.rangePlan).toBe(plans[0])
    expect(state.combos[1].data.damage).toBe(
      batch.combos[1].damage
    )
    expect(state.totalDamageReady).toBe(true)
    expect(state.totalDamage).toBe(batch.totalDamage)
    expect(state.totalDamageSummary).toBe(batch.totalDamageSummary)
    expect(state.combos[0].data.damage).toBe(batch.combos[0].damage)
  })

  it('rejects a stale generation without exposing partial combo state', () => {
    const state = createState()
    const batch = createBatch(['first', 'second'])
    const presentation = createPresentation(batch, [{}, {}])
    const generation = state.generation

    clearAttackState(state)

    expect(commitAttackResult(
      state,
      generation,
      batch,
      presentation
    )).toBe(false)
    expect(state.totalDamageReady).toBe(false)
    expect(state.combos.every(({ data }) => !data.resultReady))
      .toBe(true)
  })

  it('rejects a mismatched presentation before writing any combo', () => {
    const state = createState()
    const batch = createBatch(['first', 'second'])
    const presentation = createPresentation(batch, [{}, {}])
    presentation.combos[1].id = 'wrong-id'

    expect(commitAttackResult(
      state,
      state.generation,
      batch,
      presentation
    )).toBe(false)
    expect(state.totalDamageReady).toBe(false)
    expect(state.combos.every(({ data }) => !data.resultReady))
      .toBe(true)
  })
})

describe('createAttackRunner', () => {
  it('runs the canonical API by default', async () => {
    const state = createState()
    const batch = createBatch(['first', 'second'])
    const calculationClient = {
      calculateAttackBatch: vi.fn().mockResolvedValue(batch),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: vi.fn(createPresentation),
    })

    await expect(runner.run()).resolves.toBe(true)
    expect(calculationClient.calculateAttackBatch).toHaveBeenCalledOnce()
  })

  it('takes one ordered batch, collects plans, presents once, and commits once', async () => {
    const state = createState()
    const firstPlan = { id: 'plan-first' }
    const secondPlan = { id: 'plan-second' }
    const batch = createBatch(['first', 'second'])
    const createPresentationSpy = vi.fn(createPresentation)
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (entries, options) => {
        expect(entries.map((entry) => entry.id)).toEqual(['first', 'second'])
        expect(entries[0].params.action.score.dice).toBe(1)
        expect(entries[1].params.action.score.dice).toBe(2)
        options.onRangePlan(firstPlan)
        options.onRangePlan(secondPlan)
        return batch
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: createPresentationSpy,
    })

    await expect(runner.run()).resolves.toBe(true)

    expect(calculationClient.calculateAttackBatch).toHaveBeenCalledOnce()
    expect(createPresentationSpy).toHaveBeenCalledOnce()
    expect(createPresentationSpy).toHaveBeenCalledWith(
      batch,
      [firstPlan, secondPlan]
    )
    expect(state.totalDamageReady).toBe(true)
    expect(state.combos.map(({ data }) => data.rangePlan))
      .toEqual([firstPlan, secondPlan])
  })

  it('does not commit an old deferred result after input changes before the next run', async () => {
    const state = createState()
    const deferred = createDeferred()
    const presentation = vi.fn(createPresentation)
    let requestedEntries
    const calculationClient = {
      calculateAttackBatch: vi.fn((entries) => {
        requestedEntries = entries
        return deferred.promise
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: presentation,
    })

    const request = runner.run()
    state.combos[0].data.params.action.score.dice = 99
    deferred.resolve(createBatch(['first', 'second'], 'old'))
    await request

    expect(requestedEntries[0].params.action.score.dice).toBe(1)
    expect(presentation).not.toHaveBeenCalled()
    expect(state.totalDamageReady).toBe(false)
    expect(state.combos.every(({ data }) => !data.resultReady))
      .toBe(true)
  })

  it('snapshots queued entries and calculation options at submit time', async () => {
    const state = createState()
    const first = createDeferred()
    const calls = []
    let callCount = 0
    const submittedOnRangePlan = vi.fn()
    const mutatedOnRangePlan = vi.fn()
    const queuedOptions = {
      rangePolicy: {
        limits: { maxDisplayPoints: 64 },
      },
      requestMetadata: {
        label: 'submitted',
      },
      onRangePlan: submittedOnRangePlan,
    }
    const calculationClient = {
      calculateAttackBatch: vi.fn((entries, options) => {
        calls.push({ entries, options })
        callCount += 1
        if (callCount === 2) {
          options.onRangePlan({ id: 'latest-plan' })
        }
        return callCount === 1
          ? first.promise
          : Promise.resolve(createBatch(['first', 'second'], 'latest'))
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: vi.fn(createPresentation),
    })

    const firstRequest = runner.run()
    const latestRequest = runner.run(queuedOptions)

    state.combos[0].data.params.action.score.dice = 99
    state.combos.splice(1, 1)
    queuedOptions.rangePolicy.limits.maxDisplayPoints = 8
    queuedOptions.requestMetadata.label = 'mutated after submit'
    queuedOptions.onRangePlan = mutatedOnRangePlan

    first.resolve(createBatch(['first', 'second'], 'old'))
    await Promise.all([firstRequest, latestRequest])

    expect(calls).toHaveLength(2)
    expect(calls[1].entries.map((entry) => entry.id))
      .toEqual(['first', 'second'])
    expect(calls[1].entries[0].params.action.score.dice).toBe(1)
    expect(calls[1].options.rangePolicy).toEqual({
      limits: { maxDisplayPoints: 64 },
    })
    expect(calls[1].options.requestMetadata).toEqual({ label: 'submitted' })
    expect(calls[1].options.signal).toBeInstanceOf(AbortSignal)
    expect(calls[1].options.onRangePlan).toBeTypeOf('function')
    expect(submittedOnRangePlan).toHaveBeenCalledWith({ id: 'latest-plan' })
    expect(mutatedOnRangePlan).not.toHaveBeenCalled()
    expect(state.totalDamageReady).toBe(false)
  })

  it('aborts and suppresses stale results during rapid changes', async () => {
    const state = createState()
    const first = createDeferred()
    const secondBatch = createBatch(['first', 'second'], 'second')
    const signals = []
    let callCount = 0
    const createPresentationSpy = vi.fn(createPresentation)
    const calculationClient = {
      calculateAttackBatch: vi.fn((_entries, options) => {
        signals.push(options.signal)
        callCount += 1
        if (callCount === 1) {
          return first.promise
        }
        options.onRangePlan({ id: 'second-first-plan' })
        options.onRangePlan({ id: 'second-second-plan' })
        return Promise.resolve(secondBatch)
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: createPresentationSpy,
    })

    const firstRequest = runner.run()
    state.combos[0].data.params.action.score.dice = 7
    const secondRequest = runner.run()
    first.resolve(createBatch(['first', 'second'], 'first'))
    await Promise.all([firstRequest, secondRequest])

    expect(signals[0].aborted).toBe(true)
    expect(createPresentationSpy).toHaveBeenCalledOnce()
    expect(state.combos[0].data.damage.value).toBe('damage-second-0')
  })

  it('clears canonical state and ignores a late result after invalidation', async () => {
    const state = createState()
    const deferred = createDeferred()
    const presentation = vi.fn(createPresentation)
    let signal
    const runner = createAttackRunner({
      state,
      calculationClient: {
        calculateAttackBatch: vi.fn((_entries, options) => {
          signal = options.signal
          return deferred.promise
        }),
      },
      createPresentation: presentation,
    })

    const request = runner.run()
    runner.invalidate()
    clearAttackState(state)
    deferred.resolve(createBatch(['first', 'second']))
    await request

    expect(signal.aborted).toBe(true)
    expect(presentation).not.toHaveBeenCalled()
    expect(state.totalDamageReady).toBe(false)
    expect(state.feedback.status).toBe('idle')
    expect(state.combos.every(({ data }) => !data.resultReady))
      .toBe(true)
  })

  it('exposes dispose for unmount lifecycle cancellation', async () => {
    const state = createState()
    const deferred = createDeferred()
    const presentation = vi.fn(createPresentation)
    const runner = createAttackRunner({
      state,
      calculationClient: {
        calculateAttackBatch: vi.fn(() => deferred.promise),
      },
      createPresentation: presentation,
    })

    const request = runner.run()
    runner.dispose()
    deferred.resolve(createBatch(['first', 'second'], 'disposed'))

    await expect(request).resolves.toBe(false)
    expect(presentation).not.toHaveBeenCalled()
    await expect(runner.run()).resolves.toBe(false)
  })

  it('clears result fields on range reject and generic errors', async () => {
    const rangeError = Object.assign(new Error('range rejected'), {
      name: 'CalculationRangeError',
      plan: { accepted: false, warnings: [{ code: 'reject' }] },
    })
    const state = createState([combo('first')])
    state.totalDamage = { value: 'old total' }
    state.totalDamageSummary = { value: 'old total summary' }
    state.totalDamageReady = true
    state.combos[0].data.score = legacyScore
    state.combos[0].data.damage = legacyDamage
    state.combos[0].data.resultReady = true
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (_entries, options) => {
        options.onRangePlan(rangeError.plan)
        throw rangeError
      }),
    }
    const runner = createAttackRunner({ state, calculationClient })

    await runner.run()

    expect(state.feedback.status).toBe('rejected')
    expect(state.totalDamageReady).toBe(false)
    expect(state.totalDamage).toBeNull()
    expect(state.totalDamageSummary).toBeNull()
    expect(state.combos[0].data.score).toBeNull()
    expect(state.combos[0].data.damage).toBeNull()
    expect(state.combos[0].data.resultReady).toBe(false)

    const genericError = new Error('canonical failed')
    calculationClient.calculateAttackBatch.mockRejectedValueOnce(
      genericError
    )
    await runner.run()

    expect(state.feedback.status).toBe('error')
    expect(state.totalDamageReady).toBe(false)
    expect(state.totalDamage).toBeNull()
    expect(state.totalDamageSummary).toBeNull()
    expect(state.combos[0].data.resultReady).toBe(false)

    const resourceError = Object.assign(new Error('resource rejected'), {
      name: 'ResourceGuardError',
    })
    calculationClient.calculateAttackBatch.mockRejectedValueOnce(
      resourceError
    )
    await runner.run()

    expect(state.feedback.status).toBe('error')
    expect(state.totalDamageReady).toBe(false)
    expect(state.totalDamage).toBeNull()
    expect(state.totalDamageSummary).toBeNull()
    expect(state.combos[0].data.resultReady).toBe(false)
  })

  it('clears presentation failures and retries successfully on the same runner', async () => {
    const state = createState([combo('first')])
    const batch = createBatch(['first'])
    const presentationError = new Error('presentation failed')
    const onError = vi.fn()
    const createPresentationSpy = vi
      .fn()
      .mockImplementationOnce(() => {
        throw presentationError
      })
      .mockImplementationOnce(createPresentation)
    const calculationClient = {
      calculateAttackBatch: vi.fn().mockResolvedValue(batch),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: createPresentationSpy,
      onError,
    })

    await expect(runner.run()).resolves.toBe(false)
    expect(onError).toHaveBeenCalledWith(presentationError)
    expect(state.feedback.status).toBe('error')
    expect(state.totalDamageReady).toBe(false)
    expect(state.combos[0].data.resultReady).toBe(false)

    await expect(runner.run()).resolves.toBe(true)
    expect(calculationClient.calculateAttackBatch).toHaveBeenCalledTimes(2)
    expect(state.feedback.status).toBe('ready')
    expect(state.totalDamageReady).toBe(true)
    expect(state.combos[0].data.resultReady).toBe(true)
  })

  it('commits the canonical zero identity for an empty combo list', async () => {
    const state = createState([])
    const batch = createBatch([])
    const calculationClient = {
      calculateAttackBatch: vi.fn(async (entries, options) => {
        expect(entries).toEqual([])
        expect(options.onRangePlan).toBeTypeOf('function')
        return batch
      }),
    }
    const runner = createAttackRunner({
      state,
      calculationClient,
      createPresentation: vi.fn(createPresentation),
    })

    await expect(runner.run()).resolves.toBe(true)

    expect(state.totalDamageReady).toBe(true)
    expect(state.combos).toEqual([])
  })
})
