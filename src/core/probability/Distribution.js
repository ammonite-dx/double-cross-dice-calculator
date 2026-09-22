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
