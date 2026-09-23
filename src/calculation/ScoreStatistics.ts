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
import type {
  CertifiedProbability,
  CertifiedValue,
} from '../domain/CertifiedValue'
import type { DifficultyInput } from '../domain/CalculationInputs'
import type {
  ScoreEnvelope,
  ScorePair,
  ScoreStatistics,
} from '../domain/ScoreResultTypes'

interface ExactProbabilityDetails {
  readonly value: number
}

interface BoundedProbabilityDetails {
  readonly lowerBound: number
  readonly upperBound: number
}

interface ScoreSuccessProbabilities {
  readonly action: CertifiedProbability
  readonly reaction: CertifiedProbability
}

function createScoreProbability(
  kind: 'exact' | 'bounded',
  details: ExactProbabilityDetails | BoundedProbabilityDetails,
): CertifiedProbability {
  if (kind === 'exact') {
    if (!('value' in details)) {
      throw new TypeError('exact probability details must include value')
    }
    return createExactProbability(details.value)
  }
  if (!('lowerBound' in details) || !('upperBound' in details)) {
    throw new TypeError(
      'bounded probability details must include lowerBound and upperBound',
    )
  }
  return createBoundedProbability(details.lowerBound, details.upperBound)
}

function getScoreSuccessProbability(
  action: ScoreEnvelope,
  reaction: ScoreEnvelope,
): ScoreSuccessProbabilities {
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

function getScoreExpectedValueStatistic(envelope: ScoreEnvelope): CertifiedValue {
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

function getFixedDifficultySuccessProbability(
  envelope: ScoreEnvelope,
  target: number,
): CertifiedProbability {
  const partition = getScoreOutcomePartition(envelope)
  if (partition === null) {
    return createScoreProbability('bounded', {
      lowerBound: 0,
      upperBound: 1,
    })
  }

  const explicitSuccess = partition.regularBuckets
    .filter(({ value }: { value: number }) => value >= target)
    .reduce((sum, bucket) => sum + bucket.probability, 0)
  const tail = partition.tail
  const tailLowerBound = Number.isFinite(tail.lowerBound)
    && tail.lowerBound !== null
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
 * Summarize score envelopes without collapsing them into a fixed-width
 * distribution representation.
 */
export function getScoreStatistics(
  score: ScorePair,
  difficulty: DifficultyInput = { opposed: true, target: 0 },
): ScoreStatistics {
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
  if (difficulty.opposed) {
    rates = getScoreSuccessProbability(score.action, score.reaction)
  } else {
    const target = difficulty.target ?? 0
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
