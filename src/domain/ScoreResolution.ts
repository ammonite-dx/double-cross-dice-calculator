import type { ScoreInput } from './InputDomain'

/**
 * Describes how a score is produced after input normalization.
 *
 * The UI keeps raw score coordinates.  Calculation code receives this
 * discriminated union so that a fixed reaction (Evasion) or a forced failure
 * (Guard / reaction abandon) never has to masquerade as a DX roll.
 */
export type ScoreResolution =
  | {
      readonly kind: 'rolled-score'
      readonly params: ScoreInput
    }
  | {
      readonly kind: 'fixed-score'
      readonly value: number
    }
  | {
      readonly kind: 'forced-failure'
    }
