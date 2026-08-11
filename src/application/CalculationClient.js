import { getFinalEncroachment } from '../data/BacktrackCalculator'
import {
  calculateCanonicalDamageOnDemand,
  calculateDamageOnDemand,
} from '../calculation/DamageCalculator'
import {
  calculateDxDistribution,
  normalizeDxOptions,
} from '../calculation/DxCalculator'
import {
  getDamageSummary,
  getTotalDamage,
} from '../data/DamageCalculator'
import {
  getD10Distribution,
  loadD10Asset,
  loadLivingdeadAsset,
} from '../data/PrecomputedDataRepository'
import {
  calculateScore,
  getScoreSummary,
} from '../data/ScoreCalculator'
import { planCalculationRanges } from '../calculation/RangePlanner'
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
  getDamageSummary,
  getDamageRollDistribution: runtimeDamageRollClient.calculate,
  getFinalEncroachment,
  getD10Distribution,
  getScoreSummary,
  getTotalDamage,
  loadD10Asset,
  loadLivingdeadAsset,
  planCalculationRanges,
  resourceGuard: defaultResourceGuard,
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

function createCheckRangeParams(request) {
  return {
    operation: 'check',
    score: {
      action: request.action,
      reaction: request.reaction,
    },
  }
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
  const hasRuntimeScoreDependencies =
    typeof dependencies.calculateScore === 'function' &&
    typeof dependencies.calculateDxDistribution === 'function'
  const hasLegacyScoreDependency = typeof dependencies.getScore === 'function'
  const scoreCalculator = (() => {
    if (hasRuntimeScoreDependencies) {
      const getDxDistribution = createRuntimeDxProvider(
        dependencies.calculateDxDistribution
      )
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

  if (!hasRuntimeScoreDependencies && !hasLegacyScoreDependency) {
    throw new Error(
      'CalculationClient requires calculateScore/calculateDxDistribution'
    )
  }

  async function runAttackCalculation(
    params,
    options,
    finalizeDamage,
    buildResult
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

      const score = {
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
      const finalizedDamage = await finalizeDamage(
        score,
        request,
        plan,
        getRuntimeOptions(options)
      )
      throwIfAborted(options, 'Attack')

      return buildResult({
        score,
        scoreSummary: dependencies.getScoreSummary(score),
        finalizedDamage,
      })
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
        createCheckRangeParams(request),
        options.rangePolicy,
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
          canonicalDamage: finalizedDamage,
        })
      )
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
