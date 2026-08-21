import { getFinalEncroachment } from '../data/BacktrackCalculator'
import {
  calculateCanonicalDamageOnDemand,
  getCanonicalDamageSummary,
  calculateDamageOnDemand,
} from '../calculation/DamageCalculator'
import {
  createDistributionResult,
  getCanonicalTotalDamageSummary,
  toPublishedBucketDistribution,
} from '../calculation/DistributionResult'
import {
  planCanonicalDamageAggregation,
  sumCanonicalDamage,
  validateCanonicalDamageAggregationOptions,
} from '../calculation/CanonicalDamageAggregation'
import {
  calculateDxDistribution,
  normalizeDxOptions,
} from '../calculation/DxCalculator'
import {
  getDamageSummary,
  getTotalDamage,
} from '../data/DamageCalculator'
import { getUpperTailProbability } from '../data/Distribution'
import {
  getD10Distribution,
  loadD10Asset,
  loadLivingdeadAsset,
} from '../data/PrecomputedDataRepository'
import {
  calculateScore,
  calculateScoreCanonical,
  getCanonicalScoreSummary,
  getScoreSummary,
} from '../data/ScoreCalculator'
import { planCalculationRanges } from '../calculation/RangePlanner'
import {
  CALCULATION_BATCH_INPUT_ERROR_CODES,
  CalculationBatchInputError,
  createCanonicalTotalDamageAggregationOptions,
  isCalculationBatchInputError,
  snapshotCanonicalAttackBatchRequest,
} from './CanonicalAttackBatchInput'
import { createCheckRangePolicy } from './CheckDisplayRequestSnapshot'
import { createRuntimeDamageRollClient } from './RuntimeDamageRollClient'
import { createResourceGuard } from './ResourceGuard'

const RUNTIME_DX_CACHE_SIZE = 32
const runtimeDamageRollClient = createRuntimeDamageRollClient()
const defaultResourceGuard = createResourceGuard()
const TOTAL_DAMAGE_OUTPUT_LENGTH = 1024
const TOTAL_DAMAGE_FFT_LENGTH = 2048
const TOTAL_DAMAGE_FFT_BUFFER_COUNT = 4
const TOTAL_DAMAGE_CONVOLVED_BUFFER_LENGTH = TOTAL_DAMAGE_FFT_LENGTH
const TOTAL_DAMAGE_OUTPUT_BUFFER_COUNT = 2

function createAbortError(operation = 'Calculation') {
  const error = new Error(`${operation} calculation was aborted`)
  error.name = 'AbortError'
  return error
}

function throwIfAborted(options, operation = 'Calculation') {
  if (options?.signal?.aborted) {
    throw createAbortError(operation)
  }
}

const defaultDependencies = {
  calculateCanonicalDamageOnDemand,
  calculateDamageOnDemand,
  calculateDxDistribution,
  calculateScore,
  calculateScoreCanonical,
  getCanonicalScoreSummary,
  getCanonicalDamageSummary,
  getCanonicalTotalDamageSummary,
  getDamageSummary,
  getDamageRollDistribution: runtimeDamageRollClient.calculate,
  getFinalEncroachment,
  getD10Distribution,
  getScoreSummary,
  getTotalDamage,
  loadD10Asset,
  loadLivingdeadAsset,
  planCanonicalDamageAggregation,
  planCalculationRanges,
  resourceGuard: defaultResourceGuard,
  sumCanonicalDamage,
  validateCanonicalDamageAggregationOptions,
}

const EVASION_MODE = '《イベイジョン》'

export const CALCULATION_CLIENT_KEY = Symbol('calculationClient')

export class CalculationRangeError extends Error {
  constructor(plan) {
    const rejectionReasons = plan?.rejectionReasons ?? []
    super(
      rejectionReasons.length > 0
        ? `Calculation range rejected: ${rejectionReasons.join(', ')}`
        : 'Calculation range rejected'
    )
    this.name = 'CalculationRangeError'
    this.plan = plan
    this.rejectionReasons = rejectionReasons
  }
}

export {
  CALCULATION_BATCH_INPUT_ERROR_CODES,
  CalculationBatchInputError,
  isCalculationBatchInputError,
}

function snapshotScoreParams(params) {
  return {
    dice: params.dice,
    critical: params.critical,
    skill: params.skill,
    yousei: params.yousei,
    shihai: params.shihai,
  }
}

