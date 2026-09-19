import { describe, expect, it, vi } from 'vitest'

import {
  planDamageAggregation,
  sumDamage,
} from '../src/calculation/DamageAggregation'
import { calculateDamageOnDemand } from '../src/calculation/DamageCalculator'
import { calculateDxDistribution } from '../src/calculation/DxCalculator'
import { planCalculationRanges } from '../src/calculation/RangePlanner'
import { calculateScore } from '../src/calculation/ScoreCalculator'
import { generateMixedDamageDistribution } from '../src/calculation/RuntimeDamageRollCalculator'
import {
  createDistributionResult,
} from '../src/calculation/DistributionResult'
import { getTotalDamageStatistics } from '../src/calculation/DamageStatistics'

const DEDICATED_CERTIFICATE = Object.freeze({
  version: 1,
  kind: 'damage-expectation-certificate',
})

function createEnvelope({
  value = 0,
  certificate = null,
  overflow = null,
  support = { kind: 'finite', max: value },
  sourceSupport = { kind: 'finite', max: value },
}) {
  const metadata = {
    modeledDistribution: true,
    sourceSupport,
  }
  if (certificate !== null) {
    metadata.damageExpectationCertificate = certificate
  }
  const values = new Float64Array(value + 1)
  values[value] = 1
  return {
    result: createDistributionResult({
      values,
      support,
      overflow,
    }),
    metadata,
  }
}

function dedicatedEnvelope(lowerBound, upperBound) {
  return createEnvelope({
    certificate: {
      ...DEDICATED_CERTIFICATE,
      lowerBound,
      upperBound,
    },
  })
}

function genericBoundedEnvelope() {
  return createEnvelope({
    value: 0,
    support: { kind: 'finite', max: 10 },
    overflow: {
      kind: 'upper-bound',
      lowerBound: 1,
      probabilityUpperBound: 0.5,
      errorBound: 0,
    },
  })
}

function genericLowerBoundEnvelope() {
  return createEnvelope({
    value: 0,
    support: { kind: 'infinite' },
    sourceSupport: { kind: 'infinite' },
    overflow: {
      kind: 'upper-bound',
      lowerBound: 1,
      probabilityUpperBound: 0.5,
      errorBound: 0,
    },
  })
}

function calculateScoreEnvelope(params, scorePlan, fix = false) {
  return calculateScore(
    params,
    {
      getDxDistribution: (shihai, dice, critical, options, yousei = 0) =>
        calculateDxDistribution(
          { shihai, dice, critical, yousei },
          options
        ),
    },
    scorePlan,
    fix
  )
}

async function calculateFullTailDamage(scoreParams, attack, defence) {
  const rangePlan = planCalculationRanges({
    operation: 'attack',
    score: {
      action: scoreParams.action,
      reaction: scoreParams.reaction,
    },
    attack,
    defence,
  })
  const score = {
    action: calculateScoreEnvelope(scoreParams.action, rangePlan.scores[0]),
    reaction: calculateScoreEnvelope(scoreParams.reaction, rangePlan.scores[1]),
  }
  const damage = await calculateDamageOnDemand(
    score,
    attack,
    defence,
    { getDamageRollDistribution: generateMixedDamageDistribution },
    {},
    rangePlan
  )
  return { damage, rangePlan }
}

