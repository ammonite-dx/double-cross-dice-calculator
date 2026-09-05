import {
  D10_MAX_GENERATION_LENGTH,
  D10_MAX_GENERATION_OPERATIONS,
} from '../D10Calculator'
import { RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH } from '../RuntimeDamageRollLimits'
import {
  fftOperationCount,
  nextPowerOfTwo,
} from './PlanningMath'

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

export function planResources(scorePlans, damagePlan, comboCount, policy) {
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

export function scoreOnlyResources(scores, policy) {
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

export function backtrackResources(backtrack, policy) {
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

/** Apply policy limits and return warnings without mutating the plan. */
export function applyLimits(plan, policy) {
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
