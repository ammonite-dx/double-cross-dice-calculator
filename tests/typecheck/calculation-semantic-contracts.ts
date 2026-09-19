import type { DamageRangePlan } from '../../src/calculation/planning/RangePlannerTypes'
import type { DamageInput } from '../../src/domain/CalculationInputs'
import type { DistributionResult } from '../../src/domain/DistributionResultTypes'
import type {
  ScorePair,
  ScoreStatistics,
  ScoreTailCertificate,
  ScoreTailMomentCertificate,
} from '../../src/domain/ScoreResultTypes'
import type {
  DamageEnvelope,
  DamageExpectationCertificate,
  DamageStatistics,
} from '../../src/domain/DamageResultTypes'
import type { RolledScoreRangePlan } from '../../src/calculation/planning/RangePlannerTypes'
import {
  createFiniteScoreTailMomentCertificate,
  createScoreExpectationCertificate,
  createScoreTailCertificate,
  createScoreTailMomentCertificate,
  isValidScoreTailCertificate,
  isValidScoreTailMomentCertificate,
} from '../../src/calculation/ScoreCertificates'
import {
  getScoreOutcomePartition,
} from '../../src/calculation/ScoreOutcome'
import { getScoreStatistics } from '../../src/calculation/ScoreStatistics'
import { createDamageRollRequest } from '../../src/calculation/DamageRollRequest'
import { getDamageStatistics } from '../../src/calculation/DamageStatistics'

declare const distribution: DistributionResult
declare const scorePlan: RolledScoreRangePlan
declare const scorePair: ScorePair
declare const attack: DamageInput
declare const damagePlan: DamageRangePlan
declare const damage: DamageEnvelope

const tailCertificate = createScoreTailCertificate(distribution, scorePlan)
const typedTailCertificate: ScoreTailCertificate | null = tailCertificate

const momentCertificate = createScoreTailMomentCertificate(
  scorePlan.params,
  distribution,
  scorePlan,
  tailCertificate,
)
const typedMomentCertificate: ScoreTailMomentCertificate | null =
  momentCertificate

const expectationCertificate = createScoreExpectationCertificate(
  scorePlan.params,
  scorePlan,
)
void typedTailCertificate
void typedMomentCertificate
void expectationCertificate

const finiteMoment = createFiniteScoreTailMomentCertificate(
  0,
  'finite-support',
)
if (isValidScoreTailMomentCertificate(finiteMoment)) {
  finiteMoment.modeledMax
}
if (isValidScoreTailCertificate(tailCertificate)) {
  tailCertificate.massUpperBound
}

const partition = getScoreOutcomePartition(scorePair.action)
if (partition !== null) {
  partition.regularBuckets[0]?.probability
}

const scoreStatistics: ScoreStatistics = getScoreStatistics(scorePair, {
  opposed: true,
  target: 0,
})
const damageRequest = createDamageRollRequest(
  scorePair,
  attack,
  damagePlan,
)
const damageStatistics: DamageStatistics = getDamageStatistics(
  damage,
)
const damageExpectationCertificate: DamageExpectationCertificate = {
  version: 1,
  kind: 'damage-expectation-certificate',
  lowerBound: 0,
  upperBound: 1,
  actionTailMassUpperBound: 0,
  reactionTailMassUpperBound: 0,
}
void scoreStatistics
void damageRequest
void damageStatistics
void damageExpectationCertificate

// The domain certificate cannot be satisfied by an arbitrary string field.
const malformedCertificate: ScoreTailCertificate = {
  version: 1,
  kind: 'score-tail-certificate',
  massLowerBound: 0,
  massUpperBound: 0,
  lowerBound: null,
  // @ts-expect-error: certificate probability bounds are numeric.
  probabilityErrorBound: 'not-a-number',
}
void malformedCertificate
