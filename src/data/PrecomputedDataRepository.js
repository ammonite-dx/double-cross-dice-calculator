import { DISTRIBUTION_SIZE } from './Distribution'

export const PRECOMPUTED_DATA_SCHEMA_VERSION = 1
export const PRECOMPUTED_DATA_REVISION = 1

const PROBABILITY_TOLERANCE = 2e-4
const basePath = `${
  import.meta.env.BASE_URL
}data/schema-v${PRECOMPUTED_DATA_SCHEMA_VERSION}/revision-${PRECOMPUTED_DATA_REVISION}`

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid precomputed data: ${message}`)
  }
}

function validateShihai(shihai) {
  assert(
    Number.isInteger(shihai) && shihai >= 0 && shihai <= 19,
    `shihai must be an integer between 0 and 19: ${shihai}`
  )
}

function validateSparseDistribution(distribution, context) {
  assert(distribution && typeof distribution === 'object', `${context} is missing`)
  assert(
    Number.isInteger(distribution.offset) &&
      distribution.offset >= 0 &&
      distribution.offset < DISTRIBUTION_SIZE,
    `${context}.offset is invalid`
  )
  assert(
    Array.isArray(distribution.values) && distribution.values.length > 0,
    `${context}.values is empty`
  )
  assert(
    distribution.offset + distribution.values.length <= DISTRIBUTION_SIZE,
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

function validateDxAsset(asset, expectedShihai) {
  assert(asset?.schemaVersion === PRECOMPUTED_DATA_SCHEMA_VERSION, 'schema mismatch')
  assert(asset?.dataRevision === PRECOMPUTED_DATA_REVISION, 'revision mismatch')
  assert(asset?.dataset === 'dx', 'dataset must be dx')
  assert(asset?.distributionSize === DISTRIBUTION_SIZE, 'distribution size mismatch')
  assert(asset?.shard?.shihai === expectedShihai, 'shihai shard mismatch')
  assert(asset?.index?.dice?.start === 0, 'dice start mismatch')
  assert(asset?.index?.dice?.count === 100, 'dice count mismatch')
  assert(asset?.index?.critical?.start === 2, 'critical start mismatch')
  assert(asset?.index?.critical?.count === 10, 'critical count mismatch')
  assert(asset?.distributions?.length === 100, 'distribution dice count mismatch')

  asset.distributions.forEach((criticalDistributions, dice) => {
    assert(
      criticalDistributions.length === 10,
      `dx[${expectedShihai}][${dice}] critical count mismatch`
    )
    criticalDistributions.forEach((distribution, criticalIndex) => {
      validateSparseDistribution(
        distribution,
        `dx[${expectedShihai}][${dice}][${criticalIndex + 2}]`
      )
    })
  })

  return asset
}

export function createDxRepository(fetchAsset = (...args) => fetch(...args)) {
  const assets = new Map()
  const pendingAssets = new Map()

  function registerDxAsset(asset) {
    const shihai = asset?.shard?.shihai
    validateShihai(shihai)
    assets.set(shihai, validateDxAsset(asset, shihai))
    return asset
  }

  async function loadDxAsset(shihai) {
    validateShihai(shihai)

    if (assets.has(shihai)) {
      return assets.get(shihai)
    }
    if (pendingAssets.has(shihai)) {
      return pendingAssets.get(shihai)
    }

    const request = fetchAsset(`${basePath}/dx/shihai-${shihai}.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load dx data for shihai ${shihai}: HTTP ${response.status}`
          )
        }
        return response.json()
      })
      .then((asset) => registerDxAsset(asset))
      .finally(() => {
        pendingAssets.delete(shihai)
      })

    pendingAssets.set(shihai, request)
    return request
  }

  function getDxDistribution(shihai, dice, critical) {
    validateShihai(shihai)
    const asset = assets.get(shihai)

    if (!asset) {
      throw new Error(`dx data for shihai ${shihai} has not been loaded`)
    }

    const diceIndex = dice - asset.index.dice.start
    const criticalIndex = critical - asset.index.critical.start
    const distribution = asset.distributions[diceIndex]?.[criticalIndex]

    if (!distribution) {
      throw new Error(
        `dx distribution is unavailable: shihai=${shihai}, dice=${dice}, critical=${critical}`
      )
    }

    return distribution
  }

  function clear() {
    assets.clear()
    pendingAssets.clear()
  }

  return {
    clear,
    getDxDistribution,
    loadDxAsset,
    registerDxAsset,
  }
}

const dxRepository = createDxRepository()

export const clearPrecomputedDataCache = dxRepository.clear
export const getDxDistribution = dxRepository.getDxDistribution
export const loadDxAsset = dxRepository.loadDxAsset
export const registerDxAsset = dxRepository.registerDxAsset
