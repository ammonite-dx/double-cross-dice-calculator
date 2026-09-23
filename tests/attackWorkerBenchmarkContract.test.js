import { describe, expect, it } from 'vitest'

import {
  BENCHMARK_CASE_IDS,
} from '../experiments/phase2h-browser/canonical-attack-fixtures.js'

describe('canonical Attack Worker browser benchmark contract', () => {
  it('keeps the seven Phase 2-H fixture ids', () => {
    expect(BENCHMARK_CASE_IDS).toEqual([
      'small-normal-kazanari-0',
      'fixed-shift-defence',
      'kazanari-3',
      'failure-mass',
      'combo-total-3',
      'range-warning-boundary',
      'range-reject-boundary',
    ])
  })

})
