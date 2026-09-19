import {
  getDxOperationEstimate,
  getDxYouseiBlockLength,
  getDxYouseiFftLength,
} from '../DxWorkingShape'
import {
  findTailCutoff,
  scoreTailBound,
} from '../ScoreTailModel'
import { normalizeScoreInput } from '../../domain/CalculationInputNormalization'
import {
  addSafe,
  multiplySafe,
  subtractSafe,
  fftOperationCount,
} from './PlanningMath'
import {
  getFiniteRawSupportMax,
  getScoreOutputBufferLength,
  getScoreOutputMax,
  getScoreSupport,
} from '../ScoreSupport'
import { getDxOrderStatisticOperationEstimate } from '../DxOrderStatistic'

function scoreOperationCount(plan) {
  const dice = plan.params.dice
  const size = plan.workingLength
  if (plan.params.shihai === 0) {
    return getDxOperationEstimate(size, plan.params.critical)
  }
  return getDxOrderStatisticOperationEstimate(
    size,
    dice,
    plan.params.shihai,
    plan.params.critical
  )
}

export function normalizeScore(params, name = 'score') {
  return normalizeScoreInput(params, name)
}

/** Plan the score distribution and its DX tail certificate. */
export function planScore(params, display, tailBudget) {
  const normalized = normalizeScore(params)
  const support = getScoreSupport(normalized)
  const finiteRawSupportMax = getFiniteRawSupportMax(normalized)
  const finiteSupport = support.kind === 'finite'
  const cutoffResult = finiteSupport
    ? { reachable: true, cutoff: finiteRawSupportMax, bound: 0 }
    : findTailCutoff(normalized, tailBudget)
  const workingMax = finiteSupport
    ? finiteRawSupportMax
    : Math.max(
        cutoffResult.cutoff,
        subtractSafe(
          display.max,
          normalized.skill,
          'score display range'
        ),
        0
      )
  const tailBound = finiteSupport
    ? 0
    : scoreTailBound(workingMax, normalized)
  const oneDieCutoff = normalized.yousei > 0
    ? findTailCutoff(
        {
          dice: 1,
          critical: normalized.critical,
          shihai: 0,
          yousei: 0,
        },
        tailBudget / 2
      ).cutoff
    : 0
  // Keep every value through workingMax explicit. The final array entry is a
  // separate bucket for values strictly greater than workingMax.
  const workingLength = addSafe(workingMax, 2, 'score working range')
  const outputBufferLength = getScoreOutputBufferLength(
    normalized,
    workingMax
  )
  // Finite scores propagate their mathematical support. Infinite scores use
  // the modeled cutoff plus the fixed skill shift.
  const outputMax = getScoreOutputMax(normalized, workingMax)
  // The DX calculator convolves truncated critical-block arrays. The FFT
  // length therefore depends on the explicit block coverage, not on the
  // full score working array and not on the number of Yousei uses.
  const youseiBlockLength = normalized.yousei > 0 && normalized.critical <= 10
    ? getDxYouseiBlockLength(workingLength, normalized.yousei)
    : 0
  const youseiFftLength = getDxYouseiFftLength(
    workingLength,
    normalized.critical,
    normalized.yousei
  )
  const operations = scoreOperationCount({
    params: normalized,
    workingLength,
  })
  const fftOperations = fftOperationCount(youseiFftLength)
  // When 《絶対支配》 covers every die, DxCalculator returns a point mass
  // immediately and does not allocate the per-dice DP table. Keep the
  // planner's memory model aligned with that shortcut: the raw result and
  // its normalized copy are the only two Float64 buffers for the DX step.
  const shihaiShortcut =
    normalized.shihai > 0 && normalized.dice <= normalized.shihai
  const outputBufferElements = multiplySafe(
    2,
    outputBufferLength,
    'score output array size'
  )
  const arrayElements = normalized.shihai === 0 && normalized.yousei > 0
    ? addSafe(
        addSafe(
          multiplySafe(2, workingLength, 'score array size'),
          outputBufferElements,
          'score array size'
        ),
        addSafe(
          multiplySafe(4, youseiBlockLength, 'Yousei array size'),
          multiplySafe(4, youseiFftLength, 'Yousei FFT array size'),
          'score array size'
        ),
        'score array size'
      )
    : null
  // Positive shihai now uses a constant number of working buffers: the raw
  // order-statistic result, its normalized copy, and ScoreCalculator's
  // Array.from working representation. It no longer allocates dice-sized DP
  // state arrays.
  const arrayCount = normalized.shihai === 0
    ? 4
    : shihaiShortcut
      ? 2
      : 3
  const baseArrayElements = arrayElements
    ?? multiplySafe(arrayCount, workingLength, 'score array size')
  const scoreArrayElements = shihaiShortcut
    ? Math.max(baseArrayElements, outputBufferElements)
    : addSafe(baseArrayElements, outputBufferElements, 'score array size')
  const float64Bytes = multiplySafe(
    scoreArrayElements,
    Float64Array.BYTES_PER_ELEMENT,
    'score array size'
  )
  const tailModel = finiteSupport
    ? 'finite-support'
    : normalized.yousei > 0
    ? normalized.shihai === 0
      ? 'exact-yousei'
      : 'conservative-union-bound'
    : normalized.shihai === 0
      ? 'exact-max'
      : 'exact-order-statistic'

  const tail = {
    model: tailModel,
    kind: 'dx-tail',
    finiteSupport,
    requested: tailBudget,
    cutoff: cutoffResult.cutoff,
    bound: tailBound,
    reachable: cutoffResult.reachable,
    modeledMax: workingMax,
    meaning: finiteSupport
      ? 'The score has finite mathematical support; no tail is omitted'
      : 'Probability of a score above the modeled cutoff before fixed skill shift',
  }

  return {
    kind: 'rolled-score',
    params: normalized,
    display,
    support: {
      kind: finiteSupport ? 'finite-support' : 'dx-tail',
      finiteSupport,
      min: 0,
      max: workingMax,
      cutoff: cutoffResult.cutoff,
    },
    tail,
    workingMax,
    workingLength,
    outputMax,
    oneDieCutoff,
    fftLength: youseiFftLength,
    dxBlockLength: youseiBlockLength,
    operations,
    fftOperations,
    float64Bytes,
    finiteSupport,
  }
}

export function getScoreValueUpperBound(scorePlans) {
  return scorePlans[0].outputMax
}

export { scoreOperationCount }
