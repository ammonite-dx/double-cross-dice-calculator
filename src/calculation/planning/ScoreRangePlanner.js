import {
  getDxYouseiBlockLength,
  getDxYouseiFftLength,
} from '../DxCalculator'
import {
  findTailCutoff,
  scoreTailBound,
} from '../DxTailModel'
import { assertCriticalValue } from '../../domain/InputDomain'
import {
  addSafe,
  integer,
  multiplySafe,
  nonNegativeInteger,
  subtractSafe,
  fftOperationCount,
} from './PlanningMath'
import { getPublishedScoreUpperBound } from './RangePolicy'

function scoreOperationCount(plan) {
  const dice = plan.params.dice
  const size = plan.workingLength
  if (plan.params.shihai === 0) {
    return multiplySafe(
      size,
      Math.max(1, plan.params.critical - 1),
      'score operation estimate'
    )
  }
  const stages = Math.max(0, dice - plan.params.shihai)
  const transitionCount = multiplySafe(
    stages,
    stages + 1,
    'score transition estimate'
  ) / 2
  return multiplySafe(
    size,
    addSafe(
      transitionCount,
      multiplySafe(stages, 4, 'score operation estimate'),
      'score operation estimate'
    ),
    'score operation estimate'
  )
}

export function normalizeScore(params, name = 'score') {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError(`${name} must be an object`)
  }
  return {
    dice: nonNegativeInteger(params.dice, `${name}.dice`),
    critical: assertCriticalValue(params.critical, `${name}.critical`),
    shihai: nonNegativeInteger(params.shihai ?? 0, `${name}.shihai`),
    yousei: nonNegativeInteger(params.yousei ?? 0, `${name}.yousei`),
    skill: integer(params.skill ?? 0, `${name}.skill`),
  }
}

/** Plan the score distribution and its DX tail certificate. */
export function planScore(params, display, policy, tailBudget) {
  const normalized = normalizeScore(params)
  const cutoffResult = findTailCutoff(normalized, tailBudget)
  const calculationSourceMax = Math.max(display.max, policy.calculationMax)
  const displaySourceMax = subtractSafe(
    calculationSourceMax,
    normalized.skill,
    'score display range'
  )
  const workingMax = Math.max(
    cutoffResult.cutoff,
    displaySourceMax,
    0
  )
  const tailBound = scoreTailBound(workingMax, normalized)
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
  const outputMax = Math.max(
    0,
    addSafe(workingMax, normalized.skill, 'score output range')
  )
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
  const arrayElements = normalized.shihai === 0 && normalized.yousei > 0
    ? addSafe(
        addSafe(
          multiplySafe(2, workingLength, 'score array size'),
          addSafe(outputMax, 1, 'score output array size'),
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
  const arrayCount = normalized.shihai === 0
    ? 4
    : shihaiShortcut
      ? 2
      : addSafe(normalized.dice, 4, 'score array count')
  const float64Bytes = multiplySafe(
    arrayElements ?? multiplySafe(arrayCount, workingLength, 'score array size'),
    Float64Array.BYTES_PER_ELEMENT,
    'score array size'
  )
  const tailModel = normalized.yousei > 0
    ? normalized.shihai === 0
      ? 'exact-yousei'
      : 'conservative-union-bound'
    : normalized.shihai === 0
      ? 'exact-max'
      : 'conservative-max-bound'

  const tail = {
    model: tailModel,
    kind: 'dx-tail',
    finiteSupport: false,
    requested: tailBudget,
    cutoff: cutoffResult.cutoff,
    bound: tailBound,
    reachable: cutoffResult.reachable,
    modeledMax: workingMax,
    meaning: 'Probability of a score above the modeled cutoff before fixed skill shift',
  }

  return {
    params: normalized,
    display,
    support: {
      kind: 'dx-tail',
      finiteSupport: false,
      min: 0,
      max: workingMax,
      cutoff: cutoffResult.cutoff,
    },
    tail,
    workingMax,
    workingLength,
    outputMax,
    publishedOutputMax: getPublishedScoreUpperBound(policy.calculationMax),
    oneDieCutoff,
    fftLength: youseiFftLength,
    dxBlockLength: youseiBlockLength,
    operations,
    fftOperations,
    float64Bytes,
    finiteSupport: false,
  }
}

export function getScoreValueUpperBound(scorePlans, policy) {
  if (policy.scorePropagation !== 'full-tail') {
    return getPublishedScoreUpperBound(policy.calculationMax)
  }

  return scorePlans[0].outputMax
}

export { scoreOperationCount }
