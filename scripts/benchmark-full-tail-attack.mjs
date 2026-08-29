import os from 'node:os'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'

export const BENCHMARK_REPORT_SCHEMA_VERSION = 1
export const DEFAULT_ITERATIONS = 3
export const DEFAULT_WARMUP_ITERATIONS = 1
export const MAX_ITERATIONS = 1_000
export const MAX_WARMUP_ITERATIONS = 1_000

const PERMISSIVE_RESOURCE_LIMIT = Number.MAX_SAFE_INTEGER

// This mirrors the production Attack policy selection without copying or
// mutating the application's DEFAULT_POLICY object.
export const PRODUCTION_RANGE_POLICY = Object.freeze({
  scorePropagation: 'full-tail',
})

// Benchmark-only policy: only RangePlanner thresholds are widened. The
// planner's calculationMax, display policy, and cost model remain unchanged,
// while downstream runtime and aggregation absolute safety ceilings remain in
// force.
export const BENCHMARK_RANGE_POLICY = Object.freeze({
  scorePropagation: 'full-tail',
  limits: Object.freeze({
    warning: Object.freeze({
      estimatedTimeMs: PERMISSIVE_RESOURCE_LIMIT,
      estimatedMemoryBytes: PERMISSIVE_RESOURCE_LIMIT,
      workingLength: PERMISSIVE_RESOURCE_LIMIT,
      fftLength: PERMISSIVE_RESOURCE_LIMIT,
    }),
    hard: Object.freeze({
      estimatedTimeMs: PERMISSIVE_RESOURCE_LIMIT,
      estimatedMemoryBytes: PERMISSIVE_RESOURCE_LIMIT,
      workingLength: PERMISSIVE_RESOURCE_LIMIT,
      fftLength: PERMISSIVE_RESOURCE_LIMIT,
    }),
  }),
})

const DIGEST_MODULUS = 1_000_000_007
const DR_DICE_COUNTS = Object.freeze([202, 300, 400, 600, 800])
const KAZANARI_VALUES = Object.freeze([0, 1, 9])
let resultSink = 0

function createScoreParams(overrides = {}) {
  return {
    dice: 99,
    critical: 2,
    skill: 0,
    yousei: 0,
    shihai: 0,
    ...overrides,
  }
}

function createAttackParams({
  score = {},
  reactionScore = score,
  attackDice = 99,
  attackValue = 999,
  kazanari = 9,
  defenceDice = 99,
  defenceValue = -999,
} = {}) {
  return {
    action: {
      score: createScoreParams(score),
      damage: { dice: attackDice, value: attackValue, kazanari },
    },
    reaction: {
      mode: 'guard',
      score: createScoreParams(reactionScore),
      damage: { dice: defenceDice, value: defenceValue },
    },
  }
}

function createDrCase(dice, kazanari) {
  return Object.freeze({
    id: `dr-${dice}d-kazanari-${kazanari}`,
    label: `runtime DR ${dice}D, kazanari=${kazanari}`,
    kind: 'runtime-dr',
    dice,
    kazanari,
  })
}

export const DR_CASES = Object.freeze(
  DR_DICE_COUNTS.flatMap((dice) =>
    KAZANARI_VALUES.map((kazanari) => createDrCase(dice, kazanari))
  )
)

