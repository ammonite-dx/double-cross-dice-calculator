import { describe, expect, it } from 'vitest'

import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'
import {
  CANONICAL_LEGACY_DISPLAY_NOT_PROJECTABLE_REASONS,
  projectCanonicalDamageToLegacyDisplay,
} from '../src/application/CanonicalLegacyDisplayAdapter'

function createEnvelope({
  values = [1],
  offset = 0,
  support = { kind: 'finite', max: 0 },
  overflow = null,
} = {}) {
  return Object.freeze({
    result: createDistributionResult({
      values,
      offset,
      support,
      overflow,
    }),
    metadata: Object.freeze({
      modeledDistribution: true,
      sourceSupport: Object.freeze({ kind: 'infinite' }),
    }),
  })
}

describe('projectCanonicalDamageToLegacyDisplay', () => {
  it('projects safe exact overflow into a fresh 1024-bucket display', () => {
    const canonical = createEnvelope({
      values: [0.2, 0.3],
      offset: 1022,
      support: { kind: 'finite', max: 2000 },
      overflow: {
        kind: 'exact',
        lowerBound: 1023,
        probability: 0.5,
        errorBound: 0,
      },
    })
    const presentation = Object.freeze({ kind: 'canonical-display' })
    const projected = projectCanonicalDamageToLegacyDisplay(canonical, {
      presentation,
    })

    expect(projected.kind).toBe('projected')
    expect(projected.distribution).toBeInstanceOf(Float64Array)
    expect(projected.distribution).toHaveLength(1024)
    expect(projected.distribution[1022]).toBeCloseTo(0.2, 12)
    expect(projected.distribution[1023]).toBeCloseTo(0.8, 12)
    expect(projected.upperTailProbability).toHaveLength(1024)
    expect(projected.upperTailProbability[0]).toBeCloseTo(1, 12)
    expect(projected.upperTailProbability[1023]).toBeCloseTo(0.8, 12)
    expect(projected.canonicalOverflow).toBe(canonical.result.overflow)
    expect(projected.canonicalPresentation).toBe(presentation)
    expect(projected).not.toHaveProperty('expectedValue')
  })

  it('does not project an upper-bound overflow as an actual probability', () => {
    const canonical = createEnvelope({
      values: [0.4],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 1023,
        probabilityUpperBound: 0.6,
        errorBound: 0,
      },
    })

    const result = projectCanonicalDamageToLegacyDisplay(canonical)

    expect(result).toMatchObject({
      kind: 'not-projectable',
      reason: CANONICAL_LEGACY_DISPLAY_NOT_PROJECTABLE_REASONS.UPPER_BOUND_OVERFLOW,
      canonicalOverflow: canonical.result.overflow,
    })
    expect(result).not.toHaveProperty('distribution')
    expect(result).not.toHaveProperty('upperTailProbability')
  })

  it('does not project exact overflow that may contain values below bucket 1023', () => {
    const canonical = createEnvelope({
      values: [0.4],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'exact',
        lowerBound: 1000,
        probability: 0.6,
        errorBound: 0,
      },
    })

    const result = projectCanonicalDamageToLegacyDisplay(canonical)

    expect(result).toMatchObject({
      kind: 'not-projectable',
      reason: CANONICAL_LEGACY_DISPLAY_NOT_PROJECTABLE_REASONS.UNSAFE_EXACT_OVERFLOW,
    })
    expect(result).not.toHaveProperty('distribution')
    expect(result).not.toHaveProperty('upperTailProbability')
  })

  it('reports an invalid envelope without projecting it', () => {
    const result = projectCanonicalDamageToLegacyDisplay({
      result: createDistributionResult({
        values: [1],
        support: { kind: 'finite', max: 0 },
      }),
    })

    expect(result).toMatchObject({
      kind: 'not-projectable',
      reason: CANONICAL_LEGACY_DISPLAY_NOT_PROJECTABLE_REASONS.INVALID_ENVELOPE,
      causeCode: 'invalid-schema',
    })
    expect(result).not.toHaveProperty('distribution')
  })

  it('does not alias or mutate the canonical input while projecting', () => {
    const canonical = createEnvelope({
      values: [0.5, 0.5],
      offset: 0,
      support: { kind: 'finite', max: 1 },
    })
    const valuesBefore = Array.from(canonical.result.values)
    const overflowBefore = canonical.result.overflow
    const projected = projectCanonicalDamageToLegacyDisplay(canonical)

    projected.distribution[0] = 0
    projected.upperTailProbability[0] = 0

    expect(Array.from(canonical.result.values)).toEqual(valuesBefore)
    expect(canonical.result.overflow).toBe(overflowBefore)
    expect(projected.distribution).not.toBe(canonical.result.values)
  })
})
