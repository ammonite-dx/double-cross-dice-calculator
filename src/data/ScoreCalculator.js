import {
  calculateScore as calculateCoreScore,
  calculateScoreCanonical as calculateCoreScoreCanonical,
  getCanonicalScoreSummary as getCoreCanonicalScoreSummary,
  getScoreSummary,
} from '../calculation/ScoreCalculator'
import { getDxDistribution } from './ReferencePrecomputedDataRepository'

export { getScoreSummary }

export function getCanonicalScoreSummary(score, difficulty) {
  return getCoreCanonicalScoreSummary(score, difficulty)
}

export function calculateScore(
  params,
  getDistribution = getDxDistribution,
  fix = false,
  scoreRangePlan
) {
  return calculateCoreScore(
    params,
    { getDxDistribution: getDistribution },
    fix,
    scoreRangePlan
  )
}

export function calculateScoreCanonical(
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

export function getScore(params, fix = false) {
  return calculateCoreScore(
    params,
    { getDxDistribution },
    fix
  )
}
