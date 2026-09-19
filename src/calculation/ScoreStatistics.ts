import {
  createBoundedProbability,
  createBoundedCertifiedValue,
  createExactProbability,
} from '../domain/CertifiedValue'
import { getCertifiedExpectedValue } from './DistributionResult'
import {
  calculateScoreSuccessProbability,
  calculateScoreSuccessProbabilityInterval,
  getScoreOutcomePartition,
} from './ScoreOutcome'
import { SCORE_EXPECTATION_CERTIFICATE_VERSION } from './ScoreCertificates'

function createScoreProbability(kind: string, details: any = {}) {
  if (kind === 'exact') {
    return createExactProbability(details.value)
  }
  return createBoundedProbability(details.lowerBound, details.upperBound)
}

function getScoreSuccessProbability(action: any, reaction: any) {
  const actionPartition = getScoreOutcomePartition(action)
  const reactionPartition = getScoreOutcomePartition(reaction)
  if (actionPartition === null || reactionPartition === null) {
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

  const actionBuckets = actionPartition.regularBuckets
  const reactionBuckets = reactionPartition.regularBuckets
  const actionHasTail = actionPartition.tail.massUpperBound > 0
    || actionPartition.tail.probabilityErrorBound > 0
  const reactionHasTail = reactionPartition.tail.massUpperBound > 0
    || reactionPartition.tail.probabilityErrorBound > 0
  if (actionHasTail || reactionHasTail) {
    const interval = calculateScoreSuccessProbabilityInterval(
      action,
      reaction,
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
    reactionBuckets,
  ) + actionPartition.regularExplicitMass
    * reactionPartition.forcedFailureProbability

  return {
    action: createScoreProbability('exact', {
      value: actionSuccessProbability,
    }),
    reaction: createScoreProbability('exact', {
      value: 1 - actionSuccessProbability,
    }),
  }
}

function getScoreExpectedValueStatistic(envelope: any) {
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
      certificate.upperBound,
    )
  }
  return getCertifiedExpectedValue(envelope.result)
}

function getFixedDifficultySuccessProbability(envelope: any, target: number) {
  const partition = getScoreOutcomePartition(envelope)
  if (partition === null) {
    return createScoreProbability('bounded', {
      lowerBound: 0,
      upperBound: 1,
    })
  }

  const explicitSuccess = partition.regularBuckets
    .filter(({ value }: { value: number }) => value >= target)
    .reduce((sum: number, bucket: any) => sum + bucket.probability, 0)
  const tail = partition.tail
  const tailLowerBound = Number.isFinite(tail.lowerBound)
    && target <= tail.lowerBound
    ? tail.massLowerBound
    : 0
  const tailUpperBound = tail.massUpperBound
  const lowerBound = Math.max(
    0,
    Math.min(1, explicitSuccess + tailLowerBound),
  )
  const upperBound = Math.max(
    lowerBound,
    Math.min(1, explicitSuccess + tailUpperBound),
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
 * Summarize two score envelopes without projecting them into legacy buckets.
 */
export function getScoreStatistics(
  score: any,
  dfclty: any = { opposed: true, target: 0 },
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
    rates = getScoreSuccessProbability(score.action, score.reaction)
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
      forcedFailureProbability: createExactProbability(
        score.action.metadata?.forcedFailureProbability ?? 0,
      ),
    }),
    reaction: Object.freeze({
      expectedValue: reactionExpectedValue,
      successProbability: rates.reaction,
      forcedFailureProbability: createExactProbability(
        score.reaction.metadata?.forcedFailureProbability ?? 0,
      ),
    }),
  })
}
