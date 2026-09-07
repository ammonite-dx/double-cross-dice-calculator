import {
  areAttackCalculationInputsEqual,
  createAttackCalculationRecord,
  createAttackTotalCalculationRecord,
} from './AttackCalculationRecord'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sameId(left, right) {
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

function findCommittedRecord(committedRecords, id) {
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
 * @param {unknown[]} requestedEntries
 * @param {unknown[]} committedRecords
 * @param {{ forceAll?: boolean }} options
 */
export function planAttackExecution(
  requestedEntries,
  committedRecords = [],
  { forceAll = false } = {}
) {
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
    const record = forceAll ? null : findCommittedRecord(
      committedRecords,
      entry.id
    )
    const reusable = record !== null
      && areAttackCalculationInputsEqual(record.input, entry.params)
    return Object.freeze({
      id: entry.id,
      entry,
      action: reusable ? 'reuse' : 'calculate',
      record: reusable ? record : null,
    })
  })
}

function withExecutionContext(error, entryId, stage) {
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

function createFallbackRangePlan() {
  return Object.freeze({ warnings: Object.freeze([]) })
}

function assembleBatch(records, totalResult) {
  return {
    combos: records.map(({ id, record }) => ({
      id,
      ...record.result,
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
 * @param {{
 *   entries: ReadonlyArray<unknown>,
 *   committedRecords?: ReadonlyArray<unknown>,
 *   calculationClient: object,
 *   options?: Record<string, unknown>,
 *   onRangePlan?: (plan: unknown, context?: object) => void,
 *   forceAll?: boolean,
 * }} request
 */
export async function executeAttackIncrementally({
  entries,
  committedRecords = [],
  calculationClient,
  options = {},
  onRangePlan,
  forceAll = false,
}) {
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
  const records = []
  const rangePlans = []

  for (const item of executionPlan) {
    if (item.action === 'reuse') {
      records.push({ id: item.id, record: item.record })
      rangePlans.push(item.record.rangePlan)
      continue
    }

    let rangePlan = null
    const calculateOptions = {
      ...options,
      onRangePlan: (plan) => {
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
