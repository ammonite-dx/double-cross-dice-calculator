import {
  BACKTRACK_MAX_GENERATED_DICE,
  BACKTRACK_MAX_GENERATION_LENGTH,
  BACKTRACK_MAX_GENERATION_OPERATIONS,
  getBacktrackGenerationOperationEstimate,
} from './BacktrackLimits'
import {
  getBacktrackDiceCounts,
  getBacktrackRule,
  getBacktrackSupportMax,
} from '../domain/BacktrackRules'
import { normalizeBacktrackParams } from '../domain/CalculationInputNormalization'

/**
 * Validate that a range plan was produced for exactly the request being
 * executed. The calculator deliberately repeats these checks so a direct
 * caller cannot bypass the planner by supplying a look-alike object.
 */
export function validateBacktrackRangePlan(params, plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new TypeError('backtrackRangePlan must be an object')
  }

  for (const field of [
    'maxDice',
    'rawSupportMax',
    'workingMax',
    'workingLength',
    'fftLength',
    'generationOperations',
  ]) {
    if (!Number.isSafeInteger(plan[field])) {
      throw new TypeError(
        `backtrackRangePlan.${field} must be a safe integer`
      )
    }
  }
  if (
    plan.maxDice < 0 ||
    plan.rawSupportMax < 0 ||
    plan.generationOperations < 0
  ) {
    throw new RangeError('backtrackRangePlan support must be non-negative')
  }
  if (plan.maxDice > BACKTRACK_MAX_GENERATED_DICE) {
    throw new RangeError(
      `backtrackRangePlan.maxDice exceeds the absolute safety limit of ${BACKTRACK_MAX_GENERATED_DICE}`
    )
  }
  if (plan.workingMax !== plan.rawSupportMax) {
    throw new RangeError(
      'backtrackRangePlan.workingMax must equal rawSupportMax'
    )
  }
  if (plan.workingLength !== plan.workingMax + 1) {
    throw new RangeError(
      'backtrackRangePlan.workingLength must equal workingMax + 1'
    )
  }
  if (plan.workingLength > BACKTRACK_MAX_GENERATION_LENGTH) {
    throw new RangeError(
      `backtrackRangePlan.workingLength exceeds the absolute safety limit of ${BACKTRACK_MAX_GENERATION_LENGTH}`
    )
  }
  if (plan.generationOperations > BACKTRACK_MAX_GENERATION_OPERATIONS) {
    throw new RangeError(
      `backtrackRangePlan.generationOperations exceeds the absolute safety limit of ${BACKTRACK_MAX_GENERATION_OPERATIONS}`
    )
  }
  if (plan.fftLength !== 0) {
    throw new RangeError(
      'backtrackRangePlan.fftLength must be zero for backtrack distributions'
    )
  }
  if (plan.finiteSupport !== true) {
    throw new RangeError('backtrackRangePlan must describe finite support')
  }
  if (plan.generationMode !== 'on-demand') {
    throw new RangeError(
      'backtrackRangePlan.generationMode must be on-demand'
    )
  }

  const normalizedParams = normalizeBacktrackParams(params)
  const expectedDiceCounts = getBacktrackDiceCounts(normalizedParams)
  const expectedMaxDice = Math.max(...expectedDiceCounts)
  const expectedRawSupportMax = getBacktrackSupportMax(
    normalizedParams.dlois,
    expectedMaxDice
  )
  const expectedGenerationOperations = getBacktrackGenerationOperationEstimate(
    expectedMaxDice,
    expectedRawSupportMax + 1,
    getBacktrackRule(normalizedParams.dlois).livingdead
  )
  if (plan.rawSupportMax !== expectedRawSupportMax) {
    throw new RangeError(
      'backtrackRangePlan.rawSupportMax does not match the rule support'
    )
  }
  if (plan.maxDice !== expectedMaxDice) {
    throw new RangeError(
      'backtrackRangePlan.maxDice does not match the request'
    )
  }
  if (plan.generationOperations !== expectedGenerationOperations) {
    throw new RangeError(
      'backtrackRangePlan.generationOperations does not match the selected distribution mode'
    )
  }
  if (
    plan.support?.max !== undefined &&
    plan.support.max !== expectedRawSupportMax
  ) {
    throw new RangeError(
      'backtrackRangePlan.support.max does not match the rule support'
    )
  }
  if (plan.params && typeof plan.params === 'object') {
    for (const field of [
      'encroachment',
      'lois',
      'elois',
      'dice',
      'value',
      'dlois',
    ]) {
      if (plan.params[field] !== normalizedParams[field]) {
        throw new RangeError(
          `backtrackRangePlan.params.${field} does not match the request`
        )
      }
    }
  }
  if (plan.diceCounts) {
    const actual = [
      plan.diceCounts.single,
      plan.diceCounts.double,
      plan.diceCounts.second,
    ]
    if (actual.some((value, index) => value !== expectedDiceCounts[index])) {
      throw new RangeError(
        'backtrackRangePlan.diceCounts do not match the request'
      )
    }
  }
  return {
    normalizedParams,
    diceCounts: expectedDiceCounts,
  }
}
