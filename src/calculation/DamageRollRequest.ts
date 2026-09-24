import {
  DISTRIBUTION_RESULT_TOLERANCE,
  validateDistributionResult,
} from './DistributionResult'
import {
  getScoreOutcomePartition,
  isReactionTailAtOrAboveActionMaximum,
} from './ScoreOutcome'
import { RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH } from './RuntimeDamageRollLimits'
import {
  isValidScoreTailCertificate,
  isValidScoreTailMomentCertificate,
} from './ScoreCertificates'
import type {
  DistributionResult,
  DistributionSupport,
} from '../domain/DistributionResultTypes'
import type { DamageInput } from '../domain/CalculationInputs'
import type {
  ScorePair,
  ScoreTailCertificate,
  ScoreTailMomentCertificate,
} from '../domain/ScoreResultTypes'
import type { DamageRangePlan } from './planning/RangePlannerTypes'
import type { ScoreOutcomePartition } from './ScoreOutcome'

interface ValidatedScoreEnvelope {
  readonly envelope: ScorePair['action']
  readonly outcome: ScoreOutcomePartition
  readonly result: DistributionResult
  readonly explicitMass: number
  readonly overflowMassUpperBound: number
  readonly errorBound: number
  readonly certificateErrorBound: number
  readonly certificate: ScoreTailCertificate | null
  readonly momentCertificate: ScoreTailMomentCertificate | null
}

export interface DamageRollRequest {
  readonly failureProbability: number
  readonly hitProbability: number
  readonly weights: Float64Array
  readonly unmodeledScoreProbabilityUpperBound: number
  readonly scoreTailErrorBound: number
  readonly scoreTailCertificates: readonly (ScoreTailCertificate | null)[]
  readonly scoreTailMomentCertificates:
    readonly (ScoreTailMomentCertificate | null)[]
  readonly actionExplicitMax: number | null
  readonly sourceSupport: DistributionSupport
}

function validateScoreEnvelope(
  envelope: ScorePair['action'],
  label: string,
): ValidatedScoreEnvelope {
  if (
    envelope === null
    || typeof envelope !== 'object'
    || Array.isArray(envelope)
    || envelope.result === null
    || typeof envelope.result !== 'object'
  ) {
    throw new TypeError(`${label} must be a score envelope with a result`)
  }

  validateDistributionResult(envelope.result)
  const outcome = getScoreOutcomePartition(envelope, {
    allowUncertifiedTail: true,
  })
  if (outcome === null) {
    throw new RangeError(`${label} has invalid forced-failure metadata`)
  }
  const { result } = envelope
  let explicitMass = 0
  for (const probability of result.values) {
    explicitMass += probability
  }

  const overflow = result.overflow
  const overflowMassUpperBound = overflow === null
    ? 0
    : overflow.kind === 'exact'
      ? overflow.probability
      : overflow.probabilityUpperBound
  const errorBound = overflow?.errorBound ?? 0
  const certificate = envelope.metadata?.scoreTailCertificate
  const certificateErrorBound = certificate !== null
    && certificate !== undefined
    && Number.isFinite(certificate.probabilityErrorBound)
    ? certificate.probabilityErrorBound
    : 0

  return {
    envelope,
    outcome,
    result,
    explicitMass,
    overflowMassUpperBound,
    errorBound,
    certificateErrorBound,
    certificate: isValidScoreTailCertificate(certificate)
      ? Object.freeze({ ...certificate })
      : null,
    momentCertificate: isValidScoreTailMomentCertificate(
      envelope.metadata?.scoreTailMomentCertificate,
    )
      ? Object.freeze({ ...envelope.metadata.scoreTailMomentCertificate })
      : null,
  }
}

function getScoreExplicitMax(score: ValidatedScoreEnvelope): number | null {
  let maximum: number | null = null
  for (const bucket of score.outcome.regularBuckets) {
    if (maximum === null || bucket.value > maximum) {
      maximum = bucket.value
    }
  }
  return maximum
}

function getReactionRegularBelowLookup(
  reactionOutcome: ScoreOutcomePartition,
): (scoreValue: number) => number {
  let index = 0
  let regularBelow = 0

  return (scoreValue: number) => {
    while (
      index < reactionOutcome.regularBuckets.length
      && reactionOutcome.regularBuckets[index].value < scoreValue
    ) {
      regularBelow += reactionOutcome.regularBuckets[index].probability
      index += 1
    }
    return regularBelow
  }
}

function getScoreSourceSupport(
  action: ValidatedScoreEnvelope,
): DistributionSupport {
  return action.result.support.kind === 'finite'
    ? Object.freeze({ kind: 'finite', max: action.result.support.max })
    : Object.freeze({ kind: 'infinite' })
}

/**
 * Build a damage-roll request directly from score coverage. Explicit score
 * values are paired with explicit reaction values only; score tails remain
 * unmodeled probability bounds rather than being folded into a last bucket.
 */
