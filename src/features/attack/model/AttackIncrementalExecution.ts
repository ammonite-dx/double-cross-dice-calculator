import {
  areAttackCalculationInputsEqual,
  createAttackCalculationRecord,
  createAttackTotalCalculationRecord,
} from './AttackCalculationRecord'
import type {
  AttackExecutionEntry,
  AttackCommittedRecord,
  AttackExecutionPlanItem,
  AttackIncrementalExecutionRequest,
  AttackIncrementalExecution,
} from './AttackIncrementalExecutionTypes'
import type { AttackCalculationOptions } from '../../../runtime/CalculationClientTypes'
import type { CalculationRangePlan } from '../../../calculation/planning/RangePlannerTypes'
import type { AttackRangePlanFallback } from './AttackPresentationTypes'

/** @typedef {import('./AttackIncrementalExecutionTypes').AttackExecutionEntry} AttackExecutionEntry */
/** @typedef {import('./AttackIncrementalExecutionTypes').AttackCommittedRecord} AttackCommittedRecord */
/** @typedef {import('./AttackIncrementalExecutionTypes').AttackExecutionPlanItem} AttackExecutionPlanItem */
/** @typedef {import('./AttackIncrementalExecutionTypes').AttackIncrementalExecutionRequest} AttackIncrementalExecutionRequest */
/** @typedef {import('./AttackIncrementalExecutionTypes').AttackIncrementalExecution} AttackIncrementalExecution */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameId(left: unknown, right: unknown): boolean {
  return left === right
    || (typeof left === 'number'
      && typeof right === 'number'
      && Object.is(left, -0)
      && Object.is(right, 0))
    || (typeof left === 'number'
      && typeof right === 'number'
      && Object.is(left, 0)
      && Object.is(right, -0))
}

function findCommittedRecord(
  committedRecords: readonly AttackCommittedRecord[],
  id: string | number,
) {
  return committedRecords.find((entry) =>
    isRecord(entry)
    && sameId(entry.id, id)
    && isRecord(entry.record)
  )?.record ?? null
}

/**
 * Decide which ordered entries can reuse their committed calculation record.
 * This helper only compares stable ids and detached calculation inputs; it
 * deliberately ignores names, visibility, presentation, and display ranges.
 *
 * @param {ReadonlyArray<AttackExecutionEntry>} requestedEntries
 * @param {ReadonlyArray<AttackCommittedRecord>} committedRecords
 * @param {{ forceAll?: boolean }} options
 * @returns {ReadonlyArray<AttackExecutionPlanItem>}
 */
export function planAttackExecution(
  requestedEntries: readonly AttackExecutionEntry[],
  committedRecords: readonly AttackCommittedRecord[] = [],
  { forceAll = false }: { forceAll?: boolean } = {},
): readonly AttackExecutionPlanItem[] {
  if (!Array.isArray(requestedEntries)) {
    throw new TypeError('requestedEntries must be an array')
  }
  if (!Array.isArray(committedRecords)) {
    throw new TypeError('committedRecords must be an array')
  }

  return requestedEntries.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new TypeError(`requestedEntries[${index}] must be an object`)
    }
    const requestedEntry = entry as unknown as AttackExecutionEntry
    const record = forceAll ? null : findCommittedRecord(
      committedRecords,
      requestedEntry.id
    )
    const reusable = record !== null
      && areAttackCalculationInputsEqual(record.input, requestedEntry.params)
    return Object.freeze({
      id: requestedEntry.id,
      entry: requestedEntry,
      action: reusable ? 'reuse' : 'calculate',
      record: reusable ? record as NonNullable<typeof record> : null,
    })
  })
}

