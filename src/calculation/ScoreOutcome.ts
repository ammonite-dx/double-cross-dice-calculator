import {
  DISTRIBUTION_RESULT_TOLERANCE,
  validateDistributionResult,
} from './DistributionResult'
import {
  isValidScoreTailCertificate,
} from './ScoreCertificates'
import type { DistributionResult } from '../domain/DistributionResultTypes'
import type {
  ScoreEnvelope,
} from '../domain/ScoreResultTypes'

export interface ScoreBucket {
  readonly value: number
  readonly probability: number
}

export interface ScoreTailPartition {
  readonly massLowerBound: number
  readonly massUpperBound: number
  readonly lowerBound: number | null
  readonly probabilityErrorBound: number
}

interface ScorePartition {
  readonly buckets: ScoreBucket[]
  readonly tail: ScoreTailPartition
}

export interface ScoreOutcomePartition {
  readonly buckets: readonly ScoreBucket[]
  readonly regularBuckets: readonly ScoreBucket[]
  readonly regularZeroProbability: number
  readonly regularExplicitMass: number
  readonly forcedFailureProbability: number
  readonly tail: ScoreTailPartition
}

function getScoreBuckets(envelope: ScoreEnvelope): {
  result: DistributionResult
  buckets: ScoreBucket[]
} | null {
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

function getExactScoreBuckets(envelope: ScoreEnvelope): ScoreBucket[] | null {
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

function getScorePartition(envelope: ScoreEnvelope): ScorePartition | null {
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
    !isValidScoreTailCertificate(certificate)
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
 * Split the displayed score-zero bucket into the two rule-level outcomes it
 * represents. Fumbles and zero-dice automatic failures are forced failures;
 * an ordinary result that is shifted or clamped to zero remains regular.
 */
export function getScoreOutcomePartition(
  envelope: ScoreEnvelope,
  { allowUncertifiedTail = false }: { allowUncertifiedTail?: boolean } = {},
): ScoreOutcomePartition | null {
  let partition = getScorePartition(envelope)
  if (partition === null && allowUncertifiedTail) {
    const inspected = getScoreBuckets(envelope)
    if (inspected === null) {
      return null
    }
    const overflow = inspected.result.overflow
    partition = {
      buckets: inspected.buckets,
      tail: overflow === null
        ? {
            massLowerBound: 0,
            massUpperBound: 0,
            lowerBound: null,
            probabilityErrorBound: 0,
          }
        : {
            massLowerBound: overflow.kind === 'exact'
              ? overflow.probability
              : 0,
            massUpperBound: overflow.kind === 'exact'
              ? overflow.probability
              : overflow.probabilityUpperBound,
            lowerBound: overflow.lowerBound,
            probabilityErrorBound: overflow.errorBound,
          },
    }
  }
  if (partition === null) {
    return null
  }

  const forcedFailureProbability = envelope.metadata
    ?.forcedFailureProbability ?? 0
  if (
    !Number.isFinite(forcedFailureProbability)
    || forcedFailureProbability < 0
    || forcedFailureProbability > 1
  ) {
    return null
  }

  const displayedZeroProbability = partition.buckets
    .find(({ value }: { value: number }) => value === 0)
    ?.probability ?? 0
  if (
    forcedFailureProbability
      > displayedZeroProbability + DISTRIBUTION_RESULT_TOLERANCE
  ) {
    return null
  }

  const regularZeroProbability = Math.max(
    0,
    displayedZeroProbability - forcedFailureProbability,
  )
  const regularBuckets = []
  for (const bucket of partition.buckets) {
    if (bucket.value === 0) {
      if (regularZeroProbability > 0) {
        regularBuckets.push({
          value: 0,
          probability: regularZeroProbability,
        })
      }
      continue
    }
    regularBuckets.push(bucket)
  }
  let regularExplicitMass = 0
  for (const bucket of regularBuckets) {
    regularExplicitMass += bucket.probability
  }

  return Object.freeze({
    buckets: partition.buckets,
    regularBuckets,
    regularZeroProbability,
    regularExplicitMass,
    forcedFailureProbability,
    tail: partition.tail,
  })
}

/** Calculate P(action > reaction) for ascending sparse score buckets. */
export function calculateScoreSuccessProbability(
  actionBuckets: readonly ScoreBucket[],
  reactionBuckets: readonly ScoreBucket[],
  onReactionVisit?: (bucket: ScoreBucket, index: number) => void,
): number {
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

/** Return a conservative interval for P(action > reaction). */
export function calculateScoreSuccessProbabilityInterval(
  action: ScoreEnvelope,
  reaction: ScoreEnvelope,
): { lowerBound: number; upperBound: number } | null {
  const actionPartition = getScoreOutcomePartition(action)
  const reactionPartition = getScoreOutcomePartition(reaction)
  if (actionPartition === null || reactionPartition === null) {
    return null
  }

  const actionBuckets = actionPartition.regularBuckets
  const reactionBuckets = reactionPartition.regularBuckets
  const actionTail = actionPartition.tail
  const reactionTail = reactionPartition.tail
  const explicitSuccess = calculateScoreSuccessProbability(
    actionBuckets,
    reactionBuckets,
  ) + actionPartition.regularExplicitMass
    * reactionPartition.forcedFailureProbability
  let reactionBelowActionTail = 0
  for (const bucket of reactionBuckets) {
    if (
      actionTail.lowerBound !== null
      && bucket.value < actionTail.lowerBound
    ) {
      reactionBelowActionTail += bucket.probability
    }
  }
  let actionAboveReactionTail = 0
  for (const bucket of actionBuckets) {
    if (
      reactionTail.lowerBound !== null
      && bucket.value > reactionTail.lowerBound
    ) {
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
      + actionTail.massLowerBound * (
        reactionPartition.forcedFailureProbability
        + reactionBelowActionTail
      ),
    ),
  )
  const upperBound = Math.max(
    lowerBound,
    Math.min(
      1,
      explicitSuccess
      + actionTail.massUpperBound * (
        reactionPartition.forcedFailureProbability
        + reactionExplicitMass
        + reactionTail.massUpperBound
      )
      + reactionTail.massUpperBound * actionAboveReactionTail,
    ),
  )

  return Object.freeze({ lowerBound, upperBound })
}
