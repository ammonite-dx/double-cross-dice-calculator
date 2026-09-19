import {
  calculateFinalEncroachment as calculateCoreFinalEncroachment,
} from '../calculation/BacktrackCalculator'
import {
  calculateDamageOnDemand,
  getDamageStatistics,
} from '../calculation/DamageCalculator'
import {
  createDistributionResult,
  getTotalDamageStatistics,
} from '../calculation/DistributionResult'
import {
  planDamageAggregation,
  sumDamage,
} from '../calculation/DamageAggregation'
import {
  calculateDxDistribution,
  normalizeDxOptions,
} from '../calculation/DxCalculator'
import {
  createD10DistributionProvider,
} from '../calculation/D10Calculator'
import {
  calculateScore as calculateCoreScore,
  calculateScoreResolution as calculateCoreScoreResolution,
  getScoreStatistics,
} from '../calculation/ScoreCalculator'
import { planCalculationRanges } from '../calculation/RangePlanner'
import {
  normalizeAttackCalculationInput,
  normalizeBacktrackParams,
  normalizeDifficultyInput,
  normalizeScoreInput,
} from '../domain/CalculationInputNormalization'
import { createCheckRangePolicy } from './CheckRangePolicy'
import { createRuntimeDamageRollClient } from './RuntimeDamageRollClient'
import { createResourceGuard } from './ResourceGuard'

const RUNTIME_DX_CACHE_SIZE = 32
const runtimeDamageRollClient = createRuntimeDamageRollClient()
const runtimeD10DistributionProvider = createD10DistributionProvider()
const defaultResourceGuard = createResourceGuard()

function calculateScoreAdapter(
  params,
  getDistribution,
  scoreRangePlan
) {
  if (typeof getDistribution !== 'function') {
    throw new TypeError(
      'calculateScore requires a runtime distribution provider'
    )
  }
  return calculateCoreScore(
    params,
    { getDxDistribution: getDistribution },
    scoreRangePlan,
  )
}

function calculateScoreResolutionAdapter(
  resolution,
  getDistribution,
  scoreRangePlan
) {
  if (resolution?.kind === 'rolled-score') {
    return calculateScoreAdapter(
      resolution.params,
      getDistribution,
      scoreRangePlan
    )
  }
  return calculateCoreScoreResolution(
    resolution,
    { getDxDistribution: getDistribution },
    scoreRangePlan
  )
}

