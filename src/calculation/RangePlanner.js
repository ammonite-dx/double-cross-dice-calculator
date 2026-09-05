import { OUTPUT_DISTRIBUTION_SIZE } from '../core/probability/Distribution'
import {
  BACKTRACK_ASSET_SUPPORT_MAX,
  getBacktrackGenerationOperationEstimate,
} from './BacktrackLimits'
import {
  D10_MAX_GENERATION_LENGTH,
  D10_MAX_GENERATION_OPERATIONS,
  getD10GenerationOperationEstimate,
  getD10RequiredLength,
} from './D10Calculator'
import {
  getDxYouseiBlockLength,
  getDxYouseiFftLength,
} from './DxCalculator'
import {
  findTailCutoff,
  scoreTailBound,
} from './DxTailModel'
import { RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH } from './RuntimeDamageRollLimits'
import { PUBLISHED_OVERFLOW_INDEX } from './DistributionResult'
import {
  getBacktrackDiceCounts,
  getBacktrackRule,
  getBacktrackSupportMax,
} from '../domain/BacktrackRules'
import {
  assertCriticalValue,
  assertNonNegativeSafeInteger,
  assertRemainingLois,
  assertSafeInteger,
} from '../domain/InputDomain'

const DEFAULT_ERROR_BUDGET = 1e-8
const PUBLISHED_SCORE_MAX_INDEX = OUTPUT_DISTRIBUTION_SIZE - 1
const LEGACY_CALCULATION_MAX = PUBLISHED_OVERFLOW_INDEX - 1
const BACKTRACK_RESULT_COUNT = 3
// Runtime damage-roll work grows sublinearly across the supported reroll
// counts in the measured Node workload. Keep the max-dice and FFT terms
// explicit below, and use this coefficient only for the kazanari multiplier.
const KAZANARI_COST_LOG_COEFFICIENT = 15

function getPublishedScoreUpperBound(calculationMax) {
  return Math.max(calculationMax + 1, PUBLISHED_SCORE_MAX_INDEX)
}

