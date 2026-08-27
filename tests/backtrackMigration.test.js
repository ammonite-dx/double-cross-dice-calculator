import { describe, expect, it } from 'vitest'

import {
  getFinalEncroachment as getLegacyFinalEncroachment,
} from './legacy/LegacyCalculator'
import {
  getFinalEncroachment,
} from '../src/data/BacktrackCalculator'
import { registerD10Asset } from '../src/data/D10PrecomputedDataRepository'
import {
  registerLivingdeadAsset,
} from '../src/data/ReferencePrecomputedDataRepository'
import d10 from '../public/data/schema-v2/revision-1/d10.json'
import livingdead from '../public/data/schema-v2/revision-1/livingdead.json'

registerD10Asset(d10)
registerLivingdeadAsset(livingdead)

const dloisValues = [
  'なし',
  '戦闘用人格・生きる伝説',
  '生還者',
  '不死者・悪夢',
  '屍人',
  '戦友(通常)',
  '戦友(強化)',
]

const parameterSets = [
  {
    encroachment: 100,
    lois: 7,
    elois: 0,
    dice: 0,
    value: 0,
  },
  {
    encroachment: 142,
    lois: 3,
    elois: 2,
    dice: 4,
    value: 7,
  },
  {
    encroachment: 79,
    lois: 1,
    elois: 0,
    dice: 1,
    value: 20,
  },
]

describe('backtrack calculator migration', () => {
  it.each(dloisValues)(
    'preserves the legacy result outside the corrected boundary for %s',
    (dlois) => {
      for (const params of parameterSets) {
        const completeParams = { ...params, dlois }
        const actual = getFinalEncroachment(completeParams)
        const legacy = getLegacyFinalEncroachment(completeParams)

        if (dlois === '不死者・悪夢') {
          expect(actual.double).toEqual(legacy.double)
          expect(actual.second).toEqual(legacy.second)
        } else {
          expect(actual).toEqual(legacy)
        }
      }
    }
  )

  it.each([
    [120, [100, 0, 0, 0, 0, 0]],
    [119, [0, 100, 0, 0, 0, 0]],
    [100, [0, 100, 0, 0, 0, 0]],
    [99, [0, 0, 100, 0, 0, 0]],
  ])(
    'classifies nightmare boundary %i without gaps',
    (encroachment, expected) => {
      const result = getFinalEncroachment({
        encroachment,
        lois: 0,
        elois: 0,
        dice: 0,
        value: 0,
        dlois: '不死者・悪夢',
      })

      expect(result.single).toEqual(expected)
      expect(result.single.reduce((sum, value) => sum + value, 0)).toBe(100)
    }
  )
})
