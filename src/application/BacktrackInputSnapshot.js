const BACKTRACK_INPUT_FIELDS = Object.freeze([
  'encroachment',
  'lois',
  'elois',
  'dice',
  'value',
  'dlois',
])

function copyBacktrackParams(params = {}) {
  const normalized = {}
  for (const field of BACKTRACK_INPUT_FIELDS) {
    normalized[field] = params[field]
  }
  return normalized
}

/**
 * Copies the values accepted by the Backtrack form without changing their
 * numeric or string meaning. Form validation owns validity; this boundary
 * owns the calculation snapshot shape.
 */
export function normalizeBacktrackInputDraft(draft = {}) {
  const params = draft?.params ?? draft ?? {}
  return {
    params: copyBacktrackParams(params),
  }
}

/**
 * Creates the value submitted to Backtrack calculation. The params object is
 * copied so later form or view edits cannot change a request that is running
 * or waiting in the coordinator.
 */
export function createBacktrackInputSnapshot(draft = {}) {
  const normalized = normalizeBacktrackInputDraft(draft)
  return {
    params: { ...normalized.params },
  }
}