export const ATTACK_CASES = Object.freeze([
  Object.freeze({
    id: 'attack-99d-critical2-skill0-kazanari0',
    label: 'full-tail Attack 99D critical=2 skill=0 kazanari=0',
    kind: 'attack',
    params: createAttackParams({
      score: { skill: 0 },
      kazanari: 0,
    }),
  }),
  Object.freeze({
    id: 'attack-202d-critical11-skill0-attack99',
    label: 'full-tail Attack 202D from 99D critical=11 skill=0 attackDice=99',
    kind: 'attack',
    params: createAttackParams({
      score: { critical: 11, skill: 0 },
      attackDice: 99,
      kazanari: 0,
    }),
  }),
  Object.freeze({
    id: 'attack-300d-critical11-skill999-attack197',
    label: 'full-tail Attack 300D from 99D critical=11 skill=+999 attackDice=197',
    kind: 'attack',
    params: createAttackParams({
      score: { critical: 11, skill: 999 },
      attackDice: 197,
      kazanari: 0,
    }),
  }),
  Object.freeze({
    id: 'attack-400d-critical2-skill999-attack72',
    label: 'full-tail Attack 400D from 99D critical=2 skill=+999 attackDice=72',
    kind: 'attack',
    params: createAttackParams({
      score: { skill: 999 },
      attackDice: 72,
      kazanari: 0,
    }),
  }),
  Object.freeze({
    id: 'attack-600d-critical2-skill999-attack272',
    label: 'full-tail Attack 600D from 99D critical=2 skill=+999 attackDice=272',
    kind: 'attack',
    params: createAttackParams({
      score: { skill: 999 },
      attackDice: 272,
      kazanari: 0,
    }),
  }),
  Object.freeze({
    id: 'attack-99d-critical2-kazanari1',
    label: 'full-tail Attack 99D critical=2 skill=0 kazanari=1',
    kind: 'attack',
    params: createAttackParams({
      score: { skill: 0 },
      kazanari: 1,
    }),
  }),
  Object.freeze({
    id: 'attack-99d-critical2-kazanari9',
    label: 'full-tail Attack 99D critical=2 skill=0 kazanari=9',
    kind: 'attack',
    params: createAttackParams({
      score: { skill: 0 },
      kazanari: 9,
    }),
  }),
  Object.freeze({
    id: 'attack-99d-critical2-skill999-yousei9-shihai0',
    label: 'full-tail Attack 99D critical=2 skill=+999 yousei=9 shihai=0',
    kind: 'attack',
    params: createAttackParams({
      score: { skill: 999, yousei: 9, shihai: 0 },
      kazanari: 9,
    }),
  }),
  Object.freeze({
    id: 'attack-99d-critical2-skill999-yousei0-shihai19',
    label: 'full-tail Attack 99D critical=2 skill=+999 yousei=0 shihai=19',
    kind: 'attack',
    params: createAttackParams({
      score: { skill: 999, yousei: 0, shihai: 19 },
      kazanari: 9,
    }),
  }),
])

export const BENCHMARK_CASES = Object.freeze([
  ...DR_CASES,
  ...ATTACK_CASES,
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

function validateRunOptions(options) {
  if (options === undefined) {
    return {
      iterations: DEFAULT_ITERATIONS,
      warmupIterations: DEFAULT_WARMUP_ITERATIONS,
    }
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('benchmark options must be an object')
  }
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const warmupIterations = options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS
  return {
    iterations: validateIterationCount(
      iterations,
      'iterations',
      MAX_ITERATIONS
    ),
    warmupIterations: validateIterationCount(
      warmupIterations,
      'warmupIterations',
      MAX_WARMUP_ITERATIONS
    ),
  }
}

function mixDigest(digest, number) {
  const normalized = Number.isFinite(number) ? number : 0
  return (digest * 1.0000001 + normalized) % DIGEST_MODULUS
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
  resultSink = (resultSink + digest) % DIGEST_MODULUS
  return digest
}

async function timed(operation) {
  const started = performance.now()
  const result = await operation()
  const elapsed = performance.now() - started
  const digest = consumeResult(result)
  return { result, elapsed, digest }
}

async function measureOperation(operation) {
  const cold = await timed(operation)
  for (let iteration = 0; iteration < currentWarmupIterations; iteration += 1) {
    const warmupResult = await operation()
    consumeResult(warmupResult)
  }

  const warmElapsed = []
  let lastResult = cold.result
  let lastDigest = cold.digest
  for (let iteration = 0; iteration < currentIterations; iteration += 1) {
    const sample = await timed(operation)
    warmElapsed.push(sample.elapsed)
    lastResult = sample.result
    lastDigest = sample.digest
  }

  return {
    coldMs: cold.elapsed,
    warm: summarizeSamples(warmElapsed),
    lastResult,
    resultDigest: round(lastDigest),
  }
}

async function measureSafely(operation) {
  try {
    return {
      measurement: await measureOperation(operation),
      error: null,
    }
  } catch (error) {
    return {
      measurement: null,
      error,
    }
  }
}

function summarizeNumericArray(value) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    return null
  }
  let total = 0
  let minimum = Infinity
  let maximum = -Infinity
  let nonFiniteCount = 0
  let nonZeroCount = 0
  for (const number of value) {
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
    length: value.length,
    total: round(total),
    minimum: value.length === 0 ? null : round(minimum),
    maximum: value.length === 0 ? null : round(maximum),
    nonZeroCount,
    nonFiniteCount,
  }
}

