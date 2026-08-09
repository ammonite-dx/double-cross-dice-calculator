import { OUTPUT_DISTRIBUTION_SIZE } from '../data/Distribution'

/**
 * The planner's default limits are deliberately smaller than these direct
 * core limits. The support-length ceiling matches the direct DX API scale,
 * while the operation ceiling prevents the O(n²) backtrack DP from turning a
 * large future input into an accidental long-running or memory-heavy call.
 */
export const BACKTRACK_MAX_GENERATED_DICE = 1 << 12
export const BACKTRACK_MAX_GENERATION_LENGTH = 1 << 16
export const BACKTRACK_MAX_GENERATION_OPERATIONS = 100_000_000
export const BACKTRACK_ABORT_CHECK_INTERVAL = 4_096

export const BACKTRACK_ASSET_SUPPORT_MAX = OUTPUT_DISTRIBUTION_SIZE - 2

export const BACKTRACK_D10_GENERATION_FACTOR = 10
export const BACKTRACK_LIVINGDEAD_GENERATION_FACTOR = 110

export function getBacktrackGenerationOperationEstimate(
  maxDice,
  size,
  livingdead
) {
  const factor = livingdead
    ? BACKTRACK_LIVINGDEAD_GENERATION_FACTOR
    : BACKTRACK_D10_GENERATION_FACTOR
  return maxDice * size * factor
}
