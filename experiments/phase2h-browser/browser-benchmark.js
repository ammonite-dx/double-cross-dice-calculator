import {
  calculateCanonicalDamageOnDemand,
  createDamageRollRequest,
  getCanonicalDamageSummary,
} from '../../src/calculation/DamageCalculator.js'
import {
  compareLegacyAndCanonicalDistributions,
  compareLegacyAndCanonicalTotalDamage,
} from '../../src/calculation/LegacyCanonicalComparison.js'
import { getCanonicalTotalDamageSummary } from '../../src/calculation/DistributionResult.js'
import { generateMixedDamageDistribution } from '../../src/calculation/RuntimeDamageRollCalculator.js'
import { getScoreSummary } from '../../src/calculation/ScoreCalculator.js'
import { planCalculationRanges } from '../../src/calculation/RangePlanner.js'
import { sumCanonicalDamage } from '../../src/calculation/CanonicalDamageAggregation.js'
import {
  getD10Distribution,
  registerD10Asset,
} from '../../src/data/D10PrecomputedDataRepository.js'
import {
  registerDrAsset,
  registerDxAsset,
} from '../../src/data/ReferencePrecomputedDataRepository.js'
import {
  getDamage,
  getTotalDamage,
} from '../../src/data/DamageCalculator.js'
import { getScore } from '../../src/data/ScoreCalculator.js'
import {
  createAttackCanonicalPresentation,
} from '../../src/application/AttackCanonicalPresentation.js'

const BENCHMARK_REPORT_SCHEMA_VERSION = 1
const DEFAULT_ITERATIONS = 3
const DEFAULT_WARMUP_ITERATIONS = 1
// Browser measurements are intentionally bounded more tightly than the Node
// benchmark. A query string must not be able to turn a page visit into an
// unbounded CPU, timer, or asset-fetch loop.
const MAX_ITERATIONS = 100
const MAX_WARMUP_ITERATIONS = 100
const DATA_PATH_PREFIX = '/data/schema-v2/revision-1/'

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

// Keep these seven ids and inputs aligned with scripts/benchmark-phase2h.mjs.
// This file stays browser-safe instead of importing that Node/Vite module.
const BENCHMARK_CASES = Object.freeze([
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

const statusElement = document.querySelector('#status')
const resultElement = document.querySelector('#result')
const pageErrors = []
const longTaskEntries = []
let longTaskObserver = null

window.addEventListener('error', (event) => {
  pageErrors.push({
    type: 'pageerror',
    message: event.message,
    source: event.filename || null,
    line: event.lineno || null,
    column: event.colno || null,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  pageErrors.push({
    type: 'unhandledrejection',
    message: String(event.reason?.stack ?? event.reason),
  })
})

const supportedEntryTypes = typeof PerformanceObserver === 'undefined'
  ? []
  : PerformanceObserver.supportedEntryTypes ?? []
let longTaskSupported = supportedEntryTypes.includes('longtask')

if (longTaskSupported) {
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskEntries.push({
          startTimeMs: round(entry.startTime),
          durationMs: round(entry.duration),
        })
      }
    })
    longTaskObserver.observe({ entryTypes: ['longtask'] })
  } catch {
    longTaskSupported = false
    longTaskObserver = null
  }
}

function setStatus(message) {
  statusElement.textContent = message
}

function round(value) {
  return Number(value.toFixed(6))
}

function percentile(sortedValues, probability) {
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil(probability * sortedValues.length) - 1
  )
  return sortedValues[index]
}

function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new RangeError('samples must contain at least one measurement')
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

