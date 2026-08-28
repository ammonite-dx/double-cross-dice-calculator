import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'

export const BENCHMARK_REPORT_SCHEMA_VERSION = 1
export const DEFAULT_ITERATIONS = 3
export const DEFAULT_WARMUP_ITERATIONS = 1
export const MAX_ITERATIONS = 100_000
export const MAX_WARMUP_ITERATIONS = 100_000

const PROJECT_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)))
const ASSET_DIRECTORY = new URL('../public/data/schema-v2/revision-1/', import.meta.url)

let resultSink = 0

function scoreParams({ dice, critical, skill = 0, yousei = 0, shihai = 0 }) {
  return { dice, critical, skill, yousei, shihai }
}

function makeAttackEntry(
  id,
  { actionScore, reactionScore, attack, defence }
) {
  const action = {
    score: { ...actionScore },
    damage: { ...attack },
  }
  const reaction = {
    mode: 'guard',
    score: { ...reactionScore },
    damage: { ...defence },
  }

  return {
    id,
    params: { action, reaction },
    planner: {
      operation: 'attack',
      score: {
        action: { ...action.score },
        reaction: { ...reaction.score },
      },
      attack: { ...action.damage },
      defence: { ...reaction.damage },
    },
  }
}

function makeCase({
  id,
  label,
  tier,
  entries,
  iterations = DEFAULT_ITERATIONS,
  warmupIterations = DEFAULT_WARMUP_ITERATIONS,
  execution = 'full',
  executionReason = null,
  plannerPolicy = {},
  expectedFailureMass = false,
  note,
}) {
  return {
    id,
    label,
    route: 'attack',
    tier,
    entries,
    iterations,
    warmupIterations,
    execution,
    executionReason,
    plannerPolicy,
    expectedFailureMass,
    note,
  }
}

const SMALL_ACTION_SCORE = scoreParams({
  dice: 4,
  critical: 8,
  skill: 3,
})
const SMALL_REACTION_SCORE = scoreParams({
  dice: 3,
  critical: 10,
  skill: 1,
})

export const BENCHMARK_CASES = Object.freeze([
  makeCase({
    id: 'small-normal-kazanari-0',
    label: '小規模通常: fixed value + defence, kazanari=0',
    tier: 'small',
    entries: [makeAttackEntry('small-1', {
      actionScore: SMALL_ACTION_SCORE,
      reactionScore: SMALL_REACTION_SCORE,
      attack: { dice: 1, value: 8, kazanari: 0 },
      defence: { dice: 1, value: 3 },
    })],
    note: 'score生成はfixture準備時、damage区間は既存legacy/canonical APIだけを測定',
  }),
  makeCase({
    id: 'fixed-shift-defence',
    label: '固定値差と防御ダイス: positive shift',
    tier: 'fixed-shift',
    entries: [makeAttackEntry('fixed-1', {
      actionScore: scoreParams({ dice: 6, critical: 9, skill: 2 }),
      reactionScore: scoreParams({ dice: 4, critical: 10 }),
      attack: { dice: 2, value: 18, kazanari: 0 },
      defence: { dice: 3, value: 4 },
    })],
    note: 'attack.value - defence.value が正で、防御畳み込みを含む',
  }),
  makeCase({
    id: 'kazanari-3',
    label: 'runtime DR: kazanari>0',
    tier: 'kazanari',
    entries: [makeAttackEntry('kazanari-3-1', {
      actionScore: scoreParams({ dice: 5, critical: 8 }),
      reactionScore: scoreParams({ dice: 4, critical: 10 }),
      attack: { dice: 3, value: 5, kazanari: 3 },
      defence: { dice: 2, value: 0 },
    })],
    note: 'kazanari=0ケースと同じ分離区間で、非ゼロ振り直しを固定',
  }),
  makeCase({
    id: 'failure-mass',
    label: '命中失敗massを含むケース',
    tier: 'failure-mass',
    entries: [makeAttackEntry('failure-1', {
      actionScore: scoreParams({ dice: 3, critical: 10 }),
      reactionScore: scoreParams({ dice: 8, critical: 8 }),
      attack: { dice: 2, value: 2, kazanari: 0 },
      defence: { dice: 1, value: 8 },
    })],
    expectedFailureMass: true,
    note: 'failureProbabilityをfixture診断へ記録し、canonicalではhit massと分離したまま合成',
  }),
  makeCase({
    id: 'combo-total-3',
    label: '複数combo total: mixed fixed shift, defence, kazanari',
    tier: 'multi-combo',
    iterations: 2,
    warmupIterations: 1,
    entries: [
      makeAttackEntry('combo-1', {
        actionScore: scoreParams({ dice: 5, critical: 8 }),
        reactionScore: scoreParams({ dice: 4, critical: 10 }),
        attack: { dice: 2, value: 12, kazanari: 0 },
        defence: { dice: 1, value: 3 },
      }),
      makeAttackEntry('combo-2', {
        actionScore: scoreParams({ dice: 7, critical: 9 }),
        reactionScore: scoreParams({ dice: 5, critical: 10 }),
        attack: { dice: 4, value: 20, kazanari: 3 },
        defence: { dice: 2, value: 8 },
      }),
      makeAttackEntry('combo-3', {
        actionScore: scoreParams({ dice: 6, critical: 8 }),
        reactionScore: scoreParams({ dice: 4, critical: 9 }),
        attack: { dice: 5, value: -3, kazanari: 9 },
        defence: { dice: 2, value: 6 },
      }),
    ],
    note: 'legacy totalはpublished 1024 bucket逐次集計、canonical totalはfull-support envelopeの独立和',
  }),
  makeCase({
    id: 'range-warning-boundary',
    label: '現行上限近辺: RangePlanner warning/reject境界',
    tier: 'warning-boundary',
    iterations: 2,
    warmupIterations: 1,
    execution: 'planner-only',
    executionReason: 'current maximum near-warning case is measured only through preflight to avoid an intentionally heavy calculation run',
    entries: [makeAttackEntry('boundary-1', {
      actionScore: scoreParams({ dice: 99, critical: 8, shihai: 0 }),
      reactionScore: scoreParams({ dice: 99, critical: 2, shihai: 19 }),
      attack: { dice: 99, value: 999, kazanari: 9 },
      defence: { dice: 99, value: -999 },
    })],
    note: 'plannerのaccepted/warnings/rejectionReasonsだけを記録し、入力上限やpolicyは変更しない',
  }),
  makeCase({
    id: 'range-reject-boundary',
    label: '明示hard reject: planner-onlyではない計算拒否',
    tier: 'reject-boundary',
    iterations: 2,
    warmupIterations: 1,
    plannerPolicy: {
      limits: {
        warning: { estimatedTimeMs: 0 },
        hard: { estimatedTimeMs: 0 },
      },
    },
    executionReason: 'explicit planner hard limit rejects before fixture and calculation setup',
    entries: [makeAttackEntry('reject-boundary-1', {
      actionScore: scoreParams({ dice: 99, critical: 8, shihai: 0 }),
      reactionScore: scoreParams({ dice: 99, critical: 2, shihai: 19 }),
      attack: { dice: 99, value: 999, kazanari: 9 },
      defence: { dice: 99, value: -999 },
    })],
    note: 'planner policyだけをfixtureで狭め、reject後のscore/damage計算へ進まないことを固定',
  }),
])

