import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEMA_VERSION = 1
const DATA_REVISION = 1
const DISTRIBUTION_SIZE = 1024
const PROBABILITY_TOLERANCE = 2e-4

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const sourceDirectory = path.join(repositoryRoot, 'src', 'data')
const outputDirectory = path.join(
  repositoryRoot,
  'reference-data',
  `schema-v${SCHEMA_VERSION}`,
  `revision-${DATA_REVISION}`
)
const checkOnly = process.argv.includes('--check')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function readJson(filename) {
  return JSON.parse(
    await readFile(path.join(sourceDirectory, filename), 'utf8')
  )
}

function validateProbabilities(
  values,
  context,
  { requireNormalized = true } = {}
) {
  assert(values.length > 0, `${context}: distribution must not be empty`)

  let total = 0
  for (const probability of values) {
    assert(
      Number.isFinite(probability) &&
        probability >= 0 &&
        probability <= 1,
      `${context}: invalid probability ${probability}`
    )
    total += probability
  }

  if (requireNormalized) {
    assert(
      Math.abs(total - 1) < PROBABILITY_TOLERANCE,
      `${context}: probability total is ${total}`
    )
  } else {
    assert(total > 0, `${context}: probability total must be positive`)
    assert(
      total <= 1 + PROBABILITY_TOLERANCE,
      `${context}: probability total exceeds 1: ${total}`
    )
  }
}

function toSparseDistribution(
  distribution,
  context,
  validationOptions
) {
  assert(
    distribution.length === DISTRIBUTION_SIZE,
    `${context}: expected ${DISTRIBUTION_SIZE} values`
  )
  validateProbabilities(distribution, context, validationOptions)

  let first = 0
  let last = distribution.length - 1

  while (first < distribution.length && distribution[first] === 0) {
    first += 1
  }
  while (last >= first && distribution[last] === 0) {
    last -= 1
  }

  assert(first <= last, `${context}: distribution contains only zeroes`)

  return {
    offset: first,
    values: distribution.slice(first, last + 1),
  }
}

function convertCompressedDistribution(distribution, context) {
  const { pre, post, val } = distribution

  assert(
    Number.isInteger(pre) && pre >= 0,
    `${context}: invalid pre value`
  )
  assert(
    Number.isInteger(post) && post >= 0,
    `${context}: invalid post value`
  )
  assert(
    pre + val.length + post === DISTRIBUTION_SIZE,
    `${context}: invalid compressed distribution length`
  )
  validateProbabilities(val, context)

  return {
    offset: pre,
    values: val,
  }
}

function createAsset(dataset, shard, index, distributions) {
  return {
    schemaVersion: SCHEMA_VERSION,
    dataRevision: DATA_REVISION,
    dataset,
    distributionSize: DISTRIBUTION_SIZE,
    shard,
    index,
    distributions,
  }
}

function serialize(value) {
  return `${JSON.stringify(value)}\n`
}

