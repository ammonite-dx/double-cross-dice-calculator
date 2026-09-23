import {
  getBacktrackFloat64MemoryEstimate,
  getBacktrackGenerationOperationEstimate,
} from '../BacktrackLimits'
import {
  getBacktrackDiceCounts,
  getBacktrackRule,
  getBacktrackSupportMax,
} from '../../domain/BacktrackRules'
import { normalizeBacktrackParams } from '../../domain/CalculationInputNormalization'
import type { RangeDisplayPlan, BacktrackRangePlan } from './RangePlannerTypes'

/** Plan the finite support and source buffers for a backtrack calculation. */
export function planBacktrack(
  params: unknown,
  display: RangeDisplayPlan,
): BacktrackRangePlan {
  const normalized = normalizeBacktrackParams(params)
  const rule = getBacktrackRule(normalized.dlois)
  const diceModifier = rule.diceModifier ?? 0
  const diceCounts = getBacktrackDiceCounts(normalized)
  diceCounts.forEach((dice, index) => {
    if (!Number.isSafeInteger(dice) || dice < 0) {
      throw new TypeError(
        `backtrack.diceCounts[${index}] must be a non-negative safe integer`
      )
    }
  })
  const maxDice = Math.max(...diceCounts)
  const rawSupportMax = getBacktrackSupportMax(normalized.dlois, maxDice)
  if (!Number.isSafeInteger(rawSupportMax)) {
    throw new TypeError('backtrack.rawSupportMax must be a safe integer')
  }
  const workingLength = rawSupportMax + 1
  if (!Number.isSafeInteger(workingLength)) {
    throw new TypeError('backtrack.workingLength must be a safe integer')
  }
  const generationOperations = getBacktrackGenerationOperationEstimate(
    maxDice,
    workingLength,
    rule.livingdead === true
  )
  const operations = workingLength * 3 + generationOperations
  const memoryEstimate = getBacktrackFloat64MemoryEstimate(
    maxDice,
    workingLength,
    rule.livingdead === true,
  )

  const plan: BacktrackRangePlan = {
    params: normalized,
    display,
    rule: normalized.dlois,
    diceModifier,
    livingdead: rule.livingdead === true,
    diceCounts: {
      single: diceCounts[0],
      double: diceCounts[1],
      second: diceCounts[2],
    },
    maxDice,
    support: {
      kind: 'finite-support',
      finiteSupport: true,
      min: 0,
      max: rawSupportMax,
    },
    rawSupportMax,
    workingMax: rawSupportMax,
    workingLength,
    fftLength: 0,
    generationOperations,
    operations,
    float64Bytes: memoryEstimate.float64Bytes,
    finiteSupport: true,
    generationMode: 'on-demand',
    baseFloat64Bytes: memoryEstimate.baseFloat64Bytes,
    resultFloat64Bytes: memoryEstimate.resultFloat64Bytes,
  }
  return plan
}