export function round(value) {
  return Number(value.toFixed(6))
}

export function percentile(sortedValues, probability) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    throw new RangeError('sortedValues must contain at least one sample')
  }
  if (!Number.isFinite(probability) || probability <= 0 || probability > 1) {
    throw new RangeError('probability must be greater than 0 and at most 1')
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil(probability * sortedValues.length) - 1
  )
  return sortedValues[index]
}

export function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new RangeError('samples must contain at least one measurement')
  }
  if (samples.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('samples must contain finite non-negative milliseconds')
  }

  const sorted = samples.slice().sort((left, right) => left - right)
  return {
    sampleCount: sorted.length,
    minMs: round(sorted[0]),
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted.at(-1)),
  }
}

function validateIterationCount(value, name, maximum) {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be a safe integer`)
  }
  if (value < 0 || (name === 'iterations' && value === 0)) {
    throw new RangeError(
      `${name} must be ${name === 'iterations' ? 'positive' : 'non-negative'}`
    )
  }
  if (value > maximum) {
    throw new RangeError(`${name} must not exceed ${maximum}`)
  }
  return value
}

function readOptionValue(argv, index, option) {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`)
  }
  return { value, nextIndex: index + 1 }
}

function parseIntegerOption(value, option, maximum, allowZero) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${option} must be a non-negative integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || (!allowZero && parsed === 0)) {
    throw new Error(
      `${option} must be ${allowZero ? 'non-negative' : 'positive'} and safe`
    )
  }
  if (parsed > maximum) {
    throw new Error(`${option} must not exceed ${maximum}`)
  }
  return parsed
}

export function parseBenchmarkArgs(argv = []) {
  if (!Array.isArray(argv)) {
    throw new TypeError('argv must be an array')
  }

  let json = false
  let help = false
  let iterations = null
  let warmupIterations = null

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--json') {
      json = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }

    const optionMatch = /^(--iterations|--warmup)(?:=(.*))?$/.exec(argument)
    if (optionMatch) {
      const option = optionMatch[1]
      const inlineValue = optionMatch[2]
      const { value, nextIndex } = inlineValue === undefined
        ? readOptionValue(argv, index, option)
        : { value: inlineValue, nextIndex: index }
      const parsed = option === '--iterations'
        ? parseIntegerOption(value, option, MAX_ITERATIONS, false)
        : parseIntegerOption(value, option, MAX_WARMUP_ITERATIONS, true)
      if (option === '--iterations') {
        iterations = parsed
      } else {
        warmupIterations = parsed
      }
      index = nextIndex
      continue
    }

    throw new Error(`Unknown benchmark argument: ${argument}`)
  }

  return {
    json,
    help,
    iterations,
    warmupIterations,
  }
}

export function createMeasurementReport({
  name,
  scope,
  constraint,
  coldMilliseconds,
  warmMilliseconds,
  result,
  resultDigest,
}) {
  return {
    name,
    scope,
    status: 'measured',
    constraint,
    cold: summarizeSamples(coldMilliseconds),
    warm: summarizeSamples(warmMilliseconds),
    result,
    resultDigest: round(resultDigest),
  }
}

function formatError(error) {
  return String(error?.stack ?? error)
}

function summarizeWarning(warning) {
  return {
    code: warning.code,
    severity: warning.severity,
    message: warning.message,
    value: warning.value,
    limit: warning.limit,
  }
}

