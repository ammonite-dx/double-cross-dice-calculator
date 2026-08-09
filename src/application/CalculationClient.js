import { getFinalEncroachment } from '../data/BacktrackCalculator'
import { calculateDamageOnDemand } from '../calculation/DamageCalculator'
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

const RUNTIME_DX_CACHE_SIZE = 32
const runtimeDamageRollClient = createRuntimeDamageRollClient()

const defaultDependencies = {
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

      const score = {
        action: scoreCalculator(request.action, false, plan.scores?.[0]),
        reaction: scoreCalculator(request.reaction, false, plan.scores?.[1]),
      }
      return {
        score,
        scoreSummary: dependencies.getScoreSummary(
          score,
          difficultyRequest
        ),
      }
    },

    async calculateAttackCombo(params, options = {}) {
      const request = snapshotAttackParams(params)
      const plan = runRangePreflight(
        planner,
        createAttackRangeParams(request),
        options.rangePolicy,
        options.onRangePlan
      )
      if (request.reaction.damage.dice > 0) {
        await dependencies.loadD10Asset()
      }

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
      const damage = await dependencies.calculateDamageOnDemand(
        score,
        request.action.damage,
        request.reaction.damage,
        {
          getDamageRollDistribution:
            dependencies.getDamageRollDistribution,
          getD10Distribution: dependencies.getD10Distribution,
          onFftLength: dependencies.onFftLength,
        },
        getRuntimeOptions(options),
        plan.damage
      )

      return {
        score,
        scoreSummary: dependencies.getScoreSummary(score),
        damage,
        damageSummary: dependencies.getDamageSummary(damage),
      }
    },

    async calculateTotalDamage(combos) {
      const totalDamage = dependencies.getTotalDamage(combos)
      return {
        totalDamage,
        totalDamageSummary: dependencies.getDamageSummary(totalDamage),
      }
    },

    async calculateBacktrack(params, options = {}) {
      const request = snapshotBacktrackParams(params)
      runRangePreflight(
        planner,
        createBacktrackRangeParams(request),
        options.rangePolicy,
        options.onRangePlan
      )
      if (request.dlois === '屍人') {
        await dependencies.loadLivingdeadAsset()
      } else {
        await dependencies.loadD10Asset()
      }
      return dependencies.getFinalEncroachment(request)
    },
  }
}

export const calculationClient = createCalculationClient()
