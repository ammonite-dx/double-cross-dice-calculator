import { describe, expect, it } from 'vitest'

import {
  classifySafeSlice,
  deriveCandidateExpectationBound,
  sumExplicitFirstMoment,
  sumExplicitMass,
  summarizeDistributionResult,
} from '../experiments/r23-damage-summary-precision/tail-attribution.mjs'
import { DAMAGE_PRECISION_FIXTURES } from '../experiments/r23-damage-summary-precision/fixtures.js'

function distribution(values, offset = 0, overflow = null) {
  return {
    values: Float64Array.from(values),
    offset,
    support: { kind: 'infinite' },
    overflow,
  }
}

describe('R23 damage tail attribution helpers', () => {
  it('summarizes explicit mass and first moment without assigning overflow', () => {
    const result = distribution(
      [0.25, 0.5, 0.25],
      4,
      {
        kind: 'upper-bound',
        lowerBound: 7,
        probabilityUpperBound: 0.1,
        errorBound: 0.001,
      },
    )

    expect(sumExplicitMass(result)).toBe(1)
    expect(sumExplicitFirstMoment(result)).toBe(5)
    expect(summarizeDistributionResult(result)).toEqual({
      offset: 4,
      explicitLength: 3,
      explicitMax: 6,
      explicitMass: 1,
      explicitFirstMoment: 5,
      support: { kind: 'infinite', max: null },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 7,
        probability: null,
        probabilityUpperBound: 0.1,
        errorBound: 0.001,
      },
    })
  })

  it('recognizes the public default as the restricted safe slice', () => {
    const fixture = DAMAGE_PRECISION_FIXTURES.find(
      ({ id }) => id === 'public-v3-1-default',
    )
    const actionScoreEnvelope = {
      metadata: {
        scoreExpectationCertificate: {
          kind: 'score-expectation-certificate',
        },
      },
    }

    expect(classifySafeSlice(fixture.params, actionScoreEnvelope)).toEqual({
      eligible: true,
      checks: {
        kazanariZero: true,
        defenceDiceZero: true,
        nonNegativeFixedDifference: true,
        actionScoreExpectationCertificate: true,
        actionShihaiZero: true,
        actionYouseiZero: true,
      },
      reasons: [],
      fixedDifference: 0,
    })
  })

  it('derives only a research candidate from a score expectation certificate', () => {
    const params = DAMAGE_PRECISION_FIXTURES.find(
      ({ id }) => id === 'public-v3-1-default',
    ).params
    const actionScoreEnvelope = {
      result: distribution([0.4, 0.6]),
      metadata: {
        scoreExpectationCertificate: {
          lowerBound: 5,
          upperBound: 6,
        },
        scoreTailCertificate: { massUpperBound: 0.01 },
      },
    }
    const damageEnvelope = {
      result: distribution([0.5, 0.5]),
    }
    const safeSlice = classifySafeSlice(params, actionScoreEnvelope)
    const candidate = deriveCandidateExpectationBound({
      params,
      actionScoreEnvelope,
      damageEnvelope,
      damageStatistics: { expectedValue: { kind: 'lower-bound' } },
      safeSlice,
    })

    expect(candidate.status).toBe('finite-candidate-only')
    expect(candidate.lowerBound).toBe(0.5)
    expect(candidate.upperBound).toBe(8.8)
    expect(candidate.width).toBe(8.3)
    expect(candidate.formula).toContain('E[actionScore] / 10')
  })

  it('does not invent a bound when the safe-slice certificate is missing', () => {
    const fixture = DAMAGE_PRECISION_FIXTURES.find(
      ({ id }) => id === 'kazanari-one',
    )
    const actionScoreEnvelope = {
      result: distribution([1]),
      metadata: {},
    }
    const damageEnvelope = {
      result: distribution([1]),
    }
    const safeSlice = classifySafeSlice(fixture.params, actionScoreEnvelope)
    const candidate = deriveCandidateExpectationBound({
      params: fixture.params,
      actionScoreEnvelope,
      damageEnvelope,
      damageStatistics: { expectedValue: { kind: 'lower-bound' } },
      safeSlice,
    })

    expect(candidate.status).toBe('insufficient-certificate')
    expect(candidate.upperBound).toBeNull()
    expect(candidate.reason).toContain('safe slice')
  })
})
