import { describe, expect, it, vi } from 'vitest'

import {
  clearCanonicalAttackState,
  commitCanonicalAttackResult,
  createCanonicalAttackState,
  createCanonicalComboDataState,
  snapshotCanonicalAttackEntries,
} from '../src/application/AttackCanonicalState'
import { createAttackCanonicalRunner } from '../src/application/AttackCanonicalRunner'

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
      score: legacyScore,
      scoreSummary: { value: 'legacy score summary' },
      damage: legacyDamage,
      damageSummary: { value: 'legacy damage summary' },
      resultReady: true,
      ...createCanonicalComboDataState(),
    },
  }
}

function createState(combos = [combo('first', 0), combo('second', 1)]) {
  return {
    ...createCanonicalAttackState(),
    canonicalOptIn: true,
    combos,
    totalDamage: { value: 'legacy total' },
    totalDamageSummary: { value: 'legacy total summary' },
    totalDamageReady: true,
  }
}

function createBatch(ids, suffix = 'result') {
  return {
    combos: ids.map((id, index) => ({
      id,
      score: { value: `score-${suffix}-${index}` },
      scoreSummary: { value: `score-summary-${suffix}-${index}` },
      canonicalDamage: { value: `damage-${suffix}-${index}` },
      canonicalDamageSummary: { value: `damage-summary-${suffix}-${index}` },
    })),
    canonicalTotalDamage: { value: `total-${suffix}` },
    canonicalTotalDamageSummary: { value: `total-summary-${suffix}` },
  }
}

