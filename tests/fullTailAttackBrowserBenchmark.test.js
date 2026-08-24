import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  FULL_TAIL_ATTACK_BENCHMARK_POLICY,
  FULL_TAIL_ATTACK_CASES,
  FULL_TAIL_ATTACK_CASE_IDS,
} from '../experiments/phase2h-browser/full-tail-attack-fixtures.js'
import { planCalculationRanges } from '../src/calculation/RangePlanner'

const runnerSource = readFileSync(
  new URL(
    '../experiments/phase2h-browser/playwright-runner.mjs',
    import.meta.url
  ),
  'utf8'
)
const benchmarkSource = readFileSync(
  new URL(
    '../experiments/phase2h-browser/full-tail-attack-resource-benchmark.js',
    import.meta.url
  ),
  'utf8'
)
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)

function plannerParams(entry) {
  return {
    operation: 'attack',
    score: {
      action: entry.params.action.score,
      reaction: entry.params.reaction.score,
    },
    attack: entry.params.action.damage,
    defence: entry.params.reaction.damage,
  }
}

describe('full-tail Attack browser resource benchmark contract', () => {
  it('contains the required damage matrix and stress cases', () => {
    expect(FULL_TAIL_ATTACK_CASE_IDS).toHaveLength(11)
    expect(FULL_TAIL_ATTACK_CASES.filter((entry) => entry.id.startsWith('matrix-')))
      .toHaveLength(9)
    expect(FULL_TAIL_ATTACK_CASES.map((entry) => entry.targetMaxDamageDice))
      .toEqual([
        202, 202, 202,
        400, 400, 400,
        600, 600, 600,
        626,
        427,
      ])
  })

  it('keeps each matrix label aligned with the actual planner damage range', () => {
    for (const testCase of FULL_TAIL_ATTACK_CASES) {
      const productionPlan = planCalculationRanges(
        plannerParams(testCase.entries[0]),
        { scorePropagation: 'full-tail' }
      )
      const benchmarkPlan = planCalculationRanges(
        plannerParams(testCase.entries[0]),
        FULL_TAIL_ATTACK_BENCHMARK_POLICY
      )

      expect(productionPlan.damage.maxDamageDice, testCase.id)
        .toBe(testCase.targetMaxDamageDice)
      expect(benchmarkPlan.damage.maxDamageDice, testCase.id)
        .toBe(testCase.targetMaxDamageDice)
      expect(benchmarkPlan.accepted, testCase.id).toBe(true)
    }
  })

  it('separates production rejection from permissive benchmark execution', () => {
    const stressCases = FULL_TAIL_ATTACK_CASES.filter(
      (entry) => entry.id.startsWith('stress-')
    )
    for (const testCase of stressCases) {
      const productionPlan = planCalculationRanges(
        plannerParams(testCase.entries[0]),
        { scorePropagation: 'full-tail' }
      )
      const benchmarkPlan = planCalculationRanges(
        plannerParams(testCase.entries[0]),
        FULL_TAIL_ATTACK_BENCHMARK_POLICY
      )

      expect(productionPlan.accepted, testCase.id).toBe(false)
      expect(productionPlan.rejectionReasons, testCase.id).toContain(
        'estimated-time'
      )
      expect(benchmarkPlan.accepted, testCase.id).toBe(true)
    }
  })

  it('keeps the benchmark policy threshold-only and records browser diagnostics', () => {
    expect(FULL_TAIL_ATTACK_BENCHMARK_POLICY).not.toHaveProperty('calculationMax')
    expect(FULL_TAIL_ATTACK_BENCHMARK_POLICY).not.toHaveProperty('display')
    expect(FULL_TAIL_ATTACK_BENCHMARK_POLICY).not.toHaveProperty('costModel')
    expect(benchmarkSource).toContain('calculationClient.planAttackCombo')
    expect(benchmarkSource).toContain('calculateAttackCanonicalBatch')
    expect(benchmarkSource).toContain('performance.memory')
    expect(benchmarkSource).toContain("supported: longTaskSupported")
    expect(benchmarkSource).toContain('responseElapsedMs')
    expect(benchmarkSource).toContain('FULL_TAIL_ATTACK_BENCHMARK_POLICY')
  })

  it('adds a dedicated Playwright target and short command without changing the existing target', () => {
    expect(runnerSource).toContain("id: 'full-tail-attack-resource'")
    expect(runnerSource).toContain(
      "'/experiments/phase2h-browser/full-tail-attack-resource-benchmark.html'"
    )
    expect(runnerSource).toContain(
      "'__phase2hFullTailAttackBrowserResourceResult'"
    )
    expect(runnerSource).toContain("chromeOnly: true")
    expect(packageJson.scripts['benchmark:phase2h:browser:playwright:full-tail-attack'])
      .toBe('node experiments/phase2h-browser/playwright-runner.mjs --target full-tail-attack-resource')
    expect(packageJson.scripts['benchmark:phase2h:browser:playwright:full-tail-attack:short'])
      .toBe('node experiments/phase2h-browser/playwright-runner.mjs --target full-tail-attack-resource --iterations 1 --warmup 0')
  })
})

