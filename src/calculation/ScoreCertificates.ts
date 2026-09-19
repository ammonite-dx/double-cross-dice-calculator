import {
  DISTRIBUTION_RESULT_TOLERANCE,
} from './DistributionResult'
import {
  maxTailFirstMomentUpperBound,
  maxTailBound,
  scoreTailBound,
  youseiTailFirstMomentUpperBound,
} from './DxTailModel'
import { getScoreSupport } from './ScoreSupport'

export const SCORE_TAIL_CERTIFICATE_VERSION = 1
export const SCORE_TAIL_MOMENT_CERTIFICATE_VERSION = 1
export const SCORE_EXPECTATION_CERTIFICATE_VERSION = 1

function sumDxTailThrough(cutoff: number, dice: number, critical: number) {
  let result = 0
  let compensation = 0
  for (let value = 0; value <= cutoff; value += 1) {
    const term = maxTailBound(value, dice, critical)
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
  result: any,
  scoreRangePlan: any,
) {
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
  const hasPlannedTailBound = Number.isFinite(plannedTailBound)
  if (
    hasPlannedTailBound
    && (plannedTailBound < 0 || plannedTailBound > 1)
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
          > plannedTailBound + DISTRIBUTION_RESULT_TOLERANCE
      ) {
        return null
      }
      massLowerBound = overflow.probability
      massUpperBound = overflow.probability
    } else if (probabilityErrorBound > 0) {
      if (!hasPlannedTailBound) {
        return null
      }
      massUpperBound = plannedTailBound
    }
  } else if (overflow.probabilityUpperBound > 0) {
    massUpperBound = hasPlannedTailBound
      ? Math.min(overflow.probabilityUpperBound, plannedTailBound)
      : overflow.probabilityUpperBound
  } else if (probabilityErrorBound > 0) {
    if (!hasPlannedTailBound) {
      return null
    }
    massUpperBound = plannedTailBound
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

export function isValidScoreTailCertificate(certificate: any) {
  return certificate !== null
    && typeof certificate === 'object'
    && certificate.version === SCORE_TAIL_CERTIFICATE_VERSION
    && certificate.kind === 'score-tail-certificate'
    && Number.isFinite(certificate.massLowerBound)
    && Number.isFinite(certificate.massUpperBound)
    && certificate.massLowerBound >= 0
    && certificate.massUpperBound >= certificate.massLowerBound
    && certificate.massUpperBound <= 1
    && Number.isFinite(certificate.probabilityErrorBound)
    && certificate.probabilityErrorBound >= 0
}

export function createFiniteScoreTailMomentCertificate(
  modeledMax: number,
  model: string,
) {
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
  params: any,
  result: any,
  scoreRangePlan: any,
  scoreTailCertificate: any,
) {
  const support = getScoreSupport(params)
  if (support.kind === 'finite') {
    const modeledMax = Number.isSafeInteger(scoreRangePlan?.workingMax)
      ? scoreRangePlan.workingMax
      : support.max
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
  if (params.yousei > 0 && !hasExactYouseiTail) {
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

  const residualUpperBound = hasExactYouseiTail
    ? youseiTailFirstMomentUpperBound(
        modeledMax,
        params.dice,
        params.critical,
        params.yousei,
      )
    : maxTailFirstMomentUpperBound(
        modeledMax,
        params.dice,
        params.critical,
      )
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
        ? 'dx-max-domination'
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
 * Build a finite expected-value interval for the initial safe migration
 * slice: an infinite DX maximum with no Yousei/Shihai and non-negative skill.
 */
export function createScoreExpectationCertificate(
  params: any,
  scoreRangePlan: any,
) {
  if (
    params.dice <= 0
    || params.critical === 11
    || params.shihai !== 0
    || params.yousei !== 0
    || params.skill < 0
    || scoreRangePlan?.tail?.model !== 'exact-max'
  ) {
    return null
  }

  const modeledMax = scoreRangePlan.workingLength - 2
  const oneScoreProbability = 0.1 ** params.dice
  const partialRawExpectedValue = sumDxTailThrough(
    modeledMax,
    params.dice,
    params.critical,
  )
  const residualUpperBound = maxTailFirstMomentUpperBound(
    modeledMax,
    params.dice,
    params.critical,
  )
  const skillContribution = params.skill * (1 - oneScoreProbability)
  const partialExpectedValue =
    partialRawExpectedValue - oneScoreProbability + skillContribution
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
    model: 'dx-max-tail',
    modeledMax,
    lowerBound: Math.max(0, lowerExpectedValue),
    upperBound: upperExpectedValue,
    residualUpperBound,
  })
}
