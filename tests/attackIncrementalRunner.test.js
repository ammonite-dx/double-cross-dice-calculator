import { describe, expect, it, vi } from 'vitest'

import { executeAttackIncrementally } from '../src/features/attack/model/AttackIncrementalExecution'
import { createAttackRunner } from '../src/features/attack/model/AttackRunner'
import {
  createAttackState,
  createComboDataState,
  getAttackCalculationRecords,
} from '../src/features/attack/model/AttackState'

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
      damage: { dice: 0, value: 1 + seed, kazanari: 0 },
    },
    reaction: {
      mode: 'ドッジ',
      score: {
        dice: 1,
        critical: 10,
        skill: 0,
        yousei: 0,
        shihai: 0,
      },
      damage: { dice: 0, value: 0 },
    },
  }
}

function createState() {
  return {
    ...createAttackState(),
    combos: ['a', 'b'].map((id, index) => ({
      id,
      data: {
        params: params(index),
        ...createComboDataState(),
      },
    })),
  }
}

function createClient() {
  const calculateAttack = vi.fn(async (input) => ({
    score: { action: {}, reaction: {} },
    scoreStatistics: { action: {}, reaction: {} },
    damage: { kind: 'finite', id: input.action.score.dice },
    damageStatistics: {},
  }))
  const calculateTotalDamage = vi.fn(async (damages) => ({
    totalDamage: { kind: 'finite', ids: damages.map(({ id }) => id) },
    totalDamageStatistics: {},
  }))
  return { calculateAttack, calculateTotalDamage }
}

function createRunner(state, calculationClient, createPresentation = null) {
  return createAttackRunner({
    state,
    calculationClient,
    executeCalculation: ({ entries, calculationOptions, signal, onRangePlan, forceAll }) =>
      executeAttackIncrementally({
        entries,
        committedRecords: getAttackCalculationRecords(state.combos),
        calculationClient,
        options: { ...calculationOptions, signal },
        onRangePlan,
        forceAll,
      }),
    createPresentation: createPresentation ?? ((batch) => ({
      kind: 'display',
      batch,
    })),
    createBasePresentation: (batch) => ({
      kind: 'base',
      batch,
    }),
  })
}

describe('incremental Attack runner ownership', () => {
  it('retains unaffected records when one combo fails and retries only that combo', async () => {
    const state = createState()
    const client = createClient()
    const runner = createRunner(state, client)

    await expect(runner.run()).resolves.toBe(true)
    const unaffected = state.combos[1].data.calculation
    const error = new Error('combo failed')
    client.calculateAttack.mockRejectedValueOnce(error)
    state.combos[0].data.params.action.score.dice = 9

    await expect(runner.run()).resolves.toBe(false)
    expect(state.combos[0].data.calculation).toBeNull()
    expect(state.combos[1].data.calculation).toBe(unaffected)
    expect(state.totalCalculation).toBeNull()

    await expect(runner.run()).resolves.toBe(true)
    expect(client.calculateAttack).toHaveBeenCalledTimes(4)
    expect(state.combos[1].data.calculation).toBe(unaffected)
    expect(state.totalCalculation).not.toBeNull()
    runner.dispose()
  })

  it('retries total aggregation without recalculating combo records', async () => {
    const state = createState()
    const client = createClient()
    const runner = createRunner(state, client)

    await expect(runner.run()).resolves.toBe(true)
    const records = state.combos.map(({ data }) => data.calculation)
    client.calculateTotalDamage.mockRejectedValueOnce(new Error('total failed'))

    await expect(runner.run()).resolves.toBe(false)
    expect(state.combos.map(({ data }) => data.calculation))
      .toEqual(records)
    expect(state.totalCalculation).toBeNull()
    const attackCalls = client.calculateAttack.mock.calls.length

    await expect(runner.run()).resolves.toBe(true)
    expect(client.calculateAttack.mock.calls.length).toBe(attackCalls)
    expect(client.calculateTotalDamage).toHaveBeenCalledTimes(3)
    runner.dispose()
  })

  it('retains calculation records when presentation creation fails', async () => {
    const state = createState()
    const client = createClient()
    const presentationError = new Error('presentation failed')
    const createPresentation = vi
      .fn()
      .mockImplementationOnce(() => {
        throw presentationError
      })
      .mockImplementation((batch) => ({ kind: 'display', batch }))
    const runner = createRunner(state, client, createPresentation)

    await expect(runner.run()).resolves.toBe(false)
    expect(state.combos.every(({ data }) => data.calculation === null))
      .toBe(true)
    expect(state.totalCalculation).toBeNull()
    expect(state.displayPresentation).toBeNull()

    await expect(runner.run()).resolves.toBe(true)
    expect(state.combos.every(({ data }) => data.calculation !== null))
      .toBe(true)
    runner.dispose()
  })
})