/**
 * @typedef {'score' | 'check' | 'attack' | 'backtrack'} PlannerOperation
 * @typedef {'published-bucket' | 'full-tail'} ScorePropagation
 * @typedef {
 *   'exact-max' |
 *   'exact-yousei' |
 *   'conservative-max-bound' |
 *   'conservative-union-bound'
 * } TailModel
 *
 * @typedef {Object} ScoreInput
 * @property {number} dice
 * @property {number} critical
 * @property {number} [shihai]
 * @property {number} [yousei]
 * @property {number} [skill]
 *
 * @typedef {Object} AttackInput
 * @property {number} dice
 * @property {number} value
 * @property {number} [kazanari]
 *
 * @typedef {Object} DefenceInput
 * @property {number} dice
 * @property {number} value
 *
 * @typedef {Object} DisplayInput
 * @property {number} [min]
 * @property {number} [max]
 *
 * @typedef {Object} RangePolicy
 * @property {ScorePropagation} [scorePropagation]
 * @property {number} [calculationMax]
 * @property {{ total?: number, scoreTail?: number }} [errorBudget]
 * @property {{ defaultMin?: number, defaultMax?: number, maxPoints?: number }} [display]
 * @property {{
 *   warning?: {
 *     estimatedTimeMs?: number,
 *     estimatedMemoryBytes?: number,
 *     workingLength?: number,
 *     fftLength?: number,
 *   },
 *   hard?: {
 *     estimatedTimeMs?: number,
 *     estimatedMemoryBytes?: number,
 *     workingLength?: number,
 *     fftLength?: number,
 *   },
 * }} [limits]
 * @property {{
 *   dxOperationsPerMs?: number,
 *   fftOperationsPerMs?: number,
 *   damageOperationsPerMs?: number,
 *   backtrackOperationsPerMs?: number,
 * }} [costModel]
 *
 * @typedef {Object} TailCertificate
 * @property {TailModel} model
 * @property {'dx-tail'} kind
 * @property {false} finiteSupport
 * @property {number} requested
 * @property {number} cutoff
 * @property {number} bound
 * @property {boolean} reachable
 * @property {number} modeledMax
 * @property {string} meaning
 *
 * @typedef {Object} OverflowInfo
 * @property {'dx-tail' | 'finite-support' | 'display-bucket' | 'asset'} type
 * @property {boolean} finiteSupport
 * @property {number | null} lowerBound
 * @property {number | null} bound
 * @property {string} meaning
 *
 * @typedef {Object} OverflowSummary
 * @property {OverflowInfo | null} score Multi-score summaries use a null lowerBound and sum individual bounds.
 * @property {OverflowInfo | null} damage
 * @property {OverflowInfo} display
 * @property {OverflowInfo | null} backtrack
 *
 * @typedef {Object} ScoreRangePlan
 * @property {ScoreInput} params
 * @property {Object} support
 * @property {TailCertificate} tail
 * @property {number} workingMax
 * @property {number} workingLength Number of entries including the DX tail bucket.
 * @property {number} outputMax
 * @property {number} publishedOutputMax
 * @property {number} oneDieCutoff Deprecated diagnostic cutoff for the
 *   standalone 1D10 distribution; it no longer determines FFT length.
 * @property {number} fftLength
 * @property {number} dxBlockLength Number of explicit critical-block
 *   probabilities used by the integrated Yousei convolution.
 * @property {number} operations
 * @property {number} fftOperations
 * @property {number} float64Bytes
 * @property {false} finiteSupport
 *
 * @typedef {Object} DamageRangePlan
 * @property {number} attackDice
 * @property {number} attackValue
 * @property {number} kazanari
 * @property {number} defenceDice
 * @property {number} defenceValue
 * @property {number} fixedDifference
 * @property {number} maxDamageDice
 * @property {Object} support
 * @property {number} rawSupportMax
 * @property {number} rawMax
 * @property {number} workingMax
 * @property {number} workingLength
 * @property {number} defenceMax
 * @property {number} fftLength
 * @property {number} defenceFftLength
 * @property {number} defenceD10Length
 * @property {number} defenceD10Operations
 * @property {number} defenceD10Float64Bytes
 * @property {number} operations
 * @property {number} damageOperations
 * @property {number} fftOperations
 * @property {number} float64Bytes
 * @property {true} finiteSupport
 * @property {ScorePropagation} scoreValueMode
 * @property {number} scoreValueUpperBound
 *
 * @typedef {Object} BacktrackRangePlan
 * @property {Object} params
 * @property {Object} support
 * @property {number} maxDice
 * @property {number} rawSupportMax
 * @property {number} workingMax
 * @property {number} workingLength
 * @property {number} fftLength
 * @property {number} operations
 * @property {number} float64Bytes
 * @property {'complete-support'} [calculationMode]
 * @property {number} [baseFloat64Bytes] Source/generation buffers.
 * @property {number} [resultFloat64Bytes] Owned results.
 * @property {true} finiteSupport
 * @property {'asset' | 'on-demand'} distributionMode
 * @property {number} assetSupportMax
 * @property {boolean} assetOverflow Static asset coverage metadata; it is not
 *   a calculation overflow when distributionMode is on-demand.
 * @property {number} assetOverflowLowerBound
 *
 * @typedef {Object} ResourceEstimate
 * @property {number} operations
 * @property {number} timeMs
 * @property {number} dxTimeMs
 * @property {number} damageTimeMs
 * @property {number} fftTimeMs
 * @property {number} float64Bytes
 * @property {number} scoreOperations
 * @property {number} scoreFftOperations
 * @property {number} damageOperations
 * @property {number} damageFftOperations
 * @property {number} [backtrackOperations]
 * @property {number} [backtrackTimeMs]
 * @property {number} [defenceD10Operations]
 * @property {number} [defenceD10TimeMs]
 * @property {number} [defenceD10Float64Bytes]
 *
 * @typedef {Object} RangePlan
 * @property {boolean} accepted
 * @property {PlannerOperation} operation
 * @property {{ score: ScorePropagation, calculationMax: number }} propagation
 * @property {{ min: number, max: number, points: number, overflowLowerBound: number }} display
 * @property {Array<ScoreRangePlan>} scores
 * @property {DamageRangePlan | null} damage
 * @property {BacktrackRangePlan | null} backtrack
 * @property {ResourceEstimate} estimates
 * @property {Object} errorBudget
 * @property {Object} overflow
 * @property {OverflowSummary} overflowInfo
 * @property {Array<Object>} warnings
 * @property {Array<string>} [rejectionReasons]
 */

/**
 * The default keeps the current published-bucket contract and display range.
 * Resource thresholds are provisional policy inputs, not UI input limits.
 */
