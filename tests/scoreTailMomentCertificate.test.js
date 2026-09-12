import { describe, expect, it } from 'vitest'

import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import {
  calculateScore,
} from '../src/calculation/ScoreCalculator'
import { scoreTailBound } from '../src/calculation/DxTailModel'
import { planCalculationRanges } from '../src/calculation/RangePlanner'

function calculatePlannedScore(params) {
  const plan = planCalculationRanges({
    operation: 'score',
    score: params,
  }).scores[0]
  const envelope = calculateScore(
    params,
    {
      getDxDistribution: (shihai, dice, critical, options, yousei = 0) =>
        calculateDxDistribution(
          { shihai, dice, critical, yousei },
          options
        ),
    },
    plan
  )
  return { plan, envelope }
}

function calculateScoreAtCutoff(params, workingMax) {
  const plan = {
    workingLength: workingMax + 2,
    workingMax,
    tail: { bound: scoreTailBound(workingMax, params) },
  }
  const envelope = calculateScore(
    params,
    {
      getDxDistribution: (shihai, dice, critical, options, yousei = 0) =>
        calculateDxDistribution(
          { shihai, dice, critical, yousei },
          options
        ),
    },
    plan
  )
  return { plan, envelope }
}

function approximateTailFirstMoment(params, cutoff, workingLength = 8194) {
  const distribution = calculateDxDistribution(
    {
      dice: params.dice,
      critical: params.critical,
      shihai: params.shihai,
      yousei: 0,
    },
    { workingLength, rounding: 'unrounded' }
  )
  let firstMoment = 0
  for (let value = cutoff + 1; value < distribution.length - 1; value += 1) {
    firstMoment += Math.max(0, value + params.skill) * distribution[value]
  }
  return firstMoment
}

describe('Score tail first-moment certificate', () => {
  it('certifies finite support with zero tail mass and moment', () => {
    const { plan, envelope } = calculatePlannedScore({
      dice: 2,
      critical: 11,
      shihai: 0,
      yousei: 3,
      skill: 4,
    })
    const certificate = envelope.metadata.scoreTailMomentCertificate

    expect(certificate).toEqual({
      version: 1,
      kind: 'score-tail-moment-certificate',
      model: 'finite-support',
      modeledMax: plan.workingMax,
      massUpperBound: 0,
      firstMomentUpperBound: 0,
      numericalErrorBound: 0,
    })
    expect(Object.isFrozen(certificate)).toBe(true)
  })

  it.each([
    { critical: 10, model: 'dx-max-tail' },
    { critical: 8, model: 'dx-max-tail' },
    { critical: 5, model: 'dx-max-tail' },
  ])('certifies ordinary DX tail for critical=$critical', ({ critical, model }) => {
    const { envelope } = calculatePlannedScore({
      dice: 2,
      critical,
      shihai: 0,
      yousei: 0,
      skill: 0,
    })
    const certificate = envelope.metadata.scoreTailMomentCertificate
    const massCertificate = envelope.metadata.scoreTailCertificate

    expect(certificate).toEqual(expect.objectContaining({
      kind: 'score-tail-moment-certificate',
      model,
      massUpperBound: expect.any(Number),
      firstMomentUpperBound: expect.any(Number),
      numericalErrorBound: expect.any(Number),
    }))
    expect(certificate.massUpperBound)
      .toBeGreaterThanOrEqual(massCertificate.massUpperBound)
    expect(certificate.firstMomentUpperBound).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(certificate.firstMomentUpperBound)).toBe(true)
  })

  it.each([
    { critical: 10, dice: 2, skill: 4, shihai: 0 },
    { critical: 8, dice: 2, skill: -3, shihai: 0 },
    { critical: 5, dice: 2, skill: 0, shihai: 0 },
    { critical: 8, dice: 3, skill: 2, shihai: 1 },
  ])('encloses an independently enumerated raw tail ($critical, $dice D, skill $skill, shihai $shihai)', ({ critical, dice, skill, shihai }) => {
    const params = {
      dice,
      critical,
      shihai,
      yousei: 0,
      skill,
    }
    const cutoff = 40
    const { envelope } = calculateScoreAtCutoff(params, cutoff)
    const certificate = envelope.metadata.scoreTailMomentCertificate
    const oracleLowerEstimate = approximateTailFirstMoment(params, cutoff)

    expect(certificate).not.toBeNull()
    expect(oracleLowerEstimate)
      .toBeLessThanOrEqual(certificate.firstMomentUpperBound + 1e-10)
  })

  it('includes the W+1 boundary term and positive skill contribution', () => {
    const params = {
      dice: 1,
      critical: 10,
      shihai: 0,
      yousei: 0,
      skill: 7,
    }
    const { plan, envelope } = calculatePlannedScore(params)
    const certificate = envelope.metadata.scoreTailMomentCertificate
    const boundary = (plan.workingMax + 1) * certificate.massUpperBound
    const skill = params.skill * certificate.massUpperBound

    expect(certificate.boundaryContributionUpperBound).toBeCloseTo(boundary, 12)
    expect(certificate.skillContributionUpperBound).toBeCloseTo(skill, 12)
    expect(certificate.firstMomentUpperBound).toBeGreaterThanOrEqual(
      boundary + certificate.residualUpperBound + skill
    )
  })

  it('keeps negative skill supported without a negative tail correction', () => {
    const params = {
      dice: 2,
      critical: 8,
      shihai: 0,
      yousei: 0,
      skill: -6,
    }
    const { envelope } = calculatePlannedScore(params)
    const certificate = envelope.metadata.scoreTailMomentCertificate

    expect(certificate).not.toBeNull()
    expect(certificate.skillContributionUpperBound).toBe(0)
    expect(certificate.firstMomentUpperBound).toBeGreaterThanOrEqual(0)
  })

  it('uses maximum-DX domination for Shihai', () => {
    const { envelope } = calculatePlannedScore({
      dice: 5,
      critical: 8,
      shihai: 2,
      yousei: 0,
      skill: 3,
    })
    const certificate = envelope.metadata.scoreTailMomentCertificate

    expect(certificate).toEqual(expect.objectContaining({
      kind: 'score-tail-moment-certificate',
      model: 'dx-max-domination',
    }))
  })

  it('does not claim a first moment for a non-finite Yousei tail', () => {
    const { envelope } = calculatePlannedScore({
      dice: 3,
      critical: 8,
      shihai: 0,
      yousei: 1,
      skill: 0,
    })

    expect(envelope.result.support).toEqual({ kind: 'infinite' })
    expect(envelope.metadata.scoreTailCertificate).not.toBeNull()
    expect(envelope.metadata.scoreTailMomentCertificate).toBeNull()
  })

  it('does not decrease the upper bound when positive skill grows', () => {
    const base = calculatePlannedScore({
      dice: 2,
      critical: 8,
      shihai: 0,
      yousei: 0,
      skill: 0,
    }).envelope.metadata.scoreTailMomentCertificate
    const shifted = calculatePlannedScore({
      dice: 2,
      critical: 8,
      shihai: 0,
      yousei: 0,
      skill: 10,
    }).envelope.metadata.scoreTailMomentCertificate

    expect(shifted.firstMomentUpperBound)
      .toBeGreaterThanOrEqual(base.firstMomentUpperBound)
  })
})
