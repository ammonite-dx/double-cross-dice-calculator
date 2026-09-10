import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rolldown } from 'rolldown'

import { DAMAGE_PRECISION_FIXTURES } from './fixtures.js'

const OUTPUT_DIRECTORY = fileURLToPath(new URL('./output/', import.meta.url))
const SCRIPT_PATH = fileURLToPath(import.meta.url)
const DAMAGE_DIE_EXPECTATION = 5.5
const DAMAGE_DISPLAY_QUANTUM = 0.1

function round(value, digits = 12) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null
}

function roundDisplay(value) {
  if (!Number.isFinite(value)) {
    return null
  }
  const rounded = Math.round(value / DAMAGE_DISPLAY_QUANTUM)
    * DAMAGE_DISPLAY_QUANTUM
  return Object.is(rounded, -0) ? 0 : round(rounded, 1)
}

function finiteOrNull(value) {
  if (!Number.isFinite(value)) {
    return null
  }
  if (value !== 0 && Math.abs(value) < 1e-12) {
    return Number(value.toPrecision(15))
  }
  return round(value)
}

function copyJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(copyJsonValue)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, copyJsonValue(nested)]),
    )
  }
  return typeof value === 'number' && !Number.isFinite(value)
    ? null
    : value
}

function summarizeExpectedValue(expectedValue) {
  const kind = expectedValue?.kind ?? 'unknown'
  const lower = kind === 'exact'
    ? expectedValue.value
    : expectedValue?.lowerBound
  const upper = kind === 'exact'
    ? expectedValue.value
    : expectedValue?.upperBound
  const finiteBounds = Number.isFinite(lower) && Number.isFinite(upper)
  const roundedLower = roundDisplay(lower)
  const roundedUpper = roundDisplay(upper)
  return {
    kind,
    lower: finiteOrNull(lower),
    upper: finiteOrNull(upper),
    width: finiteBounds ? round(upper - lower) : null,
    roundedLower,
    roundedUpper,
    stableRoundedDisplay: roundedLower !== null
      && roundedLower === roundedUpper,
    diagnosticMidpoint: finiteBounds ? round((lower + upper) / 2) : null,
    midpointInterpretation: finiteBounds
      ? 'diagnostic-only; never treated as a display estimate'
      : null,
    pointEstimate: kind === 'exact' && Number.isFinite(expectedValue.value)
      ? round(expectedValue.value)
      : null,
    pointEstimateSource: kind === 'exact'
      ? 'certified-exact'
      : 'not-provided-by-model',
  }
}

export function sumExplicitMass(result) {
  if (!result || !result.values || !Number.isSafeInteger(result.offset)) {
    throw new TypeError('result must contain values and a safe integer offset')
  }
  let mass = 0
  for (const probability of result.values) {
    mass += probability
  }
  return mass
}

export function sumExplicitFirstMoment(result) {
  if (!result || !result.values || !Number.isSafeInteger(result.offset)) {
    throw new TypeError('result must contain values and a safe integer offset')
  }
  let firstMoment = 0
  for (let index = 0; index < result.values.length; index += 1) {
    firstMoment += (result.offset + index) * result.values[index]
  }
  return firstMoment
}

function summarizeSupport(support) {
  if (support === null || typeof support !== 'object') {
    return null
  }
  return {
    kind: support.kind ?? null,
    max: Number.isFinite(support.max) ? support.max : null,
  }
}

function summarizeOverflow(overflow) {
  if (overflow === null || typeof overflow !== 'object') {
    return null
  }
  if (overflow.kind === 'exact') {
    return {
      kind: 'exact',
      lowerBound: finiteOrNull(overflow.lowerBound),
      probability: finiteOrNull(overflow.probability),
      probabilityUpperBound: null,
      errorBound: finiteOrNull(overflow.errorBound),
    }
  }
  return {
    kind: overflow.kind ?? null,
    lowerBound: finiteOrNull(overflow.lowerBound),
    probability: null,
    probabilityUpperBound: finiteOrNull(overflow.probabilityUpperBound),
    errorBound: finiteOrNull(overflow.errorBound),
  }
}

