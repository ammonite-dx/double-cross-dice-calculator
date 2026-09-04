import { describe, expect, it } from 'vitest'

import { getDamageSummary } from '../src/calculation/DamageCalculator'
import {
  createDistributionResult,
  getExpectedValueSummary,
} from '../src/calculation/DistributionResult'

function createDamage(result) {
  return {
    result,
    metadata: {
      modeledDistribution: true,
    },
  }
}

function createValidResult() {
  return createDistributionResult({
    values: [1],
    support: { kind: 'finite', max: 0 },
    overflow: null,
  })
}

describe('canonical damage summary', () => {
  it('summarizes the canonical envelope without copying values or metadata', () => {
    const result = createDistributionResult({
      values: [0.75],
      offset: 2,
      support: { kind: 'finite', max: 8 },
      overflow: {
        kind: 'exact',
        lowerBound: 4,
        probability: 0.25,
        errorBound: 0.125,
      },
    })
    const damage = createDamage(result)
    const metadataBefore = { ...damage.metadata }
    const summary = getDamageSummary(damage)

    expect(summary).toEqual({
      expectedValue: {
        kind: 'bounded',
        lowerBound: 2.5,
        upperBound: 3.5,
      },
      mass: {
        explicitMass: 0.75,
        overflowMass: 0.25,
        overflowMassUpperBound: 0.25,
        totalMass: 1,
        totalMassUpperBound: 1,
        unrepresentedMass: 0.25,
        unrepresentedMassUpperBound: 0.25,
        errorBound: 0.125,
        isExact: true,
      },
    })
    expect(summary.expectedValue).toEqual(
      getExpectedValueSummary(result)
    )
    expect(damage.metadata).toEqual(metadataBefore)
    expect(Object.isFrozen(summary)).toBe(true)
    expect(Object.isFrozen(summary.expectedValue)).toBe(true)
    expect(Object.isFrozen(summary.mass)).toBe(true)
  })

  it('round-trips the JSON-safe canonical summary without non-finite values', () => {
    const summary = getDamageSummary(createDamage(
      createDistributionResult({
        values: [0.5],
        offset: 1,
        support: { kind: 'finite', max: 6 },
        overflow: {
          kind: 'exact',
          lowerBound: 4,
          probability: 0.5,
          errorBound: 0.25,
        },
      })
    ))
    const serialized = JSON.stringify(summary)

    expect(serialized).not.toMatch(/Infinity|NaN/)
    expect(JSON.parse(serialized)).toEqual(summary)
  })

  it.each([
    { label: 'null envelope', value: null },
    { label: 'array envelope', value: [] },
    { label: 'primitive envelope', value: 'canonical damage' },
    {
      label: 'null metadata',
      value: { result: createValidResult(), metadata: null },
    },
    {
      label: 'array metadata',
      value: { result: createValidResult(), metadata: [] },
    },
    {
      label: 'primitive metadata',
      value: { result: createValidResult(), metadata: 'metadata' },
    },
    {
      label: 'missing discriminator',
      value: { result: createValidResult(), metadata: {} },
    },
    {
      label: 'false discriminator',
      value: {
        result: createValidResult(),
        metadata: { modeledDistribution: false },
      },
    },
  ])('rejects invalid canonical damage envelope: $label', ({ value }) => {
    expect(() => getDamageSummary(value)).toThrow(TypeError)
  })

  it('rejects an invalid result even when the envelope discriminator is valid', () => {
    expect(() => getDamageSummary({
      result: null,
      metadata: { modeledDistribution: true },
    })).toThrow()
  })
})
