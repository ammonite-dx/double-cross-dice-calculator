import { describe, expect, it } from 'vitest'

import {
  BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN,
  enumerateBacktrackStressInputs,
  selectBacktrackStressSlice,
} from '../experiments/r23-ui-review/backtrack-label-stress.mjs'
import {
  BACKTRACK_LABEL_STRESS_FIXTURES,
} from '../experiments/r23-ui-review/backtrack-label-stress-fixtures.js'

describe('R23 Backtrack label stress selection', () => {
  it('selects an exact threshold before farther slices', () => {
    expect(selectBacktrackStressSlice([
      { chart: 'single', label: 'far', value: 10.1 },
      { chart: 'single', label: 'exact', value: 10 },
      { chart: 'single', label: 'small', value: 9.9 },
    ])).toEqual({
      chart: 'single',
      label: 'exact',
      value: 10,
      distanceFromThreshold: 0,
    })
  })

  it('uses the longer label as the deterministic tie-breaker', () => {
    expect(selectBacktrackStressSlice([
      { label: '短', value: 10.5 },
      { label: 'より長いラベル', value: 10.5 },
      { label: '閾値', value: 12 },
    ])).toEqual({
      label: 'より長いラベル',
      value: 10.5,
      distanceFromThreshold: 0.5,
    })
  })

  it('rejects slices below the formatter threshold', () => {
    expect(selectBacktrackStressSlice([
      { label: 'hidden', value: 9.99 },
      { label: 'also hidden', value: 0 },
    ])).toBeNull()
  })

  it('keeps the fixed search domain and candidate count reproducible', () => {
    const inputs = enumerateBacktrackStressInputs()
    expect(inputs).toHaveLength(
      BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN.encroachment.length
      * BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN.lois.length
      * BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN.elois.length
      * BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN.dice.length
      * BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN.value.length,
    )
    expect(inputs[0]).toEqual({
      encroachment: 70,
      lois: 0,
      elois: 0,
      dice: 0,
      value: 0,
    })
  })

  it('pins ordinary and Living Dead winners at the displayed 10% boundary', () => {
    expect(BACKTRACK_LABEL_STRESS_FIXTURES.ordinary.selectedSlice).toMatchObject({
      probability: 10,
      distanceFrom10Percent: 0,
    })
    expect(BACKTRACK_LABEL_STRESS_FIXTURES.livingdead.selectedSlice).toMatchObject({
      probability: 10,
      distanceFrom10Percent: 0,
    })
    expect(BACKTRACK_LABEL_STRESS_FIXTURES.ordinary.params.dlois).toBe('なし')
    expect(BACKTRACK_LABEL_STRESS_FIXTURES.livingdead.params.dlois).toBe('屍人')
  })
})
