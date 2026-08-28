import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const runnerSource = readFileSync(
  new URL(
    '../experiments/phase2h-browser/playwright-runner.mjs',
    import.meta.url
  ),
  'utf8'
)
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)

describe('canonical Attack Playwright runner contract', () => {
  it('keeps the canonical Attack target as the default and exposes canonical CLI args', () => {
    expect(runnerSource).toContain("target: 'canonical-attack'")
    expect(runnerSource).toContain("--target NAME")
    expect(runnerSource).toContain('--target must be one of:')
    expect(packageJson.scripts['benchmark:phase2h:browser:playwright'])
      .toBeUndefined()
    expect(packageJson.scripts['benchmark:phase2h:browser:playwright:short'])
      .toBeUndefined()
  })

  it('routes the canonical target to its page and result globals', () => {
    expect(runnerSource).toContain("id: 'canonical-attack'")
    expect(runnerSource).toContain(
      "'/experiments/phase2h-browser/canonical-attack-worker-benchmark.html'"
    )
    expect(runnerSource).toContain(
      "'__phase2hCanonicalAttackWorkerBenchmarkResult'"
    )
    expect(runnerSource).toContain(
      "'__phase2hCanonicalAttackWorkerBenchmarkError'"
    )
    expect(packageJson.scripts['benchmark:phase2h:browser:playwright:canonical-attack'])
      .toBe('node experiments/phase2h-browser/playwright-runner.mjs --target canonical-attack')
    expect(packageJson.scripts['benchmark:phase2h:browser:playwright:canonical-attack:short'])
      .toBe('node experiments/phase2h-browser/playwright-runner.mjs --target canonical-attack --iterations 1 --warmup 0')
  })

  it('retains the Firefox, WebKit, throttled Chrome, and optional Chrome ids', () => {
    expect(runnerSource).toContain("id: 'firefox'")
    expect(runnerSource).toContain("id: 'webkit'")
    expect(runnerSource).toContain("id: 'chrome-cpu-4x'")
    expect(runnerSource).toContain("id: 'chrome'")
    expect(runnerSource).toContain('Emulation.setCPUThrottlingRate')
    expect(runnerSource).toContain('--include-chrome')
  })

  it('validates the canonical report before marking an engine measured', () => {
    expect(runnerSource).toContain("report?.status === 'measured'")
    expect(runnerSource).toContain("workerSummary.status === 'production-runtime-observed'")
    expect(runnerSource).toContain('workerCounters.workerErrors === 0')
    expect(runnerSource).toContain('workerCounters.workerMessageErrors === 0')
    expect(runnerSource).toContain("cancel.abortBoundary === 'onRangePlan-preflight'")
    expect(runnerSource).toContain("cancel.result?.error?.name === 'AbortError'")
    expect(runnerSource).toContain('stale.firstCommit === false')
    expect(runnerSource).toContain('stale.secondCommit === true')
    expect(runnerSource).toContain('d10Successes.length > 0')
    expect(runnerSource).toContain('timingSummary')
  })
})