function getSha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function createAssets() {
  const [dx, dr, d10, livingdead] = await Promise.all([
    readJson('dx.json'),
    readJson('dr.json'),
    readJson('d10.json'),
    readJson('livingdead.json'),
  ])
  const assets = new Map()

  assert(dx.length === 20, 'dx: expected 20 shihai entries')
  dx.forEach((diceEntries, shihai) => {
    assert(diceEntries.length === 100, `dx[${shihai}]: expected 100 dice entries`)

    const distributions = diceEntries.map((criticalEntries, dice) => {
      assert(
        criticalEntries.length === 10,
        `dx[${shihai}][${dice}]: expected 10 critical entries`
      )

      return criticalEntries.map((distribution, criticalIndex) =>
        convertCompressedDistribution(
          distribution,
          `dx[${shihai}][${dice}][${criticalIndex + 2}]`
        )
      )
    })

    const asset = createAsset(
      'dx',
      { shihai },
      {
        dice: { start: 0, count: 100 },
        critical: { start: 2, count: 10 },
      },
      distributions
    )
    assets.set(`dx/shihai-${shihai}.json`, serialize(asset))
  })

  assert(dr.length === 10, 'dr: expected 10 kazanari entries')
  dr.forEach((damageEntries, kazanari) => {
    assert(
      damageEntries.length === DISTRIBUTION_SIZE,
      `dr[${kazanari}]: expected ${DISTRIBUTION_SIZE} damage entries`
    )
    const diceCount = damageEntries[0].length
    assert(diceCount === 203, `dr[${kazanari}]: expected 203 dice entries`)

    for (const [damage, diceEntries] of damageEntries.entries()) {
      assert(
        diceEntries.length === diceCount,
        `dr[${kazanari}][${damage}]: inconsistent dice entry count`
      )
    }

    const distributions = Array.from({ length: diceCount }, (_, dice) =>
      toSparseDistribution(
        damageEntries.map((diceEntries) => diceEntries[dice]),
        `dr[${kazanari}][dice=${dice}]`,
        { requireNormalized: false }
      )
    )
    const asset = createAsset(
      'dr',
      { kazanari },
      { dice: { start: 0, count: diceCount } },
      distributions
    )
    assets.set(`dr/kazanari-${kazanari}.json`, serialize(asset))
  })

  const convertOneDimensionalTable = (
    dataset,
    distributions,
    expectedCount
  ) => {
    assert(
      distributions.length === expectedCount,
      `${dataset}: expected ${expectedCount} dice entries`
    )
    return createAsset(
      dataset,
      {},
      { dice: { start: 0, count: expectedCount } },
      distributions.map((distribution, dice) =>
        toSparseDistribution(distribution, `${dataset}[${dice}]`)
      )
    )
  }

  assets.set(
    'd10.json',
    serialize(convertOneDimensionalTable('d10', d10, 104))
  )
  assets.set(
    'livingdead.json',
    serialize(convertOneDimensionalTable('livingdead', livingdead, 100))
  )

  return assets
}

function createManifest(assets) {
  const files = {}

  for (const [filename, content] of [...assets.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    files[filename] = {
      bytes: Buffer.byteLength(content),
      sha256: getSha256(content),
    }
  }

  return serialize({
    schemaVersion: SCHEMA_VERSION,
    dataRevision: DATA_REVISION,
    distributionSize: DISTRIBUTION_SIZE,
    files,
  })
}

async function listFiles(directory) {
  const files = []

  async function visit(currentDirectory) {
    let entries
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') {
        return
      }
      throw error
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
      } else if (entry.isFile()) {
        files.push(path.relative(directory, absolutePath).replaceAll('\\', '/'))
      }
    }
  }

  await visit(directory)
  return files.sort()
}

async function checkAssets(expectedFiles) {
  const actualFilenames = await listFiles(outputDirectory)
  const expectedFilenames = [...expectedFiles.keys()].sort()
  const issues = []

  for (const filename of expectedFilenames) {
    let actualContent
    try {
      actualContent = await readFile(path.join(outputDirectory, filename), 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') {
        issues.push(`missing: ${filename}`)
        continue
      }
      throw error
    }

    if (actualContent !== expectedFiles.get(filename)) {
      issues.push(`outdated: ${filename}`)
    }
  }

  for (const filename of actualFilenames) {
    if (!expectedFiles.has(filename)) {
      issues.push(`unexpected: ${filename}`)
    }
  }

  assert(
    issues.length === 0,
    `generated precomputed data is not up to date:\n${issues.join('\n')}`
  )
}

async function writeAssets(expectedFiles) {
  await mkdir(outputDirectory, { recursive: true })

  for (const [filename, content] of expectedFiles) {
    const outputPath = path.resolve(outputDirectory, filename)
    assert(
      outputPath.startsWith(`${path.resolve(outputDirectory)}${path.sep}`),
      `refusing to write outside output directory: ${filename}`
    )
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, content, 'utf8')
  }

  const expectedFilenames = new Set(expectedFiles.keys())
  for (const filename of await listFiles(outputDirectory)) {
    if (!expectedFilenames.has(filename)) {
      const outputPath = path.resolve(outputDirectory, filename)
      assert(
        outputPath.startsWith(`${path.resolve(outputDirectory)}${path.sep}`),
        `refusing to delete outside output directory: ${filename}`
      )
      await unlink(outputPath)
    }
  }
}

const assets = await createAssets()
const expectedFiles = new Map(assets)
expectedFiles.set('manifest.json', createManifest(assets))

if (checkOnly) {
  await checkAssets(expectedFiles)
  console.log(`Verified ${assets.size} precomputed data assets.`)
} else {
  await writeAssets(expectedFiles)
  console.log(`Generated ${assets.size} precomputed data assets.`)
}
