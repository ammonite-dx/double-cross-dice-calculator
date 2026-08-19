import {
  calculateScore as calculateCoreScore,
  calculateScoreCanonical as calculateCoreScoreCanonical,
  getScoreSummary,
} from '../calculation/ScoreCalculator'
import { getDxDistribution } from './PrecomputedDataRepository'

export { getScoreSummary }

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
  scoreRangePlan
) {
  if (typeof getDistribution !== 'function') {
    throw new TypeError(
      'calculateScoreCanonical requires a runtime distribution provider'
    )
  }
  return calculateCoreScoreCanonical(
    params,
    { getDxDistribution: getDistribution },
    scoreRangePlan
  )
}

export function getScore(params, fix = false) {
  return calculateCoreScore(
    params,
    { getDxDistribution },
    fix
  )
}
