import {
  calculateFinalEncroachment,
  calculateFinalEncroachmentCanonical,
} from '../calculation/BacktrackCalculator'
import { getD10Distribution } from './D10PrecomputedDataRepository'
import { getLivingdeadDistribution } from './ReferencePrecomputedDataRepository'

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

export function getFinalEncroachmentCanonical(
  params,
  runtimeOptions = {},
  backtrackRangePlan
) {
  return calculateFinalEncroachmentCanonical(
    params,
    dependencies,
    runtimeOptions,
    backtrackRangePlan
  )
}
