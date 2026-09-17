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

const coreSteps = [
  'npm run check:node',
  'npm test',
  'npm run typecheck',
  'npm run lint',
  'npm run lint:markdown',
  'npm run build',
  'npm run diff:check',
]

const referenceSteps = [
  'npm run check:node',
  'npm run data:check',
  'npm run test:reference',
  'npm run generator:test',
  'npm run generator:test:simulation',
  'npm run generator:lint',
  'npm run verify:runtime-dx',
]

function expectStepsInOrder(script, steps) {
  let previousIndex = -1
  for (const step of steps) {
    const index = script.indexOf(step)
    expect(index, `missing verification step: ${step}`).toBeGreaterThan(-1)
    expect(index, `out-of-order verification step: ${step}`).toBeGreaterThan(
      previousIndex
    )
    previousIndex = index
  }
}

function workflowJob(name) {
  const match = workflow.match(
    new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:|$)`)
  )
  return match?.[1] ?? ''
}

describe('release verification contract', () => {
  it('defines separate core, browser, reference, and release gates', () => {
    expect(scripts).toHaveProperty('verify:core')
    expect(scripts).toHaveProperty('verify:browser')
    expect(scripts).toHaveProperty('verify:reference')
    expect(scripts).toHaveProperty('verify:release')
    expect(scripts).toHaveProperty('verify:all')
    expect(scripts).toHaveProperty('smoke:production:built')
    expect(scripts).toHaveProperty('diff:check', 'node scripts/diff-check.mjs')

    expectStepsInOrder(scripts['verify:core'], coreSteps)
    expectStepsInOrder(scripts['verify:reference'], referenceSteps)
    expect(scripts['verify:browser']).toContain('npm run build')
    expect(scripts['verify:browser']).toContain('npm run smoke:production:built')
    expect(scripts['verify:release']).toContain('npm run verify:core')
    expect(scripts['verify:release']).toContain('npm run smoke:production:built')
    expect(scripts['verify:release'])
      .not.toMatch(/data:check|generator:|test:reference|verify:runtime-dx/)
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

  it('splits CI into core, browser, and reference jobs', () => {
    expect(workflow).toContain('changes:')
    expect(workflow).toContain('core:')
    expect(workflow).toContain('browser:')
    expect(workflow).toContain('reference:')
    expect(workflow).toContain('git diff --name-only')
    expect(workflow).toContain("github.event_name == 'push'")

    const core = workflowJob('core')
    const browser = workflowJob('browser')
    const reference = workflowJob('reference')

    expect(core).toContain('npm run verify:core')
    expect(core).toContain('fetch-depth: 0')
    expect(core).toContain('DIFF_CHECK_BASE:')
    expect(core).toContain('DIFF_CHECK_HEAD:')
    expect(core).not.toContain('uv ')
    expect(core).not.toContain('playwright')

    expect(browser).toContain('npm run verify:browser')
    expect(browser).toContain('npx playwright install --with-deps chromium')
    expect(browser).not.toContain('uv ')

    expect(reference).toContain('npm run verify:reference')
    expect(reference).toContain('uv sync --project generator --locked --dev')
    expect(reference).toContain('uv python install 3.12')
    expect(reference).not.toContain('playwright')
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
  })
})