function summarizePlan(plan) {
  return {
    accepted: plan.accepted,
    operation: plan.operation,
    propagation: plan.propagation,
    display: plan.display,
    warnings: (plan.warnings ?? []).map(summarizeWarning),
    rejectionReasons: plan.rejectionReasons ?? [],
    scores: (plan.scores ?? []).map((score) => ({
      params: score.params,
      tail: score.tail,
      workingMax: score.workingMax,
      workingLength: score.workingLength,
      fftLength: score.fftLength,
      operations: score.operations,
      float64Bytes: score.float64Bytes,
    })),
    damage: plan.damage
      ? {
          attackDice: plan.damage.attackDice,
          attackValue: plan.damage.attackValue,
          kazanari: plan.damage.kazanari,
          defenceDice: plan.damage.defenceDice,
          defenceValue: plan.damage.defenceValue,
          fixedDifference: plan.damage.fixedDifference,
          rawSupportMax: plan.damage.rawSupportMax,
          workingMax: plan.damage.workingMax,
          workingLength: plan.damage.workingLength,
          defenceMax: plan.damage.defenceMax,
          fftLength: plan.damage.fftLength,
          defenceFftLength: plan.damage.defenceFftLength,
          scoreValueMode: plan.damage.scoreValueMode,
          scoreValueUpperBound: plan.damage.scoreValueUpperBound,
          operations: plan.damage.operations,
          float64Bytes: plan.damage.float64Bytes,
        }
      : null,
    estimates: plan.estimates,
  }
}

function asNumericArray(value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return value
  }
  return null
}

function summarizeNumericArray(value) {
  const array = asNumericArray(value)
  if (array === null) {
    return null
  }
  let total = 0
  let minimum = Infinity
  let maximum = -Infinity
  let nonFiniteCount = 0
  let nonZeroCount = 0
  for (const number of array) {
    if (!Number.isFinite(number)) {
      nonFiniteCount += 1
      continue
    }
    total += number
    minimum = Math.min(minimum, number)
    maximum = Math.max(maximum, number)
    if (number !== 0) {
      nonZeroCount += 1
    }
  }
  return {
    length: array.length,
    total: round(total),
    minimum: array.length === 0 ? null : round(minimum),
    maximum: array.length === 0 ? null : round(maximum),
    nonZeroCount,
    nonFiniteCount,
  }
}

function summarizeLegacyDamage(damage) {
  return {
    distribution: summarizeNumericArray(damage.distribution),
    upperTailProbability: summarizeNumericArray(
      damage.upperTailProbability
    ),
  }
}

function summarizeCanonicalDamage(canonicalDamage) {
  const result = canonicalDamage.result
  return {
    result: {
      version: result.version,
      values: summarizeNumericArray(result.values),
      offset: result.offset,
      support: result.support,
      overflow: result.overflow,
    },
    metadata: {
      modeledDistribution: canonicalDamage.metadata.modeledDistribution,
      scorePropagation: canonicalDamage.metadata.scorePropagation,
      sourceSupport: canonicalDamage.metadata.sourceSupport,
    },
  }
}

function summarizeDisplay(display) {
  return {
    version: display.version,
    kind: display.kind,
    explicit: {
      offset: display.explicit.offset,
      probabilities: summarizeNumericArray(display.explicit.probabilities),
    },
    explicitMax: display.explicitMax,
    support: display.support,
    overflow: display.overflow,
    warningCount: display.warnings.length,
    expectedValueKind: display.expectedValue.kind,
    massIsExact: display.mass.isExact,
  }
}

function summarizeComparison(comparison) {
  if (comparison.kind === 'comparable') {
    return {
      kind: comparison.kind,
      scope: comparison.scope,
      passed: comparison.passed,
      legacyMass: round(comparison.legacyMass),
      canonicalMass: round(comparison.canonicalMass),
      massDifference: round(comparison.massDifference),
      maxAbsoluteDifference: round(comparison.maxAbsoluteDifference),
      l1Difference: round(comparison.l1Difference),
      thresholds: comparison.thresholds,
    }
  }
  return {
    kind: comparison.kind,
    scope: comparison.scope,
    passed: comparison.passed,
    reason: comparison.reason,
    thresholds: comparison.thresholds,
    details: comparison.details,
  }
}

function summarizeStageResult(name, result) {
  if (name === 'range-planner') {
    return result.map(summarizePlan)
  }
  if (name === 'legacy-damage') {
    return {
      comboCount: result.length,
      combos: result.map(summarizeLegacyDamage),
    }
  }
  if (name === 'canonical-damage') {
    return {
      comboCount: result.length,
      combos: result.map(summarizeCanonicalDamage),
    }
  }
  if (name === 'canonical-total-aggregation') {
    return summarizeCanonicalDamage(result)
  }
  if (name === 'legacy-total') {
    return summarizeLegacyDamage(result)
  }
  if (name === 'canonical-presentation') {
    return {
      kind: result.kind,
      version: result.version,
      comboCount: result.combos.length,
      combos: result.combos.map((combo) => ({
        id: combo.id,
        presentation: summarizeDisplay(combo.canonicalDamagePresentation),
      })),
      total: summarizeDisplay(result.canonicalTotalDamagePresentation),
    }
  }
  if (name === 'legacy-canonical-comparison') {
    return {
      damage: result.damage.map(summarizeComparison),
      total: summarizeComparison(result.total),
    }
  }
  return result
}

