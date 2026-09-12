import {
  createBoundedProbability,
  createBoundedCertifiedValue,
  createExactProbability,
} from '../domain/CertifiedValue'
import {
  WORKING_DISTRIBUTION_SIZE,
  expandSparseDistribution,
} from '../core/probability/Distribution'
import {
  DISTRIBUTION_RESULT_TOLERANCE,
  createDistributionResult,
  getCertifiedExpectedValue,
  validateDistributionResult,
} from './DistributionResult'
import {
  maxTailFirstMomentUpperBound,
  maxTailBound,
  scoreTailBound,
  youseiTailFirstMomentUpperBound,
} from './DxTailModel'
import {
  getScoreOutputMax,
  getScoreSupport,
} from './ScoreSupport'

const SCORE_TAIL_CERTIFICATE_VERSION = 1
const SCORE_TAIL_MOMENT_CERTIFICATE_VERSION = 1
const SCORE_EXPECTATION_CERTIFICATE_VERSION = 1

function validateScoreRangePlan(scoreRangePlan) {
  if (scoreRangePlan === undefined || scoreRangePlan === null) {
    return null
  }
  if (
    typeof scoreRangePlan !== 'object' ||
    !Number.isSafeInteger(scoreRangePlan.workingLength) ||
    scoreRangePlan.workingLength < 2
  ) {
    throw new TypeError('scoreRangePlan.workingLength must be at least 2')
  }
  if (
    scoreRangePlan.fftLength !== undefined &&
    (!Number.isSafeInteger(scoreRangePlan.fftLength) ||
      scoreRangePlan.fftLength < 0)
  ) {
    throw new TypeError('scoreRangePlan.fftLength must be a non-negative safe integer')
  }
  return scoreRangePlan
}

function expandDxDistribution(
  distribution,
  fallbackLength,
  expectedLength,
  label
) {
  if (distribution instanceof Float64Array) {
    if (expectedLength !== undefined && distribution.length !== expectedLength) {
      throw new RangeError(
        `${label} length must equal scoreRangePlan.workingLength`
      )
    }
    return Array.from(distribution)
  }

  const expanded = expandSparseDistribution(
    distribution,
    fallbackLength
  )
  if (expectedLength !== undefined && expanded.length !== expectedLength) {
    throw new RangeError(
      `${label} length must equal scoreRangePlan.workingLength`
    )
  }
  return expanded
}

function validateProbabilityDistribution(distribution, label) {
  let total = 0
  for (const probability of distribution) {
    if (!Number.isFinite(probability) || Number.isNaN(probability)) {
      throw new RangeError(`${label} contains NaN or infinity`)
    }
    if (probability < -1e-12) {
      throw new RangeError(`${label} contains a negative probability`)
    }
    total += probability
  }
  if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-8) {
    throw new RangeError(`${label} probability total is not approximately one`)
  }
}

function calculateScoreWorking(
  params,
  { getDxDistribution },
  fix = false,
  scoreRangePlan
) {
  const plan = validateScoreRangePlan(scoreRangePlan)

  if (fix) {
    const fixedScore = Math.max(0, params.skill)
    if (!Number.isSafeInteger(fixedScore)) {
      throw new RangeError('fixed score must be a safe integer')
    }
    // Keep the fixed-score path sparse.  A fixed evasion value may be much
    // larger than the historical 1023 published bucket, and allocating a
    // dense array up to that value would turn a valid input into an
    // accidental memory spike.  The score producer below represents the
    // same point mass with an offset of `fixedScore`.
    return {
      workingDistribution: [1],
      automaticFailureProbability: 0,
      alreadyShifted: true,
      fixedScore,
      plan,
    }
  }

  const requestedLength = plan?.workingLength ?? WORKING_DISTRIBUTION_SIZE
  const dxOptions = plan
    ? {
        workingLength: requestedLength,
        rounding: 'unrounded',
        ...(params.yousei > 0 && plan.fftLength > 0
          ? { fftLength: plan.fftLength }
          : {}),
      }
    : undefined
  const getDistribution = (shihai, dice, critical) => {
    if (dxOptions === undefined) {
      return params.yousei === 0
        ? getDxDistribution(shihai, dice, critical)
        : getDxDistribution(
            shihai,
            dice,
            critical,
            undefined,
            params.yousei
          )
    }
    return params.yousei === 0
      ? getDxDistribution(shihai, dice, critical, dxOptions)
      : getDxDistribution(
          shihai,
          dice,
          critical,
          dxOptions,
          params.yousei
        )
  }
  let diceResult = expandDxDistribution(
    getDistribution(params.shihai, params.dice, params.critical),
    requestedLength,
    plan?.workingLength,
    'DX distribution'
  )
  if (plan) {
    validateProbabilityDistribution(diceResult, 'DX distribution')
  }

  const automaticFailureProbability =
    (diceResult[0] ?? 0) + (diceResult[1] ?? 0)
  if (diceResult.length > 0) {
    diceResult[0] = 0
  }
  if (diceResult.length > 1) {
    diceResult[1] = 0
  }

  return {
    workingDistribution: diceResult,
    automaticFailureProbability,
    alreadyShifted: false,
    plan,
  }
}

