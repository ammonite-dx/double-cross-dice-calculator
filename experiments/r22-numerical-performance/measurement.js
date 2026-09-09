import {
  ATTACK_FIXTURES,
  CHECK_FIXTURES,
  SHIHAI_STRESS_CANDIDATES,
  YOUSEI_STRESS_CANDIDATES,
  createAttackPlannerParams,
  createFixtureSet,
  createScorePlannerParams,
  selectFirstAcceptedCandidate,
} from './fixtures.js'
import { createResultDigest, estimateValueBytes } from './result-digest.js'

export const FRAME_BUDGET_MS = 16.7
export const DEFAULT_ITERATIONS = 10
export const DEFAULT_WARMUP_ITERATIONS = 2
export const MAX_ITERATIONS = 100
export const MAX_WARMUP_ITERATIONS = 20
export const REPORT_SCHEMA_VERSION = 1

export function round(value) {
  return Number(value.toFixed(3))
}

export function formatError(error) {
  return String(error?.stack ?? error)
}

export function summarizeSamples(samples) {
  const sorted = samples
    .filter((value) => Number.isFinite(value) && value >= 0)
    .slice()
    .sort((left, right) => left - right)
  if (sorted.length === 0) {
    return null
  }
  const percentile = (probability) => sorted[Math.min(
    sorted.length - 1,
    Math.ceil(probability * sorted.length) - 1
  )]
  return {
    sampleCount: sorted.length,
    minMs: round(sorted[0]),
    medianMs: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    maxMs: round(sorted.at(-1)),
    totalMs: round(sorted.reduce((sum, value) => sum + value, 0)),
  }
}

export function validateMeasurementOptions({
  iterations = DEFAULT_ITERATIONS,
  warmupIterations = DEFAULT_WARMUP_ITERATIONS,
} = {}) {
  if (!Number.isSafeInteger(iterations) || iterations < 1
    || iterations > MAX_ITERATIONS) {
    throw new RangeError(`iterations must be 1..${MAX_ITERATIONS}`)
  }
  if (!Number.isSafeInteger(warmupIterations) || warmupIterations < 0
    || warmupIterations > MAX_WARMUP_ITERATIONS) {
    throw new RangeError(
      `warmupIterations must be 0..${MAX_WARMUP_ITERATIONS}`
    )
  }
  return { iterations, warmupIterations }
}

export function summarizePlan(plan) {
  if (plan === null || plan === undefined) {
    return null
  }
  return {
    accepted: plan.accepted ?? null,
    operation: plan.operation ?? null,
    warnings: (plan.warnings ?? []).map((warning) => ({
      code: warning.code,
      severity: warning.severity,
      value: warning.value,
      limit: warning.limit,
    })),
    estimates: plan.estimates === undefined
      ? null
      : {
          operations: plan.estimates.operations ?? null,
          timeMs: plan.estimates.timeMs ?? null,
          float64Bytes: plan.estimates.float64Bytes ?? null,
          persistentBytes: plan.estimates.persistentBytes ?? null,
          peakResourceBytes: plan.estimates.peakResourceBytes ?? null,
        },
    scores: (plan.scores ?? []).map((score) => ({
      workingLength: score.workingLength ?? null,
      fftLength: score.fftLength ?? null,
      cutoff: score.tail?.cutoff ?? null,
      modeledMax: score.tail?.modeledMax ?? null,
    })),
    damage: plan.damage === null || plan.damage === undefined
      ? null
      : {
          workingLength: plan.damage.workingLength ?? null,
          fftLength: plan.damage.fftLength ?? null,
          defenceFftLength: plan.damage.defenceFftLength ?? null,
          rawSupportMax: plan.damage.rawSupportMax ?? null,
          maxDamageDice: plan.damage.maxDamageDice ?? null,
        },
    backtrack: plan.backtrack === null || plan.backtrack === undefined
      ? null
      : {
          workingLength: plan.backtrack.workingLength ?? null,
          rawSupportMax: plan.backtrack.rawSupportMax ?? null,
          distributionMode: plan.backtrack.distributionMode ?? null,
        },
  }
}

export async function invokeFixture(runtime, fixture, context = {}) {
  switch (fixture.operation) {
    case 'dx': {
      const scorePlan = fixture.plan?.scores?.[0] ?? fixture.plan
      const options = scorePlan === undefined || scorePlan === null
        ? { rounding: 'unrounded' }
        : {
            workingLength: scorePlan.workingLength,
            rounding: 'unrounded',
            ...(scorePlan.fftLength > 0
              ? { fftLength: scorePlan.fftLength }
              : {}),
          }
      return runtime.traced.calculateDxDistribution(fixture.params, options)
    }
    case 'd10':
      return runtime.traced.calculateD10Distribution(fixture.dice)
    case 'fft':
      return runtime.traced.convolveDistributions(
        fixture.left,
        fixture.right,
        { fftLength: fixture.fftLength }
      )
    case 'check':
      return runtime.client.calculateCheck(
        fixture.params,
        fixture.difficulty
      )
    case 'attack':
      return runtime.client.calculateAttack(fixture.params)
    case 'backtrack':
      return runtime.client.calculateBacktrack(fixture.params)
    case 'statistics':
      return runtime.traced.getScoreStatistics(
        context.scorePair ?? fixture.score,
        fixture.difficulty
      )
    case 'range':
      return runtime.traced.planCalculationRanges(
        fixture.params,
        fixture.policy
      )
    case 'totalDamage':
      return runtime.client.calculateTotalDamage(fixture.damages)
    default:
      throw new TypeError(`Unknown fixture operation: ${fixture.operation}`)
  }
}

