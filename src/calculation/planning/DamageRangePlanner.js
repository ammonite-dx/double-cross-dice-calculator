import {
  D10_MAX_GENERATION_LENGTH,
  getD10GenerationOperationEstimate,
  getD10RequiredLength,
} from '../D10Calculator'
import { RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH } from '../RuntimeDamageRollLimits'
import {
  addSafe,
  getDamageKazanariCostFactor,
  integer,
  multiplySafe,
  nextPowerOfTwo,
  nonNegativeInteger,
  subtractSafe,
  fftOperationCount,
  object,
} from './PlanningMath'

export function normalizeAttack(params) {
  object(params, 'attack')
  return {
    dice: nonNegativeInteger(params.dice, 'attack.dice'),
    value: integer(params.value, 'attack.value'),
    kazanari: nonNegativeInteger(params.kazanari ?? 0, 'attack.kazanari'),
  }
}

export function normalizeDefence(params) {
  object(params, 'defence')
  return {
    dice: nonNegativeInteger(params.dice, 'defence.dice'),
    value: integer(params.value, 'defence.value'),
  }
}

/** Plan the finite damage-roll and defence-convolution ranges. */
export function planDamage(params, display, policy, maxScoreForDamage) {
  const attack = normalizeAttack(params.attack)
  const defence = normalizeDefence(params.defence)
  const maxDamageDice = Math.max(
    0,
    addSafe(
      Math.floor(maxScoreForDamage / 10) + 1,
      attack.dice,
      'damage dice range'
    )
  )
  const rawMax = multiplySafe(maxDamageDice, 10, 'damage raw support')
  const fixedDifference = subtractSafe(
    attack.value,
    defence.value,
    'damage fixed difference'
  )
  const defenceMax = multiplySafe(defence.dice, 10, 'defence support')
  const defenceD10Length = defence.dice > 0
    ? getD10RequiredLength(defence.dice)
    : 0
  const defenceD10Operations = defence.dice > 0
    ? getD10GenerationOperationEstimate(
        defence.dice,
        defenceD10Length
      )
    : 0
  // Runtime D10 generation keeps the current and next DP buffers alive while
  // producing the requested snapshot. Count both buffers for admission; the
  // returned provider copy is short-lived and is covered by the damage
  // consumer's own working-range estimate.
  const defenceD10Float64Bytes = defence.dice > 0
    ? multiplySafe(
        multiplySafe(
          defenceD10Length,
          2,
          'defence D10 generation buffer size'
        ),
        Float64Array.BYTES_PER_ELEMENT,
        'defence D10 generation buffer size'
      )
    : 0
  const calculationPlusDefence = addSafe(
    policy.calculationMax,
    defenceMax,
    'damage calculation range'
  )
  const rawPlusDifference = addSafe(
    rawMax,
    fixedDifference,
    'damage working range'
  )
  const calculationMinusDifference = subtractSafe(
    policy.calculationMax,
    fixedDifference,
    'damage working range'
  )
  const workingMax = fixedDifference >= 0
    ? Math.max(
        0,
        Math.min(rawPlusDifference, calculationPlusDefence)
      )
    : Math.max(
        0,
        Math.min(
          rawMax,
          addSafe(
            calculationMinusDifference,
            defenceMax,
            'damage working range'
          )
        )
      )
  const damageRollFftLength = nextPowerOfTwo(
    addSafe(rawMax, 1, 'damage FFT range')
  )
  const workingLength = addSafe(workingMax, 2, 'damage working range')
  const defenceFftLength = defence.dice > 0
    ? nextPowerOfTwo(addSafe(workingLength, defenceMax, 'defence FFT range'))
    : 0
  const effectiveKazanari = Math.min(attack.kazanari, maxDamageDice)
  const damageOperations =
    (damageRollFftLength / 2 + 1) *
      (maxDamageDice + 1) *
      getDamageKazanariCostFactor(effectiveKazanari)
  const fftOperations = fftOperationCount(defenceFftLength)
  const float64Bytes =
    (2 * damageRollFftLength + workingLength +
      (defence.dice > 0
        ? 2 * defenceFftLength + 2 * workingLength
        : 0)) *
    Float64Array.BYTES_PER_ELEMENT

  return {
    ...attack,
    attackDice: attack.dice,
    attackValue: attack.value,
    defenceDice: defence.dice,
    defenceValue: defence.value,
    fixedDifference,
    maxDamageDice,
    effectiveKazanari,
    support: {
      kind: 'finite-support',
      finiteSupport: true,
      min: 0,
      max: rawMax,
    },
    rawSupportMax: rawMax,
    rawMax,
    workingMax,
    workingLength,
    defenceMax,
    fftLength: damageRollFftLength,
    defenceFftLength,
    operations: damageOperations,
    damageOperations,
    fftOperations,
    float64Bytes,
    defenceD10Length,
    defenceD10Operations,
    defenceD10Float64Bytes,
    finiteSupport: true,
    scoreValueMode: policy.scorePropagation,
    scoreValueUpperBound: maxScoreForDamage,
    calculationMax: policy.calculationMax,
    display,
  }
}

export { D10_MAX_GENERATION_LENGTH, RUNTIME_DAMAGE_MAX_WEIGHT_LENGTH }