function createScoreResult(
  params,
  workingDistribution,
  automaticFailureProbability,
  scoreRangePlan,
  alreadyShifted = false,
  fixedScore = null
) {
  if (alreadyShifted) {
    const point = fixedScore ?? Math.max(0, params.skill)
    if (!Number.isSafeInteger(point) || point < 0) {
      throw new RangeError('fixed score must be a non-negative safe integer')
    }
    return createDistributionResult({
      values: [1],
      offset: point,
      support: { kind: 'finite', max: point },
      overflow: null,
    })
  }

  const workingMax = scoreRangePlan?.workingLength !== undefined
    ? scoreRangePlan.workingLength - 2
    : workingDistribution.length - 2
  const overflowIndex = workingDistribution.length - 1
  const support = getScoreSupport(params, alreadyShifted)
  const finiteSupport = support.kind === 'finite'
  const explicitMax = getScoreOutputMax(
    params,
    workingMax,
    alreadyShifted
  )
  const values = new Float64Array(explicitMax + 1)

  for (let rawValue = 0; rawValue < overflowIndex; rawValue += 1) {
    const probability = workingDistribution[rawValue]
    if (probability === 0) {
      continue
    }
    const scoreValue = alreadyShifted
      ? rawValue
      : Math.max(0, rawValue + params.skill)
    if (scoreValue <= explicitMax) {
      values[scoreValue] += probability
    }
  }

  values[0] += automaticFailureProbability

  const tailProbability = workingDistribution[overflowIndex] ?? 0
  if (
    finiteSupport
    && Math.abs(tailProbability) > DISTRIBUTION_RESULT_TOLERANCE
  ) {
    throw new RangeError(
      'finite score support contains non-zero working tail'
    )
  }

  const overflowProbability = finiteSupport
    ? 0
    : tailProbability
  const overflow = finiteSupport
    ? null
    : {
        kind: 'exact',
        lowerBound: Math.max(0, workingMax + 1 + params.skill),
        probability: overflowProbability,
        errorBound: DISTRIBUTION_RESULT_TOLERANCE,
      }

  return createDistributionResult({
    values,
    offset: 0,
    support,
    overflow,
  })
}