function formatError(error) {
  return String(error?.stack ?? error)
}

function summarizeWarnings(plan) {
  return (plan?.warnings ?? []).map((warning) => ({
    code: warning.code,
    severity: warning.severity,
    message: warning.message,
    value: warning.value,
    limit: warning.limit,
  }))
}

function summarizePlanFields(plan, kazanari) {
  return {
    scoreCutoff: plan?.scores?.map((score) => score.tail?.cutoff ?? null) ?? null,
    maxDamageDice: plan?.damage?.maxDamageDice ?? null,
    rawSupportMax: plan?.damage?.rawSupportMax ?? null,
    workingLength: plan?.damage?.workingLength ?? null,
    fftLength: plan?.damage?.fftLength ?? null,
    distributionLength: null,
    kazanari,
    estimatedTimeMs: plan?.estimates?.timeMs ?? null,
    estimatedMemoryBytes: plan?.estimates?.float64Bytes ?? null,
    warnings: summarizeWarnings(plan),
  }
}

function summarizeScoreEnvelope(envelope) {
  return {
    support: envelope.result.support,
    overflow: envelope.result.overflow,
    failureProbability: envelope.metadata.failureProbability,
    scoreTailCertificate: envelope.metadata.scoreTailCertificate,
  }
}

function summarizeCanonicalDamage(envelope) {
  return {
    result: {
      values: summarizeNumericArray(envelope.result.values),
      offset: envelope.result.offset,
      support: envelope.result.support,
      overflow: envelope.result.overflow,
    },
    metadata: {
      scorePropagation: envelope.metadata.scorePropagation,
      scoreTailProbabilityUpperBound:
        envelope.metadata.scoreTailProbabilityUpperBound ?? null,
      scoreTailErrorBound: envelope.metadata.scoreTailErrorBound ?? null,
      sourceSupport: envelope.metadata.sourceSupport ?? null,
      modeledSupport: envelope.metadata.modeledSupport ?? null,
    },
  }
}

function summarizeCanonicalTotal(envelope) {
  if (envelope === null || envelope === undefined) {
    return null
  }
  return {
    result: {
      values: summarizeNumericArray(envelope.result.values),
      offset: envelope.result.offset,
      support: envelope.result.support,
      overflow: envelope.result.overflow,
    },
    metadata: {
      sourceSupport: envelope.metadata.sourceSupport ?? null,
      aggregationErrorBound: envelope.metadata.aggregationErrorBound ?? null,
      componentCount: envelope.metadata.componentCount ?? null,
    },
  }
}

function summarizeAttackResult(result) {
  return {
    score: {
      action: summarizeScoreEnvelope(result.score.action),
      reaction: summarizeScoreEnvelope(result.score.reaction),
    },
    damage: summarizeCanonicalDamage(result.damage),
    total: summarizeCanonicalTotal(result.total),
    runtime: result.runtimeOptions,
  }
}

function createAttackPlannerParams(params) {
  return {
    operation: 'attack',
    score: {
      action: { ...params.action.score },
      reaction: { ...params.reaction.score },
    },
    attack: { ...params.action.damage },
    defence: { ...params.reaction.damage },
  }
}

function createRangePlanError(plan) {
  const reasons = getPlanRejectionReasons(plan)
  if (reasons.length > 0) {
    return `range plan rejected: ${Array.from(new Set(reasons)).join(', ')}`
  }
  return 'range plan rejected before calculation'
}

function getPlanRejectionReasons(plan) {
  const reasons = plan?.rejectionReasons ?? []
  if (reasons.length > 0) {
    return Array.from(new Set(reasons))
  }
  return Array.from(new Set(
    plan?.warnings
      ?.filter((warning) => warning.severity === 'reject')
      .map(({ code }) => code) ?? []
  ))
}

