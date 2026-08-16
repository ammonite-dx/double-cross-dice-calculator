import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  BENCHMARK_CASE_IDS,
} from '../experiments/phase2h-browser/canonical-attack-fixtures.js'

const benchmarkSource = readFileSync(
  new URL(
    '../experiments/phase2h-browser/canonical-attack-worker-benchmark.js',
    import.meta.url
  ),
  'utf8'
)
const cancelProbeSource = benchmarkSource.slice(
  benchmarkSource.indexOf('async function runCancelProbe()'),
  benchmarkSource.indexOf('async function runStaleProbe()')
)

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

  it('measures the public batch boundary instead of direct canonical damage', () => {
    expect(benchmarkSource).toContain(
      'calculationClient.calculateAttackCanonicalBatch'
    )
    expect(benchmarkSource).not.toContain('calculateCanonicalDamageOnDemand(')
  })

  it('keeps the production Worker protocol diagnostic-only', () => {
    expect(benchmarkSource).toContain('existing RuntimeDamageRollClient -> RuntimeDamageRollWorker')
    expect(benchmarkSource).toContain('globalThis.Worker = class InstrumentedWorker')
    expect(benchmarkSource).toContain('globalThis.fetch = async')
  })

  it('cancels synchronously at the preflight boundary', () => {
    expect(cancelProbeSource).toContain('onRangePlan: (plan) => {')
    expect(cancelProbeSource).toContain('abortSent = true')
    expect(cancelProbeSource).toContain('controller.abort()')
    expect(cancelProbeSource).toContain("abortBoundary: 'onRangePlan-preflight'")
    expect(cancelProbeSource).not.toContain('const timer = setTimeout')
    expect(cancelProbeSource).not.toContain('clearTimeout(timer)')
  })
})