function mixDigest(digest, number) {
  const normalized = Number.isFinite(number) ? number : 0
  return (digest * 1.0000001 + normalized) % 1_000_000_007
}

function digestValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return 1
  }
  if (typeof value === 'number') {
    return mixDigest(17, value)
  }
  if (typeof value === 'boolean') {
    return value ? 31 : 29
  }
  if (typeof value === 'string') {
    return value.length + 37
  }
  if (typeof value !== 'object') {
    return 41
  }
  if (seen.has(value)) {
    return 43
  }
  seen.add(value)

  let digest = 47
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    for (let index = 0; index < value.length; index += 1) {
      digest = mixDigest(digest, digestValue(value[index], seen))
    }
    return digest
  }
  for (const key of Object.keys(value).sort()) {
    digest = mixDigest(digest, key.length)
    digest = mixDigest(digest, digestValue(value[key], seen))
  }
  return digest
}

function consumeResult(value) {
  const digest = digestValue(value)
  resultSink = (resultSink + digest) % 1_000_000_007
  return digest
}

async function timed(operation) {
  const started = performance.now()
  const result = await operation()
  const milliseconds = performance.now() - started
  const digest = consumeResult(result)
  return { result, milliseconds, digest }
}

async function measureStage({
  name,
  scope,
  constraint,
  operation,
  iterations,
  warmupIterations,
  summarizeResult,
}) {
  const cold = await timed(operation)
  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    const warmupResult = await operation()
    consumeResult(warmupResult)
  }

  const warmMilliseconds = []
  let lastResult = cold.result
  let lastDigest = cold.digest
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = await timed(operation)
    warmMilliseconds.push(sample.milliseconds)
    lastResult = sample.result
    lastDigest = sample.digest
  }

  return {
    report: createMeasurementReport({
      name,
      scope,
      constraint,
      coldMilliseconds: [cold.milliseconds],
      warmMilliseconds,
      result: summarizeResult(lastResult),
      resultDigest: lastDigest,
    }),
    lastResult,
  }
}

async function measureStageSafely(definition) {
  try {
    return {
      ...(await measureStage(definition)),
      error: null,
    }
  } catch (error) {
    return {
      report: {
        name: definition.name,
        scope: definition.scope,
        status: 'error',
        constraint: definition.constraint,
        error: formatError(error),
      },
      lastResult: null,
      error,
    }
  }
}

function skippedStage(name, scope, constraint, reason) {
  return {
    name,
    scope,
    status: 'skipped',
    constraint,
    reason,
  }
}

function resolveMeasurementOptions(testCase, options) {
  return {
    iterations: options.iterations ?? testCase.iterations,
    warmupIterations:
      options.warmupIterations ?? testCase.warmupIterations,
    overridden: {
      iterations: options.iterations !== null,
      warmupIterations: options.warmupIterations !== null,
    },
  }
}

function validateRunOptions(options) {
  if (options === undefined) {
    return { iterations: null, warmupIterations: null }
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('benchmark options must be an object')
  }
  const iterations = options.iterations ?? null
  const warmupIterations = options.warmupIterations ?? null
  if (iterations !== null) {
    validateIterationCount(iterations, 'iterations', MAX_ITERATIONS)
  }
  if (warmupIterations !== null) {
    validateIterationCount(
      warmupIterations,
      'warmupIterations',
      MAX_WARMUP_ITERATIONS
    )
  }
  return { iterations, warmupIterations }
}

function plannerInputForReport(entry) {
  return {
    id: entry.id,
    params: entry.params,
  }
}

function createFixture(testCase, plans, dependencies) {
  const entries = testCase.entries
  const scores = entries.map((entry) => ({
    action: dependencies.getScore(entry.params.action.score),
    reaction: dependencies.getScore(entry.params.reaction.score),
  }))
  const diagnostics = entries.map((entry, index) => {
    const request = dependencies.createDamageRollRequest(
      scores[index],
      entry.params.action.damage
    )
    return {
      id: entry.id,
      failureProbability: round(request.failureProbability),
      hitProbability: round(
        request.weights.reduce((sum, probability) => sum + probability, 0)
      ),
    }
  })
  if (
    testCase.expectedFailureMass
    && diagnostics.every(({ failureProbability }) => failureProbability <= 0)
  ) {
    throw new Error(`${testCase.id} did not produce failure mass`)
  }

  const canonicalDependencies = {
    getDamageRollDistribution:
      dependencies.generateMixedDamageDistribution,
    getD10Distribution: dependencies.getD10Distribution,
  }

  return {
    entries,
    plans,
    scores,
    diagnostics,
    canonicalDependencies,
    runLegacyDamages() {
      return entries.map((entry, index) => dependencies.getDamage(
        scores[index],
        entry.params.action.damage,
        entry.params.reaction.damage
      ))
    },
    async runCanonicalDamages() {
      const damages = []
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]
        damages.push(await dependencies.calculateCanonicalDamageOnDemand(
          scores[index],
          entry.params.action.damage,
          entry.params.reaction.damage,
          canonicalDependencies,
          {},
          plans[index]
        ))
      }
      return damages
    },
  }
}

function createBatchState(fixture, canonicalDamages, canonicalTotalDamage, dependencies) {
  const combos = fixture.entries.map((entry, index) => ({
    id: entry.id,
    score: fixture.scores[index],
    scoreSummary: dependencies.getScoreSummary(fixture.scores[index]),
    canonicalDamage: canonicalDamages[index],
    canonicalDamageSummary: dependencies.getCanonicalDamageSummary(
      canonicalDamages[index]
    ),
  }))
  const batch = {
    combos,
    canonicalTotalDamage,
    canonicalTotalDamageSummary:
      dependencies.getCanonicalTotalDamageSummary(canonicalTotalDamage),
  }
  return { batch }
}

