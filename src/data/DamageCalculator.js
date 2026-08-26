import {
  calculateDamage,
  getDamageSummary,
  getTotalDamage,
} from '../calculation/DamageCalculator'
import { getD10Distribution } from './D10PrecomputedDataRepository'
import { getDrDamageDistributions } from './ReferencePrecomputedDataRepository'

const dependencies = {
  getD10Distribution,
  getDrDamageDistributions,
}

export { getDamageSummary, getTotalDamage }

export function getDamage(score, attack, defence) {
  return calculateDamage(score, attack, defence, dependencies)
}
