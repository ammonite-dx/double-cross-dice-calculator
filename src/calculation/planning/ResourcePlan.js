import {
  D10_MAX_GENERATION_LENGTH,
  D10_MAX_GENERATION_OPERATIONS,
} from '../D10Calculator'
import { BACKTRACK_MAX_GENERATION_OPERATIONS } from '../BacktrackLimits'
import {
  RUNTIME_DAMAGE_MAX_OPERATION_ESTIMATE,
  RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH,
} from '../RuntimeDamageRollLimits'
import {
  calculateCpuWork,
  fftOperationCount,
  nextPowerOfTwo,
} from './PlanningMath'
import { isSupportedScoreFeatureCombination } from '../../domain/InputDomain'

function addWarning(warnings, code, severity, message, value, limit) {
  warnings.push({ code, severity, message, value, limit })
}

function rejectMetric(warnings, accepted, code, value, limit, unit) {
  if (!Number.isFinite(value) || value > limit) {
    addWarning(
      warnings,
      code,
      'reject',
      `${code} exceeds the configured limit${unit ? ` (${unit})` : ''}`,
      value,
      limit
    )
    return false
  }
  return accepted
}

export function planResources(scorePlans, damagePlan, comboCount) {
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
  const fftOperations = scoreFftOperations + damageFftOperations
  const damageOperations = damagePlan.operations

  return {
    cpuWork: calculateCpuWork({
      scoreOperations,
      damageOperations,
      defenceD10Operations,
      fftOperations,
    }),
    float64Bytes: scoreBytes + damagePlan.float64Bytes +
      (damagePlan.defenceD10Float64Bytes ?? 0),
    scoreOperations,
    scoreFftOperations,
    damageOperations,
    damageFftOperations,
    defenceD10Operations,
    defenceD10Float64Bytes: damagePlan.defenceD10Float64Bytes ?? 0,
    totalDamageFftOperations: damageFftOperations,
  }
}

export function scoreOnlyResources(scores) {
  const scoreOperations = scores.reduce(
    (sum, score) => sum + score.operations,
    0
  )
  const scoreFftOperations = scores.reduce(
    (sum, score) => sum + score.fftOperations,
    0
  )
  return {
    cpuWork: calculateCpuWork({
      scoreOperations,
      fftOperations: scoreFftOperations,
    }),
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

export function backtrackResources(backtrack) {
  return {
    cpuWork: calculateCpuWork({
      backtrackOperations: backtrack.operations,
    }),
    float64Bytes: backtrack.float64Bytes,
    scoreOperations: 0,
    scoreFftOperations: 0,
    damageOperations: 0,
    damageFftOperations: 0,
    backtrackOperations: backtrack.operations,
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
      'display point count exceeds the configured limit',
      plan.display.points,
      policy.display.maxPoints
    )
    accepted = false
  }

  for (const score of plan.scores) {
    if (!isSupportedScoreFeatureCombination(score.params)) {
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
    accepted = rejectMetric(
      warnings,
      accepted,
      'score-working-length',
      score.workingLength,
      limits.workingLength,
      'elements'
    )
    accepted = rejectMetric(
      warnings,
      accepted,
      'score-fft-length',
      score.fftLength,
      limits.fftLength,
      'elements'
    )
  }

  if (plan.backtrack) {
    accepted = rejectMetric(
      warnings,
      accepted,
      'backtrack-working-length',
      plan.backtrack.workingLength,
      limits.workingLength,
      'elements'
    )
    accepted = rejectMetric(
      warnings,
      accepted,
      'backtrack-generation',
      plan.backtrack.generationOperations,
      BACKTRACK_MAX_GENERATION_OPERATIONS,
      'operations'
    )
  }

  if (plan.damage) {
    accepted = rejectMetric(
      warnings,
      accepted,
      'defence-d10-length',
      plan.damage.defenceD10Length,
      D10_MAX_GENERATION_LENGTH,
      'elements'
    )
    accepted = rejectMetric(
      warnings,
      accepted,
      'defence-d10-generation',
      plan.damage.defenceD10Operations,
      D10_MAX_GENERATION_OPERATIONS,
      'operations'
    )
    accepted = rejectMetric(
      warnings,
      accepted,
      'damage-weight-length',
      plan.damage.maxDamageDice + 1,
      RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH,
      'elements'
    )
    accepted = rejectMetric(
      warnings,
      accepted,
      'damage-generation',
      plan.damage.operations,
      RUNTIME_DAMAGE_MAX_OPERATION_ESTIMATE,
      'operations'
    )
    accepted = rejectMetric(
      warnings,
      accepted,
      'damage-working-length',
      plan.damage.workingLength,
      limits.workingLength,
      'elements'
    )
    accepted = rejectMetric(
      warnings,
      accepted,
      'damage-fft-length',
      Math.max(plan.damage.fftLength, plan.damage.defenceFftLength),
      limits.fftLength,
      'elements'
    )
  }

  accepted = rejectMetric(
    warnings,
    accepted,
    'estimated-memory',
    plan.estimates.float64Bytes,
    limits.estimatedMemoryBytes,
    'bytes'
  )
  accepted = rejectMetric(
    warnings,
    accepted,
    'cpu-work',
    plan.estimates.cpuWork,
    limits.maxCpuWork,
    'work units'
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
