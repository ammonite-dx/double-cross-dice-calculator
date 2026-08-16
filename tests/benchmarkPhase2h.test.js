import { describe, expect, it } from 'vitest'

import {
  BENCHMARK_CASES,
  createMeasurementReport,
  formatHumanReport,
  parseBenchmarkArgs,
  summarizeSamples,
} from '../scripts/benchmark-phase2h.mjs'

describe('Phase 2-H Node benchmark helpers', () => {
  it('summarizes cold and warm samples with nearest-rank p95', () => {
    expect(summarizeSamples([3, 1, 2, 10])).toEqual({
      sampleCount: 4,
      minMs: 1,
      medianMs: 2,
      p95Ms: 10,
      maxMs: 10,
    })
  })

  it('keeps the measurement output shape separate for cold and warm', () => {
    expect(createMeasurementReport({
      name: 'synthetic-stage',
      scope: 'synthetic',
      constraint: 'test-only',
      coldMilliseconds: [4],
      warmMilliseconds: [2, 3],
      result: { used: true },
      resultDigest: 12,
    })).toEqual({
      name: 'synthetic-stage',
      scope: 'synthetic',
      status: 'measured',
      constraint: 'test-only',
      cold: {
        sampleCount: 1,
        minMs: 4,
        medianMs: 4,
        p95Ms: 4,
        maxMs: 4,
      },
      warm: {
        sampleCount: 2,
        minMs: 2,
        medianMs: 2,
        p95Ms: 3,
        maxMs: 3,
      },
      result: { used: true },
      resultDigest: 12,
    })
  })

  it('parses JSON and iteration overrides', () => {
    expect(parseBenchmarkArgs([
      '--json',
      '--iterations',
      '4',
      '--warmup=0',
    ])).toEqual({
      json: true,
      help: false,
      iterations: 4,
      warmupIterations: 0,
    })
  })

  it.each([
    ['--iterations=0', 'positive'],
    ['--iterations nope', 'integer'],
    ['--warmup=-1', 'integer'],
    ['--unknown', 'Unknown'],
  ])('rejects invalid argument: %s', (argument, expectedMessage) => {
    expect(() => parseBenchmarkArgs(argument.split(' ')))
      .toThrow(expectedMessage)
  })

  it('fixes the required representative case dimensions', () => {
    expect(BENCHMARK_CASES).toHaveLength(7)
    expect(BENCHMARK_CASES.map((testCase) => testCase.id)).toEqual([
      'small-normal-kazanari-0',
      'fixed-shift-defence',
      'kazanari-3',
      'failure-mass',
      'combo-total-3',
      'range-warning-boundary',
      'range-reject-boundary',
    ])
    expect(BENCHMARK_CASES.find((testCase) => testCase.id === 'combo-total-3')
      .entries).toHaveLength(3)
    expect(BENCHMARK_CASES.find((testCase) => testCase.id === 'range-warning-boundary')
      .execution).toBe('planner-only')
    expect(BENCHMARK_CASES.find((testCase) => testCase.id === 'range-reject-boundary')
      .execution).toBe('full')
    expect(BENCHMARK_CASES.find((testCase) => testCase.id === 'range-reject-boundary')
      .plannerPolicy.limits.hard.estimatedTimeMs).toBe(0)
  })

  it('prints both a stage reason and error detail without empty failure text', () => {
    const output = formatHumanReport({
      metadata: {
        node: { version: 'test' },
        machine: { platform: 'test', arch: 'test' },
        commit: null,
      },
      cases: [{
        id: 'error-case',
        label: 'error',
        route: 'attack',
        iterations: 1,
        warmupIterations: 0,
        status: 'error',
        reason: null,
        stages: [
          {
            name: 'broken-with-detail',
            status: 'error',
            reason: 'operation failed',
            error: 'Error: root cause',
          },
          {
            name: 'broken-without-detail',
            status: 'error',
            reason: '',
            error: '',
          },
        ],
      }],
    })

    expect(output).toContain(
      'broken-with-detail: error (operation failed); error=Error: root cause'
    )
    expect(output).toContain(
      'broken-without-detail: error (benchmark stage failed); error=error detail unavailable'
    )
    expect(output).not.toContain('undefined')
  })
})
