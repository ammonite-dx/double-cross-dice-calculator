import {
  DISTRIBUTION_RESULT_TOLERANCE,
} from './DistributionResult'
import {
  maxTailFirstMomentUpperBound,
  youseiTailFirstMomentUpperBound,
} from './DxTailModel'
import {
  orderStatisticTailFirstMomentUpperBound,
  scoreTailBound,
} from './ScoreTailModel'
import { getScoreSupport } from './ScoreSupport'
import type { DistributionResult } from '../domain/DistributionResultTypes'
import type { ScoreInput } from '../domain/InputDomain'
import type {
  FiniteSupportScoreTailMomentCertificate,
  ScoreExpectationCertificate,
  ScoreTailCertificate,
  ScoreTailMomentCertificate,
} from '../domain/ScoreResultTypes'
import type { RolledScoreRangePlan } from './planning/RangePlannerTypes'

export const SCORE_TAIL_CERTIFICATE_VERSION = 1
export const SCORE_TAIL_MOMENT_CERTIFICATE_VERSION = 1
export const SCORE_EXPECTATION_CERTIFICATE_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sumScoreTailThrough(
  cutoff: number,
  params: ScoreInput,
) {
  let result = 0
  let compensation = 0
  for (let value = 0; value <= cutoff; value += 1) {
    const term = scoreTailBound(value, params)
    const correctedTerm = term - compensation
    const nextResult = result + correctedTerm
    compensation = (nextResult - result) - correctedTerm
    result = nextResult
  }
  return result
}

/**
 * The generic DistributionResult errorBound is not an expected-value bound.
 * For score producers only, this metadata records a defensive probability
 * interval without treating errorBound as probability mass.
 */
export function createScoreTailCertificate(
  result: DistributionResult,
  scoreRangePlan: RolledScoreRangePlan | null | undefined,
): ScoreTailCertificate | null {
  const overflow = result.overflow
  if (overflow === null) {
    return Object.freeze({
      version: SCORE_TAIL_CERTIFICATE_VERSION,
      kind: 'score-tail-certificate',
      massLowerBound: 0,
      massUpperBound: 0,
      lowerBound: null,
      probabilityErrorBound: 0,
    })
  }

  const probabilityErrorBound = overflow.errorBound ?? 0
  const plannedTailBound = scoreRangePlan?.tail?.bound
  const boundedPlannedTailBound = Number.isFinite(plannedTailBound)
    ? plannedTailBound as number
    : null
  const hasPlannedTailBound = boundedPlannedTailBound !== null
  if (
    hasPlannedTailBound
    && (boundedPlannedTailBound < 0 || boundedPlannedTailBound > 1)
  ) {
    return null
  }

  let massLowerBound = 0
  let massUpperBound = 0
  if (overflow.kind === 'exact') {
    if (overflow.probability > 0) {
      if (
        hasPlannedTailBound
        && overflow.probability
          > boundedPlannedTailBound + DISTRIBUTION_RESULT_TOLERANCE
      ) {
        return null
      }
      massLowerBound = overflow.probability
      massUpperBound = overflow.probability
    } else if (probabilityErrorBound > 0) {
      if (!hasPlannedTailBound) {
        return null
      }
      massUpperBound = boundedPlannedTailBound
    }
  } else if (overflow.probabilityUpperBound > 0) {
    massUpperBound = hasPlannedTailBound
      ? Math.min(overflow.probabilityUpperBound, boundedPlannedTailBound)
      : overflow.probabilityUpperBound
  } else if (probabilityErrorBound > 0) {
    if (!hasPlannedTailBound) {
      return null
    }
    massUpperBound = boundedPlannedTailBound
  }

  return Object.freeze({
    version: SCORE_TAIL_CERTIFICATE_VERSION,
    kind: 'score-tail-certificate',
    massLowerBound,
    massUpperBound,
    lowerBound: Number.isFinite(overflow.lowerBound)
      ? overflow.lowerBound
      : null,
    probabilityErrorBound,
  })
}