export function summarizeDistributionResult(result) {
  if (!result || !result.values || !Number.isSafeInteger(result.offset)) {
    throw new TypeError('distribution result is invalid')
  }
  return {
    offset: result.offset,
    explicitLength: result.values.length,
    explicitMax: result.values.length === 0
      ? null
      : result.offset + result.values.length - 1,
    explicitMass: finiteOrNull(sumExplicitMass(result)),
    explicitFirstMoment: finiteOrNull(sumExplicitFirstMoment(result)),
    support: summarizeSupport(result.support),
    overflow: summarizeOverflow(result.overflow),
  }
}

function summarizeCertificate(certificate) {
  return certificate === null || typeof certificate !== 'object'
    ? null
    : copyJsonValue(certificate)
}

function summarizeScoreEnvelope(envelope) {
  const metadata = envelope?.metadata ?? {}
  return {
    result: summarizeDistributionResult(envelope.result),
    metadata: {
      automaticFailureProbability: finiteOrNull(
        metadata.automaticFailureProbability,
      ),
      scoreTailCertificate: summarizeCertificate(
        metadata.scoreTailCertificate,
      ),
      scoreExpectationCertificate: summarizeCertificate(
        metadata.scoreExpectationCertificate,
      ),
    },
  }
}

function summarizeDamageEnvelope(envelope, statistics) {
  const metadata = envelope?.metadata ?? {}
  const projectionUncertainty = metadata.projectionUncertainty
  return {
    expectedValue: summarizeExpectedValue(statistics?.expectedValue),
    result: summarizeDistributionResult(envelope.result),
    explicitFirstMoment: finiteOrNull(
      sumExplicitFirstMoment(envelope.result),
    ),
    metadata: {
      modeledDistribution: metadata.modeledDistribution === true,
      scorePropagation: metadata.scorePropagation ?? null,
      scoreTailProbabilityUpperBound: finiteOrNull(
        metadata.scoreTailProbabilityUpperBound,
      ),
      scoreTailErrorBound: finiteOrNull(metadata.scoreTailErrorBound),
      projectionUncertainty: projectionUncertainty === null
        || typeof projectionUncertainty !== 'object'
        ? null
        : copyJsonValue(projectionUncertainty),
      scoreTails: copyJsonValue(metadata.scoreTails ?? []),
      scoreTailCertificates: copyJsonValue(
        metadata.scoreTailCertificates ?? [],
      ),
      modeledSupport: summarizeSupport(metadata.modeledSupport),
      sourceSupport: summarizeSupport(metadata.sourceSupport),
    },
  }
}

function scoreParams(params) {
  return {
    dice: params.dice,
    critical: params.critical,
    skill: params.skill,
    yousei: params.yousei,
    shihai: params.shihai,
  }
}

function inputSummary(params) {
  return {
    action: {
      score: scoreParams(params.action.score),
      damage: copyJsonValue(params.action.damage),
    },
    reaction: {
      mode: params.reaction.mode,
      score: scoreParams(params.reaction.score),
      damage: copyJsonValue(params.reaction.damage),
    },
  }
}

export function classifySafeSlice(params, actionScoreEnvelope) {
  const actionScore = params.action.score
  const attackDamage = params.action.damage
  const defenceDamage = params.reaction.damage
  const fixedDifference = attackDamage.value - defenceDamage.value
  const checks = {
    kazanariZero: attackDamage.kazanari === 0,
    defenceDiceZero: defenceDamage.dice === 0,
    nonNegativeFixedDifference: fixedDifference >= 0,
    actionScoreExpectationCertificate:
      actionScoreEnvelope?.metadata?.scoreExpectationCertificate !== undefined
      && actionScoreEnvelope?.metadata?.scoreExpectationCertificate !== null,
    actionShihaiZero: actionScore.shihai === 0,
    actionYouseiZero: actionScore.yousei === 0,
  }
  const reasons = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
  return {
    eligible: reasons.length === 0,
    checks,
    reasons,
    fixedDifference,
  }
}

