import {
  projectCanonicalDamageToLegacyDisplay,
} from './CanonicalLegacyDisplayAdapter'

export const CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_READY_REASONS = Object.freeze({
  OPT_IN_DISABLED: 'canonical-opt-in-disabled',
  TOTAL_NOT_READY: 'canonical-total-not-ready',
  COMBO_NOT_READY: 'canonical-combo-not-ready',
})

export const CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS = Object.freeze({
  INVALID_SHAPE: 'invalid-shape',
  BOUNDED_EXPECTED_VALUE: 'bounded-expected-value',
  LOWER_BOUND_EXPECTED_VALUE: 'lower-bound-expected-value',
  INVALID_EXPECTED_VALUE: 'invalid-expected-value',
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function cloneDisplayValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneDisplayValue)
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(value)
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneDisplayValue(nestedValue),
      ])
    )
  }
  return value
}

function createNotReady(reason, details = {}) {
  return Object.freeze({
    kind: 'not-ready',
    reason,
    ...details,
  })
}

function createNotProjectable(reason, details = {}) {
  return Object.freeze({
    kind: 'not-projectable',
    reason,
    ...details,
  })
}

function roundLegacyExpectedValue(value) {
  const rounded = Math.round(value * 10) / 10
  return Number.isFinite(rounded) ? rounded : null
}

function getExactExpectedValue(summary, scope) {
  if (!isRecord(summary) || !hasOwn(summary, 'expectedValue')) {
    return createNotProjectable(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.INVALID_SHAPE,
      { scope }
    )
  }

  const expectedValue = summary.expectedValue
  if (!isRecord(expectedValue) || typeof expectedValue.kind !== 'string') {
    return createNotProjectable(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.INVALID_EXPECTED_VALUE,
      { scope }
    )
  }

  if (expectedValue.kind === 'bounded') {
    return createNotProjectable(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.BOUNDED_EXPECTED_VALUE,
      { scope }
    )
  }

  if (expectedValue.kind === 'lower-bound') {
    return createNotProjectable(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.LOWER_BOUND_EXPECTED_VALUE,
      { scope }
    )
  }

  if (
    expectedValue.kind !== 'exact'
    || !isFiniteNumber(expectedValue.value)
  ) {
    return createNotProjectable(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.INVALID_EXPECTED_VALUE,
      { scope }
    )
  }

  const value = roundLegacyExpectedValue(expectedValue.value)
  if (value === null) {
    return createNotProjectable(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.INVALID_EXPECTED_VALUE,
      { scope }
    )
  }

  return { value }
}

function createLegacyDamageDisplay(projection) {
  return {
    distribution: Array.from(projection.distribution),
    upperTailProbability: Array.from(projection.upperTailProbability),
  }
}

function getCanonicalProjection(
  canonicalDamage,
  canonicalPresentation,
  scope
) {
  const projection = projectCanonicalDamageToLegacyDisplay(canonicalDamage, {
    presentation: canonicalPresentation,
  })
  if (projection.kind === 'projected') {
    return projection
  }
  return createNotProjectable(projection.reason, {
    scope,
    causeCode: projection.causeCode,
    details: projection.details,
  })
}

function validateLegacyComboShape(combo, index) {
  if (
    !isRecord(combo)
    || !isRecord(combo.data)
    || !hasOwn(combo.data, 'score')
    || !hasOwn(combo.data, 'scoreSummary')
    || combo.data.score === null
    || combo.data.scoreSummary === null
    || combo.data.score === undefined
    || combo.data.scoreSummary === undefined
  ) {
    return createNotProjectable(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.INVALID_SHAPE,
      { scope: 'combo', comboIndex: index, comboId: combo?.id }
    )
  }
  return null
}

function createComboDisplay(combo, projection, expectedValue) {
  return {
    id: combo.id,
    name: combo.name,
    data: {
      score: cloneDisplayValue(combo.data.score),
      scoreSummary: cloneDisplayValue(combo.data.scoreSummary),
      damage: createLegacyDamageDisplay(projection),
      damageSummary: { expectedValue },
    },
  }
}

