export const DISTRIBUTION_SIZE = 1024

export function range(min, max) {
  return Array.from({ length: DISTRIBUTION_SIZE }, (_, index) => index)
    .slice(min, max + 1)
}

export function expandSparseDistribution(
  sparseDistribution,
  size = DISTRIBUTION_SIZE
) {
  const distribution = Array(size).fill(0)
  const { offset, values } = sparseDistribution

  for (let index = 0; index < values.length; index += 1) {
    distribution[offset + index] = values[index]
  }

  return distribution
}

export function getExpectedValue(distribution) {
  if (!distribution) {
    return null
  }

  let expectedValue = 0
  for (let value = 1; value < distribution.length; value += 1) {
    expectedValue += value * distribution[value]
  }

  return Math.round(expectedValue * 10) / 10
}

export function getUpperTailProbability(distribution) {
  const upperTailProbability = Array(distribution.length).fill(0)
  upperTailProbability[0] = 1

  for (let value = 1; value < distribution.length; value += 1) {
    upperTailProbability[value] =
      upperTailProbability[value - 1] - distribution[value - 1]
  }

  return upperTailProbability
}
