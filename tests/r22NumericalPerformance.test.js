import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ATTACK_FIXTURES,
  BACKTRACK_FIXTURES,
  CHECK_FIXTURES,
  D10_FIXTURES,
  SHIHAI_STRESS_CANDIDATES,
  YOUSEI_STRESS_CANDIDATES,
  createFixtureSet,
  selectFirstAcceptedCandidate,
} from '../experiments/r22-numerical-performance/fixtures.js'
import {
  evaluatePotentialTriggers,
  getFixturePlan,
  invokeFixture,
  summarizeSamples,
  validateMeasurementOptions,
} from '../experiments/r22-numerical-performance/measurement.js'
import { createResultDigest } from '../experiments/r22-numerical-performance/result-digest.js'
import { createTraceRecorder } from '../experiments/r22-numerical-performance/trace-dependencies.js'
import { parseArgs } from '../experiments/r22-numerical-performance/node-benchmark.mjs'
import { parseArgs as parseBrowserArgs } from '../experiments/r22-numerical-performance/playwright-runner.mjs'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)
const browserBenchmarkSource = readFileSync(
  new URL('../experiments/r22-numerical-performance/benchmark.js', import.meta.url),
  'utf8'
)

describe('R22 numerical performance experiment contract', () => {
  it('keeps the required accepted-workload fixture families', () => {
    expect(CHECK_FIXTURES.map(({ id }) => id)).toEqual([
      'check-ordinary',
      'check-tail-heavy',
      'check-yousei',
    ])
    expect(ATTACK_FIXTURES.map(({ id }) => id)).toEqual([
      'attack-ordinary',
      'attack-kazanari',
      'attack-fixed-evasion',
      'attack-large-accepted',
    ])
    expect(BACKTRACK_FIXTURES.map(({ id }) => id)).toEqual([
      'backtrack-ordinary',
      'backtrack-livingdead',
      'backtrack-high-input',
    ])
    expect(D10_FIXTURES.map(({ dice }) => dice)).toEqual([3, 12, 99, 197, 272])
  })

  it('selects the first planner-accepted stress candidate without timing input', () => {
    const calls = []
    const selection = selectFirstAcceptedCandidate(
      SHIHAI_STRESS_CANDIDATES,
      (params) => {
        calls.push(params)
        return { accepted: params.dice === 75 }
      }
    )
    expect(selection.selected.params.dice).toBe(75)
    expect(calls.map(({ dice }) => dice)).toEqual([99, 75, 50, 36, 24, 12])
    expect(selection.attempts).toHaveLength(SHIHAI_STRESS_CANDIDATES.length)
    expect(YOUSEI_STRESS_CANDIDATES[0].yousei).toBe(9)
  })

  it('returns full range plans while DX invocation uses its score plan', async () => {
    const fullPlan = {
      accepted: true,
      scores: [{ workingLength: 128, fftLength: 0 }],
    }
    const modules = {
      planCalculationRanges: () => fullPlan,
    }
    const fixture = { operation: 'dx', params: { dice: 4 } }
    expect(getFixturePlan(modules, fixture)).toBe(fullPlan)

    const calls = []
    const runtime = {
      traced: {
        calculateDxDistribution: (params, options) => {
          calls.push({ params, options })
          return [1]
        },
      },
    }
    fixture.plan = fullPlan
    await invokeFixture(runtime, fixture)
    expect(calls[0].options.workingLength).toBe(128)
    expect(calls[0].options.fftLength).toBeUndefined()
  })

  it('keeps measurement options bounded and percentile summaries deterministic', () => {
    expect(validateMeasurementOptions({ iterations: 10, warmupIterations: 2 }))
      .toEqual({ iterations: 10, warmupIterations: 2 })
    expect(summarizeSamples([3, 1, 2])).toMatchObject({
      sampleCount: 3,
      medianMs: 2,
      p95Ms: 3,
    })
    expect(() => validateMeasurementOptions({ iterations: 0 }))
      .toThrow('iterations must be 1..100')
  })

  it('triggers only on synchronous spans or observed Long Tasks', () => {
    const base = {
      id: 'attack',
      timing: { warm: { p95Ms: 100 } },
      mainThread: { synchronous: { p95Ms: 3 } },
      longTasks: { maxDurationMs: null },
    }
    expect(evaluatePotentialTriggers([base])).toEqual([])
    expect(evaluatePotentialTriggers([{
      ...base,
      mainThread: { synchronous: { p95Ms: 17 } },
    }])).toHaveLength(1)
    expect(evaluatePotentialTriggers([{
      ...base,
      longTasks: { maxDurationMs: 50 },
    }])).toHaveLength(1)
    expect(evaluatePotentialTriggers([base], { syncP95ThresholdMs: 50 })).toEqual([])
  })

  it('records sync and async trace kinds without changing the result', async () => {
    const tracer = createTraceRecorder()
    const value = { answer: 42 }
    const observed = await tracer.wrap('async-dependency', async () => value)()
    expect(observed).toBe(value)
    expect(tracer.wrap('sync-dependency', () => value)()).toBe(value)
    expect(tracer.slice().map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'async-dependency', kind: 'async' },
      { name: 'sync-dependency', kind: 'sync' },
    ])
    expect(createResultDigest(observed)).toBe(createResultDigest(value))
  })

  it('keeps browser experiments outside UI and chart layers', () => {
    expect(browserBenchmarkSource).not.toMatch(/src\/(features|shared\/chart|components|views)/)
    expect(browserBenchmarkSource).not.toMatch(/from ['"](?:vue|chart\.js|vue-chartjs)/)
    expect(packageJson.scripts['benchmark:r22:numerical:node'])
      .toBe('node experiments/r22-numerical-performance/node-benchmark.mjs')
    expect(packageJson.scripts['benchmark:r22:numerical:browser'])
      .toBe('node experiments/r22-numerical-performance/playwright-runner.mjs')
    expect(packageJson.scripts['benchmark:r22:numerical:browser:short'])
      .toBe('node experiments/r22-numerical-performance/playwright-runner.mjs --iterations 1 --warmup 0 --runs 1')
  })

  it('parses bounded Node and browser runner options', () => {
    expect(parseArgs(['--iterations', '2', '--warmup=0']))
      .toMatchObject({ iterations: 2, warmupIterations: 0 })
    expect(parseBrowserArgs(['--runs', '2', '--engines', 'chrome']))
      .toMatchObject({ runs: 2, engines: ['chrome'] })
    expect(() => parseBrowserArgs(['--engines', 'unknown'])).toThrow(
      'unknown engine: unknown'
    )
  })

  it('can construct a complete fixture set from prepared production envelopes', () => {
    const fixtures = createFixtureSet({
      shihaiSelection: { selected: null, attempts: [] },
      youseiSelection: { selected: null, attempts: [] },
      totalDamages: [
        { distribution: new Float64Array([1]), min: 0, max: 0 },
        { distribution: new Float64Array([1]), min: 0, max: 0 },
      ],
      scorePair: { action: [1], reaction: [1] },
    })
    expect(fixtures.some(({ id }) => id === 'total-damage-8')).toBe(true)
  })
})
