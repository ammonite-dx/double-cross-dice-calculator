import { getFinalEncroachment } from '../data/BacktrackCalculator'
import {
  getDamage,
  getDamageSummary,
  getTotalDamage,
} from '../data/DamageCalculator'
import {
  loadD10Asset,
  loadDrAsset,
  loadDxAsset,
  loadLivingdeadAsset,
} from '../data/PrecomputedDataRepository'
import {
  getScore,
  getScoreSummary,
} from '../data/ScoreCalculator'

const defaultDependencies = {
  getDamage,
  getDamageSummary,
  getFinalEncroachment,
  getScore,
  getScoreSummary,
  getTotalDamage,
  loadD10Asset,
  loadDrAsset,
  loadDxAsset,
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

export function createCalculationClient(
  dependencies = defaultDependencies
) {
  return {
    async prepare(routeName) {
      if (routeName === 'check') {
        await dependencies.loadDxAsset(0)
        return
      }
      if (routeName === 'attack') {
        await Promise.all([
          dependencies.loadDxAsset(0),
          dependencies.loadDrAsset(0),
          dependencies.loadD10Asset(),
        ])
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
      await Promise.all([
        dependencies.loadDxAsset(request.action.shihai),
        dependencies.loadDxAsset(request.reaction.shihai),
      ])

      const score = {
        action: dependencies.getScore(request.action),
        reaction: dependencies.getScore(request.reaction),
      }
      return {
        score,
        scoreSummary: dependencies.getScoreSummary(
          score,
          difficultyRequest
        ),
      }
    },

    async calculateAttackCombo(params) {
      const request = snapshotAttackParams(params)
      await Promise.all([
        dependencies.loadDxAsset(request.action.score.shihai),
        dependencies.loadDxAsset(request.reaction.score.shihai),
        dependencies.loadDrAsset(request.action.damage.kazanari),
        request.reaction.damage.dice > 0
          ? dependencies.loadD10Asset()
          : Promise.resolve(),
      ])

      const score = {
        action: dependencies.getScore(request.action.score),
        reaction: dependencies.getScore(
          request.reaction.score,
          request.reaction.mode === '《イベイジョン》'
        ),
      }
      const damage = dependencies.getDamage(
        score,
        request.action.damage,
        request.reaction.damage
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
