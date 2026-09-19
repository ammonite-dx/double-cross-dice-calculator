import { validateDistributionResult } from './DistributionResult'
import { getScoreOutcomePartition } from './ScoreOutcome'
import { RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH } from './RuntimeDamageRollLimits'

function validateScoreEnvelope(envelope: any, label: string) {
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
  const certificateErrorBound = Number.isFinite(
    certificate?.probabilityErrorBound,
  )
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
    certificate: certificate === null || typeof certificate !== 'object'
      ? null
      : Object.freeze({ ...certificate }),
    momentCertificate:
      envelope.metadata?.scoreTailMomentCertificate === null
      || typeof envelope.metadata?.scoreTailMomentCertificate !== 'object'
        ? null
        : Object.freeze({ ...envelope.metadata.scoreTailMomentCertificate }),
  }
}

function getScoreExplicitMax(score: any) {
  return score.result.values.length === 0
    ? null
    : score.result.offset + score.result.values.length - 1
}

function getReactionRegularBelowLookup(reactionOutcome: any) {
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

function getScoreSourceSupport(action: any, reaction: any) {
  if (
    action.result.support.kind === 'finite'
    && reaction.result.support.kind === 'finite'
  ) {
    return Object.freeze({
      kind: 'finite',
      max: Math.max(action.result.support.max, reaction.result.support.max),
    })
  }
  return Object.freeze({ kind: 'infinite' })
}

/**
 * Build a damage-roll request directly from score coverage. Explicit score
 * values are paired with explicit reaction values only; score tails remain
 * unmodeled probability bounds rather than being folded into a last bucket.
 */
export function createDamageRollRequest(
  score: any,
  attack: any,
  damageRangePlan: any,
) {
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
      'full-tail damage plan maxDamageDice must fit the runtime damage weight length',
    )
  }
  const weights = new Float64Array(maxDamageDice + 1)
  let failureProbability = 0
  let hitProbability = 0

  const reactionRegularMass = reaction.outcome.regularExplicitMass
  const reactionExplicitMass =
    reactionRegularMass + reaction.outcome.forcedFailureProbability

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
        `damage dice are outside the planned full-tail range: ${damageDice}`,
      )
    }
    weights[damageDice] += hit
    hitProbability += hit
  }

  const actionForcedMass = action.outcome.forcedFailureProbability
  failureProbability += actionForcedMass * reactionExplicitMass

  const actionExplicitMass =
    action.outcome.regularExplicitMass + actionForcedMass
  const explicitPairMass = actionExplicitMass * reactionExplicitMass
  const independentTailPairUpperBound =
    action.overflowMassUpperBound
    + reaction.overflowMassUpperBound
    - action.overflowMassUpperBound * reaction.overflowMassUpperBound
  const scoreTailMassUpperBound = Math.max(
    0,
    Math.min(
      1,
      Math.max(1 - explicitPairMass, independentTailPairUpperBound),
    ),
  )
  const scoreTailErrorBound =
    Math.max(action.errorBound, action.certificateErrorBound)
    + Math.max(reaction.errorBound, reaction.certificateErrorBound)

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
    sourceSupport: getScoreSourceSupport(action, reaction),
  }
}
