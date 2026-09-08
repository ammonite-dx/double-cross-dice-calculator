import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url))
)

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

describe('R20 conservative rendering experiment contract', () => {
  it('measures the production-style line chart instead of a projected series', () => {
    const benchmark = source(
      'experiments/r20-conservative-rendering/benchmark.js'
    )

    expect(benchmark).toContain("type: 'line'")
    expect(benchmark).toContain('createProbabilityLineChartOptions')
    expect(benchmark).toContain('datasetCounts')
    expect(benchmark).toContain('markerVariants')
    expect(benchmark).toContain('requestAnimationFrame')
    expect(benchmark).toContain('longtask')
    expect(benchmark).not.toContain('createProbabilityChartProjection')
    expect(benchmark).not.toContain('Bar')
  })

  it('covers the accepted and exploratory point-count cases', () => {
    const benchmark = source(
      'experiments/r20-conservative-rendering/benchmark.js'
    )
    const runner = source(
      'experiments/r20-conservative-rendering/playwright-runner.mjs'
    )

    expect(benchmark).toContain('100, 1_000, 4_096, 16_384, 20_000')
    expect(runner).toContain('width: 390, height: 844')
    expect(runner).toContain('width: 1280, height: 900')
    expect(runner).toContain('setCPUThrottlingRate')
    expect(runner).toContain("'--cases': 'cases'")
    expect(runner).toContain("query.set(key, options[key])")
  })

  it('exposes normal and short runner commands', () => {
    expect(packageJson.scripts['benchmark:r20:conservative-rendering'])
      .toBe('node experiments/r20-conservative-rendering/playwright-runner.mjs')
    expect(packageJson.scripts['benchmark:r20:conservative-rendering:short'])
      .toBe(
        'node experiments/r20-conservative-rendering/playwright-runner.mjs --iterations=1 --warmup=0 --initial-animation-ms=100 --update-animation-ms=100'
      )
  })
})
