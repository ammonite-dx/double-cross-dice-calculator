import type {
  CheckInputSnapshot,
  DifficultyInput,
  ScoreInput,
} from '../domain/CalculationInputs'

const SCORE_FIELDS: readonly (keyof ScoreInput)[] = Object.freeze([
  'dice',
  'critical',
  'skill',
  'yousei',
  'shihai',
])

type CheckInputDraft = {
  difficulty?: Partial<DifficultyInput>
  dfclty?: Partial<DifficultyInput>
  params?: {
    action?: Partial<ScoreInput>
    reaction?: Partial<ScoreInput>
  }
} | null

function copyScoreDraft(score: Partial<ScoreInput> = {}): Partial<ScoreInput> {
  const normalized: Partial<ScoreInput> = {}
  for (const field of SCORE_FIELDS) {
    normalized[field] = score[field]
  }
  return normalized
}

/**
 * Copies the values accepted by the Check forms without changing their
 * numeric meaning. Form validation owns validity; this boundary owns shape
 * and alias-free snapshots for calculation requests.
 */
export function normalizeCheckInputDraft(
  draft: CheckInputDraft = {},
): CheckInputSnapshot {
  const difficulty = draft?.difficulty ?? draft?.dfclty ?? {}
  const params = draft?.params ?? {}
  return {
    difficulty: {
      opposed: difficulty.opposed,
      target: difficulty.target,
    },
    params: {
      action: copyScoreDraft(params.action),
      reaction: copyScoreDraft(params.reaction),
    },
  }
}

/**
 * Creates the immutable-by-convention request value submitted to Check
 * calculation. Every nested value is copied so later draft edits cannot
 * change a request that is running or waiting in the coordinator.
 */
export function createCheckInputSnapshot(
  draft: CheckInputDraft = {},
): CheckInputSnapshot {
  const normalized = normalizeCheckInputDraft(draft)
  return {
    difficulty: { ...normalized.difficulty },
    params: {
      action: { ...normalized.params.action },
      reaction: { ...normalized.params.reaction },
    },
  }
}

export const createCalculationInputSnapshot = createCheckInputSnapshot
