/**
 * Pure helpers for the R23 Backtrack label stress experiment.
 *
 * The search is deliberately deterministic: the runner records the fixed
 * domain, then selects the displayed slice nearest to 10 percentage points.
 */

export const BACKTRACK_LABEL_STRESS_THRESHOLD = 10

export const BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN = Object.freeze({
  encroachment: Object.freeze([70, 80, 90, 100, 110, 120, 130]),
  lois: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]),
  elois: Object.freeze([0, 1, 2, 3]),
  dice: Object.freeze([0, 1, 2, 3, 4, 5]),
  value: Object.freeze([0, 5, 10, 15, 20, 25, 30]),
})

function compareCandidates(left, right) {
  if (left.distanceFromThreshold !== right.distanceFromThreshold) {
    return left.distanceFromThreshold - right.distanceFromThreshold
  }
  if (left.label.length !== right.label.length) {
    return right.label.length - left.label.length
  }
  return left.label.localeCompare(right.label, 'ja')
}

/**
 * Select one displayed percentage slice from a presentation payload.
 * Values below the formatter threshold are intentionally not candidates.
 */
export function selectBacktrackStressSlice(
  slices,
  threshold = BACKTRACK_LABEL_STRESS_THRESHOLD,
) {
  if (!Array.isArray(slices)) {
    throw new TypeError('slices must be an array')
  }
  if (!Number.isFinite(threshold)) {
    throw new TypeError('threshold must be finite')
  }
  const candidates = slices
    .filter((slice) => (
      slice !== null
      && typeof slice === 'object'
      && typeof slice.label === 'string'
      && Number.isFinite(slice.value)
      && slice.value >= threshold
    ))
    .map((slice) => ({
      ...slice,
      distanceFromThreshold: Math.abs(slice.value - threshold),
    }))
    .sort(compareCandidates)
  return candidates[0] ?? null
}

export function createStressSliceRecords(labels, values) {
  if (!Array.isArray(labels) || !Array.isArray(values)) {
    throw new TypeError('labels and values must be arrays')
  }
  if (labels.length !== values.length) {
    throw new RangeError('labels and values must have equal lengths')
  }
  return labels.map((label, index) => ({
    label,
    value: values[index],
  }))
}

export function enumerateBacktrackStressInputs(
  domain = BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN,
) {
  const inputs = []
  for (const encroachment of domain.encroachment) {
    for (const lois of domain.lois) {
      for (const elois of domain.elois) {
        for (const dice of domain.dice) {
          for (const value of domain.value) {
            inputs.push({ encroachment, lois, elois, dice, value })
          }
        }
      }
    }
  }
  return inputs
}