function getScoreCertificateUpperBound(scoreEnvelope) {
  const certificate = scoreEnvelope?.metadata?.scoreExpectationCertificate
  return Number.isFinite(certificate?.upperBound)
    ? certificate.upperBound
    : null
}

function getScoreCertificateLowerBound(scoreEnvelope) {
  const certificate = scoreEnvelope?.metadata?.scoreExpectationCertificate
  return Number.isFinite(certificate?.lowerBound)
    ? certificate.lowerBound
    : null
}

export function deriveCandidateExpectationBound({
  params,
  actionScoreEnvelope,
  damageEnvelope,
  damageStatistics,
  safeSlice,
}) {
  const damageFirstMoment = sumExplicitFirstMoment(damageEnvelope.result)
  const actionScoreFirstMoment = sumExplicitFirstMoment(
    actionScoreEnvelope.result,
  )
  const actionCertificateUpper = getScoreCertificateUpperBound(
    actionScoreEnvelope,
  )
  const actionCertificateLower = getScoreCertificateLowerBound(
    actionScoreEnvelope,
  )
  const scoreTailMassUpperBound = Math.max(
    0,
    Number(actionScoreEnvelope?.metadata?.scoreTailCertificate?.massUpperBound)
      || 0,
  )

  if (!safeSlice.eligible || actionCertificateUpper === null) {
    return {
      status: 'insufficient-certificate',
      formula: null,
      reason: 'the safe slice and action score expectation certificate are both required',
      lowerBound: finiteOrNull(damageFirstMoment),
      upperBound: null,
      width: null,
      actionScoreFirstMoment: finiteOrNull(actionScoreFirstMoment),
      actionScoreTailFirstMomentUpperBound: null,
      scoreTailMassUpperBound: finiteOrNull(scoreTailMassUpperBound),
      damageExpectedValueKind: damageStatistics?.expectedValue?.kind ?? 'unknown',
    }
  }

  const attackDice = params.action.damage.dice
  const fixedDifference = safeSlice.fixedDifference
  const actionScoreTailFirstMomentUpperBound = Math.max(
    0,
    actionCertificateUpper - actionScoreFirstMoment,
  )
  const tailDamageDiceUpperBound =
    actionScoreTailFirstMomentUpperBound / 10
    + scoreTailMassUpperBound * (1 + attackDice)
  const tailDamageUpperBound = fixedDifference * scoreTailMassUpperBound
    + DAMAGE_DIE_EXPECTATION * tailDamageDiceUpperBound
  const upperBound = fixedDifference
    + DAMAGE_DIE_EXPECTATION * (
      actionCertificateUpper / 10 + 1 + attackDice
    )
  const lowerBound = Math.max(0, damageFirstMoment)

  return {
    status: 'finite-candidate-only',
    formula: 'E[damage] <= fixedDifference + 5.5 * (E[actionScore] / 10 + 1 + attack.dice)',
    assumptions: [
      'kazanari = 0, so each damage die has expectation 5.5',
      'defence dice = 0 and fixedDifference >= 0, so damage is non-negative on a hit',
      'hit probability is bounded by 1; reaction-tail coupling is not treated as additional mass',
      'floor(score / 10) <= score / 10 for non-negative score',
    ],
    reason: 'finite candidate is derived for the restricted slice but is not a production expectation certificate',
    lowerBound: finiteOrNull(lowerBound),
    upperBound: finiteOrNull(upperBound),
    width: finiteOrNull(upperBound - lowerBound),
    actionScoreFirstMoment: finiteOrNull(actionScoreFirstMoment),
    actionScoreExpectationLowerBound: finiteOrNull(actionCertificateLower),
    actionScoreExpectationUpperBound: finiteOrNull(actionCertificateUpper),
    actionScoreTailFirstMomentUpperBound: finiteOrNull(
      actionScoreTailFirstMomentUpperBound,
    ),
    scoreTailMassUpperBound: finiteOrNull(scoreTailMassUpperBound),
    tailDamageDiceUpperBound: finiteOrNull(tailDamageDiceUpperBound),
    tailDamageUpperBound: finiteOrNull(tailDamageUpperBound),
    damageExpectedValueKind: damageStatistics?.expectedValue?.kind ?? 'unknown',
  }
}

