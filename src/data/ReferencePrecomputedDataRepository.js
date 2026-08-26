import {
  OUTPUT_DISTRIBUTION_SIZE,
  WORKING_DISTRIBUTION_SIZE,
  expandSparseDistribution,
} from './Distribution'
import { getDatasetSupportMax } from '../domain/BacktrackRules'
import {
  PRECOMPUTED_DATA_REVISION,
  PRECOMPUTED_DATA_SCHEMA_VERSION,
  assert,
  getPrecomputedDataPath,
  validateSparseDistribution,
} from './PrecomputedDataSchema'

const DR_DISTRIBUTION_CACHE_SIZE = 3
const LIVINGDEAD_DISTRIBUTION_COUNT = 224

function validateShihai(shihai) {
  assert(
    Number.isInteger(shihai) && shihai >= 0 && shihai <= 19,
    `shihai must be an integer between 0 and 19: ${shihai}`
  )
}

function validateDxAsset(asset, expectedShihai) {
  assert(asset?.schemaVersion === PRECOMPUTED_DATA_SCHEMA_VERSION, 'schema mismatch')
  assert(asset?.dataRevision === PRECOMPUTED_DATA_REVISION, 'revision mismatch')
  assert(asset?.dataset === 'dx', 'dataset must be dx')
  assert(
    asset?.distributionSize === WORKING_DISTRIBUTION_SIZE,
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

    const request = fetchAsset(
      getPrecomputedDataPath('dx', `shihai-${shihai}.json`)
    )
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

let livingdeadAsset = null
let livingdeadRequest = null
const expandedLivingdeadDistributions = new Map()

function validateLivingdeadAsset(asset) {
  assert(asset?.schemaVersion === PRECOMPUTED_DATA_SCHEMA_VERSION, 'schema mismatch')
  assert(asset?.dataRevision === PRECOMPUTED_DATA_REVISION, 'revision mismatch')
  assert(asset?.dataset === 'livingdead', 'dataset must be livingdead')
  assert(
    asset?.distributionSize === OUTPUT_DISTRIBUTION_SIZE,
    'distribution size mismatch'
  )
  assert(
    asset?.index?.dice?.start === 0 &&
      asset?.index?.dice?.count === LIVINGDEAD_DISTRIBUTION_COUNT,
    'livingdead dice index mismatch'
  )
  assert(
    asset?.distributions?.length === LIVINGDEAD_DISTRIBUTION_COUNT,
    'livingdead distribution count mismatch'
  )

  asset.distributions.forEach((distribution, dice) => {
    validateSparseDistribution(
      distribution,
      `livingdead[${dice}]`,
      asset.distributionSize
    )
  })

  return asset
}

export function registerLivingdeadAsset(asset) {
  const validatedAsset = validateLivingdeadAsset(asset)
  expandedLivingdeadDistributions.clear()
  livingdeadAsset = validatedAsset
  return asset
}

export async function loadLivingdeadAsset() {
  if (livingdeadAsset) {
    return livingdeadAsset
  }
  if (livingdeadRequest) {
    return livingdeadRequest
  }

  const request = fetch(getPrecomputedDataPath('livingdead.json'))
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load livingdead data: HTTP ${response.status}`
        )
      }
      return response.json()
    })
    .then((asset) => registerLivingdeadAsset(asset))
    .finally(() => {
      livingdeadRequest = null
    })

  livingdeadRequest = request
  return request
}

export function getLivingdeadDistribution(
  dice,
  size = OUTPUT_DISTRIBUTION_SIZE
) {
  if (!livingdeadAsset) {
    throw new Error('livingdead data has not been loaded')
  }

  const sparseDistribution = livingdeadAsset.distributions[dice]
  if (!sparseDistribution) {
    throw new Error(`livingdead distribution is unavailable: dice=${dice}`)
  }

  assert(
    Number.isInteger(size) && size > 0,
    `livingdead expansion size is invalid: ${size}`
  )
  const fullSupportMax = getDatasetSupportMax('livingdead', dice)
  if (size > livingdeadAsset.distributionSize) {
    assert(
      fullSupportMax < livingdeadAsset.distributionSize,
      `livingdead[${dice}] cannot be expanded after overflow aggregation`
    )
  }
  assert(
    sparseDistribution.offset + sparseDistribution.values.length <= size,
    `livingdead distribution does not fit in expansion size: ${size}`
  )
  if (size < livingdeadAsset.distributionSize) {
    assert(
      fullSupportMax < size,
      `livingdead distribution does not fit in expansion size: ${size}`
    )
  }

  const cacheKey = `${dice}:${size}`
  if (!expandedLivingdeadDistributions.has(cacheKey)) {
    expandedLivingdeadDistributions.set(
      cacheKey,
      expandSparseDistribution(sparseDistribution, size)
    )
  }
  return expandedLivingdeadDistributions.get(cacheKey)
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
    asset?.distributionSize === WORKING_DISTRIBUTION_SIZE,
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

const drAssets = new Map()
const drRequests = new Map()
const drDamageDistributions = new Map()

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

  const request = fetch(getPrecomputedDataPath('dr', `kazanari-${kazanari}.json`))
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
        distributions[sparseDistribution.offset + index][dice] = probability
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

export function clearReferencePrecomputedDataCache() {
  dxRepository.clear()
  livingdeadAsset = null
  livingdeadRequest = null
  expandedLivingdeadDistributions.clear()
  drAssets.clear()
  drRequests.clear()
  drDamageDistributions.clear()
}