function errorMessageForPlan(plans) {
  const reasons = plans.flatMap((plan) => plan.rejectionReasons ?? [])
  return reasons.length > 0
    ? `range plan rejected: ${Array.from(new Set(reasons)).join(', ')}`
    : 'range plan rejected before calculation'
}

async function runCase(testCase, dependencies, options) {
  const measurement = resolveMeasurementOptions(testCase, options)
  const input = testCase.entries.map(plannerInputForReport)
  const stages = []

  const plannerMeasurement = await measureStageSafely({
    name: 'range-planner',
    scope: 'preflight',
    constraint: 'planCalculationRanges only; no asset load, calculator, Worker, or UI work',
    operation: () => testCase.entries.map((entry) =>
      dependencies.planCalculationRanges(entry.planner, testCase.plannerPolicy)
    ),
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) => summarizeStageResult('range-planner', result),
  })
  stages.push(plannerMeasurement.report)

  const plans = plannerMeasurement.lastResult ?? []
  const accepted = plans.length === testCase.entries.length
    && plans.every((plan) => plan.accepted === true)
  const plannerRejected = !accepted
  const plannerOnly = accepted && testCase.execution === 'planner-only'
  if (plannerMeasurement.error !== null || plannerRejected || plannerOnly) {
    const reason = plannerMeasurement.error !== null
      ? 'calculation stages skipped because range-planner failed'
      : plannerOnly
        ? testCase.executionReason ?? 'execution intentionally limited to planner-only'
        : errorMessageForPlan(plans)
    for (const [name, scope, constraint] of [
      [
        'legacy-damage',
        'legacy-damage',
        'precomputed dr/d10 legacy API only; score and asset registration are outside the timed interval',
      ],
      [
        'legacy-total',
        'legacy-total',
        'getTotalDamage only over already-produced legacy combo results; planner, score, and asset setup are outside the timed interval',
      ],
      [
        'canonical-damage',
        'canonical-damage',
        'calculateCanonicalDamageOnDemand only; score, planner, summary, Worker, and presentation are outside the timed interval',
      ],
      [
        'canonical-total-aggregation',
        'canonical-total',
        'sumCanonicalDamage only over already-produced canonical envelopes',
      ],
      [
        'canonical-presentation',
        'canonical-presentation',
        'createAttackCanonicalPresentation only; Vue, Chart.js, DOM, and drawing are outside the timed interval',
      ],
      [
        'legacy-canonical-comparison',
        'legacy-canonical-comparison',
        'projection and comparison only over already-produced legacy/canonical results',
      ],
    ]) {
      stages.push(skippedStage(name, scope, constraint, reason))
    }
    return {
      id: testCase.id,
      label: testCase.label,
      route: testCase.route,
      tier: testCase.tier,
      input,
      iterations: measurement.iterations,
      warmupIterations: measurement.warmupIterations,
      iterationOverride: measurement.overridden,
      note: testCase.note,
      execution: testCase.execution,
      executionReason: testCase.executionReason,
      plannerPolicy: testCase.plannerPolicy,
      status: plannerMeasurement.error !== null
        ? 'error'
        : plannerRejected
          ? 'planner-rejected'
          : 'planner-only',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: null,
      stages,
    }
  }

  const fixture = createFixture(testCase, plans, dependencies)
  const legacyMeasurement = await measureStageSafely({
    name: 'legacy-damage',
    scope: 'legacy-damage',
    constraint: 'precomputed dr/d10 legacy API only; score and asset registration are outside the timed interval',
    operation: fixture.runLegacyDamages,
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) => summarizeStageResult('legacy-damage', result),
  })
  stages.push(legacyMeasurement.report)
  if (legacyMeasurement.error !== null) {
    const reason = 'dependent stages skipped because legacy damage failed'
    for (const [name, scope, constraint] of [
      [
        'legacy-total',
        'legacy-total',
        'getTotalDamage only over already-produced legacy combo results; planner, score, and asset setup are outside the timed interval',
      ],
      [
        'canonical-damage',
        'canonical-damage',
        'calculateCanonicalDamageOnDemand only; score, planner, summary, Worker, and presentation are outside the timed interval',
      ],
      [
        'canonical-total-aggregation',
        'canonical-total',
        'sumCanonicalDamage only over already-produced canonical envelopes',
      ],
      [
        'canonical-presentation',
        'canonical-presentation',
        'createAttackCanonicalPresentation only; Vue, Chart.js, DOM, and drawing are outside the timed interval',
      ],
      [
        'legacy-canonical-comparison',
        'legacy-canonical-comparison',
        'projection and comparison only over already-produced legacy/canonical results',
      ],
    ]) {
      stages.push(skippedStage(name, scope, constraint, reason))
    }
    return {
      id: testCase.id,
      label: testCase.label,
      route: testCase.route,
      tier: testCase.tier,
      input,
      iterations: measurement.iterations,
      warmupIterations: measurement.warmupIterations,
      iterationOverride: measurement.overridden,
      note: testCase.note,
      execution: testCase.execution,
      executionReason: testCase.executionReason,
      plannerPolicy: testCase.plannerPolicy,
      status: 'error',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: fixture.diagnostics,
      stages,
    }
  }

  const legacyDamages = legacyMeasurement.lastResult
  const legacyTotalCombos = legacyDamages.map((damage) => ({
    data: { damage },
  }))
  const legacyTotalMeasurement = await measureStageSafely({
    name: 'legacy-total',
    scope: 'legacy-total',
    constraint: 'getTotalDamage only over already-produced legacy combo results; planner, score, and asset setup are outside the timed interval',
    operation: () => dependencies.getTotalDamage(legacyTotalCombos),
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) => summarizeStageResult('legacy-total', result),
  })
  stages.push(legacyTotalMeasurement.report)
  if (legacyTotalMeasurement.error !== null) {
    const reason = 'dependent stages skipped because legacy total aggregation failed'
    for (const [name, scope, constraint] of [
      [
        'canonical-damage',
        'canonical-damage',
        'calculateCanonicalDamageOnDemand only; score, planner, summary, Worker, and presentation are outside the timed interval',
      ],
      [
        'canonical-total-aggregation',
        'canonical-total',
        'sumCanonicalDamage only over already-produced canonical envelopes',
      ],
      [
        'canonical-presentation',
        'canonical-presentation',
        'createAttackCanonicalPresentation only; Vue, Chart.js, DOM, and drawing are outside the timed interval',
      ],
      [
        'legacy-canonical-comparison',
        'legacy-canonical-comparison',
        'projection and comparison only over already-produced legacy/canonical results',
      ],
    ]) {
      stages.push(skippedStage(name, scope, constraint, reason))
    }
    return {
      id: testCase.id,
      label: testCase.label,
      route: testCase.route,
      tier: testCase.tier,
      input,
      iterations: measurement.iterations,
      warmupIterations: measurement.warmupIterations,
      iterationOverride: measurement.overridden,
      note: testCase.note,
      execution: testCase.execution,
      executionReason: testCase.executionReason,
      plannerPolicy: testCase.plannerPolicy,
      status: 'error',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: fixture.diagnostics,
      stages,
    }
  }

  const canonicalMeasurement = await measureStageSafely({
    name: 'canonical-damage',
    scope: 'canonical-damage',
    constraint: 'calculateCanonicalDamageOnDemand only; score, planner, summary, Worker, and presentation are outside the timed interval',
    operation: fixture.runCanonicalDamages,
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) => summarizeStageResult('canonical-damage', result),
  })
  stages.push(canonicalMeasurement.report)
  if (canonicalMeasurement.error !== null) {
    const reason = 'dependent stages skipped because canonical damage failed'
    for (const [name, scope, constraint] of [
      [
        'canonical-total-aggregation',
        'canonical-total',
        'sumCanonicalDamage only over already-produced canonical envelopes',
      ],
      [
        'canonical-presentation',
        'canonical-presentation',
        'createAttackCanonicalPresentation only; Vue, Chart.js, DOM, and drawing are outside the timed interval',
      ],
      [
        'legacy-canonical-comparison',
        'legacy-canonical-comparison',
        'projection and comparison only over already-produced legacy/canonical results',
      ],
    ]) {
      stages.push(skippedStage(name, scope, constraint, reason))
    }
    return {
      id: testCase.id,
      label: testCase.label,
      route: testCase.route,
      tier: testCase.tier,
      input,
      iterations: measurement.iterations,
      warmupIterations: measurement.warmupIterations,
      iterationOverride: measurement.overridden,
      note: testCase.note,
      execution: testCase.execution,
      executionReason: testCase.executionReason,
      plannerPolicy: testCase.plannerPolicy,
      status: 'error',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: fixture.diagnostics,
      stages,
    }
  }

  const canonicalDamages = canonicalMeasurement.lastResult
  const canonicalTotalMeasurement = await measureStageSafely({
    name: 'canonical-total-aggregation',
    scope: 'canonical-total',
    constraint: 'sumCanonicalDamage only over already-produced canonical envelopes',
    operation: () => dependencies.sumCanonicalDamage(canonicalDamages),
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) =>
      summarizeStageResult('canonical-total-aggregation', result),
  })
  stages.push(canonicalTotalMeasurement.report)
  if (canonicalTotalMeasurement.error !== null) {
    const reason = 'dependent stages skipped because canonical total aggregation failed'
    for (const [name, scope, constraint] of [
      [
        'canonical-presentation',
        'canonical-presentation',
        'createAttackCanonicalPresentation only; Vue, Chart.js, DOM, and drawing are outside the timed interval',
      ],
      [
        'legacy-canonical-comparison',
        'legacy-canonical-comparison',
        'projection and comparison only over already-produced legacy/canonical results',
      ],
    ]) {
      stages.push(skippedStage(name, scope, constraint, reason))
    }
    return {
      id: testCase.id,
      label: testCase.label,
      route: testCase.route,
      tier: testCase.tier,
      input,
      iterations: measurement.iterations,
      warmupIterations: measurement.warmupIterations,
      iterationOverride: measurement.overridden,
      note: testCase.note,
      execution: testCase.execution,
      executionReason: testCase.executionReason,
      plannerPolicy: testCase.plannerPolicy,
      status: 'error',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: fixture.diagnostics,
      stages,
    }
  }

  const legacyTotalDamage = legacyTotalMeasurement.lastResult
  const canonicalTotalDamage = canonicalTotalMeasurement.lastResult
  const { batch } = createBatchState(
    fixture,
    canonicalDamages,
    canonicalTotalDamage,
    dependencies
  )
  const presentationMeasurement = await measureStageSafely({
    name: 'canonical-presentation',
    scope: 'canonical-presentation',
    constraint: 'createAttackCanonicalPresentation only; Vue, Chart.js, DOM, and drawing are outside the timed interval',
    operation: () => dependencies.createAttackCanonicalPresentation(
      batch,
      plans
    ),
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) =>
      summarizeStageResult('canonical-presentation', result),
  })
  stages.push(presentationMeasurement.report)

  const comparisonMeasurement = await measureStageSafely({
    name: 'legacy-canonical-comparison',
    scope: 'legacy-canonical-comparison',
    constraint: 'projection and comparison only over already-produced legacy/canonical results',
    operation: () => ({
      damage: fixture.entries.map((entry, index) =>
        dependencies.compareLegacyAndCanonicalDistributions(
          legacyDamages[index].distribution,
          canonicalDamages[index]
        )
      ),
      total: dependencies.compareLegacyAndCanonicalTotalDamage(
        legacyTotalDamage.distribution,
        canonicalTotalDamage
      ),
    }),
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) =>
      summarizeStageResult('legacy-canonical-comparison', result),
  })
  stages.push(comparisonMeasurement.report)

  const errorStage = stages.find((stage) => stage.status === 'error')
  return {
    id: testCase.id,
    label: testCase.label,
    route: testCase.route,
    tier: testCase.tier,
    input,
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    iterationOverride: measurement.overridden,
    note: testCase.note,
    execution: testCase.execution,
    executionReason: testCase.executionReason,
    plannerPolicy: testCase.plannerPolicy,
    status: errorStage ? 'error' : 'measured',
    reason: errorStage?.error ?? null,
    plan: plans.map(summarizePlan),
    fixtureDiagnostics: fixture.diagnostics,
    stages,
  }
}

