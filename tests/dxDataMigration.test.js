import { readFile } from 'node:fs/promises'

import { beforeAll, describe, expect, it } from 'vitest'

import legacyDx from '../src/data/dx.json'
import { getScore as getLegacyScore } from './legacy/LegacyCalculator'
import { registerDxAsset } from '../src/data/PrecomputedDataRepository'
import { getScore } from '../src/data/ScoreCalculator'

const migratedAssets = []
const MIGRATION_TOLERANCE = 1e-6 + 1e-12

function assertSameDistribution(legacy, migrated, context) {
  for (let index = 0; index < 1024; index += 1) {
    const legacyIndex = index - legacy.pre
    const migratedIndex = index - migrated.offset
    const legacyProbability =
      legacyIndex >= 0 && legacyIndex < legacy.val.length
        ? legacy.val[legacyIndex]
        : 0
    const migratedProbability =
      migratedIndex >= 0 && migratedIndex < migrated.values.length
        ? migrated.values[migratedIndex]
        : 0
    if (
      Math.abs(migratedProbability - legacyProbability) >
      MIGRATION_TOLERANCE
    ) {
      throw new Error(`${context}: probability mismatch at ${index}`)
    }
  }
}

describe('dx data migration', () => {
  beforeAll(async () => {
    for (let shihai = 0; shihai < legacyDx.length; shihai += 1) {
      const assetUrl = new URL(
        `../public/data/schema-v1/revision-3/dx/shihai-${shihai}.json`,
        import.meta.url
      )
      const asset = JSON.parse(await readFile(assetUrl, 'utf8'))
      migratedAssets.push(asset)
      registerDxAsset(asset)
    }
  })

  it('preserves every precomputed probability within rounding tolerance', () => {
    for (let shihai = 0; shihai < legacyDx.length; shihai += 1) {
      const migrated = migratedAssets[shihai]
      for (let dice = 0; dice < legacyDx[shihai].length; dice += 1) {
        for (
          let criticalIndex = 0;
          criticalIndex < legacyDx[shihai][dice].length;
          criticalIndex += 1
        ) {
          assertSameDistribution(
            legacyDx[shihai][dice][criticalIndex],
            migrated.distributions[dice][criticalIndex],
            `dx[${shihai}][${dice}][${criticalIndex + 2}]`
          )
        }
      }
    }
  })

  it.each([
    { dice: 1, critical: 10, skill: 0, yousei: 0, shihai: 0 },
    { dice: 0, critical: 10, skill: 0, yousei: 0, shihai: 0 },
    { dice: 99, critical: 2, skill: 0, yousei: 0, shihai: 0 },
    { dice: 10, critical: 7, skill: -999, yousei: 0, shihai: 0 },
    { dice: 10, critical: 7, skill: 999, yousei: 0, shihai: 0 },
    { dice: 10, critical: 8, skill: 5, yousei: 2, shihai: 0 },
    { dice: 20, critical: 10, skill: 0, yousei: 0, shihai: 19 },
    { dice: 5, critical: 11, skill: 3, yousei: 0, shihai: 5 },
  ])('preserves the legacy score result for %o', (params) => {
    expect(getScore(params)).toEqual(getLegacyScore(params))
  })
})
