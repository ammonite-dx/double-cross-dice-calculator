import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const eslint = new ESLint({ cwd: repositoryRoot })

function source(relativePath) {
  return readFileSync(`${repositoryRoot}/${relativePath}`, 'utf8')
}

function sourceFiles(directory) {
  return readdirSync(`${repositoryRoot}/${directory}`, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|ts)$/.test(entry.name))
    .map((entry) => `${directory}/${entry.name}`)
}

async function lintText(filePath, text) {
  const [result] = await eslint.lintText(text, { filePath })
  return result
}

describe('runtime and shared presentation architecture', () => {
  it('keeps runtime and shared presentation at their owning paths', () => {
    for (const path of [
      'src/runtime/CalculationClient.js',
      'src/runtime/CalculationClientTypes.ts',
      'src/runtime/CalculationFeedback.js',
      'src/runtime/CalculationRequestCoordinator.js',
      'src/runtime/CanonicalAttackBatchInput.js',
      'src/runtime/CheckRangePolicy.js',
      'src/runtime/ResourceGuard.js',
      'src/runtime/RuntimeDamageRollClient.js',
      'src/runtime/RuntimeDamageRollProtocol.ts',
      'src/runtime/RuntimeDamageRollWorker.js',
      'src/shared/presentation/CanonicalChartSeriesAdapter.js',
      'src/shared/presentation/CanonicalSummaryFormatter.js',
      'src/shared/presentation/ChartPercentages.js',
      'src/shared/presentation/DisplayRangePlanner.js',
      'src/shared/presentation/DistributionPresenter.js',
      'src/shared/presentation/index.js',
    ]) {
      expect(existsSync(`${repositoryRoot}/${path}`), path).toBe(true)
    }
    expect(existsSync(`${repositoryRoot}/src/application`)).toBe(false)
    expect(existsSync(`${repositoryRoot}/src/presentation`)).toBe(false)
  })

  it('keeps runtime framework-independent and feature-independent', () => {
    for (const path of sourceFiles('src/runtime')) {
      const contents = source(path)
      expect(contents, path).not.toMatch(
        /(?:from|import\s*\()\s*['"][^'"]*(?:features|components|views|router|plugins|layouts|application|presentation|tooling|data)\//,
      )
      expect(contents, path).not.toMatch(
        /(?:from|import\s*\()\s*['"](?:vue|vuetify|vue-router|chart\.js|vue-chartjs|chartjs-plugin-)/,
      )
      expect(contents, path).not.toMatch(/(?:from|import\s*\()\s*['"]node:/)
    }
    expect(source('src/runtime/CalculationClient.js')).not.toContain(
      '../features/',
    )
    expect(source('src/runtime/CalculationClientTypes.ts')).not.toContain(
      "from 'vue'",
    )
    expect(source('src/runtime/CalculationClientTypes.ts')).not.toContain(
      'InjectionKey',
    )
  })

  it('keeps shared presentation pure except for DistributionResult validation', () => {
    for (const path of sourceFiles('src/shared/presentation')) {
      const contents = source(path)
      expect(contents, path).not.toMatch(
        /(?:from|import\s*\()\s*['"][^'"]*(?:runtime|features|components|views|router|plugins|layouts|application|presentation|tooling|data)\//,
      )
      expect(contents, path).not.toMatch(
        /(?:from|import\s*\()\s*['"][^'"]*(?:calculation\/(?!DistributionResult(?:\.js)?['"]))/,
      )
      expect(contents, path).not.toMatch(
        /(?:from|import\s*\()\s*['"][^'"]*(?:core|domain|shared\/(?:chart|theme|validation))\//,
      )
      expect(contents, path).not.toMatch(
        /(?:from|import\s*\()\s*['"](?:vue|vuetify|vue-router|chart\.js|vue-chartjs|chartjs-plugin-)/,
      )
      expect(contents, path).not.toMatch(/(?:from|import\s*\()\s*['"]node:/)
    }
    expect(source('src/shared/presentation/DistributionPresenter.js'))
      .toContain("from '../../calculation/DistributionResult'")
  })

  it('aligns ESLint restrictions with runtime and shared presentation boundaries', async () => {
    const runtimeResult = await lintText(
      'src/runtime/ArchitectureFixture.js',
      "import feature from '@/features/check/model/useCheck'",
    )
    expect(runtimeResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const runtimeVueResult = await lintText(
      'src/runtime/ArchitectureFixture.js',
      "import { ref } from 'vue'",
    )
    expect(runtimeVueResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const sharedRuntimeResult = await lintText(
      'src/shared/presentation/ArchitectureFixture.js',
      "import client from '@/runtime/CalculationClient'",
    )
    expect(sharedRuntimeResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const sharedCalculationResult = await lintText(
      'src/shared/presentation/ArchitectureFixture.js',
      "import result from '@/calculation/DamageCalculator'",
    )
    expect(sharedCalculationResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )

    const allowedResult = await lintText(
      'src/shared/presentation/ArchitectureFixture.js',
      "import { validateDistributionResult } from '@/calculation/DistributionResult'",
    )
    expect(allowedResult.messages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-imports' }),
      ]),
    )
  })
})