async function readAsset(relativePath) {
  return JSON.parse(
    await readFile(new URL(relativePath, ASSET_DIRECTORY), 'utf8')
  )
}

function getLocalCommit() {
  try {
    return execFileSync(
      'git',
      ['rev-parse', '--short', 'HEAD'],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    ).trim() || null
  } catch {
    return null
  }
}

async function loadDependencies() {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })

  try {
    const [
      damageCalculation,
      scoreCalculation,
      runtimeDamageRollCalculation,
      canonicalDamageAggregation,
      legacyCanonicalComparison,
      distributionResult,
      rangePlanner,
      d10Repository,
      referenceRepository,
      presentation,
      attackPresentation,
    ] =
      await Promise.all([
        server.ssrLoadModule('/src/calculation/DamageCalculator.js'),
        server.ssrLoadModule('/src/calculation/ScoreCalculator.js'),
        server.ssrLoadModule(
          '/src/calculation/RuntimeDamageRollCalculator.js'
        ),
        server.ssrLoadModule('/src/calculation/CanonicalDamageAggregation.js'),
        server.ssrLoadModule('/src/calculation/LegacyCanonicalComparison.js'),
        server.ssrLoadModule('/src/calculation/DistributionResult.js'),
        server.ssrLoadModule('/src/calculation/RangePlanner.js'),
        server.ssrLoadModule('/src/data/D10PrecomputedDataRepository.js'),
        server.ssrLoadModule('/src/data/ReferencePrecomputedDataRepository.js'),
        server.ssrLoadModule('/src/presentation/index.js'),
        server.ssrLoadModule('/src/application/AttackCanonicalPresentation.js'),
      ])

    return {
      server,
      planCalculationRanges: rangePlanner.planCalculationRanges,
      calculateCanonicalDamageOnDemand:
        damageCalculation.calculateCanonicalDamageOnDemand,
      createDamageRollRequest: damageCalculation.createDamageRollRequest,
      generateMixedDamageDistribution:
        runtimeDamageRollCalculation.generateMixedDamageDistribution,
      sumCanonicalDamage: canonicalDamageAggregation.sumCanonicalDamage,
      compareLegacyAndCanonicalDistributions:
        legacyCanonicalComparison.compareLegacyAndCanonicalDistributions,
      compareLegacyAndCanonicalTotalDamage:
        legacyCanonicalComparison.compareLegacyAndCanonicalTotalDamage,
      getCanonicalDamageSummary: damageCalculation.getCanonicalDamageSummary,
      getCanonicalTotalDamageSummary:
        distributionResult.getCanonicalTotalDamageSummary,
      getScoreSummary: scoreCalculation.getScoreSummary,
      getD10Distribution: d10Repository.getD10Distribution,
      getDamage: (score, attack, defence) =>
        damageCalculation.calculateDamage(
          score,
          attack,
          defence,
          {
            getD10Distribution: d10Repository.getD10Distribution,
            getDrDamageDistributions:
              referenceRepository.getDrDamageDistributions,
          }
        ),
      getTotalDamage: damageCalculation.getTotalDamage,
      getScore: (params, fix = false) =>
        scoreCalculation.calculateScore(
          params,
          { getDxDistribution: referenceRepository.getDxDistribution },
          fix
        ),
      registerDxAsset: referenceRepository.registerDxAsset,
      registerDrAsset: referenceRepository.registerDrAsset,
      registerD10Asset: d10Repository.registerD10Asset,
      createAttackCanonicalPresentation:
        attackPresentation.createAttackCanonicalPresentation,
      presentCanonicalDistribution: presentation.presentCanonicalDistribution,
    }
  } catch (error) {
    await server.close()
    throw error
  }
}