function getFinalEncroachmentAdapter(
  params,
  runtimeOptions = {},
  backtrackRangePlan
) {
  return calculateCoreFinalEncroachment(
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
  calculateDamageOnDemand,
  calculateDxDistribution,
  calculateScore: calculateScoreAdapter,
  calculateScoreResolution: calculateScoreResolutionAdapter,
  getScoreStatistics,
  getDamageStatistics,
  getTotalDamageStatistics,
  getDamageRollDistribution: runtimeDamageRollClient.calculate,
  getFinalEncroachment: getFinalEncroachmentAdapter,
  getD10Distribution: runtimeD10DistributionProvider,
  planDamageAggregation,
  planCalculationRanges,
  resourceGuard: defaultResourceGuard,
  sumDamage,
}

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

function snapshotScoreParams(params, label = 'score') {
  return normalizeScoreInput(params, label)
}

function rolledScoreResolution(params) {
  return { kind: 'rolled-score', params }
}

function snapshotAttackParams(params) {
  return normalizeAttackCalculationInput(params)
}

function snapshotBacktrackParams(params) {
  return normalizeBacktrackParams(params)
}

function createCheckRangeParams(request, displayRequest) {
  const params = {
    operation: 'check',
    score: {
      action: rolledScoreResolution(request.action),
      reaction: rolledScoreResolution(request.reaction),
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

function createAttackRangeParams(request, scoreDisplayRequest) {
  const params = {
    operation: 'attack',
    score: {
      action: request.action.score,
      reaction: request.reaction.score,
    },
    attack: { ...request.action.damage },
    defence: { ...request.reaction.damage },
  }
  if (scoreDisplayRequest !== undefined && scoreDisplayRequest !== null) {
    params.display = {
      min: scoreDisplayRequest.min,
      max: scoreDisplayRequest.max,
    }
  }
  return params
}

function createBacktrackRangeParams(request) {
  const params = {
    operation: 'backtrack',
    backtrack: { ...request },
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
  delete runtimeOptions.scoreDisplayRequest
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

const TOTAL_DAMAGE_AGGREGATION_OPTION_NAMES = Object.freeze([
  'maxValuesLength',
  'maxFftLength',
  'maxResourceBytes',
  'maxComponents',
  'signal',
  'onFftLength',
])

function createTotalDamageAggregationOptions(
  options,
  defaultOnFftLength
) {
  const aggregationOptions = {}
  for (const name of TOTAL_DAMAGE_AGGREGATION_OPTION_NAMES) {
    if (hasOwn(options, name)) {
      aggregationOptions[name] = options[name]
    }
  }
  if (
    !hasOwn(aggregationOptions, 'onFftLength')
    && typeof defaultOnFftLength === 'function'
  ) {
    aggregationOptions.onFftLength = defaultOnFftLength
  }
  return aggregationOptions
}

function copyTotalDamageEnvelope(totalDamage) {
  const result = totalDamage?.result
  if (
    totalDamage === null
    || typeof totalDamage !== 'object'
    || result === null
    || typeof result !== 'object'
    || !hasOwn(result, 'values')
    || !hasOwn(result, 'offset')
    || !hasOwn(result, 'support')
    || !hasOwn(result, 'overflow')
  ) {
    return totalDamage
  }

  try {
    return Object.freeze({
      ...totalDamage,
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
    return totalDamage
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
      normalizedOptions.fftLength ?? '',
    ].join(':')
    if (cache.has(key)) {
      const distribution = cache.get(key)
      cache.delete(key)
      cache.set(key, distribution)
      return distribution
    }

    const distribution = calculateDistribution(
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

/**
 * @param {Object} [dependencies]
 * @returns {import('./CalculationClientTypes').CalculationClient}
 */
export function createCalculationClient(
  dependencies = defaultDependencies
) {
  const resourceGuard = dependencies.resourceGuard ?? defaultResourceGuard
  const planner = dependencies.planCalculationRanges ?? planCalculationRanges
  const damagePlan =
    dependencies.planDamageAggregation
    ?? planDamageAggregation
  const damageSum =
    dependencies.sumDamage
    ?? sumDamage
  const totalDamageStatistics =
    dependencies.getTotalDamageStatistics
    ?? getTotalDamageStatistics
  const hasRuntimeDxDependency =
    typeof dependencies.calculateDxDistribution === 'function'
  const getDxDistribution = hasRuntimeDxDependency
    ? createRuntimeDxProvider(dependencies.calculateDxDistribution)
    : null
  const scoreResolutionCalculator = (() => {
    const calculateRolled = (params, scoreRangePlan) => {
      if (typeof dependencies.calculateScore === 'function') {
        return dependencies.calculateScore(
          params,
          getDxDistribution ?? undefined,
          scoreRangePlan
        )
      }
      if (getDxDistribution !== null) {
        return calculateScoreAdapter(
          params,
          getDxDistribution,
          scoreRangePlan
        )
      }
      return null
    }

    return (resolution, scoreRangePlan) => {
      if (resolution?.kind === 'rolled-score') {
        const result = calculateRolled(resolution.params, scoreRangePlan)
        if (result === null) {
          throw new Error(
            'CalculationClient requires calculateScore or runtime score dependencies'
          )
        }
        return result
      }

      if (typeof dependencies.calculateScoreResolution === 'function') {
        return dependencies.calculateScoreResolution(
          resolution,
          getDxDistribution ?? undefined,
          scoreRangePlan
        )
      }
      return calculateCoreScoreResolution(
        resolution,
        { getDxDistribution: getDxDistribution ?? undefined },
        scoreRangePlan
      )
    }
  })()

  const scoreStatisticsCalculator =
    dependencies.getScoreStatistics ?? getScoreStatistics

  async function runAttackCalculation(params, options) {
    const request = snapshotAttackParams(params)
    const plan = runRangePreflight(
      planner,
      createAttackRangeParams(request, options.scoreDisplayRequest),
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
    const runtimeOptions = getRuntimeOptions(options)

    try {
      throwIfAborted(options, 'Attack')

      const score = {
        action: scoreResolutionCalculator(
          request.action.score,
          plan.scores?.[0]
        ),
        reaction: scoreResolutionCalculator(
          request.reaction.score,
          plan.scores?.[1]
        ),
      }
      const finalizedDamage = await dependencies.calculateDamageOnDemand(
        score,
        request.action.damage,
        request.reaction.damage,
        {
          getDamageRollDistribution: dependencies.getDamageRollDistribution,
          getD10Distribution: dependencies.getD10Distribution,
          onFftLength: dependencies.onFftLength,
        },
        runtimeOptions,
        plan
      )
      throwIfAborted(options, 'Attack')

      const scoreStatistics = scoreStatisticsCalculator(score)
      return {
        score,
        scoreStatistics,
        damage: finalizedDamage,
        damageStatistics:
          dependencies.getDamageStatistics(finalizedDamage),
      }
    } finally {
      lease.release()
    }
  }

  async function calculateAttack(params, options = {}) {
    return runAttackCalculation(params, options)
  }

  async function runTotalDamage(
    damages,
    options = {},
    aggregationOptionsOverride = null
  ) {
    // Snapshot the caller's array before planning or waiting for a resource
    // lease. The aggregation plan is then tied to this private snapshot.
    const damageSnapshot = Array.isArray(damages)
      ? damages.map(copyTotalDamageEnvelope)
      : damages
    const calculationOptions = options ?? {}
    const aggregationOptions = aggregationOptionsOverride
      ?? createTotalDamageAggregationOptions(
        calculationOptions,
        dependencies.onFftLength
      )
    const plan = damagePlan(
      damageSnapshot,
      aggregationOptions
    )
    const leaseRequest = resourceGuard.acquirePlan(plan, {
      signal: calculationOptions.signal,
      requestId: calculationOptions.requestId,
      operation: 'total-damage',
    })
    const lease = isPromiseLike(leaseRequest)
      ? await leaseRequest
      : leaseRequest

    try {
      throwIfAborted(calculationOptions, 'total damage')
      const aggregate = damageSum(
        damageSnapshot,
        { ...aggregationOptions, plan },
      )
      throwIfAborted(calculationOptions, 'total damage')
      const summary = totalDamageStatistics(aggregate)
      return {
        totalDamage: copyTotalDamageEnvelope(aggregate),
        totalDamageStatistics: summary,
      }
    } finally {
      lease.release()
    }
  }

  return {
    planCheck(params, _difficulty, policy = {}) {
      const request = {
        action: snapshotScoreParams(params.action, 'check.action'),
        reaction: snapshotScoreParams(params.reaction, 'check.reaction'),
      }
      return planner(createCheckRangeParams(request), policy)
    },

    planAttackCombo(params, policy = {}) {
      const request = snapshotAttackParams(params)
      return planner(
        createAttackRangeParams(request),
        policy
      )
    },

    planBacktrack(params, policy = {}) {
      const request = snapshotBacktrackParams(params)
      return planner(createBacktrackRangeParams(request), policy)
    },

    async calculateCheck(params, difficulty, options = {}) {
      const request = {
        action: snapshotScoreParams(params.action, 'check.action'),
        reaction: snapshotScoreParams(params.reaction, 'check.reaction'),
      }
      const difficultyRequest = normalizeDifficultyInput(difficulty)
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
        throwIfAborted(options, 'check')
        const score = {
          action: scoreResolutionCalculator(
            rolledScoreResolution(request.action),
            plan.scores?.[0]
          ),
          reaction: scoreResolutionCalculator(
            rolledScoreResolution(request.reaction),
            plan.scores?.[1]
          ),
        }
        throwIfAborted(options, 'check')
        return {
          score,
          scoreStatistics: scoreStatisticsCalculator(
            score,
            difficultyRequest
          ),
        }
      } finally {
        lease.release()
      }
    },

    async calculateAttack(params, options = {}) {
      return calculateAttack(params, options)
    },

    async calculateTotalDamage(damages, options = {}) {
      return runTotalDamage(damages, options)
    },

    async calculateBacktrack(params, options = {}) {
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
        throwIfAborted(options, 'backtrack')
        const result = await dependencies.getFinalEncroachment(
          request,
          getRuntimeOptions(options),
          plan.backtrack
        )
        throwIfAborted(options, 'backtrack')
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
