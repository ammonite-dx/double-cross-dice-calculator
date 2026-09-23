import { roundToOneDecimal } from './DecimalRounding'

/**
 * Convert one probability to the percentage precision used by probability
 * charts. Chart presentation rounds to one decimal place in percent.
 */
export function toChartPercentage(probability: number): number {
  return roundToOneDecimal(probability * 100)
}

/**
 * Convert a probability container without mutating or retaining the input.
 * Array.from also normalizes typed arrays to an ordinary owned Array.
 */
export function toChartPercentages(
  probabilities: ArrayLike<number> | null | undefined,
): number[] | null | undefined {
  if (!probabilities) {
    return probabilities
  }
  return Array.from(probabilities, toChartPercentage)
}
