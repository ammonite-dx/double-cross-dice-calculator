export type NumericDistribution = ArrayLike<number>

/** Expand the historical sparse reference-data representation. */
export function expandSparseDistribution(
  sparseDistribution: { offset: number; values: NumericDistribution },
  size: number,
): number[] {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new TypeError('distribution expansion size must be a positive safe integer')
  }
  const distribution = Array(size).fill(0)
  const { offset, values } = sparseDistribution

  for (let index = 0; index < values.length; index += 1) {
    distribution[offset + index] = values[index]
  }

  return distribution
}

export function shiftDistribution(
  distribution: NumericDistribution,
  amount: number,
): number[] {
  const size = distribution.length
  const shifted = Array(size).fill(0)

  for (let value = 0; value < size; value += 1) {
    const shiftedValue = Math.min(
      size - 1,
      Math.max(0, value + amount)
    )
    shifted[shiftedValue] += distribution[value]
  }

  return shifted
}

export function getUpperTailProbability(distribution: NumericDistribution): number[] {
  const upperTailProbability = Array(distribution.length).fill(0)
  upperTailProbability[0] = 1

  for (let value = 1; value < distribution.length; value += 1) {
    upperTailProbability[value] =
      upperTailProbability[value - 1] - distribution[value - 1]
  }

  return upperTailProbability
}
