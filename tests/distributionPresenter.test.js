import { describe, expect, it } from 'vitest'

import {
  createDistributionResult,
  getCanonicalTotalDamageSummary,
} from '../src/calculation/DistributionResult'
import { getCanonicalDamageSummary } from '../src/calculation/DamageCalculator'
import {
  DISTRIBUTION_PRESENTATION_ERROR_CODES,
  DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH,
  DISTRIBUTION_PRESENTATION_MAX_JSON_NODES,
  DistributionPresentationError,
  presentCanonicalDistribution,
} from '../src/shared/presentation'

function createEnvelope(result, metadata = {}) {
  return {
    result,
    metadata: {
      modeledDistribution: true,
      ...metadata,
    },
  }
}

function createResult(options = {}) {
  return createDistributionResult({
    values: options.values ?? [1],
    offset: options.offset ?? 0,
    support: options.support ?? { kind: 'finite', max: 0 },
    overflow: options.overflow ?? null,
  })
}

function present(result, summary, warnings = []) {
  return presentCanonicalDistribution(createEnvelope(result), {
    summary,
    warnings,
  })
}

describe('presentCanonicalDistribution', () => {
  it('uses offset coordinates, derives explicitMax, and keeps zero probabilities', () => {
    const result = createResult({
      values: [0, 0.25, 0, 0.75],
      offset: 17,
      support: { kind: 'finite', max: 20 },
      overflow: null,
    })
    const summary = getCanonicalDamageSummary(createEnvelope(result))
    const display = present(result, summary)

    expect(display.explicit).toEqual({
      offset: 17,
      probabilities: [0, 0.25, 0, 0.75],
    })
    expect(display.explicitMax).toBe(20)
    expect(display.explicit.probabilities).not.toBe(result.values)
    expect(display).not.toHaveProperty('points')
    expect(display).not.toHaveProperty('displayWindow')
  })

  it('keeps an optional safe display window separate from canonical coverage', () => {
    const result = createResult({
      values: [0.25, 0.5, 0.25],
      offset: 10,
      support: { kind: 'finite', max: 12 },
    })
    const summary = getCanonicalDamageSummary(createEnvelope(result))
    const inputWindow = { min: 0, max: Number.MAX_SAFE_INTEGER }
    const display = presentCanonicalDistribution(createEnvelope(result), {
      summary,
      displayWindow: inputWindow,
    })

    expect(display.displayWindow).toEqual(inputWindow)
    expect(display.displayWindow).not.toBe(inputWindow)
    expect(Object.isFrozen(display.displayWindow)).toBe(true)
    inputWindow.min = 4
    expect(display.displayWindow.min).toBe(0)
    expect(display.explicit).toEqual({
      offset: 10,
      probabilities: [0.25, 0.5, 0.25],
    })
    expect(display.explicitMax).toBe(12)
  })

  it.each([
    { label: 'missing min', displayWindow: { max: 1 } },
    { label: 'missing max', displayWindow: { min: 0 } },
    { label: 'negative min', displayWindow: { min: -1, max: 1 } },
    { label: 'fractional max', displayWindow: { min: 0, max: 1.5 } },
    {
      label: 'unsafe max',
      displayWindow: { min: 0, max: Number.MAX_SAFE_INTEGER + 1 },
    },
    { label: 'reversed bounds', displayWindow: { min: 2, max: 1 } },
    { label: 'null', displayWindow: null },
  ])('rejects invalid display window data: $label', ({ displayWindow }) => {
    const result = createResult()
    const summary = getCanonicalDamageSummary(createEnvelope(result))

    expect(() => presentCanonicalDistribution(
      createEnvelope(result),
      { summary, displayWindow }
    )).toThrow(DistributionPresentationError)
  })

  it('represents empty explicit values without inventing a maximum', () => {
    const result = createResult({
      values: [],
      offset: 5,
      support: { kind: 'finite', max: 10 },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 6,
        probabilityUpperBound: 1,
        errorBound: 0,
      },
    })
    const display = present(
      result,
      getCanonicalDamageSummary(createEnvelope(result))
    )

    expect(display.explicit).toEqual({ offset: 5, probabilities: [] })
    expect(display.explicitMax).toBeNull()
  })

  it('copies finite and infinite support unions', () => {
    const finite = createResult({
      values: [0.5],
      support: { kind: 'finite', max: 9 },
      overflow: {
        kind: 'exact',
        lowerBound: 9,
        probability: 0.5,
        errorBound: 0.01,
      },
    })
    const infinite = createResult({
      values: [0.5],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'exact',
        lowerBound: 1,
        probability: 0.5,
        errorBound: 0.01,
      },
    })

    expect(present(finite, getCanonicalDamageSummary(createEnvelope(finite))))
      .toMatchObject({ support: { kind: 'finite', max: 9 } })
    expect(present(infinite, getCanonicalDamageSummary(createEnvelope(infinite))))
      .toMatchObject({ support: { kind: 'infinite' } })
  })

  it('passes a validated projection uncertainty descriptor to the display contract', () => {
    const result = createResult({
      values: [0.9],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'upper-bound',
        lowerBound: 0,
        probabilityUpperBound: 0.1,
        errorBound: 0,
      },
    })
    const envelope = createEnvelope(result, {
      projectionUncertainty: {
        positionUnknownProbabilityUpperBound: 1e-8,
        outputOverflowLowerBound: null,
      },
    })
    const display = presentCanonicalDistribution(envelope, {
      summary: getCanonicalDamageSummary(envelope),
    })

    expect(display.projectionUncertainty).toEqual({
      positionUnknownProbabilityUpperBound: 1e-8,
      outputOverflowLowerBound: null,
    })
    expect(Object.isFrozen(display.projectionUncertainty)).toBe(true)
  })

  it.each([
    {
      label: 'null',
      values: [1],
      overflow: null,
      expectedOverflow: null,
    },
    {
      label: 'exact',
      values: [0.75],
      overflow: {
        kind: 'exact',
        lowerBound: 4,
        probability: 0.25,
        errorBound: 0.1,
      },
      expectedOverflow: {
        kind: 'exact',
        lowerBound: 4,
        probability: 0.25,
        errorBound: 0.1,
      },
    },
    {
      label: 'upper-bound',
      values: [0.5],
      overflow: {
        kind: 'upper-bound',
        lowerBound: 4,
        probabilityUpperBound: 0.5,
        errorBound: 0.1,
      },
      expectedOverflow: {
        kind: 'upper-bound',
        lowerBound: 4,
        probabilityUpperBound: 0.5,
        errorBound: 0.1,
      },
    },
  ])('keeps $label overflow independent from explicit probabilities', ({
    values,
    overflow,
    expectedOverflow,
  }) => {
    const result = createResult({
      values,
      offset: 2,
      support: { kind: 'finite', max: 8 },
      overflow,
    })
    const display = present(
      result,
      getCanonicalDamageSummary(createEnvelope(result))
    )

    expect(display.explicit.probabilities).toEqual(values)
    expect(display.overflow).toEqual(expectedOverflow)
  })

  it('accepts both single-damage and total-damage summaries without recalculation', () => {
    const result = createResult({
      values: [0.5],
      offset: 2,
      support: { kind: 'finite', max: 8 },
      overflow: {
        kind: 'exact',
        lowerBound: 4,
        probability: 0.5,
        errorBound: 0.1,
      },
    })
    const envelope = createEnvelope(result)
    const singleSummary = getCanonicalDamageSummary(envelope)
    const totalSummary = getCanonicalTotalDamageSummary(envelope)

    expect(presentCanonicalDistribution(envelope, { summary: singleSummary }))
      .toMatchObject({
        expectedValue: { kind: 'bounded', lowerBound: 3, upperBound: 5 },
        mass: { totalMass: 1 },
      })
    expect(presentCanonicalDistribution(envelope, { summary: totalSummary }))
      .toMatchObject({
        expectedValue: { kind: 'bounded', lowerBound: 3, upperBound: 5 },
        mass: { totalMass: 1 },
      })
  })

  it('preserves exact, bounded, and lower-bound expected-value semantics and mass', () => {
    const exact = createResult({ values: [1] })
    const bounded = createResult({
      values: [0.5],
      support: { kind: 'finite', max: 8 },
      overflow: {
        kind: 'exact',
        lowerBound: 4,
        probability: 0.5,
        errorBound: 0.1,
      },
    })
    const lowerBound = createResult({
      values: [0.5],
      support: { kind: 'infinite' },
      overflow: {
        kind: 'exact',
        lowerBound: 4,
        probability: 0.5,
        errorBound: 0.1,
      },
    })

    expect(present(exact, getCanonicalDamageSummary(createEnvelope(exact))))
      .toMatchObject({ expectedValue: { kind: 'exact', value: 0 } })
    expect(present(bounded, getCanonicalDamageSummary(createEnvelope(bounded))))
      .toMatchObject({
        expectedValue: { kind: 'bounded', lowerBound: 2, upperBound: 4 },
        mass: {
          explicitMass: 0.5,
          overflowMass: 0.5,
          totalMass: 1,
          errorBound: 0.1,
        },
      })
    expect(present(lowerBound, getCanonicalDamageSummary(createEnvelope(lowerBound))))
      .toMatchObject({
        expectedValue: { kind: 'lower-bound', lowerBound: 2 },
        mass: { isExact: true, totalMass: 1 },
      })
  })

  it('deep-copies and freezes warnings, summary fields, and returned data', () => {
    const result = createResult({
      values: [1],
      offset: 3,
      support: { kind: 'finite', max: 3 },
    })
    const envelope = createEnvelope(result)
    const summary = getCanonicalDamageSummary(envelope)
    const warning = {
      code: 'range-warning',
      severity: 'warning',
      details: { limits: { max: 1024 }, labels: ['raw', 'display'] },
    }
    const display = presentCanonicalDistribution(envelope, {
      summary,
      warnings: [warning],
    })

    expect(display.mass).not.toBe(summary.mass)
    expect(display.expectedValue).not.toBe(summary.expectedValue)
    expect(display.warnings[0]).not.toBe(warning)
    expect(display.warnings[0].details).not.toBe(warning.details)
    expect(display.warnings[0].details.limits).not.toBe(warning.details.limits)
    expect(Object.isFrozen(display)).toBe(true)
    expect(Object.isFrozen(display.explicit)).toBe(true)
    expect(Object.isFrozen(display.explicit.probabilities)).toBe(true)
    expect(Object.isFrozen(display.mass)).toBe(true)
    expect(Object.isFrozen(display.expectedValue)).toBe(true)
    expect(Object.isFrozen(display.warnings)).toBe(true)
    expect(Object.isFrozen(display.warnings[0])).toBe(true)
    expect(Object.isFrozen(display.warnings[0].details)).toBe(true)
    expect(Object.isFrozen(display.warnings[0].details.limits)).toBe(true)
    expect(warning).toEqual({
      code: 'range-warning',
      severity: 'warning',
      details: { limits: { max: 1024 }, labels: ['raw', 'display'] },
    })
  })

  it.each([
    { label: 'missing code', warning: { severity: 'warning' } },
    { label: 'invalid severity', warning: { code: 'x', severity: 'fatal' } },
    { label: 'non-plain warning', warning: new Date() },
    {
      label: 'nested non-finite number',
      warning: { code: 'x', severity: 'info', details: { value: NaN } },
    },
    {
      label: 'nested function',
      warning: { code: 'x', severity: 'info', details: { transform() {} } },
    },
  ])('rejects invalid warning data: $label', ({ warning }) => {
    const result = createResult()
    expect(() => present(
      result,
      getCanonicalDamageSummary(createEnvelope(result)),
      [warning]
    )).toThrow(DistributionPresentationError)
  })

  it('rejects circular warnings with a typed presentation error', () => {
    const warning = { code: 'x', severity: 'warning' }
    warning.details = warning
    const result = createResult()

    expect(() => present(
      result,
      getCanonicalDamageSummary(createEnvelope(result)),
      [warning]
    )).toThrow(DistributionPresentationError)
  })

  it('does not modify inputs or expose typed values or summary aliases', () => {
    const values = new Float64Array([0.25, 0, 0.75])
    const result = createDistributionResult({
      values,
      offset: 4,
      support: { kind: 'finite', max: 6 },
      overflow: null,
    })
    const envelope = createEnvelope(result)
    const summary = getCanonicalDamageSummary(envelope)
    const valuesBefore = Array.from(values)
    const metadataBefore = { ...envelope.metadata }
    const display = presentCanonicalDistribution(envelope, { summary })

    expect(Array.from(values)).toEqual(valuesBefore)
    expect(Array.from(result.values)).toEqual(valuesBefore)
    expect(envelope.metadata).toEqual(metadataBefore)
    expect(display.explicit.probabilities).not.toBe(values)
    expect(display.mass).not.toBe(summary.mass)
    expect(display.expectedValue).not.toBe(summary.expectedValue)
  })

  it('round-trips through JSON and keeps a flat probability shape for large arrays', () => {
    const values = new Float64Array(2048)
    values[0] = 0.5
    values[2047] = 0.5
    const result = createDistributionResult({
      values,
      offset: 100,
      support: { kind: 'finite', max: 2147 },
      overflow: null,
    })
    const display = present(
      result,
      getCanonicalDamageSummary(createEnvelope(result))
    )

    expect(display.explicit.probabilities).toHaveLength(2048)
    expect(display.explicit.probabilities.every(
      (probability) => typeof probability === 'number'
    )).toBe(true)
    expect(display.explicit.probabilities.some(
      (probability) => probability === 0
    )).toBe(true)
    expect(JSON.parse(JSON.stringify(display))).toEqual(display)
  })

  it.each([
    null,
    [],
    { result: createResult(), metadata: {} },
    { result: {}, metadata: { modeledDistribution: true } },
  ])('rejects invalid canonical envelopes with a typed error', (envelope) => {
    const result = createResult()
    const summary = getCanonicalDamageSummary(createEnvelope(result))
    expect(() => presentCanonicalDistribution(envelope, { summary }))
      .toThrow(DistributionPresentationError)
  })

  it.each([
    undefined,
    null,
    {},
    { mass: {}, expectedValue: {} },
    {
      mass: {
        explicitMass: 1,
        overflowMass: null,
        overflowMassUpperBound: 0,
        totalMass: 1,
        totalMassUpperBound: 1,
        unrepresentedMass: null,
        unrepresentedMassUpperBound: 0,
        errorBound: 0,
        isExact: true,
      },
      expectedValue: { kind: 'not-a-kind' },
    },
  ])('rejects invalid summaries with a typed error', (summary) => {
    const result = createResult()
    expect(() => presentCanonicalDistribution(
      createEnvelope(result),
      { summary }
    )).toThrow(DistributionPresentationError)
  })

  it('rejects prototype-derived modeled metadata and summary fields', () => {
    const previousModeledDistribution = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'modeledDistribution'
    )
    const previousErrorBound = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'errorBound'
    )
    const previousKind = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'kind'
    )

    try {
      Object.defineProperty(Object.prototype, 'modeledDistribution', {
        configurable: true,
        value: true,
      })
      const result = createResult()
      const summary = getCanonicalDamageSummary(createEnvelope(result))
      const inheritedMetadata = Object.create(Object.prototype)

      expect(() => presentCanonicalDistribution(
        { result, metadata: inheritedMetadata },
        { summary }
      )).toThrow(DistributionPresentationError)

      Object.defineProperty(Object.prototype, 'errorBound', {
        configurable: true,
        value: 0,
      })
      Object.defineProperty(Object.prototype, 'kind', {
        configurable: true,
        value: 'exact',
      })
      const mass = { ...summary.mass }
      delete mass.errorBound
      const expectedValue = { value: summary.expectedValue.value }

      expect(() => presentCanonicalDistribution(
        createEnvelope(result),
        { summary: { mass, expectedValue } }
      )).toThrow(DistributionPresentationError)

      expect(() => presentCanonicalDistribution(
        createEnvelope(result),
        {
          summary: {
            mass: { ...summary.mass },
            expectedValue,
          },
        }
      )).toThrow(DistributionPresentationError)
    } finally {
      if (previousModeledDistribution) {
        Object.defineProperty(
          Object.prototype,
          'modeledDistribution',
          previousModeledDistribution
        )
      } else {
        delete Object.prototype.modeledDistribution
      }
      if (previousErrorBound) {
        Object.defineProperty(
          Object.prototype,
          'errorBound',
          previousErrorBound
        )
      } else {
        delete Object.prototype.errorBound
      }
      if (previousKind) {
        Object.defineProperty(Object.prototype, 'kind', previousKind)
      } else {
        delete Object.prototype.kind
      }
    }
  })

  it('rejects summary accessors before executing their getters', () => {
    const result = createResult()
    const baseSummary = getCanonicalDamageSummary(createEnvelope(result))
    let getterCalled = false
    const summary = {
      ...baseSummary,
    }
    Object.defineProperty(summary, 'mass', {
      configurable: true,
      enumerable: true,
      get() {
        getterCalled = true
        throw new Error('native getter failure')
      },
    })

    expect(() => presentCanonicalDistribution(
      createEnvelope(result),
      { summary }
    )).toThrow(DistributionPresentationError)
    expect(getterCalled).toBe(false)
  })

  it('rejects JSON copies that exceed the depth limit with a typed error', () => {
    const result = createResult()
    const baseSummary = getCanonicalDamageSummary(createEnvelope(result))
    let nested = { leaf: true }
    for (
      let index = 0;
      index <= DISTRIBUTION_PRESENTATION_MAX_JSON_DEPTH;
      index += 1
    ) {
      nested = { next: nested }
    }
    const summary = {
      mass: { ...baseSummary.mass, nested },
      expectedValue: { ...baseSummary.expectedValue },
    }

    expect(() => presentCanonicalDistribution(
      createEnvelope(result),
      { summary }
    )).toThrow(DistributionPresentationError)
  })

  it('rejects JSON copies that exceed the total node limit', () => {
    const result = createResult()
    const summary = getCanonicalDamageSummary(createEnvelope(result))
    const details = new Array(DISTRIBUTION_PRESENTATION_MAX_JSON_NODES)
      .fill(0)

    expect(() => presentCanonicalDistribution(
      createEnvelope(result),
      {
        summary,
        warnings: [{ code: 'large-warning', severity: 'warning', details }],
      }
    )).toThrow(DistributionPresentationError)
  })

  it('memoizes repeated warning subtrees without changing JSON tree semantics', () => {
    const result = createResult()
    const summary = getCanonicalDamageSummary(createEnvelope(result))
    const sharedDetails = new Array(5_000).fill(0)
    const display = presentCanonicalDistribution(
      createEnvelope(result),
      {
        summary,
        warnings: [
          { code: 'first', severity: 'warning', details: sharedDetails },
          { code: 'second', severity: 'warning', details: sharedDetails },
        ],
      }
    )

    expect(display.warnings[0].details)
      .toBe(display.warnings[1].details)
    expect(JSON.parse(JSON.stringify(display.warnings)))
      .toEqual(display.warnings)
  })

  it('rejects null and other invalid options with a typed error code', () => {
    const result = createResult()
    const summary = getCanonicalDamageSummary(createEnvelope(result))

    expect(() => presentCanonicalDistribution(
      createEnvelope(result),
      null
    )).toThrow(DistributionPresentationError)

    try {
      presentCanonicalDistribution(createEnvelope(result), null)
    } catch (error) {
      expect(error.code)
        .toBe(DISTRIBUTION_PRESENTATION_ERROR_CODES.INVALID_OPTIONS)
    }

    expect(() => presentCanonicalDistribution(
      createEnvelope(result),
      { summary, warnings: null }
    )).toThrow(DistributionPresentationError)
  })

  it('accepts planner reject warnings without remapping their severity', () => {
    const result = createResult()
    const summary = getCanonicalDamageSummary(createEnvelope(result))
    const display = presentCanonicalDistribution(
      createEnvelope(result),
      {
        summary,
        warnings: [{ code: 'hard-limit', severity: 'reject' }],
      }
    )

    expect(display.warnings).toEqual([
      { code: 'hard-limit', severity: 'reject' },
    ])
  })
})
