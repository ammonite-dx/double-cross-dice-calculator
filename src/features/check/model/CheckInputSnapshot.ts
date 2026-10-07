import type {
  CheckCalculationInput,
  DifficultyInput,
  ScoreInput,
} from '../../../domain/CalculationInputs'
import { normalizeScoreInput } from '../../../domain/CalculationInputNormalization'

const SCORE_FIELDS: readonly (keyof ScoreInput)[] = Object.freeze([
  'dice',
  'critical',
  'skill',
  'yousei',
  'shihai',
])

type CheckInputDraft = {
  difficulty?: Partial<DifficultyInput>
  params?: {
    action?: Partial<ScoreInput>
    reaction?: Partial<ScoreInput>
  }
} | null

function copyScoreDraft(score: Partial<ScoreInput> = {}): Partial<ScoreInput> {
  const snapshot: Partial<ScoreInput> = {}
  for (const field of SCORE_FIELDS) {
    snapshot[field] = score[field]
  }
  return snapshot
}

/**
 * Copies the values accepted by the Check forms without changing their
 * numeric meaning. Form validation owns validity; this boundary owns shape
 * and alias-free snapshots for calculation requests.
 */
export function createCheckInputSnapshot(
  draft: CheckInputDraft = {},
): CheckCalculationInput {
  const difficulty = draft?.difficulty ?? {}
  const params = draft?.params ?? {}
  const action = normalizeScoreInput(
    copyScoreDraft(params.action),
    'check.action',
  )
  if (difficulty.opposed === true) {
    return {
      kind: 'opposed',
      action,
      reaction: normalizeScoreInput(
        copyScoreDraft(params.reaction),
        'check.reaction',
      ),
    }
  }
  return {
    kind: 'fixed',
    action,
    target: difficulty.target ?? 0,
  }
}

/**
 * Creates the immutable-by-convention request value submitted to Check
 * calculation. Every nested value is copied so later draft edits cannot
 * change a request that is running or waiting in the coordinator.
 */
export function snapshotCheckCalculationInput(
  input: CheckCalculationInput,
): CheckCalculationInput {
  const action = { ...input.action }
  if (input.kind === 'opposed') {
    return {
      kind: 'opposed',
      action,
      reaction: { ...input.reaction },
    }
  }
  return { kind: 'fixed', action, target: input.target }
}