function summarizePlannerOutcome(measurement) {
  if (measurement.error !== null) {
    return {
      accepted: null,
      status: 'planner-error',
      rejectionReasons: [],
      scoreCutoff: null,
      estimatedTimeMs: null,
      estimatedMemoryBytes: null,
      warnings: [],
      error: formatError(measurement.error),
    }
  }

  const plan = measurement.measurement.lastResult
  const accepted = plan.accepted === true
  return {
    accepted,
    status: accepted ? 'accepted' : 'planner-rejected',
    rejectionReasons: getPlanRejectionReasons(plan),
    scoreCutoff: plan.scores?.map((score) => score.tail?.cutoff ?? null) ?? null,
    estimatedTimeMs: plan.estimates?.timeMs ?? null,
    estimatedMemoryBytes: plan.estimates?.float64Bytes ?? null,
    warnings: summarizeWarnings(plan),
    error: accepted ? null : createRangePlanError(plan),
  }
}

function copyRuntimeOptions(options) {
  if (options === null || typeof options !== 'object') {
    return null
  }
  return {
    fftLength: options.fftLength ?? null,
    distributionLength: options.distributionLength ?? null,
    rawSupportMax: options.rawSupportMax ?? null,
  }
}

function createDynamicDamageProvider(dependencies, observed) {
  return (weights, kazanari, options) => {
    observed.runtimeOptions = copyRuntimeOptions(options)
    return dependencies.generateMixedDamageDistribution(
      weights,
      kazanari,
      options
    )
  }
}

function createRuntimeDxProvider(calculateDxDistribution) {
  const cache = new Map()
  return (shihai, dice, critical, options) => {
    const key = [
      shihai,
      dice,
      critical,
      options?.workingLength ?? '',
      options?.rounding ?? '',
    ].join(':')
    if (cache.has(key)) {
      return cache.get(key)
    }
    const distribution = calculateDxDistribution(
      { shihai, dice, critical },
      options
    )
    cache.set(key, distribution)
    return distribution
  }
}

function nextPowerOfTwo(value) {
  let result = 1
  while (result < value) {
    result *= 2
  }
  return result
}

function createDrWeights(dice) {
  const weights = new Float64Array(dice + 1)
  weights[dice] = 1
  return weights
}

function createTimingReport(measurement) {
  if (measurement === null) {
    return null
  }
  return {
    coldMs: round(measurement.coldMs),
    warm: measurement.warm,
  }
}

function createCommonCaseReport(testCase, fields) {
  return {
    id: testCase.id,
    label: testCase.label,
    kind: testCase.kind,
    ...fields,
  }
}

async function runDrCase(testCase, dependencies) {
  const rawSupportMax = testCase.dice * 10
  const distributionLength = rawSupportMax + 1
  const fftLength = nextPowerOfTwo(distributionLength)
  const measurement = await measureSafely(async () => {
    const distribution = dependencies.generateMixedDamageDistribution(
      createDrWeights(testCase.dice),
      testCase.kazanari,
      { fftLength, distributionLength, rawSupportMax }
    )
    return { distribution }
  })

  if (measurement.error !== null) {
    return createCommonCaseReport(testCase, {
      scoreCutoff: null,
      maxDamageDice: testCase.dice,
      rawSupportMax,
      workingLength: distributionLength,
      fftLength,
      distributionLength,
      kazanari: testCase.kazanari,
      elapsed: { planner: null, execution: null },
      estimatedTimeMs: null,
      estimatedMemoryBytes: null,
      accepted: null,
      status: 'error',
      error: formatError(measurement.error),
      warnings: [],
      tailMetadata: null,
      result: null,
      resultDigest: null,
      plannerResultDigest: null,
    })
  }

  const result = measurement.measurement.lastResult
  return createCommonCaseReport(testCase, {
    scoreCutoff: null,
    maxDamageDice: testCase.dice,
    rawSupportMax,
    workingLength: distributionLength,
    fftLength,
    distributionLength,
    kazanari: testCase.kazanari,
    elapsed: {
      planner: null,
      execution: createTimingReport(measurement.measurement),
    },
    estimatedTimeMs: null,
    estimatedMemoryBytes: null,
    accepted: true,
    status: 'measured',
    error: null,
    warnings: [],
    tailMetadata: null,
    result: {
      distribution: summarizeNumericArray(result.distribution),
    },
    resultDigest: measurement.measurement.resultDigest,
    plannerResultDigest: null,
  })
}

