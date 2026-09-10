import { describe, expect, it } from 'vitest'

import { summarizeRecords } from '../experiments/r23-damage-summary-precision/summary.mjs'

function record(id, kind, { halfWidth = null, stableRoundedDisplay = false } = {}) {
  return {
    id,
    expectedValue: {
      kind,
      halfWidth,
      stableRoundedDisplay,
      diagnosticMidpoint: kind === 'lower-bound' ? null : 1,
      pointEstimateSource: kind === 'exact' ? 'certified-exact' : 'not-provided-by-model',
    },
  }
}

describe('R23 damage precision audit summary', () => {
  it('counts only unstable bounded records as additional approximation candidates', () => {
    const summary = summarizeRecords([
      record('exact', 'exact', { halfWidth: 0, stableRoundedDisplay: true }),
      record('lower-bound', 'lower-bound'),
      record('stable-bounded', 'bounded', { halfWidth: 0.001, stableRoundedDisplay: true }),
      record('unstable-005', 'bounded', { halfWidth: 0.004 }),
      record('unstable-010', 'bounded', { halfWidth: 0.008 }),
      record('unstable-020', 'bounded', { halfWidth: 0.015 }),
      record('unstable-over', 'bounded', { halfWidth: 0.03 }),
    ])

    expect(summary.kindCounts).toEqual({ exact: 1, 'lower-bound': 1, bounded: 5 })
    expect(summary.stableRoundedBoundedCount).toBe(1)
    expect(summary.unstableRoundedBoundedCount).toBe(4)
    expect(summary.additionalApproximationCandidateCounts).toEqual({
      'halfWidth<=0.005': 1,
      'halfWidth<=0.010': 2,
      'halfWidth<=0.020': 3,
    })
    expect(summary.additionalApproximationCandidates).toEqual({
      'halfWidth<=0.005': ['unstable-005'],
      'halfWidth<=0.010': ['unstable-005', 'unstable-010'],
      'halfWidth<=0.020': ['unstable-005', 'unstable-010', 'unstable-020'],
    })
    expect(summary.allFiniteIntervalThresholdCounts).toEqual({
      'halfWidth<=0.005': 3,
      'halfWidth<=0.010': 4,
      'halfWidth<=0.020': 5,
    })
  })

  it('excludes exact, lower-bound, and stable rounded bounded records', () => {
    const summary = summarizeRecords([
      record('exact', 'exact', { halfWidth: 0, stableRoundedDisplay: true }),
      record('lower-bound', 'lower-bound', { halfWidth: 0.001 }),
      record('stable-bounded', 'bounded', { halfWidth: 0.001, stableRoundedDisplay: true }),
    ])

    expect(summary.additionalApproximationCandidateCounts).toEqual({
      'halfWidth<=0.005': 0,
      'halfWidth<=0.010': 0,
      'halfWidth<=0.020': 0,
    })
    expect(summary.additionalApproximationCandidates).toEqual({
      'halfWidth<=0.005': [],
      'halfWidth<=0.010': [],
      'halfWidth<=0.020': [],
    })
  })
})
