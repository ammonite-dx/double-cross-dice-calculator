import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

describe('R20 chart rendering experiment contract', () => {
  it('keeps the browser experiment outside production calculation paths', () => {
    const benchmark = source('experiments/r20-chart-rendering/benchmark.js')
    expect(benchmark).toContain('createProbabilityChartProjection')
    expect(benchmark).toContain('createDenseData')
    expect(benchmark).toContain('longtask')
    expect(benchmark).not.toContain('CalculationClient')
    expect(benchmark).not.toContain('Worker')
  })

  it('covers wide logical windows and records both point budgets', () => {
    const benchmark = source('experiments/r20-chart-rendering/benchmark.js')
    expect(benchmark).toContain('16_384')
    expect(benchmark).toContain('20_000')
    expect(benchmark).toContain('maxRenderedPoints')
    expect(benchmark).toContain('dataPoints')
  })

  it('provides normal and short runner commands', () => {
    expect(packageJson.scripts['benchmark:r20:chart-rendering'])
      .toBe('node experiments/r20-chart-rendering/playwright-runner.mjs')
    expect(packageJson.scripts['benchmark:r20:chart-rendering:short'])
      .toBe('node experiments/r20-chart-rendering/playwright-runner.mjs --iterations=1 --warmup=0')
  })
})