export const DEFAULT_POLICY = {
  // Preserve the current public-score-to-damage contract.
  scorePropagation: 'published-bucket',
  calculationMax: LEGACY_CALCULATION_MAX,
  errorBudget: {
    total: DEFAULT_ERROR_BUDGET,
    scoreTail: 8e-9,
  },
  display: {
    defaultMin: 0,
    defaultMax: 999,
    // The display range is no longer tied to the old 0..999 chart. Typed
    // arrays and the resource policy below provide the practical bound.
    maxPoints: Number.MAX_SAFE_INTEGER,
  },
  limits: {
    warning: {
      estimatedTimeMs: 50,
      estimatedMemoryBytes: 32 * 1024 * 1024,
      workingLength: 8192,
      fftLength: 16384,
    },
    hard: {
      estimatedTimeMs: 200,
      estimatedMemoryBytes: 64 * 1024 * 1024,
      workingLength: 16384,
      fftLength: 32768,
    },
  },
  // These coefficients remain injectable until the supported device matrix
  // has been calibrated with production measurements.
  costModel: {
    dxOperationsPerMs: 1_000_000,
    fftOperationsPerMs: 8_000_000,
    damageOperationsPerMs: 250_000,
    backtrackOperationsPerMs: 1_000_000,
  },
}

function integer(value, name) {
  return assertSafeInteger(value, name)
}

function addSafe(left, right, name) {
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${name} exceeds the safe integer range`)
  }
  return result
}

function subtractSafe(left, right, name) {
  const result = left - right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${name} exceeds the safe integer range`)
  }
  return result
}

function multiplySafe(left, right, name) {
  const result = left * right
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`${name} exceeds the safe integer range`)
  }
  return result
}

function nonNegativeInteger(value, name) {
  return assertNonNegativeSafeInteger(value, name)
}

function positiveInteger(value, name) {
  integer(value, name)
  if (value <= 0) {
    throw new RangeError(`${name} must be positive`)
  }
  return value
}

function positiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`)
  }
  return value
}

function nonNegativeNumber(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`)
  }
  return value
}

