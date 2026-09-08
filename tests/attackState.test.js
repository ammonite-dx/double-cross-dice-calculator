import { describe, expect, it } from 'vitest'

import {
  areAttackEntriesEqual,
  clearAttackState,
  commitAttackCalculationExecution,
  commitAttackPresentation,
  createAttackState,
  createComboDataState,
  ensureComboData,
  getAttackCalculationRecords,
  invalidateAttackComboCalculation,
  invalidateAttackTotalCalculation,
  isAttackCalculationReady,
  isAttackInputCurrent,
  snapshotAttackEntries,
  snapshotAttackParams,
} from '../src/features/attack/model/AttackState'
import {
  createAttackCalculationRecord,
  createAttackTotalCalculationRecord,
} from '../src/features/attack/model/AttackCalculationRecord'

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

function createExecution(ids = ['first', 'second']) {
  const results = ids.map((id, index) => ({
    score: { value: `score-${index}` },
    scoreStatistics: { value: `score-summary-${index}` },
    damage: { value: `damage-${index}` },
    damageStatistics: { value: `damage-summary-${index}` },
  }))
  const records = ids.map((id, index) => ({
    id,
    record: createAttackCalculationRecord(
      params(index),
      results[index],
      { id: `${id}-plan`, warnings: [] }
    ),
  }))
  const totalResult = {
    totalDamage: { value: 'total' },
    totalDamageStatistics: { value: 'total-summary' },
  }
  return {
    records,
    rangePlans: records.map(({ record }) => record.rangePlan),
    totalCalculation: createAttackTotalCalculationRecord(
      records,
      totalResult
    ),
    batchResult: {
      combos: records.map(({ id, record }) => ({ id, ...record.result })),
      ...totalResult,
    },
  }
}

function createDisplayPresentation(ids = ['first', 'second']) {
  return {
    displayRequest: { min: 0, max: 10, mode: 'pmf' },
    combos: ids.map((id) => ({ id, display: {}, plan: {} })),
    total: { display: {}, plan: {} },
    score: null,
  }
}

