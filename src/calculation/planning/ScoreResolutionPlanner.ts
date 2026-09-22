import { planScore } from './ScoreRangePlanner'
import type { ScoreResolution } from '../../domain/ScoreResolution'
import type {
  ForcedFailureScoreRangePlan,
  FixedScoreRangePlan,
  RangeDisplayPlan,
  ScoreRangePlan,
} from './RangePlannerTypes'

type DeterministicCommon = Omit<FixedScoreRangePlan, 'kind' | 'value'>

function deterministicPlan(
  kind: 'fixed-score',
  value: number,
  display: RangeDisplayPlan,
  tailBudget: number,
): FixedScoreRangePlan
function deterministicPlan(
  kind: 'forced-failure',
  value: number,
  display: RangeDisplayPlan,
  tailBudget: number,
): ForcedFailureScoreRangePlan
function deterministicPlan(
  kind: 'fixed-score' | 'forced-failure',
  value: number,
  display: RangeDisplayPlan,
  tailBudget: number,
): FixedScoreRangePlan | ForcedFailureScoreRangePlan {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('deterministic score value must be a non-negative safe integer')
  }
  const common: DeterministicCommon = {
    // Deterministic scores intentionally have no DX params or dense working
    // range. They are represented by an offset one-point distribution.
    display,
    support: {
      kind: 'finite-support',
      finiteSupport: true,
      min: value,
      max: value,
      cutoff: value,
    },
    tail: {
      model: 'finite-support',
      kind: 'finite-support',
      finiteSupport: true,
      requested: tailBudget,
      cutoff: value,
      bound: 0,
      reachable: true,
      modeledMax: value,
      meaning: 'The deterministic score is represented by an exact one-point distribution',
    },
    outputMax: value,
    operations: 0,
    fftOperations: 0,
    float64Bytes: Float64Array.BYTES_PER_ELEMENT,
    finiteSupport: true,
  }
  return kind === 'fixed-score'
    ? { kind, value, ...common }
    : { kind, ...common }
}

export function planFixedScore(
  value: number,
  display: RangeDisplayPlan,
  tailBudget: number,
): FixedScoreRangePlan {
  return deterministicPlan('fixed-score', value, display, tailBudget)
}

export function planForcedFailure(
  display: RangeDisplayPlan,
  tailBudget: number,
): ForcedFailureScoreRangePlan {
  return deterministicPlan('forced-failure', 0, display, tailBudget)
}

/** Dispatch a normalized score resolution to its operation-specific planner. */
export function planScoreResolution(
  resolution: ScoreResolution,
  display: RangeDisplayPlan,
  tailBudget: number,
): ScoreRangePlan {
  if (resolution?.kind === 'rolled-score') {
    return planScore(resolution.params, display, tailBudget)
  }
  if (resolution?.kind === 'fixed-score') {
    return planFixedScore(resolution.value, display, tailBudget)
  }
  if (resolution?.kind === 'forced-failure') {
    return planForcedFailure(display, tailBudget)
  }
  throw new TypeError('score resolution must be rolled-score, fixed-score, or forced-failure')
}