function isCanonicalComboReady(combo) {
  return combo?.data?.canonicalResultReady === true
    && combo.data.canonicalDamage !== null
    && combo.data.canonicalDamage !== undefined
    && combo.data.canonicalDamageSummary !== null
    && combo.data.canonicalDamageSummary !== undefined
}

/**
 * Build a legacy chart/summary-compatible attack display only when every
 * canonical combo and the canonical total can be represented safely.
 * Otherwise the caller can keep using the original attackData unchanged.
 */
export function createCanonicalLegacyAttackDisplay(attackData) {
  if (!isRecord(attackData)) {
    return createNotProjectable(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.INVALID_SHAPE,
      { scope: 'attack' }
    )
  }

  if (attackData.canonicalOptIn !== true) {
    return createNotReady(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_READY_REASONS.OPT_IN_DISABLED
    )
  }

  if (!Array.isArray(attackData.combos)) {
    return createNotProjectable(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_PROJECTABLE_REASONS.INVALID_SHAPE,
      { scope: 'attack' }
    )
  }

  if (attackData.canonicalTotalDamageReady !== true) {
    return createNotReady(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_READY_REASONS.TOTAL_NOT_READY,
      { scope: 'total' }
    )
  }

  if (
    attackData.canonicalTotalDamage === null
    || attackData.canonicalTotalDamage === undefined
    || attackData.canonicalTotalDamageSummary === null
    || attackData.canonicalTotalDamageSummary === undefined
  ) {
    return createNotReady(
      CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_READY_REASONS.TOTAL_NOT_READY,
      { scope: 'total' }
    )
  }

  const comboDisplays = []
  for (let index = 0; index < attackData.combos.length; index += 1) {
    const combo = attackData.combos[index]
    const invalidLegacyShape = validateLegacyComboShape(combo, index)
    if (invalidLegacyShape !== null) {
      return invalidLegacyShape
    }

    if (!isCanonicalComboReady(combo)) {
      return createNotReady(
        CANONICAL_LEGACY_ATTACK_DISPLAY_NOT_READY_REASONS.COMBO_NOT_READY,
        { scope: 'combo', comboIndex: index, comboId: combo?.id }
      )
    }

    const projection = getCanonicalProjection(
      combo.data.canonicalDamage,
      combo.data.canonicalDamagePresentation,
      'combo'
    )
    if (projection.kind !== 'projected') {
      return createNotProjectable(projection.reason, {
        ...projection,
        comboIndex: index,
        comboId: combo.id,
      })
    }

    const expectedValue = getExactExpectedValue(
      combo.data.canonicalDamageSummary,
      'combo'
    )
    if (expectedValue.kind === 'not-projectable') {
      return createNotProjectable(expectedValue.reason, {
        ...expectedValue,
        comboIndex: index,
        comboId: combo.id,
      })
    }

    comboDisplays.push(createComboDisplay(
      combo,
      projection,
      expectedValue.value
    ))
  }

  const totalProjection = getCanonicalProjection(
    attackData.canonicalTotalDamage,
    attackData.canonicalTotalDamagePresentation,
    'total'
  )
  if (totalProjection.kind !== 'projected') {
    return createNotProjectable(totalProjection.reason, {
      ...totalProjection,
      scope: 'total',
    })
  }

  const totalExpectedValue = getExactExpectedValue(
    attackData.canonicalTotalDamageSummary,
    'total'
  )
  if (totalExpectedValue.kind === 'not-projectable') {
    return totalExpectedValue
  }

  return Object.freeze({
    kind: 'projected',
    displayAttackData: {
      combos: comboDisplays,
      totalDamage: createLegacyDamageDisplay(totalProjection),
      totalDamageSummary: { expectedValue: totalExpectedValue.value },
      totalDamageReady: true,
    },
  })
}
