export const HALF_WIDTH_THRESHOLDS = Object.freeze([0.005, 0.01, 0.02])

function thresholdKey(threshold) {
  return `halfWidth<=${threshold.toFixed(3)}`
}

function isFiniteInterval(expectedValue) {
  return Number.isFinite(expectedValue?.halfWidth)
}

function isAdditionalApproximationCandidate(record, threshold) {
  const expectedValue = record.expectedValue
  return expectedValue?.kind === 'bounded'
    && expectedValue.stableRoundedDisplay === false
    && isFiniteInterval(expectedValue)
    && expectedValue.halfWidth <= threshold
}

export function summarizeRecords(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('damage precision records must be an array')
  }
  const kindCounts = Object.fromEntries(
    [...new Set(records.map(({ expectedValue }) => expectedValue?.kind ?? 'unknown'))]
      .map((kind) => [
        kind,
        records.filter(({ expectedValue }) => (expectedValue?.kind ?? 'unknown') === kind).length,
      ]),
  )
  const bounded = records.filter(({ expectedValue }) => expectedValue?.kind === 'bounded')
  const stableRoundedBounded = bounded.filter(({ expectedValue }) =>
    expectedValue.stableRoundedDisplay === true
  )
  const unstableRoundedBounded = bounded.filter(({ expectedValue }) =>
    expectedValue.stableRoundedDisplay === false
  )
  const allFiniteIntervalThresholdCounts = Object.fromEntries(
    HALF_WIDTH_THRESHOLDS.map((threshold) => [
      thresholdKey(threshold),
      records.filter(({ expectedValue }) =>
        isFiniteInterval(expectedValue)
        && expectedValue.halfWidth <= threshold
      ).length,
    ]),
  )
  const additionalApproximationCandidates = Object.fromEntries(
    HALF_WIDTH_THRESHOLDS.map((threshold) => [
      thresholdKey(threshold),
      records
        .filter((record) => isAdditionalApproximationCandidate(record, threshold))
        .map(({ id }) => id),
    ]),
  )
  return {
    recordCount: records.length,
    kindCounts,
    boundedCount: bounded.length,
    stableRoundedBoundedCount: stableRoundedBounded.length,
    unstableRoundedBoundedCount: unstableRoundedBounded.length,
    allFiniteIntervalThresholdCounts,
    additionalApproximationCandidateCounts: Object.fromEntries(
      Object.entries(additionalApproximationCandidates)
        .map(([key, candidates]) => [key, candidates.length]),
    ),
    additionalApproximationCandidates,
    lowerBoundHasNoMidpoint: records
      .filter(({ expectedValue }) => expectedValue?.kind === 'lower-bound')
      .every(({ expectedValue }) => expectedValue.diagnosticMidpoint === null),
    heuristicPointEstimatesAdded: records.some(({ expectedValue }) =>
      expectedValue?.pointEstimateSource === 'heuristic'
    ),
  }
}
