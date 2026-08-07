import {
  calculateScore as calculateCoreScore,
  getScoreSummary,
} from '../calculation/ScoreCalculator'
import { getDxDistribution } from './PrecomputedDataRepository'

export { getScoreSummary }

export function calculateScore(
  params,
  getDistribution = getDxDistribution,
  fix = false
) {
  return calculateCoreScore(
    params,
    { getDxDistribution: getDistribution },
    fix
  )
}

export function getScore(params, fix = false) {
  return calculateCoreScore(params, { getDxDistribution }, fix)
}