function createPresentation(batch, plans) {
  return {
    combos: batch.combos.map((entry, index) => ({
      id: entry.id,
      canonicalDamagePresentation: {
        value: `presentation-${index}`,
      },
      canonicalRangePlan: plans[index],
    })),
    canonicalTotalDamage: batch.canonicalTotalDamage,
    canonicalTotalDamageSummary: batch.canonicalTotalDamageSummary,
    canonicalTotalDamagePresentation: {
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

describe('AttackCanonicalState', () => {
  it('snapshots params and prevents nested input aliases', () => {
    const sourceParams = params()
    const entries = snapshotCanonicalAttackEntries([{
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

    expect(snapshotCanonicalAttackEntries(state.combos).map((entry) => entry.id))
      .toEqual(['copy', 'c', 'a'])
  })

  it('commits complete batch and presentation payloads atomically', () => {
    const state = createState()
    const generation = state.canonicalGeneration
    const batch = createBatch(['first', 'second'])
    const plans = [{ id: 'first-plan' }, { id: 'second-plan' }]
    const presentation = createPresentation(batch, plans)

    expect(commitCanonicalAttackResult(
      state,
      generation,
      batch,
      presentation
    )).toBe(true)
    expect(state.combos.map(({ data }) => data.canonicalResultReady))
      .toEqual([true, true])
    expect(state.combos[0].data.canonicalRangePlan).toBe(plans[0])
    expect(state.combos[1].data.canonicalDamage).toBe(
      batch.combos[1].canonicalDamage
    )
    expect(state.canonicalTotalDamageReady).toBe(true)
    expect(state.totalDamage).toEqual({ value: 'legacy total' })
    expect(state.totalDamageSummary).toEqual({ value: 'legacy total summary' })
    expect(state.combos[0].data.damage).toBe(legacyDamage)
  })

  it('rejects a stale generation without exposing partial combo state', () => {
    const state = createState()
    const batch = createBatch(['first', 'second'])
    const presentation = createPresentation(batch, [{}, {}])
    const generation = state.canonicalGeneration

    clearCanonicalAttackState(state)

    expect(commitCanonicalAttackResult(
      state,
      generation,
      batch,
      presentation
    )).toBe(false)
    expect(state.canonicalTotalDamageReady).toBe(false)
    expect(state.combos.every(({ data }) => !data.canonicalResultReady))
      .toBe(true)
  })

  it('rejects a mismatched presentation before writing any combo', () => {
    const state = createState()
    const batch = createBatch(['first', 'second'])
    const presentation = createPresentation(batch, [{}, {}])
    presentation.combos[1].id = 'wrong-id'

    expect(commitCanonicalAttackResult(
      state,
      state.canonicalGeneration,
      batch,
      presentation
    )).toBe(false)
    expect(state.canonicalTotalDamageReady).toBe(false)
    expect(state.combos.every(({ data }) => !data.canonicalResultReady))
      .toBe(true)
  })
})

describe('createAttackCanonicalRunner', () => {
  it('keeps the canonical API completely off by default', async () => {
    const state = createState()
    state.canonicalOptIn = false
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(),
    }
    const runner = createAttackCanonicalRunner({ state, calculationClient })

    await expect(runner.run()).resolves.toBe(false)
    expect(calculationClient.calculateAttackCanonicalBatch).not.toHaveBeenCalled()
  })

  it('takes one ordered batch, collects plans, presents once, and commits once', async () => {
    const state = createState()
    const firstPlan = { id: 'plan-first' }
    const secondPlan = { id: 'plan-second' }
    const batch = createBatch(['first', 'second'])
    const createPresentationSpy = vi.fn(createPresentation)
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(async (entries, options) => {
        expect(entries.map((entry) => entry.id)).toEqual(['first', 'second'])
        expect(entries[0].params.action.score.dice).toBe(1)
        expect(entries[1].params.action.score.dice).toBe(2)
        options.onRangePlan(firstPlan)
        options.onRangePlan(secondPlan)
        return batch
      }),
    }
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient,
      createPresentation: createPresentationSpy,
    })

    await expect(runner.run()).resolves.toBe(true)

    expect(calculationClient.calculateAttackCanonicalBatch).toHaveBeenCalledOnce()
    expect(createPresentationSpy).toHaveBeenCalledOnce()
    expect(createPresentationSpy).toHaveBeenCalledWith(
      batch,
      [firstPlan, secondPlan]
    )
    expect(state.canonicalTotalDamageReady).toBe(true)
    expect(state.combos.map(({ data }) => data.canonicalRangePlan))
      .toEqual([firstPlan, secondPlan])
  })

  it('does not commit an old deferred result after input changes before the next run', async () => {
    const state = createState()
    const deferred = createDeferred()
    const presentation = vi.fn(createPresentation)
    let requestedEntries
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn((entries) => {
        requestedEntries = entries
        return deferred.promise
      }),
    }
    const runner = createAttackCanonicalRunner({
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
    expect(state.canonicalTotalDamageReady).toBe(false)
    expect(state.combos.every(({ data }) => !data.canonicalResultReady))
      .toBe(true)
  })

  it('aborts and suppresses stale results during rapid changes', async () => {
    const state = createState()
    const first = createDeferred()
    const secondBatch = createBatch(['first', 'second'], 'second')
    const signals = []
    let callCount = 0
    const createPresentationSpy = vi.fn(createPresentation)
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn((_entries, options) => {
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
    const runner = createAttackCanonicalRunner({
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
    expect(state.combos[0].data.canonicalDamage.value).toBe('damage-second-0')
  })

  it('clears canonical state and ignores a late result after disable', async () => {
    const state = createState()
    const deferred = createDeferred()
    const presentation = vi.fn(createPresentation)
    let signal
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient: {
        calculateAttackCanonicalBatch: vi.fn((_entries, options) => {
          signal = options.signal
          return deferred.promise
        }),
      },
      createPresentation: presentation,
    })

    const request = runner.run()
    runner.invalidate()
    clearCanonicalAttackState(state)
    deferred.resolve(createBatch(['first', 'second']))
    await request

    expect(signal.aborted).toBe(true)
    expect(presentation).not.toHaveBeenCalled()
    expect(state.canonicalTotalDamageReady).toBe(false)
    expect(state.canonicalFeedback.status).toBe('idle')
    expect(state.combos.every(({ data }) => !data.canonicalResultReady))
      .toBe(true)
  })

  it('keeps legacy fields unchanged on range reject and generic errors', async () => {
    const legacySnapshot = {
      totalDamage: { value: 'legacy total' },
      totalDamageSummary: { value: 'legacy total summary' },
      totalDamageReady: true,
      score: legacyScore,
      damage: legacyDamage,
      resultReady: true,
    }
    const rangeError = Object.assign(new Error('range rejected'), {
      name: 'CalculationRangeError',
      plan: { accepted: false, warnings: [{ code: 'reject' }] },
    })
    const state = createState([combo('first')])
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(async (_entries, options) => {
        options.onRangePlan(rangeError.plan)
        throw rangeError
      }),
    }
    const runner = createAttackCanonicalRunner({ state, calculationClient })

    await runner.run()

    expect(state.canonicalFeedback.status).toBe('rejected')
    expect(state.canonicalTotalDamageReady).toBe(false)
    expect(state.totalDamage).toEqual(legacySnapshot.totalDamage)
    expect(state.totalDamageSummary).toEqual(legacySnapshot.totalDamageSummary)
    expect(state.totalDamageReady).toBe(legacySnapshot.totalDamageReady)
    expect(state.combos[0].data.score).toBe(legacySnapshot.score)
    expect(state.combos[0].data.damage).toBe(legacySnapshot.damage)
    expect(state.combos[0].data.resultReady).toBe(legacySnapshot.resultReady)

    state.canonicalOptIn = true
    const genericError = new Error('canonical failed')
    calculationClient.calculateAttackCanonicalBatch.mockRejectedValueOnce(
      genericError
    )
    await runner.run()

    expect(state.canonicalFeedback.status).toBe('error')
    expect(state.canonicalTotalDamageReady).toBe(false)
    expect(state.totalDamageReady).toBe(true)

    state.canonicalOptIn = true
    const resourceError = Object.assign(new Error('resource rejected'), {
      name: 'ResourceGuardError',
    })
    calculationClient.calculateAttackCanonicalBatch.mockRejectedValueOnce(
      resourceError
    )
    await runner.run()

    expect(state.canonicalFeedback.status).toBe('error')
    expect(state.canonicalTotalDamageReady).toBe(false)
    expect(state.totalDamageReady).toBe(true)
  })

  it('commits the canonical zero identity for an empty combo list', async () => {
    const state = createState([])
    const batch = createBatch([])
    const calculationClient = {
      calculateAttackCanonicalBatch: vi.fn(async (entries, options) => {
        expect(entries).toEqual([])
        expect(options.onRangePlan).toBeTypeOf('function')
        return batch
      }),
    }
    const runner = createAttackCanonicalRunner({
      state,
      calculationClient,
      createPresentation: vi.fn(createPresentation),
    })

    await expect(runner.run()).resolves.toBe(true)

    expect(state.canonicalTotalDamageReady).toBe(true)
    expect(state.combos).toEqual([])
  })
})
