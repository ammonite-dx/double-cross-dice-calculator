import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))

function readRepositoryFile(relativePath) {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
}

const packageJson = JSON.parse(readRepositoryFile('package.json'))
const scripts = packageJson.scripts
const workflow = readRepositoryFile('.github/workflows/ci.yml')
const readme = readRepositoryFile('README.md')
const contributing = readRepositoryFile('CONTRIBUTING.md')
const diffCheck = readRepositoryFile('scripts/diff-check.mjs')

const releaseSteps = [
  'npm run check:node',
  'npm run data:check',
  'npm run data:verify-generator',
  'npm test',
  'npm run generator:test',
  'npm run generator:test:simulation',
  'npm run generator:lint',
  'npm run typecheck',
  'npm run verify:runtime-dx',
  'npm run lint',
  'npm run lint:markdown',
  'npm run build',
  'npm run smoke:production:built',
  'npm run diff:check',
]

describe('release verification contract', () => {
  it('defines one ordered release gate in package.json', () => {
    expect(scripts).toHaveProperty('verify:release')
    expect(scripts).toHaveProperty('smoke:production:built')
    expect(scripts).toHaveProperty('diff:check', 'node scripts/diff-check.mjs')

    let previousIndex = -1
    for (const step of releaseSteps) {
      const index = scripts['verify:release'].indexOf(step)
      expect(index, `missing release step: ${step}`).toBeGreaterThan(-1)
      expect(index, `out-of-order release step: ${step}`).toBeGreaterThan(
        previousIndex
      )
      previousIndex = index
    }
  })

  it('keeps standalone production smoke and the built smoke path', () => {
    expect(scripts['smoke:production']).toContain('npm run build')
    expect(scripts['smoke:production']).toContain(
      'npm run smoke:production:built'
    )
    expect(scripts['smoke:production:built']).toContain(
      'production-browser-smoke.mjs'
    )
  })

  it('connects CI to the release gate and installs Chromium explicitly', () => {
    expect(workflow).toContain('npm run verify:release')
    expect(workflow).toContain('npx playwright install --with-deps chromium')
    expect(workflow).toContain('fetch-depth: 0')
    expect(workflow).toContain('DIFF_CHECK_BASE:')
    expect(workflow).toContain('DIFF_CHECK_HEAD:')
  })

  it('checks the working tree locally and a committed range in CI', () => {
    expect(diffCheck).toContain(
      "execFileSync('git', [command, '--check', ...argumentsList]"
    )
    expect(diffCheck).toContain("`${base}..${head}`")
    expect(diffCheck).toContain("runGitDiffCheck([], 'working tree')")
    expect(diffCheck).toContain("'diff-tree'")
  })

  it('keeps live developer documentation on the current release command', () => {
    expect(readme).toContain('npm run verify:release')
    expect(contributing).toContain('npm run verify:release')
    expect(readme).not.toContain('src/data/')
    expect(readme).not.toContain('npm run benchmark:calculators')
    expect(readme).not.toContain('canonical')
    expect(readme).not.toContain('legacy')
  })
})