function snapshotAttackParams(params) {
  return {
    action: {
      score: snapshotScoreParams(params.action.score),
      damage: { ...params.action.damage },
    },
    reaction: {
      mode: params.reaction.mode,
      score: snapshotScoreParams(params.reaction.score),
      damage: { ...params.reaction.damage },
    },
  }
}

function snapshotBacktrackParams(params) {
  return { ...params }
}

function fixedReactionScoreForPlanning(request) {
  if (request.mode !== EVASION_MODE) {
    return request.score
  }
  return {
    ...request.score,
    dice: 0,
    critical: 11,
    shihai: 0,
    yousei: 0,
  }
}

function createCheckRangeParams(request, displayRequest) {
  const params = {
    operation: 'check',
    score: {
      action: request.action,
      reaction: request.reaction,
    },
  }
  if (displayRequest !== undefined) {
    params.display = {
      min: displayRequest.min,
      max: displayRequest.max,
    }
  }
  return params
}

function getCheckRangePolicy(options) {
  return options.displayRequest === undefined
    ? options.rangePolicy
    : createCheckRangePolicy(options.displayRequest, options.rangePolicy)
}

function createAttackRangeParams(request) {
  return {
    operation: 'attack',
    score: {
      action: request.action.score,
      reaction: fixedReactionScoreForPlanning(request.reaction),
    },
    attack: { ...request.action.damage },
    defence: { ...request.reaction.damage },
  }
}

function createBacktrackRangeParams(request) {
  return {
    operation: 'backtrack',
    backtrack: { ...request },
  }
}

function getRuntimeOptions(options) {
  if (
    !('rangePolicy' in options) &&
    !('onRangePlan' in options)
  ) {
    return options
  }

  const runtimeOptions = { ...options }
  delete runtimeOptions.rangePolicy
  delete runtimeOptions.onRangePlan
  return runtimeOptions
}

function acquirePlanLease(resourceGuard, plan, options, operation) {
  return resourceGuard.acquirePlan(plan, {
    signal: options.signal,
    requestId: options.requestId,
    operation,
  })
}

function acquireResourceLease(resourceGuard, request) {
  const acquire = resourceGuard.acquireLease ?? resourceGuard.acquire
  return acquire.call(resourceGuard, request)
}

function isPromiseLike(value) {
  return value !== null
    && value !== undefined
    && typeof value.then === 'function'
}

function createPublishedScoreFromCanonicalEnvelope(envelope) {
  const distribution = toPublishedBucketDistribution(envelope.result)
  return {
    distribution,
    upperTailProbability: getUpperTailProbability(distribution),
    failureProbability: envelope.metadata.failureProbability,
  }
}

function multiplySafeInteger(left, right) {
  const product = left * right
  return Number.isSafeInteger(product)
    ? product
    : Number.MAX_SAFE_INTEGER
}

