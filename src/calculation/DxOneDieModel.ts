import { assertCriticalValue } from '../domain/InputDomain'

function geometricSum(probabilityValue: number, terms: number): number {
  if (terms <= 0) {
    return 0
  }
  if (probabilityValue === 1) {
    return terms
  }
  return (1 - probabilityValue ** terms) / (1 - probabilityValue)
}

/** Cumulative probability for one DX die at an integer score boundary. */
export function oneDieCumulative(value: number, critical: number): number {
  if (value <= 0) {
    return 0
  }
  assertCriticalValue(critical)

  const criticalProbability = (11 - critical) / 10
  let result = 0
  for (let face = 1; face < critical && face <= value; face += 1) {
    const terms = Math.floor((value - face) / 10) + 1
    result += 0.1 * geometricSum(criticalProbability, terms)
  }
  return Math.min(1, result)
}

/** Strict tail probability for one DX die at an integer score boundary. */
export function oneDieTail(value: number, critical: number): number {
  if (value < 0) {
    return 1
  }
  assertCriticalValue(critical)

  const criticalProbability = (11 - critical) / 10
  let result = 0
  for (let face = 1; face < critical; face += 1) {
    const firstExcludedRepeat =
      value < face ? 0 : Math.floor((value - face) / 10) + 1
    if (criticalProbability === 0) {
      if (firstExcludedRepeat === 0) {
        result += 0.1
      }
      continue
    }
    result +=
      0.1 *
      criticalProbability ** firstExcludedRepeat /
      (1 - criticalProbability)
  }
  return Math.max(0, Math.min(1, result))
}
