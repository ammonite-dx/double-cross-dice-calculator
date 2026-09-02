import type { BacktrackParams, BacktrackInputSnapshot } from '../../../domain/CalculationInputs'

type BacktrackInputDraft =
  | (Partial<BacktrackParams> & { params?: Partial<BacktrackParams> })
  | null

function copyBacktrackParams(params: Partial<BacktrackParams> = {}): Partial<BacktrackParams> {
  return {
    encroachment: params.encroachment,
    lois: params.lois,
    elois: params.elois,
    dice: params.dice,
    value: params.value,
    dlois: params.dlois,
  }
}

export function normalizeBacktrackInputDraft(
  draft: BacktrackInputDraft = {},
): BacktrackInputSnapshot {
  const params = draft?.params ?? draft ?? {}
  return {
    params: copyBacktrackParams(params),
  }
}

/**
 * Create a detached snapshot at the validated form boundary. The snapshot is
 * the only Backtrack input passed to the request coordinator, so later form
 * edits cannot mutate an in-flight calculation.
 */
export function createBacktrackInputSnapshot(
  draft: BacktrackInputDraft = {},
): BacktrackInputSnapshot {
  const normalized = normalizeBacktrackInputDraft(draft)
  return {
    params: { ...normalized.params },
  }
}
