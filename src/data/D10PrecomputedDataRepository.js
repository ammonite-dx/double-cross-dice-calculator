import {
  OUTPUT_DISTRIBUTION_SIZE,
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

const D10_DISTRIBUTION_COUNT = 224
const D10_FILENAME = 'd10.json'

function validateD10Asset(asset) {
  assert(asset?.schemaVersion === PRECOMPUTED_DATA_SCHEMA_VERSION, 'schema mismatch')
  assert(asset?.dataRevision === PRECOMPUTED_DATA_REVISION, 'revision mismatch')
  assert(asset?.dataset === 'd10', 'dataset must be d10')
  assert(
    asset?.distributionSize === OUTPUT_DISTRIBUTION_SIZE,
    'distribution size mismatch'
  )
  assert(
    asset?.index?.dice?.start === 0 &&
      asset?.index?.dice?.count === D10_DISTRIBUTION_COUNT,
    'd10 dice index mismatch'
  )
  assert(
    asset?.distributions?.length === D10_DISTRIBUTION_COUNT,
    'd10 distribution count mismatch'
  )

  asset.distributions.forEach((distribution, dice) => {
    validateSparseDistribution(
      distribution,
      `d10[${dice}]`,
      asset.distributionSize
    )
  })

  return asset
}

export function createD10Repository(
  fetchAsset = (...args) => fetch(...args)
) {
  let asset = null
  let pendingRequest = null
  const expandedDistributions = new Map()

  function registerD10Asset(nextAsset) {
    const validatedAsset = validateD10Asset(nextAsset)
    expandedDistributions.clear()
    asset = validatedAsset
    return nextAsset
  }

  async function loadD10Asset() {
    if (asset) {
      return asset
    }
    if (pendingRequest) {
      return pendingRequest
    }

    const request = fetchAsset(getPrecomputedDataPath(D10_FILENAME))
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load d10 data: HTTP ${response.status}`
          )
        }
        return response.json()
      })
      .then((nextAsset) => registerD10Asset(nextAsset))
      .finally(() => {
        pendingRequest = null
      })

    pendingRequest = request
    return request
  }

  function getD10Distribution(dice, size = OUTPUT_DISTRIBUTION_SIZE) {
    if (!asset) {
      throw new Error('d10 data has not been loaded')
    }

    const sparseDistribution = asset.distributions[dice]
    if (!sparseDistribution) {
      throw new Error(`d10 distribution is unavailable: dice=${dice}`)
    }

    assert(
      Number.isInteger(size) && size > 0,
      `d10 expansion size is invalid: ${size}`
    )
    const fullSupportMax = getDatasetSupportMax('d10', dice)
    if (size > asset.distributionSize) {
      assert(
        fullSupportMax < asset.distributionSize,
        `d10[${dice}] cannot be expanded after overflow aggregation`
      )
    }
    assert(
      sparseDistribution.offset + sparseDistribution.values.length <= size,
      `d10 distribution does not fit in expansion size: ${size}`
    )
    if (size < asset.distributionSize) {
      assert(
        fullSupportMax < size,
        `d10 distribution does not fit in expansion size: ${size}`
      )
    }

    const cacheKey = `${dice}:${size}`
    if (!expandedDistributions.has(cacheKey)) {
      expandedDistributions.set(
        cacheKey,
        expandSparseDistribution(sparseDistribution, size)
      )
    }
    return expandedDistributions.get(cacheKey)
  }

  function clear() {
    asset = null
    pendingRequest = null
    expandedDistributions.clear()
  }

  return {
    clear,
    getD10Distribution,
    loadD10Asset,
    registerD10Asset,
  }
}

const d10Repository = createD10Repository()

export const getD10Distribution = d10Repository.getD10Distribution
export const loadD10Asset = d10Repository.loadD10Asset
export const registerD10Asset = d10Repository.registerD10Asset
export const clearD10PrecomputedDataCache = d10Repository.clear