function probability(value, name) {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new RangeError(`${name} must be between 0 and 1`)
  }
  return value
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`)
  }
  return value
}

export function nextPowerOfTwo(value) {
  positiveInteger(value, 'value')
  let result = 1
  while (result < value) {
    if (result > Number.MAX_SAFE_INTEGER / 2) {
      throw new RangeError('value is too large for a power-of-two length')
    }
    result *= 2
  }
  return result
}

function mergePolicy(policy) {
  const supplied = policy ?? {}
  object(supplied, 'policy')

  const merged = {
    ...DEFAULT_POLICY,
    ...supplied,
    errorBudget: {
      ...DEFAULT_POLICY.errorBudget,
      ...(supplied.errorBudget ?? {}),
    },
    display: {
      ...DEFAULT_POLICY.display,
      ...(supplied.display ?? {}),
    },
    limits: {
      warning: {
        ...DEFAULT_POLICY.limits.warning,
        ...(supplied.limits?.warning ?? {}),
      },
      hard: {
        ...DEFAULT_POLICY.limits.hard,
        ...(supplied.limits?.hard ?? {}),
      },
    },
    costModel: {
      ...DEFAULT_POLICY.costModel,
      ...(supplied.costModel ?? {}),
    },
  }

  if (!['published-bucket', 'full-tail'].includes(merged.scorePropagation)) {
    throw new RangeError(
      'policy.scorePropagation must be published-bucket or full-tail'
    )
  }
  nonNegativeInteger(merged.calculationMax, 'policy.calculationMax')

  probability(merged.errorBudget.total, 'policy.errorBudget.total')
  probability(merged.errorBudget.scoreTail, 'policy.errorBudget.scoreTail')
  if (merged.errorBudget.scoreTail > merged.errorBudget.total) {
    throw new RangeError(
      'policy.errorBudget.scoreTail must not exceed policy.errorBudget.total'
    )
  }

  nonNegativeInteger(merged.display.defaultMin, 'policy.display.defaultMin')
  nonNegativeInteger(merged.display.defaultMax, 'policy.display.defaultMax')
  nonNegativeInteger(merged.display.maxPoints, 'policy.display.maxPoints')
  if (merged.display.defaultMax < merged.display.defaultMin) {
    throw new RangeError(
      'policy.display.defaultMax must be greater than or equal to defaultMin'
    )
  }

  const metricNames = [
    'estimatedTimeMs',
    'estimatedMemoryBytes',
    'workingLength',
    'fftLength',
  ]
  for (const thresholdName of ['warning', 'hard']) {
    for (const metricName of ['estimatedTimeMs', 'estimatedMemoryBytes']) {
      nonNegativeNumber(
        merged.limits[thresholdName][metricName],
        `policy.limits.${thresholdName}.${metricName}`
      )
    }
    for (const metricName of ['workingLength', 'fftLength']) {
      nonNegativeInteger(
        merged.limits[thresholdName][metricName],
        `policy.limits.${thresholdName}.${metricName}`
      )
    }
  }
  for (const metricName of metricNames) {
    if (
      merged.limits.warning[metricName] >
      merged.limits.hard[metricName]
    ) {
      throw new RangeError(
        `policy.limits.warning.${metricName} must not exceed the hard limit`
      )
    }
  }

  for (const name of [
    'dxOperationsPerMs',
    'fftOperationsPerMs',
    'damageOperationsPerMs',
    'backtrackOperationsPerMs',
  ]) {
    positiveNumber(merged.costModel[name], `policy.costModel.${name}`)
  }

  return merged
}

function normalizeDisplay(display, policy) {
  const supplied = display ?? {}
  object(supplied, 'display')
  const min = supplied.min ?? policy.display.defaultMin
  const max = supplied.max ?? policy.display.defaultMax
  nonNegativeInteger(min, 'display.min')
  nonNegativeInteger(max, 'display.max')
  if (max < min) {
    throw new RangeError('display.max must be greater than or equal to display.min')
  }
  const points = max - min + 1
  if (!Number.isSafeInteger(points)) {
    throw new RangeError('display range is too large to represent safely')
  }
  return {
    min,
    max,
    points,
    overflowLowerBound: max === Number.MAX_SAFE_INTEGER
      ? Infinity
      : max + 1,
  }
}

function addWarning(warnings, code, severity, message, value, limit) {
  warnings.push({ code, severity, message, value, limit })
}

function classifyMetric(
  warnings,
  accepted,
  code,
  value,
  warningLimit,
  hardLimit,
  unit
) {
  if (value > hardLimit) {
    addWarning(
      warnings,
      code,
      'reject',
      `${code} exceeds the hard limit`,
      value,
      hardLimit
    )
    return false
  }
  if (value > warningLimit) {
    addWarning(
      warnings,
      code,
      'warning',
      `${code} exceeds the warning limit (${unit})`,
      value,
      warningLimit
    )
  }
  return accepted
}

function scoreOperationCount(plan) {
  const dice = plan.params.dice
  const size = plan.workingLength
  if (plan.params.shihai === 0) {
    return multiplySafe(size, Math.max(1, plan.params.critical - 1), 'score operation estimate')
  }
  const stages = Math.max(0, dice - plan.params.shihai)
  const transitionCount = multiplySafe(stages, stages + 1, 'score transition estimate') / 2
  return multiplySafe(
    size,
    addSafe(transitionCount, multiplySafe(stages, 4, 'score operation estimate'), 'score operation estimate'),
    'score operation estimate'
  )
}

function fftOperationCount(length) {
  if (!length) {
    return 0
  }
  return 3 * length * Math.log2(length)
}

function getDamageKazanariCostFactor(kazanari) {
  return 1 + KAZANARI_COST_LOG_COEFFICIENT * Math.log1p(kazanari)
}

function normalizeScore(params, name) {
  object(params, name)
  const normalized = {
    dice: nonNegativeInteger(params.dice, `${name}.dice`),
    critical: assertCriticalValue(params.critical, `${name}.critical`),
    shihai: nonNegativeInteger(params.shihai ?? 0, `${name}.shihai`),
    yousei: nonNegativeInteger(params.yousei ?? 0, `${name}.yousei`),
    skill: integer(params.skill ?? 0, `${name}.skill`),
  }
  return normalized
}

function planScore(params, display, policy, tailBudget) {
  const normalized = normalizeScore(params, 'score')
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
  // immediately and does not allocate the per-dice DP table.  Keep the
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

  /** @type {TailCertificate} */
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

function planBacktrack(params, display, completeSupport = false) {
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
    ? BACKTRACK_RESULT_COUNT *
      workingLength *
      Float64Array.BYTES_PER_ELEMENT
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

function normalizeAttack(params) {
  object(params, 'attack')
  return {
    dice: nonNegativeInteger(params.dice, 'attack.dice'),
    value: integer(params.value, 'attack.value'),
    kazanari: nonNegativeInteger(params.kazanari ?? 0, 'attack.kazanari'),
  }
}

function normalizeDefence(params) {
  object(params, 'defence')
  return {
    dice: nonNegativeInteger(params.dice, 'defence.dice'),
    value: integer(params.value, 'defence.value'),
  }
}

function planDamage(params, display, policy, maxScoreForDamage) {
  const attack = normalizeAttack(params.attack)
  const defence = normalizeDefence(params.defence)
  const maxDamageDice = Math.max(
    0,
    addSafe(
      Math.floor(maxScoreForDamage / 10) + 1,
      attack.dice,
      'damage dice range'
    )
  )
  const rawMax = multiplySafe(maxDamageDice, 10, 'damage raw support')
  const fixedDifference = subtractSafe(
    attack.value,
    defence.value,
    'damage fixed difference'
  )
  const defenceMax = multiplySafe(defence.dice, 10, 'defence support')
  const defenceD10Length = defence.dice > 0
    ? getD10RequiredLength(defence.dice)
    : 0
  const defenceD10Operations = defence.dice > 0
    ? getD10GenerationOperationEstimate(
        defence.dice,
        defenceD10Length
      )
    : 0
  // Runtime D10 generation keeps the current and next DP buffers alive while
  // producing the requested snapshot. Count both buffers for admission; the
  // returned provider copy is short-lived and is covered by the damage
  // consumer's own working-range estimate.
  const defenceD10Float64Bytes = defence.dice > 0
    ? multiplySafe(
        multiplySafe(
          defenceD10Length,
          2,
          'defence D10 generation buffer size'
        ),
        Float64Array.BYTES_PER_ELEMENT,
        'defence D10 generation buffer size'
      )
    : 0
  const calculationPlusDefence = addSafe(
    policy.calculationMax,
    defenceMax,
    'damage calculation range'
  )
  const rawPlusDifference = addSafe(
    rawMax,
    fixedDifference,
    'damage working range'
  )
  const calculationMinusDifference = subtractSafe(
    policy.calculationMax,
    fixedDifference,
    'damage working range'
  )
  const workingMax = fixedDifference >= 0
    ? Math.max(
        0,
        Math.min(rawPlusDifference, calculationPlusDefence)
      )
    : Math.max(
        0,
        Math.min(
          rawMax,
          addSafe(
            calculationMinusDifference,
            defenceMax,
            'damage working range'
          )
        )
      )
  const damageRollFftLength = nextPowerOfTwo(
    addSafe(rawMax, 1, 'damage FFT range')
  )
  const workingLength = addSafe(workingMax, 2, 'damage working range')
  const defenceFftLength = defence.dice > 0
    ? nextPowerOfTwo(addSafe(workingLength, defenceMax, 'defence FFT range'))
    : 0
  const effectiveKazanari = Math.min(attack.kazanari, maxDamageDice)
  const damageOperations =
    (damageRollFftLength / 2 + 1) *
      (maxDamageDice + 1) *
      getDamageKazanariCostFactor(effectiveKazanari)
  const fftOperations = fftOperationCount(defenceFftLength)
  const float64Bytes =
    (2 * damageRollFftLength + workingLength +
      (defence.dice > 0
        ? 2 * defenceFftLength + 2 * workingLength
        : 0)) *
    Float64Array.BYTES_PER_ELEMENT

  return {
    ...attack,
    attackDice: attack.dice,
    attackValue: attack.value,
    defenceDice: defence.dice,
    defenceValue: defence.value,
    fixedDifference,
    maxDamageDice,
    effectiveKazanari,
    support: {
      kind: 'finite-support',
      finiteSupport: true,
      min: 0,
      max: rawMax,
    },
    rawSupportMax: rawMax,
    rawMax,
    workingMax,
    workingLength,
    defenceMax,
    fftLength: damageRollFftLength,
    defenceFftLength,
    operations: damageOperations,
    damageOperations,
    fftOperations,
    float64Bytes,
    defenceD10Length,
    defenceD10Operations,
    defenceD10Float64Bytes,
    finiteSupport: true,
    scoreValueMode: policy.scorePropagation,
    scoreValueUpperBound: maxScoreForDamage,
    calculationMax: policy.calculationMax,
    display,
  }
}

function getScoreValueUpperBound(scorePlans, policy) {
  if (policy.scorePropagation !== 'full-tail') {
    return getPublishedScoreUpperBound(policy.calculationMax)
  }

  return scorePlans[0].outputMax
}

function planResources(scorePlans, damagePlan, comboCount, policy) {
  const scoreOperations = scorePlans.reduce(
    (sum, plan) => sum + plan.operations,
    0
  )
  const scoreFftOperations = scorePlans.reduce(
    (sum, plan) => sum + plan.fftOperations,
    0
  )
  const scoreBytes = scorePlans.reduce(
    (sum, plan) => sum + plan.float64Bytes,
    0
  )
  const comboFftOperations = comboCount > 1
    ? comboCount * fftOperationCount(
        nextPowerOfTwo(2 * (damagePlan.workingLength + 1))
      )
    : 0
  const damageFftOperations = damagePlan.fftOperations + comboFftOperations
  const defenceD10Operations = damagePlan.defenceD10Operations ?? 0
  const defenceD10TimeMs =
    defenceD10Operations / policy.costModel.damageOperationsPerMs
  const operations = scoreOperations + scoreFftOperations +
    damagePlan.operations + damageFftOperations + defenceD10Operations
  const dxTimeMs = scoreOperations / policy.costModel.dxOperationsPerMs
  const damageTimeMs =
    damagePlan.operations / policy.costModel.damageOperationsPerMs +
    defenceD10TimeMs
  const fftTimeMs =
    (scoreFftOperations + damageFftOperations) /
    policy.costModel.fftOperationsPerMs

  return {
    operations,
    timeMs: dxTimeMs + damageTimeMs + fftTimeMs,
    dxTimeMs,
    damageTimeMs,
    fftTimeMs,
    float64Bytes: scoreBytes + damagePlan.float64Bytes +
      (damagePlan.defenceD10Float64Bytes ?? 0),
    scoreOperations,
    scoreFftOperations,
    damageOperations: damagePlan.operations,
    damageFftOperations,
    defenceD10Operations,
    defenceD10TimeMs,
    defenceD10Float64Bytes: damagePlan.defenceD10Float64Bytes ?? 0,
    totalDamageFftOperations: damageFftOperations,
  }
}

function scoreOnlyResources(scores, policy) {
  const scoreOperations = scores.reduce(
    (sum, score) => sum + score.operations,
    0
  )
  const scoreFftOperations = scores.reduce(
    (sum, score) => sum + score.fftOperations,
    0
  )
  const dxTimeMs = scoreOperations / policy.costModel.dxOperationsPerMs
  const fftTimeMs = scoreFftOperations / policy.costModel.fftOperationsPerMs
  return {
    operations: scoreOperations + scoreFftOperations,
    timeMs: dxTimeMs + fftTimeMs,
    dxTimeMs,
    damageTimeMs: 0,
    fftTimeMs,
    float64Bytes: scores.reduce(
      (sum, score) => sum + score.float64Bytes,
      0
    ),
    scoreOperations,
    scoreFftOperations,
    damageOperations: 0,
    damageFftOperations: 0,
  }
}

function backtrackResources(backtrack, policy) {
  const backtrackTimeMs =
    backtrack.operations / policy.costModel.backtrackOperationsPerMs
  return {
    operations: backtrack.operations,
    timeMs: backtrackTimeMs,
    dxTimeMs: 0,
    damageTimeMs: 0,
    fftTimeMs: 0,
    float64Bytes: backtrack.float64Bytes,
    scoreOperations: 0,
    scoreFftOperations: 0,
    damageOperations: 0,
    damageFftOperations: 0,
    backtrackOperations: backtrack.operations,
    backtrackTimeMs,
  }
}

function applyLimits(plan, policy) {
  const warnings = []
  let accepted = true
  const limits = policy.limits

  if (plan.display.points > policy.display.maxPoints) {
    addWarning(
      warnings,
      'display-points',
      'reject',
      'display point count exceeds the hard display limit',
      plan.display.points,
      policy.display.maxPoints
    )
    accepted = false
  }

  for (const score of plan.scores) {
    if (score.params.shihai > 0 && score.params.yousei > 0) {
      addWarning(
        warnings,
        'incompatible-input',
        'reject',
        'shihai and yousei cannot both be non-zero in the current compatibility mode',
        {
          shihai: score.params.shihai,
          yousei: score.params.yousei,
        },
        0
      )
      accepted = false
    }
    accepted = classifyMetric(
      warnings,
      accepted,
      'score-working-length',
      score.workingLength,
      limits.warning.workingLength,
      limits.hard.workingLength,
      'elements'
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'score-fft-length',
      score.fftLength,
      limits.warning.fftLength,
      limits.hard.fftLength,
      'elements'
    )
  }

  if (plan.backtrack) {
    accepted = classifyMetric(
      warnings,
      accepted,
      'backtrack-working-length',
      plan.backtrack.workingLength,
      limits.warning.workingLength,
      limits.hard.workingLength,
      'elements'
    )
    if (
      plan.backtrack.assetOverflow &&
      plan.backtrack.distributionMode !== 'on-demand'
    ) {
      addWarning(
        warnings,
        'backtrack-asset-overflow',
        'warning',
        'the selected static backtrack asset cannot represent the full support; use an on-demand calculator or a larger asset',
        plan.backtrack.rawSupportMax,
        plan.backtrack.assetOverflowLowerBound
      )
    }
  }

  if (plan.damage) {
    accepted = classifyMetric(
      warnings,
      accepted,
      'defence-d10-length',
      plan.damage.defenceD10Length,
      D10_MAX_GENERATION_LENGTH,
      D10_MAX_GENERATION_LENGTH,
      'elements'
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'defence-d10-generation',
      plan.damage.defenceD10Operations,
      D10_MAX_GENERATION_OPERATIONS,
      D10_MAX_GENERATION_OPERATIONS,
      'operations'
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'damage-weight-length',
      plan.damage.maxDamageDice + 1,
      RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH,
      RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH,
      'elements'
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'damage-working-length',
      plan.damage.workingLength,
      limits.warning.workingLength,
      limits.hard.workingLength,
      'elements'
    )
    accepted = classifyMetric(
      warnings,
      accepted,
      'damage-fft-length',
      Math.max(plan.damage.fftLength, plan.damage.defenceFftLength),
      limits.warning.fftLength,
      limits.hard.fftLength,
      'elements'
    )
  }

  accepted = classifyMetric(
    warnings,
    accepted,
    'estimated-memory',
    plan.estimates.float64Bytes,
    limits.warning.estimatedMemoryBytes,
    limits.hard.estimatedMemoryBytes,
    'bytes'
  )
  accepted = classifyMetric(
    warnings,
    accepted,
    'estimated-time',
    plan.estimates.timeMs,
    limits.warning.estimatedTimeMs,
    limits.hard.estimatedTimeMs,
    'ms'
  )

  for (const score of plan.scores) {
    if (!score.tail.reachable) {
      addWarning(
        warnings,
        'tail-cutoff-unreachable',
        'reject',
        'the requested score tail error cannot be met within the search limit',
        score.tail.bound,
        score.tail.requested
      )
      accepted = false
    }
    if (score.tail.bound > score.tail.requested) {
      addWarning(
        warnings,
        'tail-error',
        'reject',
        'score tail bound exceeds the requested error budget',
        score.tail.bound,
        score.tail.requested
      )
      accepted = false
    }
  }

  return { accepted, warnings }
}

/**
 * @param {RangePlan} plan
 * @returns {OverflowSummary}
 */
function makeOverflowInfo(plan) {
  const score = plan.scores.length > 0
    ? {
        type: 'dx-tail',
        finiteSupport: false,
        lowerBound: plan.scores.length === 1
          ? plan.scores[0].workingMax + 1
          : null,
        bound: plan.scores.reduce(
          (sum, item) => sum + item.tail.bound,
          0
        ),
        meaning: 'DX values above each modeled range are represented by tail certificates; for multiple scores, bound is the sum and lowerBound is null because each score has its own boundary',
      }
    : null
  const damage = plan.damage
    ? {
        type: 'finite-support',
        finiteSupport: true,
        lowerBound: plan.damage.workingMax + 1,
        bound: 0,
        meaning: 'pre-defence damage values above workingMax use an explicit overflow bucket; raw DR support remains finite before fixed differences',
      }
    : null
  const display = {
    type: 'display-bucket',
    finiteSupport: false,
    lowerBound: plan.display.overflowLowerBound,
    bound: null,
    meaning: 'values at or above the display overflow boundary are grouped for presentation only',
  }
  const backtrack = plan.backtrack
    ? {
        type: plan.backtrack.assetOverflow &&
            plan.backtrack.distributionMode !== 'on-demand'
          ? 'asset'
          : 'finite-support',
        finiteSupport: true,
        lowerBound: plan.backtrack.assetOverflow &&
            plan.backtrack.distributionMode !== 'on-demand'
          ? plan.backtrack.assetOverflowLowerBound
          : null,
        bound: null,
        meaning: plan.backtrack.distributionMode === 'on-demand'
          ? 'backtrack values have finite support and this plan generates the complete support on demand; assetOverflow only describes static asset coverage'
          : 'backtrack values have finite support within the selected asset',
      }
    : null

  return { score, damage, display, backtrack }
}

/**
 * Plan the ranges and resources required by a calculation.
 *
 * This function only returns a plan. It does not allocate calculator arrays,
 * invoke a calculator, alter UI limits, or select a production data path.
 *
 * @param {Object} params
 * @param {PlannerOperation} [params.operation='attack']
 * @param {ScoreInput | { action: ScoreInput, reaction: ScoreInput }} [params.score]
 * @param {AttackInput} [params.attack]
 * @param {DefenceInput} [params.defence]
 * @param {Object} [params.backtrack]
 * @param {DisplayInput} [params.display]
 * @param {number} [params.comboCount=1]
 * @param {RangePolicy} [policy]
 * @returns {RangePlan}
 */
export function planCalculationRanges(params, policy = {}) {
  const effectivePolicy = mergePolicy(policy)
  object(params, 'params')

  const operation = params.operation ?? 'attack'
  if (!['score', 'check', 'attack', 'backtrack'].includes(operation)) {
    throw new RangeError(
      'operation must be score, check, attack, or backtrack'
    )
  }
  const display = normalizeDisplay(params.display, effectivePolicy)
  const comboCount = params.comboCount ?? 1
  positiveInteger(comboCount, 'comboCount')

  let scores = []
  let damage = null
  let backtrack = null
  let tailBudget = 0

  if (operation === 'backtrack') {
    backtrack = planBacktrack(
      params.backtrack ?? params,
      display,
      params.completeSupportBacktrack === true
    )
  } else {
    const scoreParams = operation === 'score'
      ? [params.score ?? params]
      : [
          params.score?.action ?? params.action,
          params.score?.reaction ?? params.reaction,
        ]

    if (scoreParams.some((value) => !value)) {
      throw new TypeError('score parameters are required')
    }
    tailBudget = effectivePolicy.errorBudget.scoreTail / scoreParams.length
    scores = scoreParams.map((score) =>
      planScore(score, display, effectivePolicy, tailBudget)
    )

    if (operation === 'attack') {
      damage = planDamage(
        params,
        display,
        effectivePolicy,
        getScoreValueUpperBound(scores, effectivePolicy)
      )
    }
  }

  const estimates = backtrack
    ? backtrackResources(backtrack, effectivePolicy)
    : damage
      ? planResources(scores, damage, comboCount, effectivePolicy)
      : scoreOnlyResources(scores, effectivePolicy)

  /** @type {RangePlan} */
  const result = {
    accepted: true,
    operation,
    propagation: {
      score: effectivePolicy.scorePropagation,
      calculationMax: effectivePolicy.calculationMax,
    },
    display,
    scores,
    damage,
    backtrack,
    estimates,
    errorBudget: {
      total: effectivePolicy.errorBudget.total,
      scoreTail: operation === 'backtrack'
        ? 0
        : effectivePolicy.errorBudget.scoreTail,
      scorePerSide: tailBudget,
      finiteDamageTail: 0,
    },
    // Keep the reference planner's human-readable meanings for callers that
    // only need to display a short explanation. Structured details live in
    // overflowInfo so the kind and finite/infinite distinction are explicit.
    overflow: {
      score: 'values above the modeled cutoff are omitted only within tail error budget',
      damage: 'finite modeled values above display.max are an explicit display overflow bucket',
      totalDamage: 'once a value is aggregated above display.max, later operations must not subtract from it',
      backtrack: 'backtrack values have finite support; on-demand plans generate the complete support, while static asset coverage is reported separately',
    },
    overflowInfo: null,
    warnings: [],
  }
  result.overflowInfo = makeOverflowInfo(result)

  const limitResult = applyLimits(result, effectivePolicy)
  result.accepted = limitResult.accepted
  result.warnings = limitResult.warnings
  if (!result.accepted) {
    result.rejectionReasons = Array.from(
      new Set(
        result.warnings
          .filter((warning) => warning.severity === 'reject')
          .map((warning) => warning.code)
      )
    )
  }
  return result
}
