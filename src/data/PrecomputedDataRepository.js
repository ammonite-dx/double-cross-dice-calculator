import {
  OUTPUT_DISTRIBUTION_SIZE,
  WORKING_DISTRIBUTION_SIZE,
  expandSparseDistribution,
} from './Distribution'

export const PRECOMPUTED_DATA_SCHEMA_VERSION = 2
export const PRECOMPUTED_DATA_REVISION = 1

const PROBABILITY_TOLERANCE = 2e-4
const DR_DISTRIBUTION_CACHE_SIZE = 3
const datasetDistributionSizes = {
  dx: WORKING_DISTRIBUTION_SIZE,
  dr: WORKING_DISTRIBUTION_SIZE,
  d10: OUTPUT_DISTRIBUTION_SIZE,
  livingdead: OUTPUT_DISTRIBUTION_SIZE,
}
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

function validateSparseDistribution(
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

function validateDxAsset(asset, expectedShihai) {
  assert(asset?.schemaVersion === PRECOMPUTED_DATA_SCHEMA_VERSION, 'schema mismatch')
  assert(asset?.dataRevision === PRECOMPUTED_DATA_REVISION, 'revision mismatch')
  assert(asset?.dataset === 'dx', 'dataset must be dx')
  assert(
    asset?.distributionSize === datasetDistributionSizes.dx,
    'distribution size mismatch'
  )
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
        `dx[${expectedShihai}][${dice}][${criticalIndex + 2}]`,
        asset.distributionSize
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

export const getDxDistribution = dxRepository.getDxDistribution
export const loadDxAsset = dxRepository.loadDxAsset
export const registerDxAsset = dxRepository.registerDxAsset

const oneDimensionalAssets = new Map()
const oneDimensionalRequests = new Map()
const drAssets = new Map()
const drRequests = new Map()
const drDamageDistributions = new Map()
const expandedDistributions = new Map()

const oneDimensionalDefinitions = {
  d10: { count: 224, filename: 'd10.json' },
  livingdead: { count: 224, filename: 'livingdead.json' },
}

function validateOneDimensionalAsset(asset, dataset) {
  const definition = oneDimensionalDefinitions[dataset]

  assert(definition, `unknown dataset: ${dataset}`)
  assert(asset?.schemaVersion === PRECOMPUTED_DATA_SCHEMA_VERSION, 'schema mismatch')
  assert(asset?.dataRevision === PRECOMPUTED_DATA_REVISION, 'revision mismatch')
  assert(asset?.dataset === dataset, `dataset must be ${dataset}`)
  assert(
    asset?.distributionSize === datasetDistributionSizes[dataset],
    'distribution size mismatch'
  )
  assert(
    asset?.index?.dice?.start === 0 &&
      asset?.index?.dice?.count === definition.count,
    `${dataset} dice index mismatch`
  )
  assert(
    asset?.distributions?.length === definition.count,
    `${dataset} distribution count mismatch`
  )

  asset.distributions.forEach((distribution, dice) => {
    validateSparseDistribution(
      distribution,
      `${dataset}[${dice}]`,
      asset.distributionSize
    )
  })

  return asset
}

function registerOneDimensionalAsset(asset, dataset) {
  const validatedAsset = validateOneDimensionalAsset(asset, dataset)

  for (const cacheKey of expandedDistributions.keys()) {
    if (cacheKey.startsWith(`${dataset}:`)) {
      expandedDistributions.delete(cacheKey)
    }
  }
  oneDimensionalAssets.set(dataset, validatedAsset)

  return asset
}

async function loadOneDimensionalAsset(dataset) {
  const definition = oneDimensionalDefinitions[dataset]
  assert(definition, `unknown dataset: ${dataset}`)

  if (oneDimensionalAssets.has(dataset)) {
    return oneDimensionalAssets.get(dataset)
  }
  if (oneDimensionalRequests.has(dataset)) {
    return oneDimensionalRequests.get(dataset)
  }

  const request = fetch(`${basePath}/${definition.filename}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load ${dataset} data: HTTP ${response.status}`
        )
      }
      return response.json()
    })
    .then((asset) => registerOneDimensionalAsset(asset, dataset))
    .finally(() => {
      oneDimensionalRequests.delete(dataset)
    })

  oneDimensionalRequests.set(dataset, request)
  return request
}

