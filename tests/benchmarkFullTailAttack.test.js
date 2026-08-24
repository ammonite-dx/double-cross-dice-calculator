import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ATTACK_CASES,
  BENCHMARK_RANGE_POLICY,
  BENCHMARK_CASES,
  DR_CASES,
  formatHumanReport,
  MAX_ITERATIONS,
  MAX_WARMUP_ITERATIONS,
  parseBenchmarkArgs,
  PRODUCTION_RANGE_POLICY,
} from '../scripts/benchmark-full-tail-attack.mjs'
import { planCalculationRanges } from '../src/calculation/RangePlanner'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)

describe('full-tail Attack resource benchmark contract', () => {
  it('keeps the DR matrix above the legacy 202-dice boundary', () => {
    expect(DR_CASES).toHaveLength(15)
    expect(DR_CASES.map(({ dice }) => dice)).toEqual([
      202, 202, 202,
      300, 300, 300,
      400, 400, 400,
      600, 600, 600,
      800, 800, 800,
    ])
    expect(DR_CASES.map(({ kazanari }) => kazanari)).toEqual([
      0, 1, 9,
      0, 1, 9,
      0, 1, 9,
      0, 1, 9,
      0, 1, 9,
    ])
  })

  it('keeps the boundary and stress Attack matrix on the canonical path', () => {
    expect(ATTACK_CASES).toHaveLength(9)
    expect(ATTACK_CASES.map(({ id }) => id)).toEqual([
      'attack-99d-critical2-skill0-kazanari0',
      'attack-202d-critical11-skill0-attack99',
      'attack-300d-critical11-skill999-attack197',
      'attack-400d-critical2-skill999-attack72',
      'attack-600d-critical2-skill999-attack272',
      'attack-99d-critical2-kazanari1',
      'attack-99d-critical2-kazanari9',
      'attack-99d-critical2-skill999-yousei9-shihai0',
      'attack-99d-critical2-skill999-yousei0-shihai19',
    ])
    expect(ATTACK_CASES[0].params.action.score).toMatchObject({
      dice: 99,
      critical: 2,
      skill: 0,
      yousei: 0,
      shihai: 0,
    })
    expect(ATTACK_CASES[7].params.action.score).toMatchObject({
      dice: 99,
      critical: 2,
      skill: 999,
      shihai: 0,
      yousei: 9,
    })
    expect(ATTACK_CASES[8].params.action.score).toMatchObject({
      dice: 99,
      critical: 2,
      skill: 999,
      shihai: 19,
      yousei: 0,
    })
    for (const { params } of ATTACK_CASES) {
      expect(params.action.score.dice).toBe(99)
      expect([2, 11]).toContain(params.action.score.critical)
      expect(params.action).not.toHaveProperty('weights')
      expect(params.action.damage).toMatchObject({
        value: 999,
      })
      expect(params.reaction.damage.dice).toBe(99)
    }
    expect(ATTACK_CASES.map(({ params }) => params.action.damage.dice))
      .toEqual([99, 99, 197, 72, 272, 99, 99, 99, 99])
    expect(ATTACK_CASES.map(({ params }) => params.action.damage.kazanari))
      .toEqual([0, 0, 0, 0, 0, 1, 9, 9, 9])
    expect(BENCHMARK_CASES).toHaveLength(24)
  })

  it('widens only benchmark planner thresholds and preserves production policy shape', () => {
    expect(PRODUCTION_RANGE_POLICY).toEqual({
      scorePropagation: 'full-tail',
    })
    expect(BENCHMARK_RANGE_POLICY.scorePropagation).toBe('full-tail')
    expect(BENCHMARK_RANGE_POLICY.limits.warning).toEqual({
      estimatedTimeMs: Number.MAX_SAFE_INTEGER,
      estimatedMemoryBytes: Number.MAX_SAFE_INTEGER,
      workingLength: Number.MAX_SAFE_INTEGER,
      fftLength: Number.MAX_SAFE_INTEGER,
    })
    expect(BENCHMARK_RANGE_POLICY.limits.hard).toEqual(
      BENCHMARK_RANGE_POLICY.limits.warning
    )
    expect(BENCHMARK_RANGE_POLICY).not.toHaveProperty('calculationMax')
    expect(BENCHMARK_RANGE_POLICY).not.toHaveProperty('display')
    expect(BENCHMARK_RANGE_POLICY).not.toHaveProperty('costModel')
  })

  it('keeps every Attack matrix case on the planner-safe canonical path', () => {
    const expectedBoundaryMaxDamageDice = new Map([
      ['attack-202d-critical11-skill0-attack99', 202],
      ['attack-300d-critical11-skill999-attack197', 300],
      ['attack-400d-critical2-skill999-attack72', 400],
      ['attack-600d-critical2-skill999-attack272', 600],
    ])

    for (const { params } of ATTACK_CASES) {
      const plan = planCalculationRanges({
        operation: 'attack',
        score: {
          action: params.action.score,
          reaction: params.reaction.score,
        },
        attack: params.action.damage,
        defence: params.reaction.damage,
      }, BENCHMARK_RANGE_POLICY)

      expect(plan.accepted).toBe(true)
      expect(plan.propagation.score).toBe('full-tail')
      expect(plan.damage.scoreValueMode).toBe('full-tail')
      expect(plan.damage.maxDamageDice).toBeGreaterThan(0)
      expect(plan.damage.fftLength).toBeGreaterThan(0)
    }

    for (const testCase of ATTACK_CASES) {
      const expected = expectedBoundaryMaxDamageDice.get(testCase.id)
      if (expected === undefined) {
        continue
      }
      const params = testCase.params
      const plan = planCalculationRanges({
        operation: 'attack',
        score: {
          action: params.action.score,
          reaction: params.reaction.score,
        },
        attack: params.action.damage,
        defence: params.reaction.damage,
      }, BENCHMARK_RANGE_POLICY)
      expect(plan.damage.maxDamageDice).toBe(expected)
    }
  })

  it('parses bounded JSON and iteration options', () => {
    expect(parseBenchmarkArgs([
      '--json',
      '--iterations=4',
      '--warmup',
      '0',
    ])).toEqual({
      json: true,
      help: false,
      iterations: 4,
      warmupIterations: 0,
    })
    expect(() => parseBenchmarkArgs([
      '--iterations',
      String(MAX_ITERATIONS + 1),
    ])).toThrow('must not exceed')
    expect(() => parseBenchmarkArgs([
      '--warmup',
      String(MAX_WARMUP_ITERATIONS + 1),
    ])).toThrow('must not exceed')
  })

  it('exposes the package script and required human-readable fields', () => {
    expect(packageJson.scripts['benchmark:full-tail-attack'])
      .toBe('node scripts/benchmark-full-tail-attack.mjs')

    const output = formatHumanReport({
      metadata: {
        node: { version: 'test' },
        machine: { platform: 'test', arch: 'test' },
      },
      resultDigest: 42,
      cases: [{
        id: 'contract-case',
        kind: 'runtime-dr',
        status: 'measured',
        accepted: true,
        productionAccepted: null,
        productionStatus: null,
        productionRejectionReasons: [],
        benchmarkAccepted: true,
        benchmarkStatus: 'measured',
        scoreCutoff: null,
        maxDamageDice: 300,
        rawSupportMax: 3000,
        workingLength: 3001,
        fftLength: 4096,
        distributionLength: 3001,
        kazanari: 9,
        elapsed: {
          productionPlanner: null,
          planner: null,
          execution: {
            coldMs: 1,
            warm: {
              medianMs: 2,
              p95Ms: 3,
            },
          },
        },
        estimatedTimeMs: null,
        estimatedMemoryBytes: null,
        productionEstimatedTimeMs: null,
        productionEstimatedMemoryBytes: null,
        error: null,
        resultDigest: 7,
      }],
    })

    expect(output).toContain('scoreCutoff=-')
    expect(output).toContain('production=-/-')
    expect(output).toContain('benchmark=true/measured')
    expect(output).toContain('maxDamageDice=300')
    expect(output).toContain('rawSupportMax=3000')
    expect(output).toContain('workingLength=3001')
    expect(output).toContain('fftLength=4096')
    expect(output).toContain('distributionLength=3001')
    expect(output).toContain('kazanari=9')
    expect(output).toContain('estimatedTimeMs=-')
    expect(output).toContain('estimatedMemoryBytes=-')
    expect(output).toContain('digest=7')
  })
})
