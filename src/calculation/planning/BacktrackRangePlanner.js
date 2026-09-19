import { getBacktrackGenerationOperationEstimate } from '../BacktrackLimits'
import {
  getBacktrackDiceCounts,
  getBacktrackRule,
  getBacktrackSupportMax,
} from '../../domain/BacktrackRules'
import { normalizeBacktrackParams } from '../../domain/CalculationInputNormalization'

/** Plan the finite support and source buffers for a backtrack calculation. */
export function planBacktrack(params, display) {
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
    rule.livingdead
  )
  const operations = workingLength * 3 + generationOperations
  const generationFloat64Arrays = rule.livingdead ? 22 : 2
  const baseFloat64Bytes = (
    3 + generationFloat64Arrays
  ) * workingLength * Float64Array.BYTES_PER_ELEMENT
  const resultFloat64Bytes = 3 * workingLength * Float64Array.BYTES_PER_ELEMENT

  const plan = {
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
    float64Bytes: baseFloat64Bytes + resultFloat64Bytes,
    finiteSupport: true,
    generationMode: 'on-demand',
    baseFloat64Bytes,
    resultFloat64Bytes,
  }
  return plan
}
