import { getFinalEncroachment } from '../data/BacktrackCalculator'
import { calculateDamageOnDemand } from '../calculation/DamageCalculator'
import { calculateDxDistribution } from '../calculation/DxCalculator'
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

function createRuntimeDxProvider(calculateDistribution) {
  const cache = new Map()

  return (shihai, dice, critical) => {
    const key = [dice, critical, shihai].join(':')
    if (cache.has(key)) {
      const distribution = cache.get(key)
      cache.delete(key)
      cache.set(key, distribution)
      return distribution
    }

    const distribution = calculateDistribution({ dice, critical, shihai })
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
  const scoreCalculator =
    dependencies.calculateScore && dependencies.calculateDxDistribution
      ? (() => {
          const getDxDistribution = createRuntimeDxProvider(
            dependencies.calculateDxDistribution
          )
          return (params, fix = false) =>
            dependencies.calculateScore(params, getDxDistribution, fix)
        })()
      : dependencies.getScore

  if (!scoreCalculator) {
    throw new Error(
      'CalculationClient requires calculateScore/calculateDxDistribution'
    )
  }

  return {
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

    async calculateCheck(params, difficulty) {
      const request = {
        action: snapshotScoreParams(params.action),
        reaction: snapshotScoreParams(params.reaction),
      }
      const difficultyRequest = { ...difficulty }

      const score = {
        action: scoreCalculator(request.action),
        reaction: scoreCalculator(request.reaction),
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
      if (request.reaction.damage.dice > 0) {
        await dependencies.loadD10Asset()
      }

      const score = {
        action: scoreCalculator(request.action.score),
        reaction: scoreCalculator(
          request.reaction.score,
          request.reaction.mode === '《イベイジョン》'
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
        },
        options
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

    async calculateBacktrack(params) {
      const request = { ...params }
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