async function runAttackCase(testCase, dependencies, runtimeDx) {
  const plannerParams = createAttackPlannerParams(testCase.params)
  const productionPlannerMeasurement = await measureSafely(() =>
    dependencies.planCalculationRanges(
      plannerParams,
      PRODUCTION_RANGE_POLICY
    )
  )
  const benchmarkPlannerMeasurement = await measureSafely(() =>
    dependencies.planCalculationRanges(
      plannerParams,
      BENCHMARK_RANGE_POLICY
    )
  )
  const productionPlanner = summarizePlannerOutcome(
    productionPlannerMeasurement
  )
  const benchmarkPlanner = summarizePlannerOutcome(
    benchmarkPlannerMeasurement
  )
  const plan = benchmarkPlannerMeasurement.measurement?.lastResult ?? null
  const kazanari = testCase.params.action.damage.kazanari
  const planFields = summarizePlanFields(plan, kazanari)
  const productionPlannerResultDigest =
    productionPlannerMeasurement.measurement?.resultDigest ?? null
  const plannerResultDigest =
    benchmarkPlannerMeasurement.measurement?.resultDigest ?? null
  const baseReport = {
    ...planFields,
    productionAccepted: productionPlanner.accepted,
    productionStatus: productionPlanner.status,
    productionRejectionReasons: productionPlanner.rejectionReasons,
    productionScoreCutoff: productionPlanner.scoreCutoff,
    productionEstimatedTimeMs: productionPlanner.estimatedTimeMs,
    productionEstimatedMemoryBytes: productionPlanner.estimatedMemoryBytes,
    productionWarnings: productionPlanner.warnings,
    productionError: productionPlanner.error,
    productionPlannerResultDigest,
    benchmarkAccepted: benchmarkPlanner.accepted,
    benchmarkStatus: benchmarkPlanner.status,
    benchmarkRejectionReasons: benchmarkPlanner.rejectionReasons,
    benchmarkWarnings: benchmarkPlanner.warnings,
    benchmarkError: benchmarkPlanner.error,
    benchmarkPlannerResultDigest: plannerResultDigest,
    elapsed: {
      productionPlanner: createTimingReport(
        productionPlannerMeasurement.measurement
      ),
      planner: createTimingReport(benchmarkPlannerMeasurement.measurement),
      execution: null,
    },
  }

  if (benchmarkPlannerMeasurement.error !== null) {
    return createCommonCaseReport(testCase, {
      ...baseReport,
      accepted: null,
      status: 'planner-error',
      benchmarkAccepted: null,
      benchmarkStatus: 'planner-error',
      error: formatError(benchmarkPlannerMeasurement.error),
      tailMetadata: null,
      result: null,
      resultDigest: null,
      plannerResultDigest: null,
    })
  }

  if (plan.accepted !== true) {
    return createCommonCaseReport(testCase, {
      ...baseReport,
      accepted: false,
      status: 'planner-rejected',
      error: createRangePlanError(plan),
      tailMetadata: null,
      result: null,
      resultDigest: plannerResultDigest,
      plannerResultDigest,
    })
  }

  const observed = { runtimeOptions: null }
  const getDamageRollDistribution = createDynamicDamageProvider(
    dependencies,
    observed
  )
  const executionMeasurement = await measureSafely(async () => {
    const score = {
      action: dependencies.calculateScoreCanonical(
        testCase.params.action.score,
        { getDxDistribution: runtimeDx },
        plan.scores[0]
      ),
      reaction: dependencies.calculateScoreCanonical(
        testCase.params.reaction.score,
        { getDxDistribution: runtimeDx },
        plan.scores[1]
      ),
    }
    const damage = await dependencies.calculateCanonicalDamageOnDemand(
      score,
      testCase.params.action.damage,
      testCase.params.reaction.damage,
      {
        getDamageRollDistribution,
        getD10Distribution: dependencies.getD10Distribution,
      },
      {},
      plan
    )
    const total = dependencies.sumCanonicalDamage([damage])
    return {
      score,
      damage,
      total,
      runtimeOptions: observed.runtimeOptions,
    }
  })

  if (executionMeasurement.error !== null) {
    return createCommonCaseReport(testCase, {
      ...baseReport,
      distributionLength: observed.runtimeOptions?.distributionLength ?? null,
      fftLength: observed.runtimeOptions?.fftLength ?? planFields.fftLength,
      elapsed: {
        ...baseReport.elapsed,
        execution: null,
      },
      accepted: true,
      status: 'execution-error',
      benchmarkAccepted: true,
      benchmarkStatus: 'execution-error',
      benchmarkError: formatError(executionMeasurement.error),
      error: formatError(executionMeasurement.error),
      tailMetadata: null,
      result: null,
      resultDigest: plannerResultDigest,
      plannerResultDigest,
    })
  }

  const execution = executionMeasurement.measurement
  const result = execution.lastResult
  return createCommonCaseReport(testCase, {
    ...baseReport,
    distributionLength: result.runtimeOptions?.distributionLength ?? null,
    fftLength: result.runtimeOptions?.fftLength ?? planFields.fftLength,
    elapsed: {
      ...baseReport.elapsed,
      execution: createTimingReport(execution),
    },
    accepted: true,
    status: 'measured',
    benchmarkAccepted: true,
    benchmarkStatus: 'measured',
    benchmarkError: null,
    error: null,
    tailMetadata: summarizeAttackResult(result),
    result: {
      score: {
        action: summarizeScoreEnvelope(result.score.action),
        reaction: summarizeScoreEnvelope(result.score.reaction),
      },
      damage: summarizeCanonicalDamage(result.damage),
      total: summarizeCanonicalTotal(result.total),
    },
    resultDigest: execution.resultDigest,
    plannerResultDigest,
  })
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
      dxCalculation,
      scoreCalculation,
      runtimeDamageRollCalculation,
      rangePlanner,
      canonicalDamageAggregation,
      d10Calculation,
    ] = await Promise.all([
      server.ssrLoadModule('/src/calculation/DamageCalculator.js'),
      server.ssrLoadModule('/src/calculation/DxCalculator.js'),
      server.ssrLoadModule('/src/calculation/ScoreCalculator.js'),
      server.ssrLoadModule(
        '/src/calculation/RuntimeDamageRollCalculator.js'
      ),
      server.ssrLoadModule('/src/calculation/RangePlanner.js'),
      server.ssrLoadModule('/src/calculation/CanonicalDamageAggregation.js'),
      server.ssrLoadModule('/src/calculation/D10Calculator.js'),
    ])
    return {
      server,
      calculateCanonicalDamageOnDemand:
        damageCalculation.calculateCanonicalDamageOnDemand,
      calculateDxDistribution: dxCalculation.calculateDxDistribution,
      calculateScoreCanonical: scoreCalculation.calculateScoreCanonical,
      generateMixedDamageDistribution:
        runtimeDamageRollCalculation.generateMixedDamageDistribution,
      getD10Distribution: (dice, size, options) =>
        d10Calculation.calculateD10Distribution(dice, {
          size,
          ...options,
        }),
      planCalculationRanges: rangePlanner.planCalculationRanges,
      sumCanonicalDamage: canonicalDamageAggregation.sumCanonicalDamage,
    }
  } catch (error) {
    await server.close()
    throw error
  }
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
    clock: 'performance.now',
    defaultIterations: DEFAULT_ITERATIONS,
    defaultWarmupIterations: DEFAULT_WARMUP_ITERATIONS,
    requestedIterations: options.iterations,
    requestedWarmupIterations: options.warmupIterations,
    scorePropagation: 'full-tail',
    productionRangePolicy: PRODUCTION_RANGE_POLICY,
    benchmarkRangePolicy: BENCHMARK_RANGE_POLICY,
    drWeightMatrix: DR_CASES.map(({ dice, kazanari }) => ({ dice, kazanari })),
    attackCases: ATTACK_CASES.map(({ id }) => id),
  }
}