function getOneDimensionalDistribution(
  dataset,
  dice,
  size = datasetDistributionSizes[dataset]
) {
  const asset = oneDimensionalAssets.get(dataset)
  if (!asset) {
    throw new Error(`${dataset} data has not been loaded`)
  }

  const sparseDistribution = asset.distributions[dice]
  if (!sparseDistribution) {
    throw new Error(`${dataset} distribution is unavailable: dice=${dice}`)
  }

  assert(
    Number.isInteger(size) && size > 0,
    `${dataset} expansion size is invalid: ${size}`
  )
  if (dataset === 'd10' && size > asset.distributionSize) {
    assert(
      10 * dice < asset.distributionSize,
      `d10[${dice}] cannot be expanded after overflow aggregation`
    )
  }
  assert(
    sparseDistribution.offset + sparseDistribution.values.length <= size,
    `${dataset} distribution does not fit in expansion size: ${size}`
  )
  if (dataset === 'd10' && size < asset.distributionSize) {
    assert(
      10 * dice < size,
      `d10 distribution does not fit in expansion size: ${size}`
    )
  }

  const cacheKey = `${dataset}:${dice}:${size}`
  if (!expandedDistributions.has(cacheKey)) {
    expandedDistributions.set(
      cacheKey,
      expandSparseDistribution(sparseDistribution, size)
    )
  }
  return expandedDistributions.get(cacheKey)
}

function validateKazanari(kazanari) {
  assert(
    Number.isInteger(kazanari) && kazanari >= 0 && kazanari <= 9,
    `kazanari must be an integer between 0 and 9: ${kazanari}`
  )
}

function validateDrAsset(asset, expectedKazanari) {
  assert(asset?.schemaVersion === PRECOMPUTED_DATA_SCHEMA_VERSION, 'schema mismatch')
  assert(asset?.dataRevision === PRECOMPUTED_DATA_REVISION, 'revision mismatch')
  assert(asset?.dataset === 'dr', 'dataset must be dr')
  assert(
    asset?.distributionSize === datasetDistributionSizes.dr,
    'distribution size mismatch'
  )
  assert(asset?.shard?.kazanari === expectedKazanari, 'kazanari shard mismatch')
  assert(
    asset?.index?.dice?.start === 0 &&
      asset?.index?.dice?.count === 203,
    'dr dice index mismatch'
  )
  assert(asset?.distributions?.length === 203, 'dr distribution count mismatch')

  asset.distributions.forEach((distribution, dice) => {
    validateSparseDistribution(
      distribution,
      `dr[${expectedKazanari}][${dice}]`,
      asset.distributionSize
    )
  })

  return asset
}

export function registerDrAsset(asset) {
  const kazanari = asset?.shard?.kazanari
  validateKazanari(kazanari)
  const validatedAsset = validateDrAsset(asset, kazanari)

  drDamageDistributions.delete(kazanari)
  drAssets.set(kazanari, validatedAsset)

  return asset
}

export async function loadDrAsset(kazanari) {
  validateKazanari(kazanari)

  if (drAssets.has(kazanari)) {
    return drAssets.get(kazanari)
  }
  if (drRequests.has(kazanari)) {
    return drRequests.get(kazanari)
  }

  const request = fetch(`${basePath}/dr/kazanari-${kazanari}.json`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load dr data for kazanari ${kazanari}: HTTP ${response.status}`
        )
      }
      return response.json()
    })
    .then((asset) => registerDrAsset(asset))
    .finally(() => {
      drRequests.delete(kazanari)
    })

  drRequests.set(kazanari, request)
  return request
}

export function getDrDamageDistributions(kazanari) {
  validateKazanari(kazanari)
  const asset = drAssets.get(kazanari)
  if (!asset) {
    throw new Error(`dr data for kazanari ${kazanari} has not been loaded`)
  }

  if (!drDamageDistributions.has(kazanari)) {
    const distributions = Array.from(
      { length: asset.distributionSize },
      () => new Float64Array(asset.index.dice.count)
    )

    asset.distributions.forEach((sparseDistribution, dice) => {
      sparseDistribution.values.forEach((probability, index) => {
        distributions[sparseDistribution.offset + index][dice] =
          probability
      })
    })
    while (drDamageDistributions.size >= DR_DISTRIBUTION_CACHE_SIZE) {
      const oldestKazanari = drDamageDistributions.keys().next().value
      drDamageDistributions.delete(oldestKazanari)
    }
    drDamageDistributions.set(kazanari, distributions)
  } else {
    const distributions = drDamageDistributions.get(kazanari)
    drDamageDistributions.delete(kazanari)
    drDamageDistributions.set(kazanari, distributions)
  }

  return drDamageDistributions.get(kazanari)
}

export function clearPrecomputedDataCache() {
  dxRepository.clear()
  oneDimensionalAssets.clear()
  oneDimensionalRequests.clear()
  drAssets.clear()
  drRequests.clear()
  drDamageDistributions.clear()
  expandedDistributions.clear()
}

export const loadD10Asset = () => loadOneDimensionalAsset('d10')
export const loadLivingdeadAsset = () =>
  loadOneDimensionalAsset('livingdead')
export const registerD10Asset = (asset) =>
  registerOneDimensionalAsset(asset, 'd10')
export const registerLivingdeadAsset = (asset) =>
  registerOneDimensionalAsset(asset, 'livingdead')
export const getD10Distribution = (dice, size) =>
  getOneDimensionalDistribution('d10', dice, size)
export const getLivingdeadDistribution = (dice) =>
  getOneDimensionalDistribution('livingdead', dice)