async function registerAssets(dependencies) {
  const shihai = new Set()
  const kazanari = new Set()
  for (const testCase of BENCHMARK_CASES) {
    for (const entry of testCase.entries) {
      shihai.add(entry.params.action.score.shihai)
      shihai.add(entry.params.reaction.score.shihai)
      kazanari.add(entry.params.action.damage.kazanari)
    }
  }

  await Promise.all([
    ...Array.from(shihai, async (value) => {
      dependencies.registerDxAsset(await readAsset(`dx/shihai-${value}.json`))
    }),
    ...Array.from(kazanari, async (value) => {
      dependencies.registerDrAsset(await readAsset(`dr/kazanari-${value}.json`))
    }),
    (async () => {
      dependencies.registerD10Asset(await readAsset('d10.json'))
    })(),
  ])
}

function createMetadata(options) {
  const cpu = os.cpus()[0]
  return {
    schemaVersion: BENCHMARK_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    node: {
      version: process.version,
      executable: process.execPath,
    },
    machine: {
      platform: process.platform,
      arch: process.arch,
      cpu: cpu?.model?.trim() ?? null,
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    commit: getLocalCommit(),
    clock: 'performance.now',
    cold: 'the first timed invocation after module, fixture, and asset setup; process startup and Vite/module load are excluded',
    warmup: 'untimed invocations after cold and before warm samples; warmup results are consumed but not reported as samples',
    warm: 'timed invocations after warmup; statistics are nearest-rank median and p95 plus min/max',
    defaultIterations: DEFAULT_ITERATIONS,
    defaultWarmupIterations: DEFAULT_WARMUP_ITERATIONS,
    requestedIterations: options.iterations,
    requestedWarmupIterations: options.warmupIterations,
    browserComparison: 'Node timings exclude browser event-loop delay, Worker creation/message transfer, fetch/JSON serialization, DOM, Chart.js, and device/browser engine variability',
  }
}

export async function runBenchmark(options = {}) {
  const normalizedOptions = validateRunOptions(options)
  resultSink = 0
  const dependencies = await loadDependencies()
  try {
    await registerAssets(dependencies)
    const cases = []
    for (const testCase of BENCHMARK_CASES) {
      cases.push(await runCase(testCase, dependencies, normalizedOptions))
    }
    return {
      metadata: createMetadata(normalizedOptions),
      cases,
      resultSink: round(resultSink),
    }
  } finally {
    await dependencies.server.close()
  }
}

function formatStats(stats) {
  return `${stats.medianMs.toFixed(3)} / ${stats.p95Ms.toFixed(3)} / ${stats.minMs.toFixed(3)} / ${stats.maxMs.toFixed(3)}`
}

function nonEmptyText(value, fallback) {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim()
  }
  if (value !== null && value !== undefined) {
    const text = String(value).trim()
    if (text !== '') {
      return text
    }
  }
  return fallback
}