let currentIterations = DEFAULT_ITERATIONS
let currentWarmupIterations = DEFAULT_WARMUP_ITERATIONS

export async function runBenchmark(options = {}) {
  const normalizedOptions = validateRunOptions(options)
  currentIterations = normalizedOptions.iterations
  currentWarmupIterations = normalizedOptions.warmupIterations
  resultSink = 0

  const dependencies = await loadDependencies()
  try {
    const runtimeDx = createRuntimeDxProvider(
      dependencies.calculateDxDistribution
    )
    const cases = []
    for (const testCase of BENCHMARK_CASES) {
      cases.push(
        testCase.kind === 'runtime-dr'
          ? await runDrCase(testCase, dependencies)
          : await runAttackCase(testCase, dependencies, runtimeDx)
      )
    }
    return {
      metadata: createMetadata(normalizedOptions),
      cases,
      resultDigest: round(resultSink),
    }
  } finally {
    await dependencies.server.close()
  }
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return '-'
  }
  if (Array.isArray(value)) {
    return `[${value.join(',')}]`
  }
  return String(value)
}

function formatTiming(timing) {
  if (timing === null) {
    return '-'
  }
  return `cold=${timing.coldMs.toFixed(3)}ms,warm-median=${timing.warm.medianMs.toFixed(3)}ms,warm-p95=${timing.warm.p95Ms.toFixed(3)}ms`
}

