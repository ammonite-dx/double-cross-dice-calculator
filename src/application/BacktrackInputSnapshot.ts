import type { BacktrackParams, BacktrackInputSnapshot } from '../domain/CalculationInputs'

type BacktrackInputDraft =
  | (Partial<BacktrackParams> & { params?: Partial<BacktrackParams> })
  | null

function copyBacktrackParams(
  params: Partial<BacktrackParams> = {},
): Partial<BacktrackParams> {
  return {
    encroachment: params.encroachment,
    lois: params.lois,
    elois: params.elois,
    dice: params.dice,
    value: params.value,
    dlois: params.dlois,
  }
}

/**
 * Copies the values accepted by the Backtrack form without changing their
 * numeric or string meaning. Form validation owns validity; this boundary
 * owns the calculation snapshot shape.
 */
export function normalizeBacktrackInputDraft(
  draft: BacktrackInputDraft = {},
): BacktrackInputSnapshot {
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
export function createBacktrackInputSnapshot(
  draft: BacktrackInputDraft = {},
): BacktrackInputSnapshot {
  const normalized = normalizeBacktrackInputDraft(draft)
  return {
    params: { ...normalized.params },
  }
}
