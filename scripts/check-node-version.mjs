import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/
const rangePattern = /^>=(\d+)\.(\d+)(?:\.(\d+))?\s+<(\d+)(?:\.(\d+))?(?:\.(\d+))?$/

function versionTuple(match, offset) {
  return match.slice(offset, offset + 3).map((part) => Number(part ?? 0))
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index]
    }
  }

  return 0
}

function formatVersion(version) {
  return version.join('.')
}

try {
  const [packageJsonText, nodeVersionText] = await Promise.all([
    readFile(path.join(rootDirectory, 'package.json'), 'utf8'),
    readFile(path.join(rootDirectory, '.node-version'), 'utf8'),
  ])
  const packageJson = JSON.parse(packageJsonText)
  const expectedVersion = nodeVersionText.trim().replace(/^v/, '')
  const engineRange = packageJson.engines?.node
  const expectedMatch = versionPattern.exec(expectedVersion)
  const rangeMatch = typeof engineRange === 'string' ? rangePattern.exec(engineRange) : null

  if (!expectedMatch) {
    throw new Error(`.node-version must contain a full version such as 22.23.2; found ${JSON.stringify(expectedVersion)}.`)
  }

  if (!rangeMatch) {
    throw new Error(`Unsupported package.json engines.node range: ${JSON.stringify(engineRange)}.`)
  }

  const expectedTuple = versionTuple(expectedMatch, 1)
  const lowerBound = versionTuple(rangeMatch, 1)
  const upperBound = versionTuple(rangeMatch, 4)
  const actualVersion = process.versions.node
  const actualMatch = versionPattern.exec(actualVersion)
  const errors = []

  if (compareVersions(expectedTuple, lowerBound) < 0 || compareVersions(expectedTuple, upperBound) >= 0) {
    errors.push(`.node-version ${expectedVersion} is outside engines.node ${engineRange}.`)
  }

  if (!actualMatch) {
    errors.push(`Unable to parse the running Node.js version ${actualVersion}.`)
  } else {
    const actualTuple = versionTuple(actualMatch, 1)

    if (compareVersions(actualTuple, lowerBound) < 0 || compareVersions(actualTuple, upperBound) >= 0) {
      errors.push(`Running Node.js ${actualVersion} is outside engines.node ${engineRange}.`)
    }

    if (actualVersion !== expectedVersion) {
      errors.push(`Running Node.js ${actualVersion} does not match .node-version ${expectedVersion}.`)
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  console.log(`Node.js ${formatVersion(expectedTuple)} matches .node-version and package.json engines.node (${engineRange}).`)
} catch (error) {
  console.error(`Node.js version check failed:\n${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
