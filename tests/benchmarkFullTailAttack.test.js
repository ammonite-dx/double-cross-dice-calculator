import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ATTACK_CASES,
  BENCHMARK_CASES,
  DR_CASES,
  formatHumanReport,
  MAX_ITERATIONS,
  MAX_WARMUP_ITERATIONS,
  parseBenchmarkArgs,
} from '../scripts/benchmark-full-tail-attack.mjs'

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

  it('keeps the requested high-bound Attack inputs in the matrix', () => {
    expect(ATTACK_CASES).toHaveLength(2)
    expect(ATTACK_CASES.map(({ params }) => params.action.score.yousei))
      .toEqual([0, 9])
    expect(ATTACK_CASES[0].params.action.score).toMatchObject({
      dice: 99,
      critical: 2,
      skill: 999,
      shihai: 19,
    })
    expect(ATTACK_CASES[1].params.action.score).toMatchObject({
      dice: 99,
      critical: 2,
      skill: 999,
      shihai: 0,
    })
    for (const { params } of ATTACK_CASES) {
      expect(params.action.damage).toMatchObject({
        dice: 99,
        kazanari: 9,
      })
      expect(params.reaction.damage.dice).toBe(99)
    }
    expect(BENCHMARK_CASES).toHaveLength(17)
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
        scoreCutoff: null,
        maxDamageDice: 300,
        rawSupportMax: 3000,
        workingLength: 3001,
        fftLength: 4096,
        distributionLength: 3001,
        kazanari: 9,
        elapsed: {
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
        error: null,
        resultDigest: 7,
      }],
    })

    expect(output).toContain('scoreCutoff=-')
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