export function formatHumanReport(report) {
  const lines = [
    'Phase 2-H 第11単位 Node benchmark',
    `Node ${report.metadata.node.version}, ${report.metadata.machine.platform}/${report.metadata.machine.arch}, commit=${report.metadata.commit ?? 'unavailable'}`,
    'timing: cold=first timed call, warm=after warmup; columns are median / p95 / min / max ms',
  ]
  for (const testCase of report.cases) {
    lines.push('')
    lines.push(
      `[${testCase.id}] ${testCase.label} route=${testCase.route} `
      + `iterations=${testCase.iterations} warmup=${testCase.warmupIterations} `
      + `status=${testCase.status}`
    )
    if (testCase.reason !== null) {
      lines.push(`  reason: ${testCase.reason}`)
    }
    for (const stage of testCase.stages) {
      if (stage.status === 'measured') {
        lines.push(
          `  ${stage.name}: cold ${formatStats(stage.cold)}; `
          + `warm ${formatStats(stage.warm)}`
        )
      } else if (stage.status === 'error') {
        const reason = nonEmptyText(stage.reason, 'benchmark stage failed')
        const error = nonEmptyText(stage.error, 'error detail unavailable')
        lines.push(`  ${stage.name}: error (${reason}); error=${error}`)
      } else {
        const reason = nonEmptyText(stage.reason, 'no reason provided')
        lines.push(`  ${stage.name}: ${stage.status} (${reason})`)
      }
    }
  }
  return lines.join('\n')
}

export const HELP_TEXT = `Usage: npm run benchmark:phase2h -- [options]

Options:
  --json                 write machine-readable JSON to stdout
  --iterations N         override warm sample count for every case (1-${MAX_ITERATIONS})
  --warmup N             override warmup count for every case (0-${MAX_WARMUP_ITERATIONS})
  --help                 show this help
`

function isMainModule() {
  if (process.argv[1] === undefined) {
    return false
  }
  return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
}

if (isMainModule()) {
  let args
  try {
    args = parseBenchmarkArgs(process.argv.slice(2))
    if (args.help) {
      console.log(HELP_TEXT)
    } else {
      const report = await runBenchmark(args)
      if (args.json) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        console.log(formatHumanReport(report))
      }
    }
  } catch (error) {
    console.error(formatError(error))
    process.exitCode = 1
  }
}