export function isValidScoreTailCertificate(
  certificate: unknown,
): certificate is ScoreTailCertificate {
  if (!isRecord(certificate)) {
    return false
  }
  const candidate = certificate as unknown as ScoreTailCertificate
  return (
    candidate.version === SCORE_TAIL_CERTIFICATE_VERSION
    && candidate.kind === 'score-tail-certificate'
    && Number.isFinite(candidate.massLowerBound)
    && Number.isFinite(candidate.massUpperBound)
    && candidate.massLowerBound >= 0
    && candidate.massUpperBound >= candidate.massLowerBound
    && candidate.massUpperBound <= 1
    && (candidate.lowerBound === null || Number.isFinite(candidate.lowerBound))
    && Number.isFinite(
      candidate.probabilityErrorBound,
    )
    && candidate.probabilityErrorBound >= 0
  )
}

export function isValidScoreTailMomentCertificate(
  certificate: unknown,
): certificate is ScoreTailMomentCertificate {
  if (!isRecord(certificate)) {
    return false
  }
  const candidate = certificate as unknown as ScoreTailMomentCertificate
  if (
    candidate.version !== SCORE_TAIL_MOMENT_CERTIFICATE_VERSION
    || candidate.kind !== 'score-tail-moment-certificate'
    || typeof candidate.model !== 'string'
    || !Number.isSafeInteger(candidate.modeledMax)
    || candidate.modeledMax < 0
    || !Number.isFinite(candidate.massUpperBound)
    || candidate.massUpperBound < 0
    || candidate.massUpperBound > 1
    || !Number.isFinite(candidate.firstMomentUpperBound)
    || candidate.firstMomentUpperBound < 0
  ) {
    return false
  }
  return true
}

export function createFiniteScoreTailMomentCertificate(
  modeledMax: number,
  model: 'finite-support',
): FiniteSupportScoreTailMomentCertificate {
  return Object.freeze({
    version: SCORE_TAIL_MOMENT_CERTIFICATE_VERSION,
    kind: 'score-tail-moment-certificate',
    model,
    modeledMax,
    massUpperBound: 0,
    firstMomentUpperBound: 0,
  })
}

export function createScoreTailMomentCertificate(
  params: ScoreInput,
  result: DistributionResult,
  scoreRangePlan: RolledScoreRangePlan | null | undefined,
  scoreTailCertificate: ScoreTailCertificate | null,
): ScoreTailMomentCertificate | null {
  const support = getScoreSupport(params)
  if (support.kind === 'finite') {
    const plannedWorkingMax = scoreRangePlan?.workingMax
    const modeledMax: number = Number.isSafeInteger(plannedWorkingMax)
      ? Number(plannedWorkingMax)
      : Number(support.max ?? 0)
    return createFiniteScoreTailMomentCertificate(
      modeledMax,
      'finite-support',
    )
  }

  if (scoreRangePlan === undefined || scoreRangePlan === null) {
    return null
  }

  const modeledMax = scoreRangePlan.workingMax
  if (!Number.isSafeInteger(modeledMax) || modeledMax < 0) {
    return null
  }
  if (!isValidScoreTailCertificate(scoreTailCertificate)) {
    return null
  }

  const hasExactYouseiTail =
    params.yousei > 0
    && params.shihai === 0
    && params.critical <= 10
    && scoreRangePlan.tail?.model === 'exact-yousei'
  const hasExactShihaiTail =
    params.shihai > 0
    && params.yousei === 0
    && params.critical <= 10
    && scoreRangePlan.tail?.model === 'exact-order-statistic'
  if (params.yousei > 0 && !hasExactYouseiTail) {
    return null
  }
  if (params.shihai > 0 && !hasExactShihaiTail) {
    return null
  }

  const overflow = result.overflow
  if (overflow === null) {
    return null
  }
  if (hasExactYouseiTail && overflow.kind !== 'exact') {
    return null
  }
  const planBound = scoreRangePlan.tail?.bound
  if (overflow.kind === 'exact' && Number.isFinite(planBound)) {
    if (overflow.probability > planBound + DISTRIBUTION_RESULT_TOLERANCE) {
      return null
    }
  }

  let plannedMassUpperBound = scoreTailCertificate.massUpperBound
  const analysisBound = scoreTailBound(modeledMax, params)
  if (Number.isFinite(planBound)) {
    if (planBound < 0 || planBound > 1) {
      return null
    }
    plannedMassUpperBound = Math.max(plannedMassUpperBound, planBound)
  }
  if (Number.isFinite(analysisBound)) {
    plannedMassUpperBound = Math.max(plannedMassUpperBound, analysisBound)
  }
  const massUpperBound = Math.min(1, plannedMassUpperBound)
  if (!Number.isFinite(massUpperBound) || massUpperBound < 0) {
    return null
  }

  let residualUpperBound
  try {
    residualUpperBound = hasExactYouseiTail
      ? youseiTailFirstMomentUpperBound(
          modeledMax,
          params.dice,
          params.critical,
          params.yousei,
        )
      : params.shihai > 0
        ? orderStatisticTailFirstMomentUpperBound(
            modeledMax,
            params.dice,
            params.critical,
            params.shihai,
          )
        : maxTailFirstMomentUpperBound(
            modeledMax,
            params.dice,
            params.critical,
          )
  } catch {
    // A non-finite analytic bound makes the certificate unavailable. Never
    // substitute the unrelated maximum-DX domination bound for Shihai.
    return null
  }
  const boundaryContributionUpperBound =
    (modeledMax + 1) * massUpperBound
  const skillContributionUpperBound = Math.max(params.skill, 0) * massUpperBound
  const analyticUpperBound =
    boundaryContributionUpperBound
    + residualUpperBound
    + skillContributionUpperBound
  if (
    !Number.isFinite(residualUpperBound)
    || !Number.isFinite(boundaryContributionUpperBound)
    || !Number.isFinite(skillContributionUpperBound)
    || !Number.isFinite(analyticUpperBound)
    || analyticUpperBound < 0
  ) {
    return null
  }

  return Object.freeze({
    version: SCORE_TAIL_MOMENT_CERTIFICATE_VERSION,
    kind: 'score-tail-moment-certificate',
    model: hasExactYouseiTail
      ? 'dx-yousei-tail'
      : params.shihai > 0
        ? 'dx-order-statistic-tail'
        : 'dx-max-tail',
    modeledMax,
    massUpperBound,
    firstMomentUpperBound: analyticUpperBound,
    boundaryContributionUpperBound,
    residualUpperBound,
    skillContributionUpperBound,
  })
}

