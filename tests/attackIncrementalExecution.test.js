import { describe, expect, it, vi } from 'vitest'

import {
  areAttackCalculationInputsEqual,
  createAttackCalculationRecord,
  createAttackTotalCalculationRecord,
} from '../src/features/attack/model/AttackCalculationRecord'
import {
  executeAttackIncrementally,
  planAttackExecution,
} from '../src/features/attack/model/AttackIncrementalExecution'

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
      damage: { dice: seed, value: 10 + seed, kazanari: 0 },
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

function result(label) {
  return {
    score: { action: { label }, reaction: { label } },
    scoreStatistics: { action: { label }, reaction: { label } },
    damage: { kind: 'finite', label },
    damageStatistics: { expectedValue: { kind: 'exact', value: 0 } },
  }
}

function entries(ids = ['a', 'b']) {
  return ids.map((id, index) => ({ id, params: params(index) }))
}

function createClient() {
  const calculateAttack = vi.fn(async (input) => result(
    `attack-${input.action.score.dice}`
  ))
  const calculateTotalDamage = vi.fn(async (damages) => ({
    totalDamage: { kind: 'finite', labels: damages.map((damage) => damage.label) },
    totalDamageStatistics: { expectedValue: { kind: 'exact', value: damages.length } },
  }))
  return { calculateAttack, calculateTotalDamage }
}

describe('AttackCalculationRecord', () => {
  it('detaches and freezes the calculation input without freezing the result', () => {
    const input = params(2)
    const value = result('value')
    const record = createAttackCalculationRecord(input, value, { warnings: [] })

    expect(record).not.toBe(input)
    expect(record.input).not.toBe(input)
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.input)).toBe(true)
    expect(Object.isFrozen(record.input.action)).toBe(true)
    expect(Object.isFrozen(record.input.action.score)).toBe(true)
    expect(record.result).toBe(value)
    expect(Object.isFrozen(value)).toBe(false)

    input.action.score.dice = 99
    expect(record.input.action.score.dice).toBe(3)
  })

  it('compares only stable calculation fields', () => {
    const left = params(1)
    const right = params(1)
    expect(areAttackCalculationInputsEqual(left, right)).toBe(true)
    right.action.damage.value += 1
    expect(areAttackCalculationInputsEqual(left, right)).toBe(false)
  })

  it('freezes ordered total sources', () => {
    const first = createAttackCalculationRecord(params(), result('a'), {})
    const second = createAttackCalculationRecord(params(1), result('b'), {})
    const total = createAttackTotalCalculationRecord(
      [{ id: 'a', record: first }, { id: 'b', record: second }],
      { totalDamage: {}, totalDamageStatistics: {} }
    )

    expect(Object.isFrozen(total)).toBe(true)
    expect(Object.isFrozen(total.sources)).toBe(true)
    expect(total.sources.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(total.sources[0].record).toBe(first)
  })
})

