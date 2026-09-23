import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const runnerPath = fileURLToPath(new URL(
  '../experiments/phase2h-browser/playwright-runner.mjs',
  import.meta.url,
))
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)

function runRunner(...args) {
  return spawnSync(process.execPath, [runnerPath, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 10_000,
  })
}

describe('canonical Attack Playwright runner contract', () => {
  it('exposes the benchmark targets and Chrome option through CLI help', () => {
    const result = runRunner('--help')
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(output).toContain('canonical-attack')
    expect(output).toContain('full-tail-attack-resource')
    expect(output).toContain('default: canonical-attack')
    expect(output).toContain('--include-chrome')
  })

  it('reports allowed target names for an invalid CLI target', () => {
    const result = runRunner('--target', 'not-a-target')
    const output = `${result.stdout}\n${result.stderr}`

    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(output).toContain('--target must be one of:')
    expect(output).toContain('canonical-attack')
    expect(output).toContain('full-tail-attack-resource')
  })

  it('keeps the benchmark serving command connected to its config', () => {
    expect(packageJson.scripts['benchmark:attack-worker:serve'])
      .toBe('vite --config experiments/phase2h-browser/vite.config.mjs')
  })

  it('keeps the public benchmark commands wired to their CLI targets', () => {
    expect(packageJson.scripts['benchmark:attack-worker'])
      .toBe('node experiments/phase2h-browser/playwright-runner.mjs --target canonical-attack')
    expect(packageJson.scripts['benchmark:attack-worker:short'])
      .toBe('node experiments/phase2h-browser/playwright-runner.mjs --target canonical-attack --iterations 1 --warmup 0')
  })

})