export function createDamageRollRequest(
  score: ScorePair,
  attack: DamageInput,
  damageRangePlan: DamageRangePlan | null | undefined,
): DamageRollRequest {
  const action = validateScoreEnvelope(score?.action, 'score.action')
  const reaction = validateScoreEnvelope(score?.reaction, 'score.reaction')
  const reactionExplicitBelow = getReactionRegularBelowLookup(
    reaction.outcome,
  )
  const maxDamageDice = damageRangePlan?.maxDamageDice
    ?? (
      Math.floor(
        Math.max(0, action.result.offset + action.result.values.length - 1)
          / 10,
      ) + 1 + attack.dice
    )

  if (
    !Number.isSafeInteger(maxDamageDice)
    || maxDamageDice < 0
    || maxDamageDice + 1 > RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH
  ) {
    throw new TypeError(
      'damage plan maxDamageDice must fit the runtime damage weight length',
    )
  }
  const weights = new Float64Array(maxDamageDice + 1)
  let failureProbability = 0
  let hitProbability = 0

  const reactionRegularMass = reaction.outcome.regularExplicitMass
  const reactionExplicitMass =
    reactionRegularMass + reaction.outcome.forcedFailureProbability
  const actionForcedMass = action.outcome.forcedFailureProbability
  const actionExplicitMass =
    action.outcome.regularExplicitMass + actionForcedMass
  const exactReactionOverflow = reaction.result.overflow?.kind === 'exact'
    ? reaction.result.overflow
    : null
  const actionHasUnmodeledTail =
    action.outcome.tail.massUpperBound > 0
    || action.outcome.tail.probabilityErrorBound > 0
    || action.overflowMassUpperBound > 0
    || action.errorBound > 0
    || action.certificateErrorBound > 0
  const reactionTailIsExactlyRepresented = exactReactionOverflow !== null
    && reaction.outcome.tail.massLowerBound === exactReactionOverflow.probability
    && reaction.outcome.tail.massUpperBound === exactReactionOverflow.probability
    // A classified tail is placed at the known failure coordinate. Its
    // probability error remains in the source certificate, but may be
    // absorbed into the DistributionResult mass tolerance only when it is
    // within that existing contract; larger errors stay unresolved below.
    && Math.max(reaction.errorBound, reaction.certificateErrorBound)
      <= DISTRIBUTION_RESULT_TOLERANCE
  const reactionTailIsGuaranteedFailure = !actionHasUnmodeledTail
    && action.result.support.kind === 'finite'
    && reactionTailIsExactlyRepresented
    && isReactionTailAtOrAboveActionMaximum(
      action.result.support.max,
      reaction.outcome.tail.lowerBound,
    )
  const classifiedReactionTailMass = reactionTailIsGuaranteedFailure
    ? exactReactionOverflow.probability
    : 0
  const unmodeledReactionTailMassUpperBound =
    reactionTailIsGuaranteedFailure
      ? 0
      : reaction.overflowMassUpperBound

  for (const actionBucket of action.outcome.regularBuckets) {
    const actionProbability = actionBucket.probability
    if (actionProbability === 0) {
      continue
    }

    const scoreValue = actionBucket.value
    const reactionBelow =
      reaction.outcome.forcedFailureProbability
      + reactionExplicitBelow(scoreValue)
    const reactionFailure = Math.max(
      0,
      reactionExplicitMass - reactionBelow,
    )
    failureProbability += actionProbability * reactionFailure

    const hit = actionProbability * reactionBelow
    if (hit === 0) {
      continue
    }

    const damageDice = Math.floor(scoreValue / 10) + 1 + attack.dice
    if (damageDice < 0 || damageDice >= weights.length) {
      throw new RangeError(
        `damage dice are outside the planned runtime range: ${damageDice}`,
      )
    }
    weights[damageDice] += hit
    hitProbability += hit
  }

  failureProbability += actionForcedMass * reactionExplicitMass
  if (classifiedReactionTailMass > 0) {
    failureProbability += actionExplicitMass * classifiedReactionTailMass
  }

  const reactionMassWithClassifiedTail =
    reactionExplicitMass + classifiedReactionTailMass
  const explicitPairMass = actionExplicitMass * reactionMassWithClassifiedTail
  const independentTailPairUpperBound =
    action.overflowMassUpperBound
    + unmodeledReactionTailMassUpperBound
    - action.overflowMassUpperBound * unmodeledReactionTailMassUpperBound
  const explicitPairMassGap = Math.max(0, 1 - explicitPairMass)
  // DistributionResult already permits a sub-probability mass discrepancy
  // within this tolerance. Keep the computed masses as-is (do not
  // renormalize); do not manufacture an unlocated tail from floating-point
  // residue that the shared result contract accepts.
  const effectiveExplicitPairMassGap =
    explicitPairMassGap > DISTRIBUTION_RESULT_TOLERANCE
      ? explicitPairMassGap
      : 0
  const scoreTailMassUpperBound = Math.max(
    0,
    Math.min(
      1,
      Math.max(effectiveExplicitPairMassGap, independentTailPairUpperBound),
    ),
  )
  const scoreTailErrorBound =
    Math.max(action.errorBound, action.certificateErrorBound)
    + (reactionTailIsGuaranteedFailure
      ? 0
      : Math.max(reaction.errorBound, reaction.certificateErrorBound))

  return {
    failureProbability,
    hitProbability,
    weights,
    unmodeledScoreProbabilityUpperBound: scoreTailMassUpperBound,
    scoreTailErrorBound,
    scoreTailCertificates: Object.freeze([
      action.certificate,
      reaction.certificate,
    ]),
    scoreTailMomentCertificates: Object.freeze([
      action.momentCertificate,
      reaction.momentCertificate,
    ]),
    actionExplicitMax: getScoreExplicitMax(action),
    sourceSupport: getScoreSourceSupport(action),
  }
}
