import {
  calculateFinalEncroachmentCanonical as calculateCoreFinalEncroachmentCanonical,
} from '../calculation/BacktrackCalculator'
import {
  calculateCanonicalDamageOnDemand,
  getCanonicalDamageSummary,
} from '../calculation/DamageCalculator'
import {
  createDistributionResult,
  getCanonicalTotalDamageSummary,
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
  createD10DistributionProvider,
} from '../calculation/D10Calculator'
import {
  calculateScoreCanonical as calculateCoreScoreCanonical,
  getCanonicalScoreSummary,
} from '../calculation/ScoreCalculator'
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
const runtimeD10DistributionProvider = createD10DistributionProvider()
const defaultResourceGuard = createResourceGuard()

function calculateScoreCanonicalAdapter(
  params,
  getDistribution,
  scoreRangePlan,
  fix = false
) {
  if (typeof getDistribution !== 'function') {
    throw new TypeError(
      'calculateScoreCanonical requires a runtime distribution provider'
    )
  }
  return calculateCoreScoreCanonical(
    params,
    { getDxDistribution: getDistribution },
    scoreRangePlan,
    fix
  )
}

function getFinalEncroachmentCanonicalAdapter(
  params,
  runtimeOptions = {},
  backtrackRangePlan
) {
  return calculateCoreFinalEncroachmentCanonical(
    params,
    undefined,
    runtimeOptions,
    backtrackRangePlan
  )
}

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
  calculateDxDistribution,
  calculateScoreCanonical: calculateScoreCanonicalAdapter,
  getCanonicalScoreSummary,
  getCanonicalDamageSummary,
  getCanonicalTotalDamageSummary,
  getDamageRollDistribution: runtimeDamageRollClient.calculate,
  getFinalEncroachmentCanonical: getFinalEncroachmentCanonicalAdapter,
  getD10Distribution: runtimeD10DistributionProvider,
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

function getAttackRangePolicy(rangePolicy) {
  if (rangePolicy === undefined) {
    return { scorePropagation: 'full-tail' }
  }
  if (
    rangePolicy === null ||
    typeof rangePolicy !== 'object' ||
    Array.isArray(rangePolicy) ||
    Object.prototype.hasOwnProperty.call(rangePolicy, 'scorePropagation')
  ) {
    return rangePolicy
  }
  return {
    ...rangePolicy,
    scorePropagation: 'full-tail',
  }
}

function createBacktrackRangeParams(request, canonical = false) {
  const params = {
    operation: 'backtrack',
    backtrack: { ...request },
  }
  if (canonical) {
    // Keep the public planner and canonical execution on the same
    // on-demand plan. The operation remains `backtrack` for callers.
    params.canonicalBacktrack = true
  }
  return params
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

function isPromiseLike(value) {
  return value !== null
    && value !== undefined
    && typeof value.then === 'function'
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

  return (shihai, dice, critical, options, yousei = 0) => {
    const normalizedOptions = normalizeDxOptions(options)
    const key = [
      dice,
      critical,
      shihai,
      yousei,
      normalizedOptions.workingLength,
      normalizedOptions.rounding,
      normalizedOptions.fftLength ?? '',
    ].join(':')
    if (cache.has(key)) {
      const distribution = cache.get(key)
      cache.delete(key)
      cache.set(key, distribution)
      return distribution
    }

    const distribution = options === undefined
      ? calculateDistribution({ dice, critical, shihai, yousei })
      : calculateDistribution(
          { dice, critical, shihai, yousei },
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
  const hasRuntimeDxDependency =
    typeof dependencies.calculateDxDistribution === 'function'
  const getDxDistribution = hasRuntimeDxDependency
    ? createRuntimeDxProvider(dependencies.calculateDxDistribution)
    : null
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
          ? calculateScoreCanonicalAdapter(
              params,
              getDxDistribution,
              scoreRangePlan,
              true
            )
          : calculateScoreCanonicalAdapter(
              params,
              getDxDistribution,
              scoreRangePlan
            )
    }
    return null
  })()

  const canonicalScoreSummaryCalculator =
    dependencies.getCanonicalScoreSummary ?? getCanonicalScoreSummary

  async function runAttackCalculation(params, options) {
    const request = snapshotAttackParams(params)
    const plan = runRangePreflight(
      planner,
      createAttackRangeParams(request),
      getAttackRangePolicy(options.rangePolicy),
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
      throwIfAborted(options, 'Attack')

      if (canonicalScoreCalculator === null) {
        throw new Error(
          'CalculationClient requires calculateScoreCanonical or runtime score dependencies'
        )
      }
      const score = {
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
      const finalizedDamage = await dependencies.calculateCanonicalDamageOnDemand(
        score,
        request.action.damage,
        request.reaction.damage,
        {
          getDamageRollDistribution: dependencies.getDamageRollDistribution,
          getD10Distribution: dependencies.getD10Distribution,
          onFftLength: dependencies.onFftLength,
        },
        getRuntimeOptions(options),
        plan
      )
      throwIfAborted(options, 'Attack')

      const scoreSummary = canonicalScoreSummaryCalculator(score)
      return {
        score,
        scoreSummary,
        canonicalScore: score,
        canonicalScoreBatchSummary: scoreSummary,
        canonicalDamage: finalizedDamage,
        canonicalDamageSummary:
          dependencies.getCanonicalDamageSummary(finalizedDamage),
      }
    } finally {
      lease.release()
    }
  }

  async function calculateCanonicalAttack(params, options = {}) {
    return runAttackCalculation(params, options)
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
      return planner(
        createAttackRangeParams(request),
        getAttackRangePolicy(policy)
      )
    },

    planBacktrack(params, policy = {}) {
      const request = snapshotBacktrackParams(params)
      return planner(createBacktrackRangeParams(request, true), policy)
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
        throwIfAborted(options, 'Canonical check')
        return {
          score,
          scoreSummary: canonicalScoreSummaryCalculator(
            score,
            difficultyRequest
          ),
        }
      } finally {
        lease.release()
      }
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

    async calculateCanonicalTotalDamage(canonicalDamages, options = {}) {
      return runCanonicalTotalDamage(canonicalDamages, options)
    },

    async calculateBacktrackCanonical(params, options = {}) {
      const request = snapshotBacktrackParams(params)
      const plan = runRangePreflight(
        planner,
        createBacktrackRangeParams(request, true),
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
        throwIfAborted(options, 'Canonical backtrack')
        const result = await dependencies.getFinalEncroachmentCanonical(
          request,
          getRuntimeOptions(options),
          plan.backtrack
        )
        throwIfAborted(options, 'Canonical backtrack')
        return result
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