describe('executeAttackIncrementally', () => {
  it('calculates every combo initially and aggregates once', async () => {
    const client = createClient()
    const execution = await executeAttackIncrementally({
      entries: entries(),
      calculationClient: client,
    })

    expect(client.calculateAttack).toHaveBeenCalledTimes(2)
    expect(client.calculateTotalDamage).toHaveBeenCalledTimes(1)
    expect(execution.records).toHaveLength(2)
    expect(execution.totalCalculation.sources.map(({ id }) => id))
      .toEqual(['a', 'b'])
    expect(execution.batchResult.combos.map(({ id }) => id))
      .toEqual(['a', 'b'])
  })

  it('keeps requested combo ids when a calculation result contains an id', async () => {
    const client = createClient()
    client.calculateAttack.mockImplementation(async (input) => ({
      ...result(`attack-${input.action.score.dice}`),
      id: 'source-result-id',
    }))

    const execution = await executeAttackIncrementally({
      entries: entries(),
      calculationClient: client,
    })

    expect(execution.batchResult.combos.map(({ id }) => id))
      .toEqual(['a', 'b'])
  })

  it('reuses unchanged records and recalculates only a changed combo', async () => {
    const client = createClient()
    const initial = await executeAttackIncrementally({
      entries: entries(),
      calculationClient: client,
    })
    client.calculateAttack.mockClear()
    client.calculateTotalDamage.mockClear()

    const changedEntries = entries()
    changedEntries[0] = { id: 'a', params: params(4) }
    const next = await executeAttackIncrementally({
      entries: changedEntries,
      committedRecords: initial.records,
      calculationClient: client,
    })

    expect(client.calculateAttack).toHaveBeenCalledTimes(1)
    expect(client.calculateAttack.mock.calls[0][0].action.score.dice)
      .toBe(5)
    expect(client.calculateTotalDamage).toHaveBeenCalledTimes(1)
    expect(next.records[1].record).toBe(initial.records[1].record)
    expect(next.records[0].record).not.toBe(initial.records[0].record)
  })

  it('calculates only a new id when a combo is added or duplicated', async () => {
    const client = createClient()
    const initial = await executeAttackIncrementally({
      entries: entries(['a', 'b']),
      calculationClient: client,
    })
    client.calculateAttack.mockClear()

    const added = await executeAttackIncrementally({
      entries: [...entries(['a', 'b']), { id: 'c', params: params(3) }],
      committedRecords: initial.records,
      calculationClient: client,
    })
    expect(client.calculateAttack).toHaveBeenCalledTimes(1)
    expect(client.calculateAttack.mock.calls[0][0].action.score.dice)
      .toBe(4)
    expect(added.records[0].record).toBe(initial.records[0].record)
    expect(added.records[1].record).toBe(initial.records[1].record)

    client.calculateAttack.mockClear()
    const duplicated = await executeAttackIncrementally({
      entries: [...entries(['a', 'b']), { id: 'copy', params: params(0) }],
      committedRecords: initial.records,
      calculationClient: client,
    })
    expect(client.calculateAttack).toHaveBeenCalledTimes(1)
    expect(duplicated.records[0].record).toBe(initial.records[0].record)
  })

  it('does not recalculate remaining combos when one is removed', async () => {
    const client = createClient()
    const initial = await executeAttackIncrementally({
      entries: entries(['a', 'b', 'c']),
      calculationClient: client,
    })
    client.calculateAttack.mockClear()

    const next = await executeAttackIncrementally({
      entries: [
        { id: 'a', params: params(0) },
        { id: 'c', params: params(2) },
      ],
      committedRecords: initial.records,
      calculationClient: client,
    })
    expect(client.calculateAttack).not.toHaveBeenCalled()
    expect(next.records[0].record).toBe(initial.records[0].record)
    expect(next.records[1].record).toBe(initial.records[2].record)
  })

  it('marks only the changed entry for calculation in the pure plan', async () => {
    const client = createClient()
    const initial = await executeAttackIncrementally({
      entries: entries(),
      calculationClient: client,
    })
    const changed = entries()
    changed[0] = { id: 'a', params: params(8) }
    expect(planAttackExecution(changed, initial.records)
      .map(({ id, action }) => ({ id, action })))
      .toEqual([
        { id: 'a', action: 'calculate' },
        { id: 'b', action: 'reuse' },
      ])
  })

  it('retains combo context when a combo calculation fails', async () => {
    const error = new Error('combo failed')
    const client = createClient()
    client.calculateAttack.mockRejectedValueOnce(error)

    await expect(executeAttackIncrementally({
      entries: entries(),
      calculationClient: client,
    })).rejects.toMatchObject({
      attackExecutionStage: 'combo',
      attackExecutionEntryId: 'a',
    })
    expect(client.calculateTotalDamage).not.toHaveBeenCalled()
  })

  it('marks total aggregation failures separately for total-only retry', async () => {
    const client = createClient()
    const error = new Error('total failed')
    client.calculateTotalDamage.mockRejectedValueOnce(error)

    await expect(executeAttackIncrementally({
      entries: entries(),
      calculationClient: client,
    })).rejects.toMatchObject({
      attackExecutionStage: 'total',
      attackExecutionEntryId: null,
    })
    expect(client.calculateAttack).toHaveBeenCalledTimes(2)
  })
})