async function loadRuntimeModules() {
  const entryPoint = fileURLToPath(new URL('./runtime-entry.mjs', import.meta.url))
  const bundle = await rolldown({ input: entryPoint })
  const generated = await bundle.generate({ format: 'esm' })
  const source = generated.output?.[0]?.code
  if (typeof source !== 'string') {
    throw new Error('damage tail attribution bundle was not generated')
  }
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  try {
    return await import(moduleUrl)
  } finally {
    await bundle.close?.()
  }
}

function createAuditClient({
  calculateDamageOnDemand,
  calculateDxDistribution,
  getDamageStatistics,
  getDamageRollDistribution,
  getD10Distribution,
  createCalculationClient,
}) {
  return createCalculationClient({
    calculateDamageOnDemand,
    calculateDxDistribution,
    getDamageStatistics,
    getDamageRollDistribution,
    getD10Distribution,
  })
}

async function auditFixture(client, fixture) {
  const result = await client.calculateAttack(fixture.params)
  const safeSlice = classifySafeSlice(fixture.params, result.score.action)
  const candidateBound = deriveCandidateExpectationBound({
    params: fixture.params,
    actionScoreEnvelope: result.score.action,
    damageEnvelope: result.damage,
    damageStatistics: result.damageStatistics,
    safeSlice,
  })
  return {
    id: fixture.id,
    label: fixture.label,
    category: fixture.category,
    reference: fixture.reference === undefined
      ? null
      : copyJsonValue(fixture.reference),
    input: inputSummary(fixture.params),
    safeSlice,
    score: {
      action: summarizeScoreEnvelope(result.score.action),
      reaction: summarizeScoreEnvelope(result.score.reaction),
    },
    damage: summarizeDamageEnvelope(
      result.damage,
      result.damageStatistics,
    ),
    candidateBound,
    interpretation: candidateBound.status === 'finite-candidate-only'
      ? 'finite candidate bound is research evidence only; production keeps the existing certified lower-bound contract'
      : 'no finite bound was derived from the available certificates; do not add a point estimate',
  }
}

export async function buildReport(modules = null) {
  const loaded = modules ?? await loadRuntimeModules()
  const client = createAuditClient({
    ...loaded,
    getDamageRollDistribution: (weights, kazanari, options) =>
      loaded.generateMixedDamageDistribution(weights, kazanari, options),
    getD10Distribution: (dice, size, options = {}) =>
      loaded.calculateD10Distribution(dice, { size, ...options }),
  })
  const records = []
  for (const fixture of DAMAGE_PRECISION_FIXTURES) {
    records.push(await auditFixture(client, fixture))
  }
  const publicRecord = records.find(({ id }) => id === 'public-v3-1-default')
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: {
      productionChanges: false,
      scorePropagation: 'full-tail',
      displayQuantum: DAMAGE_DISPLAY_QUANTUM,
      publicReferenceExpectedDamageExpectation:
        publicRecord?.reference?.expectedDamageExpectation ?? null,
    },
    records,
  }
}

export async function main() {
  const report = await buildReport()
  await mkdir(OUTPUT_DIRECTORY, { recursive: true })
  const reportPath = fileURLToPath(new URL('./output/tail-attribution.json', import.meta.url))
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  await main()
}
