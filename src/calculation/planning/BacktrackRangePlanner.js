import {
  BACKTRACK_ASSET_SUPPORT_MAX,
  getBacktrackGenerationOperationEstimate,
} from '../BacktrackLimits'
import {
  getBacktrackDiceCounts,
  getBacktrackRule,
  getBacktrackSupportMax,
} from '../../domain/BacktrackRules'
import {
  assertRemainingLois,
} from '../../domain/InputDomain'
import {
  integer,
  nonNegativeInteger,
  object,
} from './PlanningMath'

/** Plan the finite support and source buffers for a backtrack calculation. */
export function planBacktrack(params, display, completeSupport = false) {
  object(params, 'backtrack')
  const normalized = {
    encroachment: integer(
      params.encroachment ?? 0,
      'backtrack.encroachment'
    ),
    lois: assertRemainingLois(params.lois ?? 0, 'backtrack.lois'),
    elois: nonNegativeInteger(params.elois ?? 0, 'backtrack.elois'),
    dice: nonNegativeInteger(params.dice ?? 0, 'backtrack.dice'),
    value: nonNegativeInteger(params.value ?? 0, 'backtrack.value'),
    dlois: params.dlois ?? 'なし',
  }
  if (typeof normalized.dlois !== 'string') {
    throw new TypeError('backtrack.dlois must be a string')
  }
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
  // schema-v2 backtrack assets are 1024-element arrays. The calculation
  // maximum is a separate policy boundary and may be lower than the asset
  // boundary, so it must not be used to classify asset overflow.
  const assetSupportMax = BACKTRACK_ASSET_SUPPORT_MAX
  const assetOverflow = rawSupportMax > assetSupportMax
  const distributionMode = completeSupport || assetOverflow ? 'on-demand' : 'asset'
  const dynamicSupport = distributionMode === 'on-demand'
  const generationOperations = dynamicSupport
    ? getBacktrackGenerationOperationEstimate(
        maxDice,
        workingLength,
        rule.livingdead
      )
    : 0
  const operations = workingLength * 3 + generationOperations
  const generationFloat64Arrays = dynamicSupport
    ? rule.livingdead
      ? 22
      : 2
    : 0
  const baseFloat64Bytes = (
    3 + generationFloat64Arrays
  ) * workingLength * Float64Array.BYTES_PER_ELEMENT
  const resultFloat64Bytes = completeSupport
    ? 3 * workingLength * Float64Array.BYTES_PER_ELEMENT
    : 0

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
    operations,
    float64Bytes: baseFloat64Bytes + resultFloat64Bytes,
    finiteSupport: true,
    distributionMode,
    assetSupportMax,
    assetOverflow,
    assetOverflowLowerBound: assetSupportMax + 1,
  }
  if (completeSupport) {
    plan.calculationMode = 'complete-support'
    plan.baseFloat64Bytes = baseFloat64Bytes
    plan.resultFloat64Bytes = resultFloat64Bytes
  }
  return plan
}