function formatError(error) {
  return String(error?.stack ?? error)
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
  if (name === 'asset-fetch-json-register') {
    return {
      assetCount: result.length,
      paths: result,
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

function longTasksSnapshot() {
  if (!longTaskSupported) {
    return null
  }
  return longTaskEntries.slice()
}

function longTasksSince(snapshot) {
  if (!longTaskSupported) {
    return null
  }
  const startIndex = snapshot?.length ?? 0
  return longTaskEntries.slice(startIndex)
}

function summarizeLongTasks(coldEntries, warmEntries) {
  if (!longTaskSupported) {
    return {
      supported: false,
      cold: null,
      warm: null,
      count: null,
    }
  }

  const allEntries = [...coldEntries, ...warmEntries]
  return {
    supported: true,
    cold: {
      count: coldEntries.length,
      entries: coldEntries,
    },
    warm: {
      count: warmEntries.length,
      entries: warmEntries,
    },
    count: allEntries.length,
  }
}

function yieldToEventLoop() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function timedInvocation(operation) {
  const started = performance.now()
  const timerScheduled = performance.now()
  let timerFired = null
  const timerPromise = new Promise((resolve) => {
    setTimeout(() => {
      timerFired = performance.now()
      resolve()
    }, 0)
  })

  const result = await operation()
  const ended = performance.now()
  await timerPromise

  return {
    result,
    invocationElapsedMs: ended - started,
    queuedZeroDelayTimerDelayMs: timerFired - timerScheduled,
  }
}

function timingReport(invocations, timerDelays) {
  return {
    invocationElapsedMs: summarizeSamples(invocations),
    queuedZeroDelayTimerDelayMs: summarizeSamples(timerDelays),
  }
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
  const coldLongTaskSnapshot = longTasksSnapshot()
  const cold = await timedInvocation(operation)
  const coldDigest = consumeResult(cold.result)
  await Promise.resolve()
  const coldLongTasks = longTasksSince(coldLongTaskSnapshot) ?? []

  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    const warmupResult = await operation()
    consumeResult(warmupResult)
  }
  // Let the observer deliver any entries from the untimed warmup before the
  // warm sample window starts. Warmup is deliberately excluded from timing
  // and Long Task counts in the reported warm block.
  await yieldToEventLoop()
  const warmLongTaskSnapshot = longTasksSnapshot()

  const warmInvocations = []
  const warmTimerDelays = []
  let lastResult = cold.result
  let lastDigest = coldDigest
  const warmLongTasks = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampleLongTaskSnapshot = longTasksSnapshot()
    const sample = await timedInvocation(operation)
    warmInvocations.push(sample.invocationElapsedMs)
    warmTimerDelays.push(sample.queuedZeroDelayTimerDelayMs)
    lastResult = sample.result
    lastDigest = consumeResult(sample.result)
    const sampleLongTasks = longTasksSince(sampleLongTaskSnapshot)
    if (sampleLongTasks !== null) {
      warmLongTasks.push(...sampleLongTasks)
    }
  }

  const warmLongTaskEntries = longTasksSince(warmLongTaskSnapshot)
    ?? warmLongTasks
  return {
    report: {
      name,
      scope,
      status: 'measured',
      constraint,
      cold: timingReport(
        [cold.invocationElapsedMs],
        [cold.queuedZeroDelayTimerDelayMs]
      ),
      warm: timingReport(warmInvocations, warmTimerDelays),
      longTasks: summarizeLongTasks(coldLongTasks, warmLongTaskEntries),
      numericDigest: {
        cold: coldDigest,
        warm: lastDigest,
      },
      result: summarizeResult(lastResult),
    },
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
        cold: null,
        warm: null,
        longTasks: longTaskSupported
          ? { supported: true, cold: null, warm: null, count: null }
          : { supported: false, cold: null, warm: null, count: null },
        numericDigest: null,
        result: null,
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
    cold: null,
    warm: null,
    longTasks: longTaskSupported
      ? { supported: true, cold: null, warm: null, count: null }
      : { supported: false, cold: null, warm: null, count: null },
    numericDigest: null,
    result: null,
  }
}

function createErrorStage(name, scope, constraint, error) {
  return {
    name,
    scope,
    status: 'error',
    constraint,
    error: formatError(error),
    cold: null,
    warm: null,
    longTasks: longTaskSupported
      ? { supported: true, cold: null, warm: null, count: null }
      : { supported: false, cold: null, warm: null, count: null },
    numericDigest: null,
    result: null,
  }
}

function parseIntegerOverride(searchParams, name, maximum, allowZero) {
  const rawValue = searchParams.get(name)
  if (rawValue === null) {
    return null
  }
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a non-negative integer`)
  }
  const value = Number(rawValue)
  if (
    !Number.isSafeInteger(value)
    || (!allowZero && value === 0)
    || value > maximum
  ) {
    const positivity = allowZero ? 'non-negative' : 'positive'
    throw new Error(`${name} must be ${positivity} and must not exceed ${maximum}`)
  }
  return value
}

function parseOptions() {
  const searchParams = new URLSearchParams(window.location.search)
  return {
    iterations: parseIntegerOverride(
      searchParams,
      'iterations',
      MAX_ITERATIONS,
      false
    ),
    warmupIterations: parseIntegerOverride(
      searchParams,
      'warmup',
      MAX_WARMUP_ITERATIONS,
      true
    ),
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

function plannerInputForReport(entry) {
  return {
    id: entry.id,
    params: entry.params,
  }
}

function errorMessageForPlan(plans) {
  const reasons = plans.flatMap((plan) => plan.rejectionReasons ?? [])
  return reasons.length > 0
    ? `range plan rejected: ${Array.from(new Set(reasons)).join(', ')}`
    : 'range plan rejected before calculation'
}

function getAssetPaths() {
  const shihai = new Set()
  const kazanari = new Set()
  for (const testCase of BENCHMARK_CASES) {
    for (const entry of testCase.entries) {
      shihai.add(entry.params.action.score.shihai)
      shihai.add(entry.params.reaction.score.shihai)
      kazanari.add(entry.params.action.damage.kazanari)
    }
  }

  return [
    ...Array.from(shihai, (value) => `dx/shihai-${value}.json`),
    ...Array.from(kazanari, (value) => `dr/kazanari-${value}.json`),
    'd10.json',
  ].sort()
}

let assetFetchCallCount = 0

function assetUrl(relativePath) {
  return new URL(`${DATA_PATH_PREFIX}${relativePath}`, window.location.origin)
}

async function fetchAndRegisterAsset(relativePath) {
  assetFetchCallCount += 1
  const response = await fetch(assetUrl(relativePath))
  if (!response.ok) {
    throw new Error(
      `Failed to load benchmark asset ${relativePath}: HTTP ${response.status}`
    )
  }
  const asset = await response.json()
  if (relativePath.startsWith('dx/')) {
    registerDxAsset(asset)
  } else if (relativePath.startsWith('dr/')) {
    registerDrAsset(asset)
  } else if (relativePath === 'd10.json') {
    registerD10Asset(asset)
  } else {
    throw new Error(`Unknown benchmark asset path: ${relativePath}`)
  }
  return relativePath
}

async function loadAndRegisterAssets(assetPaths) {
  return Promise.all(assetPaths.map(fetchAndRegisterAsset))
}

function createFixture(testCase, plans) {
  const entries = testCase.entries
  const scores = entries.map((entry) => ({
    action: getScore(entry.params.action.score),
    reaction: getScore(entry.params.reaction.score),
  }))
  const diagnostics = entries.map((entry, index) => {
    const request = createDamageRollRequest(
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
    getDamageRollDistribution: generateMixedDamageDistribution,
    getD10Distribution,
  }

  return {
    entries,
    plans,
    scores,
    diagnostics,
    canonicalDependencies,
    runLegacyDamages() {
      return entries.map((entry, index) => getDamage(
        scores[index],
        entry.params.action.damage,
        entry.params.reaction.damage
      ))
    },
    async runCanonicalDamages() {
      const damages = []
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]
        damages.push(await calculateCanonicalDamageOnDemand(
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

function createBatchState(fixture, canonicalDamages, canonicalTotalDamage) {
  const combos = fixture.entries.map((entry, index) => ({
    id: entry.id,
    score: fixture.scores[index],
    scoreSummary: getScoreSummary(fixture.scores[index]),
    canonicalDamage: canonicalDamages[index],
    canonicalDamageSummary: getCanonicalDamageSummary(
      canonicalDamages[index]
    ),
  }))
  return {
    combos,
    canonicalTotalDamage,
    canonicalTotalDamageSummary:
      getCanonicalTotalDamageSummary(canonicalTotalDamage),
  }
}

function baseCaseReport(testCase, measurement, input, stages, extra = {}) {
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
    stages,
    ...extra,
  }
}

const CALCULATION_STAGE_DEFINITIONS = Object.freeze([
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
])

function appendSkippedCalculationStages(stages, reason, names = null) {
  const selected = names === null
    ? CALCULATION_STAGE_DEFINITIONS
    : CALCULATION_STAGE_DEFINITIONS.filter(([name]) => names.includes(name))
  for (const [name, scope, constraint] of selected) {
    stages.push(skippedStage(name, scope, constraint, reason))
  }
}

async function runCase(testCase, options) {
  const measurement = resolveMeasurementOptions(testCase, options)
  const input = testCase.entries.map(plannerInputForReport)
  const stages = []

  const plannerMeasurement = await measureStageSafely({
    name: 'range-planner',
    scope: 'preflight',
    constraint: 'planCalculationRanges only; no asset load, calculator, Worker, or UI work',
    operation: () => testCase.entries.map((entry) =>
      planCalculationRanges(entry.planner, testCase.plannerPolicy)
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
        ? testCase.executionReason
          ?? 'execution intentionally limited to planner-only'
        : errorMessageForPlan(plans)
    appendSkippedCalculationStages(stages, reason)
    return baseCaseReport(testCase, measurement, input, stages, {
      status: plannerMeasurement.error !== null
        ? 'error'
        : plannerRejected
          ? 'planner-rejected'
          : 'planner-only',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: null,
      comparison: {
        status: 'not-comparable',
        reason,
      },
    })
  }

  let fixture
  try {
    fixture = createFixture(testCase, plans)
  } catch (error) {
    stages.push(createErrorStage(
      'fixture-preparation',
      'fixture-preparation',
      'score and damage request setup; outside timed calculation stages',
      error
    ))
    appendSkippedCalculationStages(
      stages,
      'dependent stages skipped because fixture preparation failed'
    )
    return baseCaseReport(testCase, measurement, input, stages, {
      status: 'error',
      reason: formatError(error),
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: null,
      comparison: {
        status: 'not-comparable',
        reason: 'fixture preparation failed',
      },
    })
  }

  const legacyMeasurement = await measureStageSafely({
    name: 'legacy-damage',
    scope: 'legacy-damage',
    constraint: CALCULATION_STAGE_DEFINITIONS[0][2],
    operation: fixture.runLegacyDamages,
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) => summarizeStageResult('legacy-damage', result),
  })
  stages.push(legacyMeasurement.report)
  if (legacyMeasurement.error !== null) {
    const reason = 'dependent stages skipped because legacy damage failed'
    appendSkippedCalculationStages(
      stages,
      reason,
      ['legacy-total', 'canonical-damage', 'canonical-total-aggregation',
        'canonical-presentation', 'legacy-canonical-comparison']
    )
    return baseCaseReport(testCase, measurement, input, stages, {
      status: 'error',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: fixture.diagnostics,
      comparison: { status: 'not-comparable', reason },
    })
  }

  const legacyDamages = legacyMeasurement.lastResult
  const legacyTotalCombos = legacyDamages.map((damage) => ({
    data: { damage },
  }))
  const legacyTotalMeasurement = await measureStageSafely({
    name: 'legacy-total',
    scope: 'legacy-total',
    constraint: CALCULATION_STAGE_DEFINITIONS[1][2],
    operation: () => getTotalDamage(legacyTotalCombos),
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) => summarizeStageResult('legacy-total', result),
  })
  stages.push(legacyTotalMeasurement.report)
  if (legacyTotalMeasurement.error !== null) {
    const reason = 'dependent stages skipped because legacy total aggregation failed'
    appendSkippedCalculationStages(
      stages,
      reason,
      ['canonical-damage', 'canonical-total-aggregation',
        'canonical-presentation', 'legacy-canonical-comparison']
    )
    return baseCaseReport(testCase, measurement, input, stages, {
      status: 'error',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: fixture.diagnostics,
      comparison: { status: 'not-comparable', reason },
    })
  }

  const canonicalMeasurement = await measureStageSafely({
    name: 'canonical-damage',
    scope: 'canonical-damage',
    constraint: CALCULATION_STAGE_DEFINITIONS[2][2],
    operation: fixture.runCanonicalDamages,
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) => summarizeStageResult('canonical-damage', result),
  })
  stages.push(canonicalMeasurement.report)
  if (canonicalMeasurement.error !== null) {
    const reason = 'dependent stages skipped because canonical damage failed'
    appendSkippedCalculationStages(
      stages,
      reason,
      ['canonical-total-aggregation', 'canonical-presentation',
        'legacy-canonical-comparison']
    )
    return baseCaseReport(testCase, measurement, input, stages, {
      status: 'error',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: fixture.diagnostics,
      comparison: { status: 'not-comparable', reason },
    })
  }

  const canonicalDamages = canonicalMeasurement.lastResult
  const canonicalTotalMeasurement = await measureStageSafely({
    name: 'canonical-total-aggregation',
    scope: 'canonical-total',
    constraint: CALCULATION_STAGE_DEFINITIONS[3][2],
    operation: () => sumCanonicalDamage(canonicalDamages),
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) =>
      summarizeStageResult('canonical-total-aggregation', result),
  })
  stages.push(canonicalTotalMeasurement.report)
  if (canonicalTotalMeasurement.error !== null) {
    const reason = 'dependent stages skipped because canonical total aggregation failed'
    appendSkippedCalculationStages(
      stages,
      reason,
      ['canonical-presentation', 'legacy-canonical-comparison']
    )
    return baseCaseReport(testCase, measurement, input, stages, {
      status: 'error',
      reason,
      plan: plans.map(summarizePlan),
      fixtureDiagnostics: fixture.diagnostics,
      comparison: { status: 'not-comparable', reason },
    })
  }

  const legacyTotalDamage = legacyTotalMeasurement.lastResult
  const canonicalTotalDamage = canonicalTotalMeasurement.lastResult
  const batch = createBatchState(
    fixture,
    canonicalDamages,
    canonicalTotalDamage
  )
  const presentationMeasurement = await measureStageSafely({
    name: 'canonical-presentation',
    scope: 'canonical-presentation',
    constraint: CALCULATION_STAGE_DEFINITIONS[4][2],
    operation: () => createAttackCanonicalPresentation(batch, plans),
    iterations: measurement.iterations,
    warmupIterations: measurement.warmupIterations,
    summarizeResult: (result) =>
      summarizeStageResult('canonical-presentation', result),
  })
  stages.push(presentationMeasurement.report)

  const comparisonMeasurement = await measureStageSafely({
    name: 'legacy-canonical-comparison',
    scope: 'legacy-canonical-comparison',
    constraint: CALCULATION_STAGE_DEFINITIONS[5][2],
    operation: () => ({
      damage: fixture.entries.map((entry, index) =>
        compareLegacyAndCanonicalDistributions(
          legacyDamages[index].distribution,
          canonicalDamages[index]
        )
      ),
      total: compareLegacyAndCanonicalTotalDamage(
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
  const comparisonSummary = comparisonMeasurement.report.result
  const comparisonsComparable = comparisonSummary === null
    ? false
    : comparisonSummary.damage.every(
      (comparison) => comparison.kind === 'comparable'
    ) && comparisonSummary.total.kind === 'comparable'
  return baseCaseReport(testCase, measurement, input, stages, {
    status: errorStage ? 'error' : 'measured',
    reason: errorStage?.error ?? null,
    plan: plans.map(summarizePlan),
    fixtureDiagnostics: fixture.diagnostics,
    comparison: errorStage
      ? {
          status: 'not-comparable',
          reason: 'one or more calculation stages failed',
        }
      : {
          status: comparisonsComparable ? 'comparable' : 'not-comparable',
          damage: comparisonSummary.damage,
          total: comparisonSummary.total,
        },
  })
}

function datasetForAssetPath(pathname) {
  if (pathname.includes('/dx/')) {
    return 'dx'
  }
  if (pathname.includes('/dr/')) {
    return 'dr'
  }
  if (pathname.endsWith('/d10.json')) {
    return 'd10'
  }
  return null
}

function isBenchmarkAssetPath(pathname) {
  return pathname.includes(DATA_PATH_PREFIX)
    && datasetForAssetPath(pathname) !== null
}

function getAssetResourceDiagnostics() {
  const resources = performance.getEntriesByType('resource')
  const entries = []
  const dataPathCounts = { dr: 0, dx: 0, d10: 0 }
  for (const resource of resources) {
    let pathname
    try {
      pathname = new URL(resource.name, window.location.href).pathname
    } catch {
      continue
    }
    if (!isBenchmarkAssetPath(pathname)) {
      continue
    }
    const dataset = datasetForAssetPath(pathname)
    dataPathCounts[dataset] += 1
    entries.push({
      path: pathname.startsWith('/') ? pathname.slice(1) : pathname,
      dataset,
      initiatorType: resource.initiatorType || null,
      startTimeMs: round(resource.startTime),
      durationMs: round(resource.duration),
      transferSize: Number.isFinite(resource.transferSize)
        ? resource.transferSize
        : null,
      encodedBodySize: Number.isFinite(resource.encodedBodySize)
        ? resource.encodedBodySize
        : null,
      decodedBodySize: Number.isFinite(resource.decodedBodySize)
        ? resource.decodedBodySize
        : null,
    })
  }

  return {
    resourceEntries: entries,
    resourceFetchCount: entries.length,
    dataPathCounts,
    fetchCallCount: assetFetchCallCount,
  }
}

function createBrowserMetadata(options, assetPaths) {
  return {
    benchmark: 'phase2h-browser',
    defaultIterations: DEFAULT_ITERATIONS,
    defaultWarmupIterations: DEFAULT_WARMUP_ITERATIONS,
    requestedIterations: options.iterations,
    requestedWarmupIterations: options.warmupIterations,
    maximumIterations: MAX_ITERATIONS,
    maximumWarmupIterations: MAX_WARMUP_ITERATIONS,
    assetPaths,
    clock: 'performance.now',
    cold: 'the first timed invocation after module, fixture, and asset setup; page load and import evaluation are excluded',
    warmup: 'untimed invocations after cold and before warm samples; warmup results are consumed but are not reported as samples',
    warm: 'timed main-thread invocations after warmup; statistics are nearest-rank median and p95 plus min/max',
    timerDelay: 'queued zero-delay timer delay from scheduling to callback; it is an event-loop scheduling observation, not CPU time',
    assetSetup: 'asset fetch, JSON parse, and repository registration are measured in one separate shared stage before case calculation warmups',
    worker: 'not-connected: the current production canonical attack state is not connected to RuntimeDamageRollWorker, so this page does not create or simulate a Worker path',
    calculationScope: 'existing public planner, legacy data APIs, canonical on-demand APIs, canonical total aggregation, presentation, and comparison only',
  }
}

function createReport(options, assetPaths, assetMeasurement, cases) {
  const caseCounts = {
    total: cases.length,
    measured: cases.filter((entry) => entry.status === 'measured').length,
    plannerOnly: cases.filter((entry) => entry.status === 'planner-only').length,
    plannerRejected: cases.filter(
      (entry) => entry.status === 'planner-rejected'
    ).length,
    error: cases.filter((entry) => entry.status === 'error').length,
  }
  const assetDiagnostics = getAssetResourceDiagnostics()
  const diagnostics = {
    pageErrors: pageErrors.filter((entry) => entry.type === 'pageerror'),
    unhandledRejections: pageErrors.filter(
      (entry) => entry.type === 'unhandledrejection'
    ),
    longTasks: {
      supported: longTaskSupported,
      entries: longTaskSupported ? longTaskEntries.slice() : null,
      count: longTaskSupported ? longTaskEntries.length : null,
    },
  }

  return {
    schemaVersion: BENCHMARK_REPORT_SCHEMA_VERSION,
    status: caseCounts.error === 0 ? 'measured' : 'error',
    generatedAt: new Date().toISOString(),
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language || null,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemory: navigator.deviceMemory ?? null,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    metadata: createBrowserMetadata(options, assetPaths),
    caseCounts,
    iterations: {
      requested: options.iterations,
      warmupRequested: options.warmupIterations,
    },
    assetSetup: assetMeasurement.report,
    assets: assetDiagnostics,
    worker: {
      status: 'not-connected',
      reason: 'canonical attack state currently has no RuntimeDamageRollWorker connection',
    },
    pageErrors: diagnostics.pageErrors,
    unhandledRejections: diagnostics.unhandledRejections,
    diagnostics,
    cases,
    resultSink: round(resultSink),
  }
}

function publishResult(report) {
  window.__phase2hBrowserBenchmarkResult = report
  delete window.__phase2hBrowserBenchmarkError
  resultElement.textContent = JSON.stringify(report, null, 2)
  setStatus('ベンチマーク完了。window.__phase2hBrowserBenchmarkResult を確認できます。')
}

function publishError(error) {
  const message = formatError(error)
  window.__phase2hBrowserBenchmarkError = message
  delete window.__phase2hBrowserBenchmarkResult
  resultElement.textContent = JSON.stringify({
    schemaVersion: BENCHMARK_REPORT_SCHEMA_VERSION,
    status: 'error',
    error: message,
    pageErrors,
  }, null, 2)
  setStatus('ベンチマークに失敗しました。')
}

async function runBenchmark() {
  const options = parseOptions()
  resultSink = 0
  const assetPaths = getAssetPaths()
  setStatus('アセットのcold fetch/JSON parse/registerを測定しています...')
  const assetMeasurement = await measureStageSafely({
    name: 'asset-fetch-json-register',
    scope: 'asset-setup',
    constraint: 'fetch + response.json + public repository registration only; case calculation stages are outside this interval',
    operation: () => loadAndRegisterAssets(assetPaths),
    iterations: options.iterations ?? DEFAULT_ITERATIONS,
    warmupIterations: options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS,
    summarizeResult: (result) =>
      summarizeStageResult('asset-fetch-json-register', result),
  })
  if (assetMeasurement.error !== null) {
    throw assetMeasurement.error
  }

  const cases = []
  for (const testCase of BENCHMARK_CASES) {
    setStatus(`case ${cases.length + 1}/${BENCHMARK_CASES.length}: ${testCase.id}`)
    cases.push(await runCase(testCase, options))
  }

  if (longTaskObserver !== null) {
    longTaskObserver.disconnect()
    longTaskObserver = null
    await Promise.resolve()
  }
  publishResult(createReport(options, assetPaths, assetMeasurement, cases))
}

runBenchmark().catch(publishError)