export function getFixturePlan(modules, fixture) {
  if (fixture.operation === 'dx') {
    return modules.planCalculationRanges(
      createScorePlannerParams(fixture.params)
    ) ?? null
  }
  if (fixture.operation === 'check') {
    return modules.planCalculationRanges({
      operation: 'check',
      score: {
        action: fixture.params.action,
        reaction: fixture.params.reaction,
      },
    })
  }
  if (fixture.operation === 'attack') {
    return modules.planCalculationRanges(
      createAttackPlannerParams(fixture.params),
      { scorePropagation: 'full-tail' }
    )
  }
  if (fixture.operation === 'backtrack') {
    return modules.planCalculationRanges({
      operation: 'backtrack',
      backtrack: fixture.params,
      completeSupportBacktrack: true,
    })
  }
  if (fixture.operation === 'range') {
    return modules.planCalculationRanges(fixture.params, fixture.policy)
  }
  return null
}

export function selectStressFixtures(modules) {
  const planScore = (params) => modules.planCalculationRanges(
    createScorePlannerParams(params)
  )
  const shihai = selectFirstAcceptedCandidate(
    SHIHAI_STRESS_CANDIDATES,
    planScore
  )
  const yousei = selectFirstAcceptedCandidate(
    YOUSEI_STRESS_CANDIDATES,
    planScore
  )
  return { shihai, yousei }
}

export function createScorePair(modules, params) {
  const actionPlan = modules.planCalculationRanges(
    createScorePlannerParams(params.action)
  )
  const reactionPlan = modules.planCalculationRanges(
    createScorePlannerParams(params.reaction)
  )
  const getDxDistribution = (shihai, dice, critical, options, yousei = 0) =>
    modules.calculateDxDistribution(
      { shihai, dice, critical, yousei },
      options
    )
  return {
    action: modules.calculateScore(
      params.action,
      { getDxDistribution },
      actionPlan.scores[0]
    ),
    reaction: modules.calculateScore(
      params.reaction,
      { getDxDistribution },
      reactionPlan.scores[0]
    ),
  }
}

export async function buildProductionDamageEnvelopes(runtime) {
  const envelopes = []
  for (const fixture of ATTACK_FIXTURES.slice(0, 2)) {
    const result = await runtime.client.calculateAttack(fixture.params)
    envelopes.push(result.damage)
  }
  return envelopes
}

export async function prepareFixtures(runtime, modules) {
  const stressSelection = selectStressFixtures(modules)
  const scorePair = createScorePair(modules, CHECK_FIXTURES[0].params)
  const totalDamages = await buildProductionDamageEnvelopes(runtime)
  const fixtures = createFixtureSet({
    shihaiSelection: stressSelection.shihai,
    youseiSelection: stressSelection.yousei,
    totalDamages,
    scorePair,
  })
  return {
    fixtures,
    stressSelection,
    scorePair,
    totalDamages,
  }
}

export function createFixtureReport(fixture, plan, timing, result, diagnostics = {}) {
  return {
    id: fixture.id,
    label: fixture.label,
    operation: fixture.operation,
    kind: fixture.kind ?? 'accepted',
    plan: summarizePlan(plan),
    timing,
    digest: result === null ? null : createResultDigest(result),
    outputBytes: result === null ? null : estimateValueBytes(result),
    ...diagnostics,
  }
}

export function evaluatePotentialTriggers(
  measurements,
  { syncP95ThresholdMs = FRAME_BUDGET_MS } = {}
) {
  const candidates = []
  for (const measurement of measurements) {
    // A CalculationClient wall-time sample may include an asynchronous
    // Worker wait. Only the explicitly recorded synchronous span is eligible
    // for the main-thread frame-budget trigger; Node reports do not have that
    // browser-only field and therefore cannot trigger this decision.
    const p95 = measurement.mainThread?.synchronous?.p95Ms
    const longTask = measurement.longTasks?.maxDurationMs
    if (Number.isFinite(p95) && p95 >= syncP95ThresholdMs) {
      candidates.push({
        id: measurement.id,
        reason: 'normal-main-thread-p95',
        thresholdMs: syncP95ThresholdMs,
        observedMs: p95,
      })
    }
    if (Number.isFinite(longTask) && longTask >= 50) {
      candidates.push({
        id: measurement.id,
        reason: 'long-task',
        thresholdMs: 50,
        observedMs: longTask,
      })
    }
  }
  return candidates
}