export function formatHumanReport(report) {
  const lines = [
    'Full-tail Attack resource benchmark',
    `Node ${report.metadata.node.version}, ${report.metadata.machine.platform}/${report.metadata.machine.arch}, resultDigest=${formatValue(report.resultDigest)}`,
    'elapsed: production-planner/planner/execution; columns are cold and warm median/p95 milliseconds',
  ]
  for (const testCase of report.cases) {
    const error = testCase.error === null || testCase.error === undefined
      ? '-'
      : String(testCase.error).replace(/\s+/g, ' ')
    const benchmarkAccepted = testCase.benchmarkAccepted
      ?? testCase.accepted
    const benchmarkStatus = testCase.benchmarkStatus ?? testCase.status
    lines.push(
      `[${testCase.id}] kind=${testCase.kind} status=${testCase.status} `
      + `accepted=${formatValue(testCase.accepted)} `
      + `production=${formatValue(testCase.productionAccepted)}/${formatValue(testCase.productionStatus)} `
      + `productionReject=${formatValue(testCase.productionRejectionReasons)} `
      + `benchmark=${formatValue(benchmarkAccepted)}/${formatValue(benchmarkStatus)} `
      + `scoreCutoff=${formatValue(testCase.scoreCutoff)} `
      + `maxDamageDice=${formatValue(testCase.maxDamageDice)} `
      + `rawSupportMax=${formatValue(testCase.rawSupportMax)} `
      + `workingLength=${formatValue(testCase.workingLength)} `
      + `fftLength=${formatValue(testCase.fftLength)} `
      + `distributionLength=${formatValue(testCase.distributionLength)} `
      + `kazanari=${formatValue(testCase.kazanari)} `
      + `elapsed=production-planner(${formatTiming(testCase.elapsed?.productionPlanner ?? null)})/planner(${formatTiming(testCase.elapsed?.planner ?? null)})/execution(${formatTiming(testCase.elapsed?.execution ?? null)}) `
      + `productionEstimatedTimeMs=${formatValue(testCase.productionEstimatedTimeMs)} `
      + `productionEstimatedMemoryBytes=${formatValue(testCase.productionEstimatedMemoryBytes)} `
      + `estimatedTimeMs=${formatValue(testCase.estimatedTimeMs)} `
      + `estimatedMemoryBytes=${formatValue(testCase.estimatedMemoryBytes)} `
      + `error=${error} digest=${formatValue(testCase.resultDigest)}`
    )
  }
  return lines.join('\n')
}

export const HELP_TEXT = `Usage: npm run benchmark:full-tail-attack -- [options]

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
      console.log(
        args.json
          ? JSON.stringify(report, null, 2)
          : formatHumanReport(report)
      )
    }
  } catch (error) {
    console.error(formatError(error))
    process.exitCode = 1
  }
}
