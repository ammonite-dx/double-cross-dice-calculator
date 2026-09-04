import { describe, expect, it } from 'vitest'

import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'
import { getDamageSummary } from '../src/calculation/DamageCalculator'
import {
  DISTRIBUTION_PRESENTATION_ERROR_CODES,
  DistributionPresentationError,
  presentDistribution,
} from '../src/shared/presentation'

function createEnvelope({
  values,
  offset,
  support,
  overflow,
}) {
  const result = createDistributionResult({
    values,
    offset,
    support,
    overflow,
  })
  return {
    result,
    metadata: { modeledDistribution: true },
  }
}

// These are intentionally producer-neutral envelopes. Check and Backtrack do
// not consume this contract yet; the fixture only fixes the shared display
// meanings before their Phase 4/6 producer work begins.
const GOLDEN_FIXTURES = [
  {
    path: 'attack',
    envelope: {
      values: [0.5, 0.5],
      offset: 2,
      support: { kind: 'finite', max: 3 },
      overflow: null,
    },
    expected: {
      explicit: { offset: 2, probabilities: [0.5, 0.5] },
      explicitMax: 3,
      support: { kind: 'finite', max: 3 },
      overflow: null,
      expectedValue: { kind: 'exact', value: 2.5 },
      mass: { explicitMass: 1, totalMass: 1, isExact: true },
    },
  },
  {
    path: 'check',
    envelope: {
      values: [0.25],
      offset: 0,
      support: { kind: 'finite', max: 4 },
      overflow: {
        kind: 'exact',
        lowerBound: 2,
        probability: 0.75,
        errorBound: 0.01,
      },
    },
    expected: {
      explicit: { offset: 0, probabilities: [0.25] },
      explicitMax: 0,
      support: { kind: 'finite', max: 4 },
      overflow: {
        kind: 'exact',
        lowerBound: 2,
        probability: 0.75,
        errorBound: 0.01,
      },
      expectedValue: { kind: 'bounded', lowerBound: 1.5, upperBound: 3 },
      mass: {
        explicitMass: 0.25,
        overflowMass: 0.75,
        totalMass: 1,
        isExact: true,
      },
    },
  },
  {
    path: 'backtrack',
    envelope: {
      values: [0.5],
      offset: 1,
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 3,
        probabilityUpperBound: 0.5,
        errorBound: 0.02,
      },
    },
    expected: {
      explicit: { offset: 1, probabilities: [0.5] },
      explicitMax: 1,
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 3,
        probabilityUpperBound: 0.5,
        errorBound: 0.02,
      },
      expectedValue: { kind: 'lower-bound', lowerBound: 0.5 },
      mass: {
        explicitMass: 0.5,
        overflowMass: null,
        totalMass: null,
        isExact: false,
      },
    },
  },
]

describe('shared canonical display contract golden fixtures', () => {
  it.each(GOLDEN_FIXTURES)(
    'preserves $path support, coverage, tail, mass, and expected-value meanings',
    ({ envelope: fixture, expected }) => {
      const envelope = createEnvelope(fixture)
      const display = presentDistribution(envelope, {
        summary: getDamageSummary(envelope),
        warnings: [{ code: `${fixture.path}-range`, severity: 'warning' }],
        displayWindow: { min: 0, max: 8 },
      })

      expect(display).toMatchObject({
        displayWindow: { min: 0, max: 8 },
        ...expected,
        warnings: [{ code: `${fixture.path}-range`, severity: 'warning' }],
      })
      // A window is not a projection: all canonical explicit values remain.
      expect(display.explicit.probabilities).toHaveLength(
        fixture.values.length
      )
    }
  )

  it('rejects signed result offsets at the non-negative display boundary', () => {
    const envelope = createEnvelope({
      values: [1],
      offset: -1,
      support: { kind: 'finite', max: -1 },
      overflow: null,
    })

    expect(() => presentDistribution(envelope, {
      summary: getDamageSummary(envelope),
    })).toThrowError(
      expect.objectContaining({
        code: DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_ENVELOPE,
      })
    )
    expect(() => presentDistribution(envelope, {
      summary: getDamageSummary(envelope),
    })).toThrow(DistributionPresentationError)
  })
})