function sumDxTailThrough(cutoff, dice, critical) {
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
 * For score producers only, this metadata records a defensive
 * probability interval without treating errorBound as probability mass.
 * Exact overflow probability is actual mass, while probabilityUpperBound
 * already includes the producer's safety margin. A zero-mass overflow with
 * positive diagnostic error uses the independent planner bound; without one,
 * no probability certificate is produced.
 */
function createScoreTailCertificate(result, scoreRangePlan) {
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
  } else {
    if (overflow.probabilityUpperBound > 0) {
      massUpperBound = hasPlannedTailBound
        ? Math.min(overflow.probabilityUpperBound, plannedTailBound)
        : overflow.probabilityUpperBound
    } else if (probabilityErrorBound > 0) {
      if (!hasPlannedTailBound) {
        return null
      }
      massUpperBound = plannedTailBound
    }
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

function isValidScoreTailCertificate(certificate) {
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

function createFiniteScoreTailMomentCertificate(modeledMax, model) {
  return Object.freeze({
    version: SCORE_TAIL_MOMENT_CERTIFICATE_VERSION,
    kind: 'score-tail-moment-certificate',
    model,
    modeledMax,
    massUpperBound: 0,
    firstMomentUpperBound: 0,
    numericalErrorBound: 0,
  })
}

/**
 * Bound only the part of a Score that lies above the producer's explicit
 * working cutoff. The mass term is the boundary contribution at W+1; the
 * first-moment helper is the residual tail-sum above that boundary. Keeping
 * this certificate separate from the whole-score expectation certificate lets
 * Damage propagate a tail without interpreting a generic overflow error as
 * probability mass.
 */
function createScoreTailMomentCertificate(
  params,
  result,
  scoreRangePlan,
  scoreTailCertificate,
  alreadyShifted
) {
  const support = getScoreSupport(params, alreadyShifted)
  if (support.kind === 'finite') {
    const modeledMax = Number.isSafeInteger(scoreRangePlan?.workingMax)
      ? scoreRangePlan.workingMax
      : support.max
    return createFiniteScoreTailMomentCertificate(
      modeledMax,
      'finite-support'
    )
  }

  if (
    alreadyShifted
    || scoreRangePlan === undefined
    || scoreRangePlan === null
  ) {
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
        params.critical
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

  // Each term is evaluated from a centralized tail bound, but the products
  // and their final sum still incur floating-point error. Scale the margin by
  // the operation's magnitude and by the modeled boundary; do not introduce
  // an input-independent expected-value epsilon.
  const boundaryArithmeticErrorBound =
    Math.max(1, Math.abs(boundaryContributionUpperBound))
      * DISTRIBUTION_RESULT_TOLERANCE
  const residualArithmeticErrorBound =
    Math.max(1, Math.abs(residualUpperBound))
      * DISTRIBUTION_RESULT_TOLERANCE
  const skillArithmeticErrorBound =
    Math.max(1, Math.abs(skillContributionUpperBound))
      * DISTRIBUTION_RESULT_TOLERANCE
  const aggregationArithmeticErrorBound =
    Math.max(1, Math.abs(analyticUpperBound))
      * DISTRIBUTION_RESULT_TOLERANCE
  const tailEvaluationErrorBound = hasExactYouseiTail
    ? Math.max(1, Math.abs(modeledMax + 1))
      * DISTRIBUTION_RESULT_TOLERANCE
    : 0
  const numericalErrorBound =
    boundaryArithmeticErrorBound
    + residualArithmeticErrorBound
    + skillArithmeticErrorBound
    + aggregationArithmeticErrorBound
    + tailEvaluationErrorBound
  const firstMomentUpperBound = analyticUpperBound + numericalErrorBound
  if (
    !Number.isFinite(numericalErrorBound)
    || numericalErrorBound < 0
    || !Number.isFinite(firstMomentUpperBound)
    || firstMomentUpperBound < 0
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
    firstMomentUpperBound,
    boundaryContributionUpperBound,
    residualUpperBound,
    skillContributionUpperBound,
    boundaryArithmeticErrorBound,
    residualArithmeticErrorBound,
    skillArithmeticErrorBound,
    aggregationArithmeticErrorBound,
    tailEvaluationErrorBound,
    numericalErrorBound,
  })
}

/**
 * Build a finite expected-value interval for the initial safe migration
 * slice: an infinite DX maximum with no Yousei/Shihai and non-negative skill.
 * Unsupported score shapes intentionally return null and keep the existing
 * lower-bound summary contract.
 */
function createScoreExpectationCertificate(
  params,
  scoreRangePlan,
  alreadyShifted
) {
  if (
    alreadyShifted
    || params.dice <= 0
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
    params.critical
  )
  const residualUpperBound = maxTailFirstMomentUpperBound(
    modeledMax,
    params.dice,
    params.critical
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

  // This certificate is independent of the DP buckets. Each exact-max tail
  // evaluation is widened by the centralized numeric tolerance, and the
  // fumble/skill adjustment is widened separately. The geometric residual is
  // an analytic upper bound and receives one additional arithmetic margin.
  const tailEvaluationErrorBound =
    (modeledMax + 1) * DISTRIBUTION_RESULT_TOLERANCE
  const fumbleCorrectionErrorBound =
    (1 + params.skill) * DISTRIBUTION_RESULT_TOLERANCE
  const residualArithmeticErrorBound =
    Math.max(1, residualUpperBound) * DISTRIBUTION_RESULT_TOLERANCE
  const numericalErrorBound =
    tailEvaluationErrorBound
    + fumbleCorrectionErrorBound
    + residualArithmeticErrorBound
  const lowerBound = Math.max(
    0,
    lowerExpectedValue - numericalErrorBound
  )
  const upperBound = upperExpectedValue + numericalErrorBound

  return Object.freeze({
    version: SCORE_EXPECTATION_CERTIFICATE_VERSION,
    kind: 'score-expectation-certificate',
    model: 'dx-max-tail',
    modeledMax,
    lowerBound,
    upperBound,
    residualUpperBound,
    tailEvaluationErrorBound,
    fumbleCorrectionErrorBound,
    residualArithmeticErrorBound,
    numericalErrorBound,
  })
}

export function calculateScore(
  params,
  dependencies,
  scoreRangePlan,
  fix = false
) {
  const {
    workingDistribution,
    automaticFailureProbability,
    alreadyShifted,
    fixedScore,
  } = calculateScoreWorking(
    params,
    dependencies,
    fix,
    scoreRangePlan
  )
  const result = createScoreResult(
    params,
    workingDistribution,
    automaticFailureProbability,
    scoreRangePlan,
    alreadyShifted,
    fixedScore
  )
  const scoreTailCertificate = createScoreTailCertificate(
    result,
    scoreRangePlan
  )
  const scoreTailMomentCertificate = createScoreTailMomentCertificate(
    params,
    result,
    scoreRangePlan,
    scoreTailCertificate,
    alreadyShifted
  )
  const scoreExpectationCertificate =
    createScoreExpectationCertificate(
      params,
      scoreRangePlan,
      alreadyShifted
    )
  const metadata = Object.freeze({
    modeledDistribution: true,
    automaticFailureProbability,
    scoreTailCertificate,
    scoreTailMomentCertificate,
    ...(scoreExpectationCertificate === null
      ? {}
      : { scoreExpectationCertificate }),
  })

  return Object.freeze({ result, metadata })
}

function createScoreProbability(kind, details = {}) {
  if (kind === 'exact') {
    return createExactProbability(details.value)
  }
  return createBoundedProbability(details.lowerBound, details.upperBound)
}

function getScoreBuckets(envelope) {
  if (
    envelope === null
    || typeof envelope !== 'object'
    || envelope.result === null
    || typeof envelope.result !== 'object'
  ) {
    return null
  }

  validateDistributionResult(envelope.result)
  const result = envelope.result
  const buckets = []
  for (let index = 0; index < result.values.length; index += 1) {
    const probability = result.values[index]
    if (probability !== 0) {
      buckets.push({
        value: result.offset + index,
        probability,
      })
    }
  }

  return { result, buckets }
}

function getExactScoreBuckets(envelope) {
  const inspected = getScoreBuckets(envelope)
  if (inspected === null) {
    return null
  }

  const { result, buckets } = inspected

  const overflow = result.overflow
  if (overflow === null) {
    return buckets
  }
  if (overflow.kind === 'upper-bound') {
    return overflow.probabilityUpperBound === 0
      && overflow.errorBound === 0
      ? buckets
      : null
  }
  if (overflow.probability === 0 && overflow.errorBound === 0) {
    return buckets
  }
  if (
    result.support.kind === 'finite'
    && overflow.lowerBound === result.support.max
    && overflow.errorBound === 0
  ) {
    buckets.push({
      value: result.support.max,
      probability: overflow.probability,
    })
    return buckets
  }
  return null
}

function getScorePartition(envelope) {
  const inspected = getScoreBuckets(envelope)
  if (inspected === null) {
    return null
  }

  const exactBuckets = getExactScoreBuckets(envelope)
  if (exactBuckets !== null) {
    return {
      buckets: exactBuckets,
      tail: {
        massLowerBound: 0,
        massUpperBound: 0,
        lowerBound: null,
        probabilityErrorBound: 0,
      },
    }
  }

  const certificate = envelope.metadata?.scoreTailCertificate
  const overflow = inspected.result.overflow
  if (
    certificate === null
    || typeof certificate !== 'object'
    || certificate.version !== SCORE_TAIL_CERTIFICATE_VERSION
    || certificate.kind !== 'score-tail-certificate'
    || !Number.isFinite(certificate.massLowerBound)
    || !Number.isFinite(certificate.massUpperBound)
    || certificate.massLowerBound < 0
    || certificate.massUpperBound < certificate.massLowerBound
    || certificate.massUpperBound > 1
    || !Number.isFinite(certificate.probabilityErrorBound)
    || certificate.probabilityErrorBound < 0
    || !Number.isFinite(certificate.lowerBound)
    || overflow === null
  ) {
    return null
  }

  return {
    buckets: inspected.buckets,
    tail: {
      massLowerBound: certificate.massLowerBound,
      massUpperBound: certificate.massUpperBound,
      lowerBound: certificate.lowerBound,
      probabilityErrorBound: certificate.probabilityErrorBound ?? 0,
    },
  }
}

/**
 * Calculate P(action > reaction) for ascending, sparse score buckets.
 * `onReactionVisit` is intentionally optional and exists for structural tests
 * of the linear two-pointer walk; production callers do not allocate stats.
 */
export function calculateScoreSuccessProbability(
  actionBuckets,
  reactionBuckets,
  onReactionVisit
) {
  let reactionIndex = 0
  let reactionBelow = 0
  let actionSuccessProbability = 0

  for (const actionBucket of actionBuckets) {
    while (
      reactionIndex < reactionBuckets.length
      && reactionBuckets[reactionIndex].value < actionBucket.value
    ) {
      const reactionBucket = reactionBuckets[reactionIndex]
      reactionBelow += reactionBucket.probability
      onReactionVisit?.(reactionBucket, reactionIndex)
      reactionIndex += 1
    }
    actionSuccessProbability +=
      actionBucket.probability * reactionBelow
  }

  return actionSuccessProbability
}

/**
 * Return a conservative interval for P(action > reaction) while keeping the
 * explicit/explicit, action-tail/reaction-explicit,
 * action-explicit/reaction-tail, and tail/tail events disjoint.
 */
export function calculateScoreSuccessProbabilityInterval(
  action,
  reaction
) {
  const actionPartition = getScorePartition(action)
  const reactionPartition = getScorePartition(reaction)
  if (actionPartition === null || reactionPartition === null) {
    return null
  }

  const actionBuckets = actionPartition.buckets
  const reactionBuckets = reactionPartition.buckets
  const actionTail = actionPartition.tail
  const reactionTail = reactionPartition.tail
  const explicitSuccess = calculateScoreSuccessProbability(
    actionBuckets,
    reactionBuckets
  )
  const probabilityMargin =
    actionTail.massUpperBound > 0 || reactionTail.massUpperBound > 0
      ? DISTRIBUTION_RESULT_TOLERANCE
      : 0
  let reactionBelowActionTail = 0
  for (const bucket of reactionBuckets) {
    if (bucket.value < actionTail.lowerBound) {
      reactionBelowActionTail += bucket.probability
    }
  }
  let actionAboveReactionTail = 0
  for (const bucket of actionBuckets) {
    if (bucket.value > reactionTail.lowerBound) {
      actionAboveReactionTail += bucket.probability
    }
  }
  let reactionExplicitMass = 0
  for (const bucket of reactionBuckets) {
    reactionExplicitMass += bucket.probability
  }

  const lowerBound = Math.max(
    0,
    Math.min(
      1,
      explicitSuccess
      + actionTail.massLowerBound * reactionBelowActionTail
      - probabilityMargin
    )
  )
  const upperBound = Math.max(
    lowerBound,
    Math.min(
      1,
      explicitSuccess
      + actionTail.massUpperBound * reactionExplicitMass
      + reactionTail.massUpperBound * actionAboveReactionTail
      + actionTail.massUpperBound * reactionTail.massUpperBound
      + probabilityMargin
    )
  )

  return Object.freeze({ lowerBound, upperBound })
}

function getScoreSuccessProbability(action, reaction) {
  const actionBuckets = getExactScoreBuckets(action)
  const reactionBuckets = getExactScoreBuckets(reaction)
  if (actionBuckets === null || reactionBuckets === null) {
    const interval = calculateScoreSuccessProbabilityInterval(
      action,
      reaction
    )
    if (interval !== null) {
      return {
        action: createScoreProbability('bounded', interval),
        reaction: createScoreProbability('bounded', {
          lowerBound: 1 - interval.upperBound,
          upperBound: 1 - interval.lowerBound,
        }),
      }
    }
    return {
      action: createScoreProbability('bounded', {
        lowerBound: 0,
        upperBound: 1,
      }),
      reaction: createScoreProbability('bounded', {
        lowerBound: 0,
        upperBound: 1,
      }),
    }
  }

  const actionSuccessProbability = calculateScoreSuccessProbability(
    actionBuckets,
    reactionBuckets
  )

  return {
    action: createScoreProbability('exact', {
      value: actionSuccessProbability,
    }),
    reaction: createScoreProbability('exact', {
      value: 1 - actionSuccessProbability,
    }),
  }
}

function getScoreExpectedValueStatistic(envelope) {
  const certificate = envelope?.metadata?.scoreExpectationCertificate
  if (
    certificate?.version === SCORE_EXPECTATION_CERTIFICATE_VERSION
    && certificate?.kind === 'score-expectation-certificate'
    && Number.isFinite(certificate.lowerBound)
    && Number.isFinite(certificate.upperBound)
    && certificate.lowerBound >= 0
    && certificate.upperBound >= certificate.lowerBound
  ) {
    return createBoundedCertifiedValue(
      certificate.lowerBound,
      certificate.upperBound
    )
  }
  return getCertifiedExpectedValue(envelope.result)
}

function getFixedDifficultySuccessProbability(envelope, target) {
  const partition = getScorePartition(envelope)
  if (partition === null) {
    return createScoreProbability('bounded', {
      lowerBound: 0,
      upperBound: 1,
    })
  }

  const explicitSuccess = partition.buckets
    .filter(({ value }) => value >= target)
    .reduce((sum, bucket) => sum + bucket.probability, 0)
    - (target === 0
      ? (envelope.metadata?.automaticFailureProbability ?? 0)
      : 0)
  const tail = partition.tail
  const tailLowerBound = Number.isFinite(tail.lowerBound)
    && target <= tail.lowerBound
    ? tail.massLowerBound
    : 0
  const tailUpperBound = tail.massUpperBound
  const lowerBound = Math.max(
    0,
    Math.min(1, explicitSuccess + tailLowerBound)
  )
  const upperBound = Math.max(
    lowerBound,
    Math.min(1, explicitSuccess + tailUpperBound)
  )

  if (tail.massUpperBound === 0 && tail.probabilityErrorBound === 0) {
    return createScoreProbability('exact', {
      value: lowerBound,
    })
  }
  return createScoreProbability('bounded', {
    lowerBound,
    upperBound,
  })
}

/**
 * Summarize the two Attack score envelopes without projecting them
 * into the legacy 1024 buckets. Expected values retain the
 * exact/bounded/lower-bound semantics; bounded success-rate intervals are
 * retained unless both score supports are fully represented.
 */
export function getScoreStatistics(
  score,
  dfclty = { opposed: true, target: 0 }
) {
  if (
    score === null
    || typeof score !== 'object'
    || score.action === null
    || typeof score.action !== 'object'
    || score.reaction === null
    || typeof score.reaction !== 'object'
  ) {
    throw new TypeError('score must contain action and reaction envelopes')
  }

  const actionExpectedValue = getScoreExpectedValueStatistic(score.action)
  const reactionExpectedValue = getScoreExpectedValueStatistic(score.reaction)
  let rates
  if (dfclty.opposed) {
    rates = getScoreSuccessProbability(
      score.action,
      score.reaction
    )
  } else {
    const target = dfclty.target ?? 0
    rates = {
      action: getFixedDifficultySuccessProbability(score.action, target),
      reaction: createScoreProbability('exact', { value: 0 }),
    }
  }

  return Object.freeze({
    action: Object.freeze({
      expectedValue: actionExpectedValue,
      successProbability: rates.action,
      automaticFailureProbability: createExactProbability(
        score.action.metadata?.automaticFailureProbability ?? 0
      ),
    }),
    reaction: Object.freeze({
      expectedValue: reactionExpectedValue,
      successProbability: rates.reaction,
      automaticFailureProbability: createExactProbability(
        score.reaction.metadata?.automaticFailureProbability ?? 0
      ),
    }),
  })
}