describe('Total Damage expected-value certificate propagation', () => {
  it('sums bounded component intervals', () => {
    const total = sumDamage([
      dedicatedEnvelope(1, 2),
      dedicatedEnvelope(3, 4),
    ])

    expect(total.metadata.damageExpectationCertificate).toEqual({
      version: 1,
      kind: 'damage-expectation-certificate',
      lowerBound: 4,
      upperBound: 6,
    })
    expect(getTotalDamageStatistics(total).expectedValue).toEqual({
      kind: 'bounded',
      lowerBound: 4,
      upperBound: 6,
    })
  })

  it('combines a dedicated bounded component with a generic exact one', () => {
    const total = sumDamage([
      dedicatedEnvelope(1, 2),
      createEnvelope({ value: 3 }),
    ])

    expect(total.metadata.damageExpectationCertificate).toMatchObject({
      lowerBound: 4,
      upperBound: 5,
    })
    expect(getTotalDamageStatistics(total).expectedValue).toEqual({
      kind: 'bounded',
      lowerBound: 4,
      upperBound: 5,
    })
  })

  it('combines a dedicated bounded component with a generic bounded one', () => {
    const total = sumDamage([
      dedicatedEnvelope(1, 2),
      genericBoundedEnvelope(),
    ])

    expect(total.metadata.damageExpectationCertificate).toMatchObject({
      lowerBound: 1,
      upperBound: 7,
    })
    expect(getTotalDamageStatistics(total).expectedValue.kind).toBe('bounded')
  })

  it('fails closed when a component has only a generic lower bound', () => {
    const total = sumDamage([
      dedicatedEnvelope(1, 2),
      genericLowerBoundEnvelope(),
    ])

    expect(total.metadata.damageExpectationCertificate).toBeNull()
    expect(getTotalDamageStatistics(total).expectedValue.kind)
      .toBe('lower-bound')
  })

  it('keeps exact-only components on the generic exact path', () => {
    const total = sumDamage([
      createEnvelope({ value: 2 }),
      createEnvelope({ value: 3 }),
    ])

    expect(total.metadata.damageExpectationCertificate).toBeNull()
    expect(getTotalDamageStatistics(total).expectedValue).toEqual({
      kind: 'exact',
      value: 5,
    })
  })

  it('returns the exact zero identity for no components', () => {
    const total = sumDamage([])

    expect(total.metadata.damageExpectationCertificate).toBeNull()
    expect(getTotalDamageStatistics(total).expectedValue).toEqual({
      kind: 'exact',
      value: 0,
    })
  })

  it('propagates one dedicated bounded component without FFT', () => {
    const onFftLength = vi.fn()
    const component = dedicatedEnvelope(1, 2)
    const total = sumDamage([component], { onFftLength })

    expect(onFftLength).not.toHaveBeenCalled()
    expect(total.metadata.damageExpectationCertificate).toEqual({
      version: 1,
      kind: 'damage-expectation-certificate',
      lowerBound: 1,
      upperBound: 2,
    })
  })

  it('uses the planned expectation snapshot after metadata mutation', () => {
    const first = dedicatedEnvelope(1, 2)
    const second = createEnvelope({ value: 3 })
    const damages = [first, second]
    const plan = planDamageAggregation(damages)

    first.metadata.damageExpectationCertificate.lowerBound = 100
    first.metadata.damageExpectationCertificate.upperBound = 200

    const total = sumDamage(damages, { plan })
    expect(total.metadata.damageExpectationCertificate).toMatchObject({
      lowerBound: 4,
      upperBound: 5,
    })
  })

  it('falls back when a dedicated certificate is malformed', () => {
    const total = sumDamage([
      createEnvelope({
        value: 2,
        certificate: {
          version: 999,
          kind: 'damage-expectation-certificate',
          lowerBound: 0,
          upperBound: 100,
        },
      }),
      createEnvelope({ value: 3 }),
    ])

    expect(total.metadata.damageExpectationCertificate).toBeNull()
    expect(getTotalDamageStatistics(total).expectedValue).toEqual({
      kind: 'exact',
      value: 5,
    })
  })

  it('propagates an ordinary and an action Yousei Damage result end to end', async () => {
    const attack = { dice: 0, value: 0, kazanari: 0 }
    const defence = { dice: 0, value: 0 }
    const ordinary = await calculateFullTailDamage({
      action: { dice: 1, critical: 10, shihai: 0, yousei: 0, skill: 0 },
      reaction: { dice: 0, critical: 11, shihai: 0, yousei: 0, skill: 0 },
    }, attack, defence)
    const yousei = await calculateFullTailDamage({
      action: { dice: 1, critical: 10, shihai: 0, yousei: 1, skill: 0 },
      reaction: { dice: 0, critical: 11, shihai: 0, yousei: 0, skill: 0 },
    }, attack, defence)

    expect(ordinary.damage.metadata.damageExpectationCertificate)
      .not.toBeNull()
    expect(yousei.damage.metadata.damageExpectationCertificate)
      .not.toBeNull()

    const total = sumDamage([
      ordinary.damage,
      yousei.damage,
    ])
    const certificate = total.metadata.damageExpectationCertificate

    expect(certificate).not.toBeNull()
    expect(getTotalDamageStatistics(total).expectedValue.kind)
      .toBe('bounded')
    expect(certificate.lowerBound).toBeCloseTo(
      ordinary.damage.metadata.damageExpectationCertificate.lowerBound
        + yousei.damage.metadata.damageExpectationCertificate.lowerBound,
      12
    )
    expect(certificate.upperBound).toBeCloseTo(
      ordinary.damage.metadata.damageExpectationCertificate.upperBound
        + yousei.damage.metadata.damageExpectationCertificate.upperBound,
      12
    )
  })
})
