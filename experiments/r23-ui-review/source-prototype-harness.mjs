import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  getSourcePrototypeVariant,
  validateSourcePrototypeDefinitions,
} from './source-prototype-definitions.js'

export function countLiteralOccurrences(source, needle) {
  if (needle.length === 0) {
    return 0
  }
  let count = 0
  let offset = 0
  while (true) {
    const index = source.indexOf(needle, offset)
    if (index < 0) {
      return count
    }
    count += 1
    offset = index + needle.length
  }
}

export function applyExactReplacements(source, replacements, file = '<source>') {
  let next = source
  for (const candidate of replacements) {
    const actualCount = countLiteralOccurrences(next, candidate.from)
    if (actualCount !== candidate.expectedCount) {
      throw new Error([
        `source replacement count mismatch: ${file}`,
        `expected=${candidate.expectedCount}`,
        `actual=${actualCount}`,
      ].join(' '))
    }
    next = next.split(candidate.from).join(candidate.to)
  }
  return next
}

export async function readPrototypeSources(root, variant) {
  const snapshots = []
  const transformed = []
  for (const target of variant.targets) {
    const path = join(root, target.file)
    const source = await readFile(path)
    const text = source.toString('utf8')
    snapshots.push(Object.freeze({ path, source }))
    transformed.push(Object.freeze({
      path,
      source: Buffer.from(applyExactReplacements(text, target.replacements, target.file), 'utf8'),
    }))
  }
  return Object.freeze({ snapshots: Object.freeze(snapshots), transformed: Object.freeze(transformed) })
}

export async function writePrototypeSources(transformed) {
  for (const target of transformed) {
    await writeFile(target.path, target.source)
  }
}

export async function restorePrototypeSources(snapshots) {
  for (const snapshot of snapshots) {
    await writeFile(snapshot.path, snapshot.source)
  }
  for (const snapshot of snapshots) {
    const restored = await readFile(snapshot.path)
    if (!restored.equals(snapshot.source)) {
      throw new Error(`source restoration mismatch: ${snapshot.path}`)
    }
  }
}

export async function withTemporarySourcePrototype({
  root,
  variantId,
  variant: providedVariant,
  build,
  capture,
}) {
  const variant = providedVariant ?? getSourcePrototypeVariant(variantId)
  const definitionErrors = validateSourcePrototypeDefinitions()
  if (definitionErrors.length > 0) {
    throw new Error(`Invalid source prototype definitions:\n${definitionErrors.join('\n')}`)
  }
  const { snapshots, transformed } = await readPrototypeSources(root, variant)
  let restored = false
  try {
    await writePrototypeSources(transformed)
    await build(variant)
    await restorePrototypeSources(snapshots)
    restored = true
    return await capture(variant)
  } finally {
    if (!restored) {
      await restorePrototypeSources(snapshots)
    }
  }
}