function createTotalDamageResourceRequest(combos, options) {
  const comboCount = Array.isArray(combos) ? combos.length : 0
  const operationCount = Math.max(1, comboCount)
  // sumDistribution() uses two complex FFT buffers (four Float64Array
  // buffers), a convolution result, and the previous/new aggregate arrays.
  // The convolution result is bounded by the 2048-point FFT length because
  // two 1024-element distributions produce 2047 values.
  const float64WordsPerOperation =
    TOTAL_DAMAGE_FFT_BUFFER_COUNT * TOTAL_DAMAGE_FFT_LENGTH
    + TOTAL_DAMAGE_CONVOLVED_BUFFER_LENGTH
    + TOTAL_DAMAGE_OUTPUT_BUFFER_COUNT * TOTAL_DAMAGE_OUTPUT_LENGTH
  const bytesPerOperation = multiplySafeInteger(
    float64WordsPerOperation,
    Float64Array.BYTES_PER_ELEMENT
  )
  return {
    operation: 'attack-total-damage',
    requestId: options.requestId,
    signal: options.signal,
    float64Bytes: multiplySafeInteger(operationCount, bytesPerOperation),
    operations: multiplySafeInteger(
      operationCount,
      TOTAL_DAMAGE_FFT_LENGTH * Math.log2(TOTAL_DAMAGE_FFT_LENGTH)
    ),
    timeMs: null,
  }
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function copyCanonicalTotalDamageEnvelope(canonicalTotalDamage) {
  const result = canonicalTotalDamage?.result
  if (
    canonicalTotalDamage === null
    || typeof canonicalTotalDamage !== 'object'
    || result === null
    || typeof result !== 'object'
    || !hasOwn(result, 'values')
    || !hasOwn(result, 'offset')
    || !hasOwn(result, 'support')
    || !hasOwn(result, 'overflow')
  ) {
    return canonicalTotalDamage
  }

  try {
    return Object.freeze({
      ...canonicalTotalDamage,
      result: createDistributionResult({
        values: result.values,
        offset: result.offset,
        support: result.support,
        overflow: result.overflow,
      }),
    })
  } catch {
    // A dependency-injected test double or an invalid upstream result should
    // be reported by its summary/aggregation dependency, not hidden here.
    return canonicalTotalDamage
  }
}

/**
 * Plans a request and publishes the plan before any calculation starts.
 *
 * `onRangePlan` is a synchronous notification. Its return value is ignored;
 * asynchronous callbacks are not part of the CalculationClient contract.
 */
function runRangePreflight(
  planner,
  plannerParams,
  rangePolicy,
  onRangePlan
) {
  const plan = planner(plannerParams, rangePolicy)
  if (typeof onRangePlan === 'function') {
    onRangePlan(plan)
  }
  if (!plan.accepted) {
    throw new CalculationRangeError(plan)
  }
  return plan
}

function createRuntimeDxProvider(calculateDistribution) {
  const cache = new Map()

  return (shihai, dice, critical, options) => {
    const normalizedOptions = normalizeDxOptions(options)
    const key = [
      dice,
      critical,
      shihai,
      normalizedOptions.workingLength,
      normalizedOptions.rounding,
    ].join(':')
    if (cache.has(key)) {
      const distribution = cache.get(key)
      cache.delete(key)
      cache.set(key, distribution)
      return distribution
    }

    const distribution = options === undefined
      ? calculateDistribution({ dice, critical, shihai })
      : calculateDistribution(
          { dice, critical, shihai },
          normalizedOptions
        )
    cache.set(key, distribution)
    while (cache.size > RUNTIME_DX_CACHE_SIZE) {
      cache.delete(cache.keys().next().value)
    }
    return distribution
  }
}

export function createCalculationClient(
  dependencies = defaultDependencies
) {
  const resourceGuard = dependencies.resourceGuard ?? defaultResourceGuard
  const planner = dependencies.planCalculationRanges ?? planCalculationRanges
  const canonicalDamagePlan =
    dependencies.planCanonicalDamageAggregation
    ?? planCanonicalDamageAggregation
  const canonicalDamageSum =
    dependencies.sumCanonicalDamage
    ?? sumCanonicalDamage
  const canonicalDamageOptionsValidator =
    dependencies.validateCanonicalDamageAggregationOptions
    ?? validateCanonicalDamageAggregationOptions
  const canonicalTotalDamageSummary =
    dependencies.getCanonicalTotalDamageSummary
    ?? getCanonicalTotalDamageSummary
  const hasRuntimeScoreDependencies =
    typeof dependencies.calculateScore === 'function' &&
    typeof dependencies.calculateDxDistribution === 'function'
  const hasLegacyScoreDependency = typeof dependencies.getScore === 'function'
  const getDxDistribution = hasRuntimeScoreDependencies
    ? createRuntimeDxProvider(dependencies.calculateDxDistribution)
    : null
  const scoreCalculator = (() => {
    if (hasRuntimeScoreDependencies) {
      return (params, fix = false, scoreRangePlan) => {
        if (scoreRangePlan === undefined) {
          return dependencies.calculateScore(params, getDxDistribution, fix)
        }
        return dependencies.calculateScore(
          params,
          getDxDistribution,
          fix,
          scoreRangePlan
        )
      }
    }

    return (params, fix = false) =>
      fix
        ? dependencies.getScore(params, true)
        : dependencies.getScore(params)
  })()
  const canonicalScoreCalculator = (() => {
    if (typeof dependencies.calculateScoreCanonical === 'function') {
      if (getDxDistribution === null) {
        return (params, scoreRangePlan, fix = false) => {
          if (!fix) {
            return dependencies.calculateScoreCanonical(
              params,
              undefined,
              scoreRangePlan
            )
          }
          return dependencies.calculateScoreCanonical(
            params,
            undefined,
            scoreRangePlan,
            true
          )
        }
      }
      return (params, scoreRangePlan, fix = false) => {
        if (!fix) {
          return dependencies.calculateScoreCanonical(
            params,
            getDxDistribution,
            scoreRangePlan
          )
        }
        return dependencies.calculateScoreCanonical(
          params,
          getDxDistribution,
          scoreRangePlan,
          true
        )
      }
    }
    if (getDxDistribution !== null) {
      return (params, scoreRangePlan, fix = false) =>
        fix
          ? calculateScoreCanonical(
              params,
              getDxDistribution,
              scoreRangePlan,
              true
            )
          : calculateScoreCanonical(
              params,
              getDxDistribution,
              scoreRangePlan
            )
    }
    return null
  })()

  const canonicalScoreSummaryCalculator =
    dependencies.getCanonicalScoreSummary ?? getCanonicalScoreSummary

  if (!hasRuntimeScoreDependencies && !hasLegacyScoreDependency) {
    throw new Error(
      'CalculationClient requires calculateScore/calculateDxDistribution'
    )
  }

  async function runAttackCalculation(
    params,
    options,
    finalizeDamage,
    buildResult,
    useCanonicalScore = false
  ) {
    const request = snapshotAttackParams(params)
    const plan = runRangePreflight(
      planner,
      createAttackRangeParams(request),
      options.rangePolicy,
      options.onRangePlan
    )
    const leaseRequest = acquirePlanLease(
      resourceGuard,
      plan,
      options,
      'attack'
    )
    const lease = isPromiseLike(leaseRequest)
      ? await leaseRequest
      : leaseRequest

    try {
      throwIfAborted(options, 'Attack')
      if (request.reaction.damage.dice > 0) {
        await dependencies.loadD10Asset()
      }
      throwIfAborted(options, 'Attack')

      if (useCanonicalScore && canonicalScoreCalculator === null) {
        throw new Error(
          'CalculationClient requires calculateScoreCanonical or runtime score dependencies'
        )
      }
      const score = useCanonicalScore
        ? {
            action: canonicalScoreCalculator(
              request.action.score,
              plan.scores?.[0]
            ),
            reaction: canonicalScoreCalculator(
              request.reaction.score,
              plan.scores?.[1],
              request.reaction.mode === EVASION_MODE
            ),
          }
        : {
            action: scoreCalculator(
              request.action.score,
              false,
              plan.scores?.[0]
            ),
            reaction: scoreCalculator(
              request.reaction.score,
              request.reaction.mode === EVASION_MODE,
              plan.scores?.[1]
            ),
          }
      const scoreForDamage = useCanonicalScore
        ? {
            action: createPublishedScoreFromCanonicalEnvelope(score.action),
            reaction: createPublishedScoreFromCanonicalEnvelope(score.reaction),
          }
        : score
      const finalizedDamage = await finalizeDamage(
        scoreForDamage,
        request,
        plan,
        getRuntimeOptions(options)
      )
      throwIfAborted(options, 'Attack')

      return buildResult({
        score,
        scoreSummary: useCanonicalScore
          ? canonicalScoreSummaryCalculator(score)
          : dependencies.getScoreSummary(score),
        scoreForDamage,
        finalizedDamage,
      })
    } finally {
      lease.release()
    }
  }

  async function calculateCanonicalAttack(params, options = {}) {
    return runAttackCalculation(
      params,
      options,
      (score, request, plan, runtimeOptions) =>
        dependencies.calculateCanonicalDamageOnDemand(
          score,
          request.action.damage,
          request.reaction.damage,
          {
            getDamageRollDistribution:
              dependencies.getDamageRollDistribution,
            getD10Distribution: dependencies.getD10Distribution,
            onFftLength: dependencies.onFftLength,
          },
          runtimeOptions,
          plan
        ),
      ({ score, scoreSummary, finalizedDamage }) => ({
        score,
        scoreSummary,
        canonicalScore: score,
        canonicalScoreBatchSummary: scoreSummary,
        canonicalDamage: finalizedDamage,
        canonicalDamageSummary:
          dependencies.getCanonicalDamageSummary(finalizedDamage),
      }),
      true
    )
  }

  async function runCanonicalTotalDamage(
    canonicalDamages,
    options = {},
    aggregationOptionsOverride = null
  ) {
    // Snapshot the caller's array before planning or waiting for a resource
    // lease. The aggregation plan is then tied to this private snapshot.
    const canonicalDamageSnapshot = Array.isArray(canonicalDamages)
      ? canonicalDamages.map(copyCanonicalTotalDamageEnvelope)
      : canonicalDamages
    const calculationOptions = options ?? {}
    const aggregationOptions = aggregationOptionsOverride
      ?? createCanonicalTotalDamageAggregationOptions(
        calculationOptions,
        dependencies.onFftLength
      )
    const plan = canonicalDamagePlan(
      canonicalDamageSnapshot,
      aggregationOptions
    )
    const leaseRequest = resourceGuard.acquirePlan(plan, {
      signal: calculationOptions.signal,
      requestId: calculationOptions.requestId,
      operation: 'canonical-total-damage',
    })
    const lease = isPromiseLike(leaseRequest)
      ? await leaseRequest
      : leaseRequest

    try {
      throwIfAborted(calculationOptions, 'Canonical total damage')
      const aggregate = canonicalDamageSum(
        canonicalDamageSnapshot,
        { ...aggregationOptions, plan },
      )
      throwIfAborted(calculationOptions, 'Canonical total damage')
      const summary = canonicalTotalDamageSummary(aggregate)
      return {
        canonicalTotalDamage: copyCanonicalTotalDamageEnvelope(aggregate),
        canonicalTotalDamageSummary: summary,
      }
    } finally {
      lease.release()
    }
  }

  return {
    planCheck(params, _difficulty, policy = {}) {
      const request = {
        action: snapshotScoreParams(params.action),
        reaction: snapshotScoreParams(params.reaction),
      }
      return planner(createCheckRangeParams(request), policy)
    },

    planAttackCombo(params, policy = {}) {
      const request = snapshotAttackParams(params)
      return planner(createAttackRangeParams(request), policy)
    },

    planBacktrack(params, policy = {}) {
      const request = snapshotBacktrackParams(params)
      return planner(createBacktrackRangeParams(request), policy)
    },

    async prepare(routeName) {
      if (routeName === 'check') {
        return
      }
      if (routeName === 'attack') {
        await dependencies.loadD10Asset()
        return
      }
      if (routeName === 'backtrack') {
        await Promise.all([
          dependencies.loadD10Asset(),
          dependencies.loadLivingdeadAsset(),
        ])
        return
      }
      throw new Error(`Unknown calculation route: ${routeName}`)
    },

    async calculateCheck(params, difficulty, options = {}) {
      const request = {
        action: snapshotScoreParams(params.action),
        reaction: snapshotScoreParams(params.reaction),
      }
      const difficultyRequest = { ...difficulty }
      const plan = runRangePreflight(
        planner,
        createCheckRangeParams(request, options.displayRequest),
        getCheckRangePolicy(options),
        options.onRangePlan
      )
      const leaseRequest = acquirePlanLease(
        resourceGuard,
        plan,
        options,
        'check'
      )
      const lease = isPromiseLike(leaseRequest)
        ? await leaseRequest
        : leaseRequest

      try {
        throwIfAborted(options, 'Check')
        const score = {
          action: scoreCalculator(request.action, false, plan.scores?.[0]),
          reaction: scoreCalculator(request.reaction, false, plan.scores?.[1]),
        }
        throwIfAborted(options, 'Check')
        return {
          score,
          scoreSummary: dependencies.getScoreSummary(
            score,
            difficultyRequest
          ),
        }
      } finally {
        lease.release()
      }
    },

    async calculateCheckCanonical(params, difficulty, options = {}) {
      const request = {
        action: snapshotScoreParams(params.action),
        reaction: snapshotScoreParams(params.reaction),
      }
      const difficultyRequest = { ...difficulty }
      const plan = runRangePreflight(
        planner,
        createCheckRangeParams(request, options.displayRequest),
        getCheckRangePolicy(options),
        options.onRangePlan
      )
      const leaseRequest = acquirePlanLease(
        resourceGuard,
        plan,
        options,
        'check'
      )
      const lease = isPromiseLike(leaseRequest)
        ? await leaseRequest
        : leaseRequest

      try {
        throwIfAborted(options, 'Canonical check')
        if (canonicalScoreCalculator === null) {
          throw new Error(
            'CalculationClient requires calculateScoreCanonical or runtime score dependencies'
          )
        }
        const score = {
          action: canonicalScoreCalculator(
            request.action,
            plan.scores?.[0]
          ),
          reaction: canonicalScoreCalculator(
            request.reaction,
            plan.scores?.[1]
          ),
        }
        const summaryScore = {
          action: createPublishedScoreFromCanonicalEnvelope(score.action),
          reaction: createPublishedScoreFromCanonicalEnvelope(score.reaction),
        }
        throwIfAborted(options, 'Canonical check')
        return {
          score,
          scoreSummary: dependencies.getScoreSummary(
            summaryScore,
            difficultyRequest
          ),
        }
      } finally {
        lease.release()
      }
    },

    async calculateAttackCombo(params, options = {}) {
      return runAttackCalculation(
        params,
        options,
        (score, request, plan, runtimeOptions) =>
          dependencies.calculateDamageOnDemand(
            score,
            request.action.damage,
            request.reaction.damage,
            {
              getDamageRollDistribution:
                dependencies.getDamageRollDistribution,
              getD10Distribution: dependencies.getD10Distribution,
              onFftLength: dependencies.onFftLength,
            },
            runtimeOptions,
            plan.damage
          ),
        ({ score, scoreSummary, finalizedDamage }) => ({
          score,
          scoreSummary,
          damage: finalizedDamage,
          damageSummary: dependencies.getDamageSummary(finalizedDamage),
        })
      )
    },

    async calculateAttackCanonical(params, options = {}) {
      return calculateCanonicalAttack(params, options)
    },

    async calculateAttackCanonicalBatch(entries, options = {}) {
      const batchRequest = snapshotCanonicalAttackBatchRequest(
        entries,
        options,
        {
          validateAggregationOptions: canonicalDamageOptionsValidator,
          defaultOnFftLength: dependencies.onFftLength,
        }
      )
      const {
        entries: entrySnapshots,
        options: batchOptions,
        aggregationOptions,
      } = batchRequest
      throwIfAborted(batchOptions, 'Canonical attack batch')

      const combos = []
      for (const entry of entrySnapshots) {
        throwIfAborted(batchOptions, 'Canonical attack batch')
        const combo = await calculateCanonicalAttack(
          entry.params,
          batchOptions
        )
        throwIfAborted(batchOptions, 'Canonical attack batch')
        combos.push({
          id: entry.id,
          ...combo,
        })
      }

      throwIfAborted(batchOptions, 'Canonical attack batch')
      const total = await runCanonicalTotalDamage(
        combos.map((combo) => combo.canonicalDamage),
        batchOptions,
        aggregationOptions
      )
      throwIfAborted(batchOptions, 'Canonical attack batch')
      return {
        combos,
        ...total,
      }
    },

    async calculateTotalDamage(combos, options = {}) {
      const leaseRequest = acquireResourceLease(
        resourceGuard,
        createTotalDamageResourceRequest(combos, options)
      )
      const lease = isPromiseLike(leaseRequest)
        ? await leaseRequest
        : leaseRequest
      try {
        throwIfAborted(options, 'Total damage')
        const totalDamage = dependencies.getTotalDamage(combos)
        throwIfAborted(options, 'Total damage')
        return {
          totalDamage,
          totalDamageSummary: dependencies.getDamageSummary(totalDamage),
        }
      } finally {
        lease.release()
      }
    },

    async calculateCanonicalTotalDamage(canonicalDamages, options = {}) {
      return runCanonicalTotalDamage(canonicalDamages, options)
    },

    async calculateBacktrack(params, options = {}) {
      const request = snapshotBacktrackParams(params)
      const plan = runRangePreflight(
        planner,
        createBacktrackRangeParams(request),
        options.rangePolicy,
        options.onRangePlan
      )
      const leaseRequest = acquirePlanLease(
        resourceGuard,
        plan,
        options,
        'backtrack'
      )
      const lease = isPromiseLike(leaseRequest)
        ? await leaseRequest
        : leaseRequest
      try {
        throwIfAborted(options, 'Backtrack')
        if (plan.backtrack?.distributionMode === 'on-demand') {
          return dependencies.getFinalEncroachment(
            request,
            getRuntimeOptions(options),
            plan.backtrack
          )
        }
        if (request.dlois === '屍人') {
          await dependencies.loadLivingdeadAsset()
        } else {
          await dependencies.loadD10Asset()
        }
        throwIfAborted(options, 'Backtrack')
        return dependencies.getFinalEncroachment(
          request,
          getRuntimeOptions(options),
          plan.backtrack
        )
      } finally {
        lease.release()
      }
    },
  }
}

export function createCalculationDependencies(overrides = {}) {
  return {
    ...defaultDependencies,
    ...overrides,
    resourceGuard: overrides.resourceGuard ?? createResourceGuard(),
  }
}

export const calculationDependencies = defaultDependencies
export const calculationResourceGuard = defaultResourceGuard
export const calculationClient = createCalculationClient()