/**
 * Build a finite expected-value interval for an infinite-support score with
 * no Yousei, non-negative skill, and an exact max/order-statistic tail.
 */
export function createScoreExpectationCertificate(
  params: ScoreInput,
  scoreRangePlan: RolledScoreRangePlan | null | undefined,
): ScoreExpectationCertificate | null {
  if (
    params.dice <= 0
    || params.critical === 11
    || params.yousei !== 0
    || params.skill < 0
    || !(
      scoreRangePlan?.tail?.model === 'exact-max'
      || scoreRangePlan?.tail?.model === 'exact-order-statistic'
    )
  ) {
    return null
  }

  const modeledMax = scoreRangePlan.workingLength - 2
  const fumbleProbability =
    scoreTailBound(0, params) - scoreTailBound(1, params)
  const nonFumbleProbability = scoreTailBound(1, params)
  const partialRawExpectedValue = sumScoreTailThrough(
    modeledMax,
    params,
  )
  let residualUpperBound
  try {
    residualUpperBound = params.shihai > 0
      ? orderStatisticTailFirstMomentUpperBound(
          modeledMax,
          params.dice,
          params.critical,
          params.shihai,
        )
      : maxTailFirstMomentUpperBound(
          modeledMax,
          params.dice,
          params.critical,
        )
  } catch {
    return null
  }
  const skillContribution = params.skill * nonFumbleProbability
  const partialExpectedValue =
    partialRawExpectedValue - fumbleProbability + skillContribution
  const lowerExpectedValue = partialExpectedValue
  const upperExpectedValue = partialExpectedValue + residualUpperBound

  if (
    !Number.isFinite(lowerExpectedValue)
    || !Number.isFinite(upperExpectedValue)
    || upperExpectedValue < lowerExpectedValue
  ) {
    return null
  }

  return Object.freeze({
    version: SCORE_EXPECTATION_CERTIFICATE_VERSION,
    kind: 'score-expectation-certificate',
    model: params.shihai > 0
      ? 'dx-order-statistic-tail'
      : 'dx-max-tail',
    modeledMax,
    lowerBound: Math.max(0, lowerExpectedValue),
    upperBound: upperExpectedValue,
    residualUpperBound,
  })
}
