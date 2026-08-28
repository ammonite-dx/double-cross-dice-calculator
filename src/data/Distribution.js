export const OUTPUT_DISTRIBUTION_SIZE = 1024
export const WORKING_DISTRIBUTION_SIZE = 2048
export const DISTRIBUTION_SIZE = OUTPUT_DISTRIBUTION_SIZE

export function range(min, max) {
  return Array.from({ length: DISTRIBUTION_SIZE }, (_, index) => index)
    .slice(min, max + 1)
}

export function expandSparseDistribution(
  sparseDistribution,
  size = OUTPUT_DISTRIBUTION_SIZE
) {
  const distribution = Array(size).fill(0)
  const { offset, values } = sparseDistribution

  for (let index = 0; index < values.length; index += 1) {
    distribution[offset + index] = values[index]
  }

  return distribution
}

export function collapseDistribution(
  distribution,
  size = OUTPUT_DISTRIBUTION_SIZE
) {
  if (distribution.length < size) {
    return distribution.concat(Array(size - distribution.length).fill(0))
  }

  const collapsed = distribution.slice(0, size)
  collapsed[size - 1] = distribution
    .slice(size - 1)
    .reduce((sum, probability) => sum + probability, 0)
  return collapsed
}

export function shiftDistribution(distribution, amount) {
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

export function getUpperTailProbability(distribution) {
  const upperTailProbability = Array(distribution.length).fill(0)
  upperTailProbability[0] = 1

  for (let value = 1; value < distribution.length; value += 1) {
    upperTailProbability[value] =
      upperTailProbability[value - 1] - distribution[value - 1]
  }

  return upperTailProbability
}
