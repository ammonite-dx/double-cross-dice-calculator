import {
  calculateFinalEncroachment,
} from '../calculation/BacktrackCalculator'
import {
  getD10Distribution,
  getLivingdeadDistribution,
} from './PrecomputedDataRepository'

const dependencies = {
  getD10Distribution,
  getLivingdeadDistribution,
}

export function getFinalEncroachment(
  params,
  runtimeOptions = {},
  backtrackRangePlan
) {
  return calculateFinalEncroachment(
    params,
    dependencies,
    runtimeOptions,
    backtrackRangePlan
  )
}
