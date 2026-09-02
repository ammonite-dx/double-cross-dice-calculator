/**
 * Pure backtrack rule definitions shared by the planner, calculation core,
 * and precomputed-data repository.
 */

export interface BacktrackRule {
  diceModifier?: number
  nightmare?: boolean
  livingdead?: boolean
}

export interface BacktrackParams {
  encroachment: number
  lois: number
  elois: number
  dice: number
  value: number
  dlois: string
}

export type BacktrackDataset = 'livingdead' | 'd10'

export const BACKTRACK_RULES: Record<string, BacktrackRule> = {
  '戦闘用人格・生きる伝説': { diceModifier: -1 },
  生還者: { diceModifier: 3 },
  '不死者・悪夢': { nightmare: true },
  屍人: { livingdead: true },
  '戦友(通常)': { diceModifier: 2 },
  '戦友(強化)': { diceModifier: 4 },
}

export const LIVINGDEAD_DLOIS = '屍人'

export function getBacktrackRule(dlois: string): BacktrackRule {
  return BACKTRACK_RULES[dlois] ?? {}
}

export function getBacktrackDiceCounts(params: BacktrackParams): number[] {
  const diceModifier = getBacktrackRule(params.dlois).diceModifier ?? 0
  return [1, 2, 3].map((multiplier) => Math.max(
    0,
    params.lois * multiplier +
      params.elois +
      params.dice +
      diceModifier
  ))
}

/**
 * Return the largest finite support value for one backtrack distribution.
 * Ordinary D10 sums reach 10n. 《屍人》 reaches 0 for n=0 and 10n-9 for
 * n>=1 because its result is sum(d10) - max(d10) + 1.
 */
export function getBacktrackSupportMax(dlois: string, dice: number): number {
  if (!Number.isSafeInteger(dice) || dice < 0) {
    throw new RangeError('backtrack dice must be a non-negative safe integer')
  }
  const supportMax = getBacktrackRule(dlois).livingdead
    ? dice === 0 ? 0 : 10 * dice - 9
    : 10 * dice
  if (!Number.isSafeInteger(supportMax)) {
    throw new RangeError('backtrack support must be a safe integer')
  }
  return supportMax
}

/**
 * Return the smallest possible finite support value for one backtrack
 * distribution. Both ordinary D10 and 《屍人》 use at least one point per
 * die when dice are present; the zero-dice case remains a point mass at 0.
 */
export function getBacktrackSupportMin(_dlois: string, dice: number): number {
  if (!Number.isSafeInteger(dice) || dice < 0) {
    throw new RangeError('backtrack dice must be a non-negative safe integer')
  }
  return dice === 0 ? 0 : dice
}

/**
 * The repository stores datasets separately, so it uses this equivalent
 * dataset-level helper without depending on a display or planner policy.
 */
export function getDatasetSupportMax(
  dataset: BacktrackDataset,
  dice: number,
): number {
  if (dataset === 'livingdead') {
    return getBacktrackSupportMax(LIVINGDEAD_DLOIS, dice)
  }
  if (dataset === 'd10') {
    if (!Number.isSafeInteger(dice) || dice < 0) {
      throw new RangeError('backtrack dice must be a non-negative safe integer')
    }
    const supportMax = 10 * dice
    if (!Number.isSafeInteger(supportMax)) {
      throw new RangeError('backtrack support must be a safe integer')
    }
    return supportMax
  }
  throw new RangeError(`unknown backtrack dataset: ${dataset}`)
}
