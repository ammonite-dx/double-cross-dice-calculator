export const PRECOMPUTED_DATA_SCHEMA_VERSION = 2
export const PRECOMPUTED_DATA_REVISION = 1

export const PROBABILITY_TOLERANCE = 2e-4

export const PRECOMPUTED_DATA_BASE_PATH = `${
  import.meta.env.BASE_URL
}data/schema-v${PRECOMPUTED_DATA_SCHEMA_VERSION}/revision-${PRECOMPUTED_DATA_REVISION}`

export function getPrecomputedDataPath(...segments) {
  return [PRECOMPUTED_DATA_BASE_PATH, ...segments].join('/')
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid precomputed data: ${message}`)
  }
}

export function validateSparseDistribution(
  distribution,
  context,
  distributionSize
) {
  assert(distribution && typeof distribution === 'object', `${context} is missing`)
  assert(
    Number.isInteger(distribution.offset) &&
      distribution.offset >= 0 &&
      distribution.offset < distributionSize,
    `${context}.offset is invalid`
  )
  assert(
    Array.isArray(distribution.values) && distribution.values.length > 0,
    `${context}.values is empty`
  )
  assert(
    distribution.offset + distribution.values.length <= distributionSize,
    `${context} exceeds distribution size`
  )

  let total = 0
  for (const probability of distribution.values) {
    assert(
      Number.isFinite(probability) &&
        probability >= 0 &&
        probability <= 1,
      `${context} contains an invalid probability`
    )
    total += probability
  }
  assert(
    Math.abs(total - 1) < PROBABILITY_TOLERANCE,
    `${context} probability total is ${total}`
  )
}
