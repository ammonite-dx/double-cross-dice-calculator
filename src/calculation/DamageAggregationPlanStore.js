import {
  DAMAGE_AGGREGATION_ERROR_CODES,
  fail,
} from './DamageAggregationCommon'

// The registry is deliberately private to the calculation core. A public
// plan is an immutable description, not an authority that callers can forge.
const PLAN_RECORDS = new WeakMap()

export function registerDamageAggregationPlan(plan, record) {
  PLAN_RECORDS.set(plan, record)
  return plan
}

export function getDamageAggregationPlanRecord(plan) {
  const record = PLAN_RECORDS.get(plan)
  if (!record) {
    fail(
      DAMAGE_AGGREGATION_ERROR_CODES.INVALID_OPTIONS,
      'damage aggregation plan is not an approved immutable plan'
    )
  }
  return record
}
