/**
 * Pure backtrack rule definitions shared by the planner, calculation core,
 * and precomputed-data repository.
 */
export const BACKTRACK_RULES = {
  '戦闘用人格・生きる伝説': { diceModifier: -1 },
  生還者: { diceModifier: 3 },
  '不死者・悪夢': { nightmare: true },
  屍人: { livingdead: true },
  '戦友(通常)': { diceModifier: 2 },
  '戦友(強化)': { diceModifier: 4 },
}
export const LIVINGDEAD_DLOIS = '屍人'

export function getBacktrackRule(dlois) {
  return BACKTRACK_RULES[dlois] ?? {}
}

export function getBacktrackDiceCounts(params) {
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
export function getBacktrackSupportMax(dlois, dice) {
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
 * The repository stores datasets separately, so it uses this equivalent
 * dataset-level helper without depending on a display or planner policy.
 */
export function getDatasetSupportMax(dataset, dice) {
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
