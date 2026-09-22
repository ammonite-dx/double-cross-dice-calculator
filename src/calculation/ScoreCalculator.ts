import {
  DISTRIBUTION_RESULT_TOLERANCE,
  createDistributionResult,
} from './DistributionResult'
import {
  getScoreOutputMax,
  getScoreSupport,
} from './ScoreSupport'
import {
  createFiniteScoreTailMomentCertificate,
  createScoreExpectationCertificate,
  createScoreTailCertificate,
  createScoreTailMomentCertificate,
} from './ScoreCertificates'
import type { ScoreInput } from '../domain/InputDomain'
import type { ScoreResolution } from '../domain/ScoreResolution'
import type {
  FixedScoreRangePlan,
  RolledScoreRangePlan,
  ScoreRangePlan,
} from './planning/RangePlannerTypes'
import type { DxDistributionProvider } from './DxProviderTypes'

interface ScoreDependencies {
  readonly getDxDistribution?: DxDistributionProvider
}

interface RequiredScoreDependencies {
  readonly getDxDistribution: DxDistributionProvider
}

function validateScoreRangePlan(
  scoreRangePlan: RolledScoreRangePlan | null | undefined,
): RolledScoreRangePlan | null {
  if (scoreRangePlan === undefined || scoreRangePlan === null) {
    return null
  }
  if (
    typeof scoreRangePlan !== 'object' ||
    (scoreRangePlan.kind !== undefined && scoreRangePlan.kind !== 'rolled-score') ||
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
  distribution: Float64Array,
  expectedLength: number | undefined,
  label: string,
): number[] {
  if (!(distribution instanceof Float64Array)) {
    throw new TypeError(`${label} provider must return a Float64Array`)
  }
  if (expectedLength !== undefined && distribution.length !== expectedLength) {
    throw new RangeError(
      `${label} length must equal scoreRangePlan.workingLength`
    )
  }
  return Array.from(distribution)
}

function validateProbabilityDistribution(distribution: readonly number[], label: string): void {
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
  params: ScoreInput,
  { getDxDistribution }: RequiredScoreDependencies,
  scoreRangePlan: RolledScoreRangePlan | null | undefined,
): {
  workingDistribution: number[]
  forcedFailureProbability: number
  plan: RolledScoreRangePlan
} {
  const plan = validateScoreRangePlan(scoreRangePlan)

  if (plan === null) {
    throw new TypeError(
      'non-fixed score calculation requires a score range plan with an explicit workingLength'
    )
  }
  const requestedLength = plan.workingLength
  const dxOptions = {
    workingLength: requestedLength,
    ...(params.yousei > 0 && plan.fftLength > 0
      ? { fftLength: plan.fftLength }
      : {}),
  }
  const getDistribution = (input: Omit<ScoreInput, 'skill' | 'yousei'>) => getDxDistribution(
    { ...input, yousei: params.yousei },
    dxOptions,
  )
  let diceResult = expandDxDistribution(
    getDistribution({
      shihai: params.shihai,
      dice: params.dice,
      critical: params.critical,
    }),
    plan?.workingLength,
    'DX distribution'
  )
  if (plan) {
    validateProbabilityDistribution(diceResult, 'DX distribution')
  }

  const forcedFailureProbability =
    (diceResult[0] ?? 0) + (diceResult[1] ?? 0)
  if (diceResult.length > 0) {
    diceResult[0] = 0
  }
  if (diceResult.length > 1) {
    diceResult[1] = 0
  }

  return {
    workingDistribution: diceResult,
    forcedFailureProbability,
    plan,
  }
}

function createScoreResult(
  params: ScoreInput,
  workingDistribution: readonly number[],
  forcedFailureProbability: number,
  scoreRangePlan: RolledScoreRangePlan | null | undefined,
) {
  const workingMax = scoreRangePlan?.workingLength !== undefined
    ? scoreRangePlan.workingLength - 2
    : workingDistribution.length - 2
  const overflowIndex = workingDistribution.length - 1
  const support = getScoreSupport(params)
  const finiteSupport = support.kind === 'finite'
  const explicitMax = getScoreOutputMax(params, workingMax)
  const values = new Float64Array(explicitMax + 1)

  for (let rawValue = 0; rawValue < overflowIndex; rawValue += 1) {
    const probability = workingDistribution[rawValue]
    if (probability === 0) {
      continue
    }
    const scoreValue = Math.max(0, rawValue + params.skill)
    if (scoreValue <= explicitMax) {
      values[scoreValue] += probability
    }
  }

  values[0] += forcedFailureProbability

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

export function calculateScore(
  params: ScoreInput,
  dependencies: ScoreDependencies,
  scoreRangePlan: RolledScoreRangePlan | null | undefined,
) {
  if (typeof dependencies.getDxDistribution !== 'function') {
    throw new TypeError('calculateScore requires a runtime distribution provider')
  }
  const requiredDependencies: RequiredScoreDependencies = {
    getDxDistribution: dependencies.getDxDistribution,
  }
  const {
    workingDistribution,
    forcedFailureProbability,
  } = calculateScoreWorking(
    params,
    requiredDependencies,
    scoreRangePlan
  )
  const result = createScoreResult(
    params,
    workingDistribution,
    forcedFailureProbability,
    scoreRangePlan
  )
  const scoreTailCertificate = createScoreTailCertificate(
    result,
    scoreRangePlan
  )
  const scoreTailMomentCertificate = createScoreTailMomentCertificate(
    params,
    result,
    scoreRangePlan,
    scoreTailCertificate
  )
  const scoreExpectationCertificate =
    createScoreExpectationCertificate(
      params,
      scoreRangePlan
    )
  const metadata = Object.freeze({
    modeledDistribution: true,
    forcedFailureProbability,
    scoreTailCertificate,
    scoreTailMomentCertificate,
    ...(scoreExpectationCertificate === null
      ? {}
      : { scoreExpectationCertificate }),
  })

  return Object.freeze({ result, metadata })
}

function validateScoreResolutionPlan(
  resolution: ScoreResolution,
  scoreRangePlan: ScoreRangePlan | null | undefined,
): void {
  if (scoreRangePlan === undefined || scoreRangePlan === null) {
    throw new TypeError('score resolution calculation requires a score range plan')
  }
  if (scoreRangePlan.kind !== resolution.kind) {
    throw new TypeError(
      `score resolution kind ${resolution.kind} does not match plan kind ${scoreRangePlan.kind}`
    )
  }
  if (
    resolution.kind === 'fixed-score'
    && (!Number.isSafeInteger((scoreRangePlan as FixedScoreRangePlan).value)
      || (scoreRangePlan as FixedScoreRangePlan).value < 0)
  ) {
    throw new TypeError('fixed score plan must include a non-negative safe integer value')
  }
  if (
    resolution.kind === 'fixed-score'
    && (scoreRangePlan as FixedScoreRangePlan).value !== resolution.value
  ) {
    throw new RangeError('fixed score plan value does not match resolution value')
  }
}

function createDeterministicScoreEnvelope(
  kind: 'fixed-score' | 'forced-failure',
  value: number,
) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('deterministic score value must be a non-negative safe integer')
  }
  const forcedFailureProbability = kind === 'forced-failure' ? 1 : 0
  const result = createDistributionResult({
    values: [1],
    offset: value,
    support: { kind: 'finite', max: value },
    overflow: null,
  })
  const scoreTailCertificate = createScoreTailCertificate(result, null)
  const scoreTailMomentCertificate = createFiniteScoreTailMomentCertificate(
    value,
    'finite-support'
  )
  return Object.freeze({
    result,
    metadata: Object.freeze({
      modeledDistribution: true,
      forcedFailureProbability,
      scoreTailCertificate,
      scoreTailMomentCertificate,
    }),
  })
}

/**
 * Execute a rolled, fixed, or forced score using the same resolution that was
 * passed to the range planner.  Deterministic scores stay sparse regardless
 * of their coordinate, so a large fixed value never allocates a dense array.
 */
export function calculateScoreResolution(
  resolution: ScoreResolution,
  dependencies: ScoreDependencies,
  scoreRangePlan: ScoreRangePlan | null | undefined,
) {
  if (
    resolution?.kind !== 'fixed-score'
    && resolution?.kind !== 'rolled-score'
    && resolution?.kind !== 'forced-failure'
  ) {
    throw new TypeError('score resolution must be rolled-score, fixed-score, or forced-failure')
  }

  if (resolution.kind === 'rolled-score') {
    validateScoreResolutionPlan(resolution, scoreRangePlan)
    return calculateScore(
      resolution.params,
      dependencies,
      scoreRangePlan as RolledScoreRangePlan
    )
  }

  validateScoreResolutionPlan(resolution, scoreRangePlan)
  return createDeterministicScoreEnvelope(
    resolution.kind,
    resolution.kind === 'fixed-score' ? resolution.value : 0
  )
}
