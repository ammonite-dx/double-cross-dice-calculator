import {
  calculateDamage,
  getDamageSummary,
  getTotalDamage,
} from '../calculation/DamageCalculator'
import {
  getD10Distribution,
  getDrDamageDistributions,
} from './PrecomputedDataRepository'

const dependencies = {
  getD10Distribution,
  getDrDamageDistributions,
}

export { getDamageSummary, getTotalDamage }

export function getDamage(score, attack, defence) {
  return calculateDamage(score, attack, defence, dependencies)
}