function withExecutionContext(
  error: unknown,
  entryId: string | number | null,
  stage: 'combo' | 'total',
): unknown {
  if (error === null || typeof error !== 'object') {
    return error
  }
  try {
    if (!Object.prototype.hasOwnProperty.call(error, 'attackExecutionStage')) {
      Object.defineProperty(error, 'attackExecutionStage', {
        configurable: true,
        enumerable: false,
        value: stage,
        writable: false,
      })
    }
    if (!Object.prototype.hasOwnProperty.call(error, 'attackExecutionEntryId')) {
      Object.defineProperty(error, 'attackExecutionEntryId', {
        configurable: true,
        enumerable: false,
        value: entryId,
        writable: false,
      })
    }
  } catch {
    // A frozen dependency error still carries its original type and message;
    // the executor will conservatively treat it as a whole-batch failure.
  }
  return error
}

function createFallbackRangePlan(): AttackRangePlanFallback {
  return Object.freeze({ warnings: Object.freeze([]) })
}

function assembleBatch(
  records: readonly AttackCommittedRecord[],
  totalResult: Awaited<ReturnType<AttackIncrementalExecutionRequest['calculationClient']['calculateTotalDamage']>>,
) {
  return {
    combos: records.map(({ id, record }) => ({
      ...record.result,
      // The requested stable combo id is authoritative. A calculation
      // result may carry an incidental id from a source batch, but it must
      // never overwrite the id used for state ownership and presentation
      // validation.
      id,
    })),
    totalDamage: totalResult.totalDamage,
    totalDamageStatistics: totalResult.totalDamageStatistics,
  }
}

/**
 * Execute only changed Attack combos, then aggregate the ordered damage
 * records. No state is mutated until the caller atomically commits the
 * returned execution object.
 *
 * @param {AttackIncrementalExecutionRequest} request
 * @returns {Promise<AttackIncrementalExecution>}
 */
export async function executeAttackIncrementally({
  entries,
  committedRecords = [],
  calculationClient,
  options = {},
  onRangePlan,
  forceAll = false,
}: AttackIncrementalExecutionRequest): Promise<AttackIncrementalExecution> {
  if (!isRecord(calculationClient)
    || typeof calculationClient.calculateAttack !== 'function'
    || typeof calculationClient.calculateTotalDamage !== 'function') {
    throw new TypeError(
      'executeAttackIncrementally requires calculateAttack and calculateTotalDamage'
    )
  }

  const executionPlan = planAttackExecution(
    entries,
    committedRecords,
    { forceAll }
  )
  const records: AttackCommittedRecord[] = []
  const rangePlans = []

  for (const item of executionPlan) {
    if (item.action === 'reuse') {
      const record = item.record
      if (record === null) {
        throw new Error('reuse execution item is missing its record')
      }
      records.push({ id: item.id, record })
      rangePlans.push(record.rangePlan)
      continue
    }

    let rangePlan = null
    const calculateOptions: AttackCalculationOptions = {
      ...options,
      onRangePlan: (plan: CalculationRangePlan) => {
        rangePlan = plan
        onRangePlan?.(plan, { entryId: item.id })
      },
    }
    let result
    try {
      result = await calculationClient.calculateAttack(
        item.entry.params,
        calculateOptions
      )
    } catch (error) {
      throw withExecutionContext(error, item.id, 'combo')
    }
    if (rangePlan === null) {
      rangePlan = createFallbackRangePlan()
    }
    const record = createAttackCalculationRecord(
      item.entry.params,
      result,
      rangePlan
    )
    records.push({ id: item.id, record })
    rangePlans.push(rangePlan)
  }

  const totalOptions = { ...options }
  let totalResult
  try {
    totalResult = await calculationClient.calculateTotalDamage(
      records.map(({ record }) => record.result.damage),
      totalOptions
    )
  } catch (error) {
    throw withExecutionContext(error, null, 'total')
  }

  const totalCalculation = createAttackTotalCalculationRecord(
    records,
    totalResult
  )
  return Object.freeze({
    entries,
    records: Object.freeze(records.map(({ id, record }) =>
      Object.freeze({ id, record }))),
    rangePlans: Object.freeze(rangePlans),
    totalCalculation,
    batchResult: assembleBatch(records, totalResult),
  })
}