describe('AttackState', () => {
  it('keeps only the current calculation and presentation ownership fields', () => {
    const state = createAttackState()

    expect(Object.keys(state)).toEqual([
      'totalCalculation',
      'basePresentation',
      'displayPresentation',
      'generation',
      'feedback',
      'scoreDisplayFeedback',
      'displayFeedback',
    ])
    for (const mirror of [
      'totalDamage',
      'totalDamageStatistics',
      'totalDamagePresentation',
      'totalDamageReady',
      'scoreDisplayPresentation',
    ]) {
      expect(state).not.toHaveProperty(mirror)
    }
    expect(createComboDataState()).toEqual({ calculation: null })
  })

  it('adds only the calculation field when normalizing combo data', () => {
    const data = { label: 'owned by the input form' }

    expect(ensureComboData(data)).toBe(data)
    expect(data).toEqual({
      label: 'owned by the input form',
      calculation: null,
    })
  })

  it('snapshots calculation inputs without retaining nested aliases', () => {
    const source = params()
    const snapshot = snapshotAttackParams(source)

    source.action.score.dice = 99
    source.action.damage.value = 999
    source.reaction.mode = 'changed'

    expect(snapshot).toEqual(params())
    expect(snapshot).not.toBe(source)
    expect(snapshot.action.score).not.toBe(source.action.score)
    expect(snapshot.action.damage).not.toBe(source.action.damage)
    expect(snapshot.reaction).not.toBe(source.reaction)
  })

  it('snapshots combo order and calculation inputs', () => {
    const combos = [combo('a'), combo('b'), combo('c')]
    const entries = snapshotAttackEntries(combos)

    combos.reverse()
    combos[0].data.params.action.score.dice = 99

    expect(entries.map(({ id }) => id)).toEqual(['a', 'b', 'c'])
    expect(entries[0].params.action.score.dice).toBe(1)
    expect(areAttackEntriesEqual(
      entries,
      snapshotAttackEntries([combo('a'), combo('b'), combo('c')])
    )).toBe(true)
    expect(isAttackInputCurrent(combos, entries)).toBe(false)
  })

  it('commits a complete incremental calculation atomically', () => {
    const state = createState()
    const execution = createExecution()

    expect(commitAttackCalculationExecution(
      state,
      state.generation,
      execution
    )).toBe(true)
    expect(getAttackCalculationRecords(state.combos).map(({ id }) => id))
      .toEqual(['first', 'second'])
    expect(state.combos[0].data.calculation).toBe(execution.records[0].record)
    expect(state.combos[1].data.calculation).toBe(execution.records[1].record)
    expect(state.totalCalculation).toBe(execution.totalCalculation)
    expect(state.basePresentation).toBeNull()
    expect(state.displayPresentation).toBeNull()
    expect(isAttackCalculationReady(state)).toBe(true)
  })

  it('rejects stale or malformed executions before writing records', () => {
    const cases = [
      {
        name: 'stale generation',
        mutate: ({ state }) => { state.generation += 1 },
      },
      {
        name: 'wrong combo id',
        mutate: ({ execution }) => { execution.records[0].id = 'wrong' },
      },
      {
        name: 'missing total result',
        mutate: ({ execution }) => {
          execution.totalCalculation = {
            ...execution.totalCalculation,
            result: null,
          }
        },
      },
      {
        name: 'wrong source record',
        mutate: ({ execution }) => {
          execution.totalCalculation = {
            ...execution.totalCalculation,
            sources: [
              { id: 'first', record: {} },
              execution.totalCalculation.sources[1],
            ],
          }
        },
      },
    ]

    for (const testCase of cases) {
      const state = createState()
      const execution = createExecution()
      testCase.mutate({ state, execution })

      expect(commitAttackCalculationExecution(
        state,
        0,
        execution
      ), testCase.name).toBe(false)
      expect(state.combos.every(({ data }) => data.calculation === null))
        .toBe(true)
      expect(state.totalCalculation).toBeNull()
    }
  })

  it('commits display presentation without replacing calculation records', () => {
    const state = createState()
    const execution = createExecution()
    commitAttackCalculationExecution(state, state.generation, execution)
    const base = { kind: 'base' }
    const display = createDisplayPresentation()

    expect(commitAttackPresentation(
      state,
      state.generation,
      base,
      display
    )).toBe(true)
    expect(state.combos[0].data.calculation).toBe(execution.records[0].record)
    expect(state.totalCalculation).toBe(execution.totalCalculation)
    expect(state.basePresentation).toBe(base)
    expect(state.displayPresentation).toBe(display)
    expect(state).not.toHaveProperty('scoreDisplayPresentation')
  })

  it('rejects a mismatched presentation without changing calculation state', () => {
    const state = createState()
    const execution = createExecution()
    commitAttackCalculationExecution(state, state.generation, execution)
    const previousBase = { kind: 'previous-base' }
    const previousDisplay = createDisplayPresentation()
    state.basePresentation = previousBase
    state.displayPresentation = previousDisplay
    const invalidDisplay = createDisplayPresentation()
    invalidDisplay.combos[1].id = 'wrong'

    expect(commitAttackPresentation(
      state,
      state.generation,
      { kind: 'new-base' },
      invalidDisplay
    )).toBe(false)
    expect(state.totalCalculation).toBe(execution.totalCalculation)
    expect(state.basePresentation).toBe(previousBase)
    expect(state.displayPresentation).toBe(previousDisplay)
  })

  it('invalidates one combo and then the aggregate without touching other records', () => {
    const state = createState()
    const execution = createExecution()
    commitAttackCalculationExecution(state, state.generation, execution)
    const unaffected = state.combos[1].data.calculation

    expect(invalidateAttackComboCalculation(state, 'first')).toBe(true)
    expect(state.combos[0].data.calculation).toBeNull()
    expect(state.combos[1].data.calculation).toBe(unaffected)
    expect(invalidateAttackTotalCalculation(state)).toBe(true)
    expect(state.totalCalculation).toBeNull()
    expect(state.basePresentation).toBeNull()
    expect(state.displayPresentation).toBeNull()
    expect(state.combos[1].data.calculation).toBe(unaffected)
    expect(isAttackCalculationReady(state)).toBe(false)
  })

  it('clears all calculation and presentation state while preserving input combos', () => {
    const state = createState()
    const execution = createExecution()
    commitAttackCalculationExecution(state, state.generation, execution)
    state.basePresentation = { kind: 'base' }
    state.displayPresentation = createDisplayPresentation()
    const generation = state.generation

    expect(clearAttackState(state)).toBe(generation + 1)
    expect(state.generation).toBe(generation + 1)
    expect(state.totalCalculation).toBeNull()
    expect(state.basePresentation).toBeNull()
    expect(state.displayPresentation).toBeNull()
    expect(state.combos.every(({ data }) => data.calculation === null))
      .toBe(true)
  })
})
