import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'

import {
  BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN,
  BACKTRACK_LABEL_STRESS_THRESHOLD,
  createStressSliceRecords,
  enumerateBacktrackStressInputs,
  selectBacktrackStressSlice,
} from './backtrack-label-stress.mjs'

const OUTPUT_PATH = fileURLToPath(new URL('./output/backtrack-label-stress.json', import.meta.url))
const LABELS = Object.freeze({
  single: Object.freeze(['100%〜', '71〜99%', '51〜70%', '31〜50%', '0〜30%']),
  double: Object.freeze(['失敗', '成功']),
  second: Object.freeze(['失敗', '成功']),
})
const MODES = Object.freeze([
  Object.freeze({ id: 'ordinary', dlois: 'なし', livingdead: false }),
  Object.freeze({ id: 'livingdead', dlois: '屍人', livingdead: true }),
])

async function loadProductionModules() {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  try {
    const [backtrack, distribution, rules, presentation, clientModule] = await Promise.all([
      server.ssrLoadModule('/src/calculation/BacktrackCalculator.js'),
      server.ssrLoadModule('/src/calculation/DistributionResult.js'),
      server.ssrLoadModule('/src/domain/BacktrackRules.ts'),
      server.ssrLoadModule('/src/features/backtrack/model/BacktrackPresentation.js'),
      server.ssrLoadModule('/src/runtime/CalculationClient.js'),
    ])
    return {
      server,
      calculateD10Distributions: backtrack.calculateD10Distributions,
      calculateLivingdeadDistributions: backtrack.calculateLivingdeadDistributions,
      createDistributionResult: distribution.createDistributionResult,
      getBacktrackDiceCounts: rules.getBacktrackDiceCounts,
      getBacktrackSupportMax: rules.getBacktrackSupportMax,
      createBacktrackPresentation: presentation.createBacktrackPresentation,
      createCalculationClient: clientModule.createCalculationClient,
    }
  } catch (error) {
    await server.close()
    throw error
  }
}

function getModeDistributions(mode, maxDice, modules) {
  const diceCounts = Array.from({ length: maxDice + 1 }, (_, dice) => dice)
  const supportMax = modules.getBacktrackSupportMax(mode.dlois, maxDice)
  const size = supportMax + 1
  const generator = mode.livingdead
    ? modules.calculateLivingdeadDistributions
    : modules.calculateD10Distributions
  return {
    supportMax,
    distributions: generator(diceCounts, size),
  }
}

function createFinalResult({ distribution, params, dice, mode, createDistributionResult }) {
  const rawSupportMin = dice === 0 ? 0 : dice
  const rawSupportMax = mode.livingdead
    ? dice === 0 ? 0 : 10 * dice - 9
    : 10 * dice
  const base = params.encroachment - params.value
  const values = new Float64Array(rawSupportMax - rawSupportMin + 1)
  for (let decrease = rawSupportMin; decrease <= rawSupportMax; decrease += 1) {
    values[rawSupportMax - decrease] = distribution[decrease]
  }
  return createDistributionResult({
    values,
    offset: base - rawSupportMax,
    support: { kind: 'finite', max: base - rawSupportMin },
    overflow: null,
  })
}

function summarizeSlices(presentation) {
  const slices = []
  for (const chart of ['single', 'double', 'second']) {
    const values = presentation.finalEncroachment[chart]
    const records = createStressSliceRecords(LABELS[chart], values)
    slices.push(...records.map((slice) => ({ ...slice, chart })))
  }
  return slices
}

function compareSelected(left, right) {
  if (left === null) return 1
  if (right === null) return -1
  if (left.distanceFromThreshold !== right.distanceFromThreshold) {
    return left.distanceFromThreshold - right.distanceFromThreshold
  }
  if (left.label.length !== right.label.length) {
    return right.label.length - left.label.length
  }
  return left.label < right.label ? -1 : left.label > right.label ? 1 : 0
}

function round(value, digits = 12) {
  return Number(value.toFixed(digits))
}

async function main() {
  const modules = await loadProductionModules()
  const inputs = enumerateBacktrackStressInputs()
  const maxDice = Math.max(
    ...MODES.flatMap((mode) => inputs.map((input) => (
      Math.max(...modules.getBacktrackDiceCounts({ ...input, dlois: mode.dlois }))
    )))
  )
  const generated = new Map()
  for (const mode of MODES) {
    generated.set(mode.id, getModeDistributions(mode, maxDice, modules))
  }

  const selectedByMode = new Map(MODES.map((mode) => [mode.id, null]))
  const records = []
  for (const mode of MODES) {
    const modeData = generated.get(mode.id)
    for (const input of inputs) {
      const params = { ...input, dlois: mode.dlois }
      const diceCounts = modules.getBacktrackDiceCounts(params)
      const results = diceCounts.map((dice) => createFinalResult({
        distribution: modeData.distributions.get(dice),
        params,
        dice,
        mode,
        createDistributionResult: modules.createDistributionResult,
      }))
      const presentation = modules.createBacktrackPresentation({
        single: results[0],
        double: results[1],
        second: results[2],
      }, params)
      const allSlices = summarizeSlices(presentation)
      const selected = selectBacktrackStressSlice(allSlices)
      const record = {
        mode: mode.id,
        dlois: mode.dlois,
        input: params,
        diceCounts,
        selectedSlice: selected === null
          ? null
          : {
              chart: selected.chart ?? null,
              label: selected.label,
              probability: selected.value,
              distanceFrom10Percent: round(selected.distanceFromThreshold),
            },
        allSlices: allSlices.map((slice) => ({
          chart: slice.chart,
          label: slice.label,
          probability: slice.value,
        })),
      }
      records.push(record)
      if (selected !== null) {
        const candidate = {
          ...selected,
          input: params,
          dlois: mode.dlois,
          mode: mode.id,
          chart: selected.chart ?? null,
        }
        if (compareSelected(candidate, selectedByMode.get(mode.id)) < 0) {
          selectedByMode.set(mode.id, candidate)
        }
      }
    }
  }

  const selectedFixtures = []
  const client = modules.createCalculationClient()
  for (const mode of MODES) {
    const selected = selectedByMode.get(mode.id)
    if (selected === null) {
      throw new Error(`no displayed slice reached ${BACKTRACK_LABEL_STRESS_THRESHOLD}% for ${mode.id}`)
    }
    const fixture = records.find((record) => (
      record.mode === mode.id
      && record.input.encroachment === selected.input.encroachment
      && record.input.lois === selected.input.lois
      && record.input.elois === selected.input.elois
      && record.input.dice === selected.input.dice
      && record.input.value === selected.input.value
    ))
    if (!fixture) {
      throw new Error(`selected fixture is missing for ${mode.id}`)
    }
    const clientResult = await client.calculateBacktrack(fixture.input)
    const clientPresentation = modules.createBacktrackPresentation(
      clientResult,
      fixture.input,
    )
    const clientSlices = summarizeSlices(clientPresentation)
    const expectedClientSlices = fixture.allSlices.map((slice) => ({
      chart: slice.chart,
      label: slice.label,
      value: slice.probability,
    }))
    const actualClientSlices = clientSlices.map((slice) => ({
      chart: slice.chart,
      label: slice.label,
      value: slice.value,
    }))
    if (JSON.stringify(actualClientSlices) !== JSON.stringify(expectedClientSlices)) {
      throw new Error([
        `production client presentation mismatch for ${mode.id}`,
        `expected=${JSON.stringify(fixture.allSlices)}`,
        `actual=${JSON.stringify(clientSlices.map((slice) => ({
          chart: slice.chart,
          label: slice.label,
          probability: slice.value,
        })))}`,
      ].join('\\n'))
    }
    selectedFixtures.push({
      mode: mode.id,
      dlois: mode.dlois,
      input: fixture.input,
      selectedSlice: fixture.selectedSlice,
      allSlices: fixture.allSlices,
      verifiedWithClient: true,
    })
  }

  const report = {
    schemaVersion: 1,
    thresholdPercent: BACKTRACK_LABEL_STRESS_THRESHOLD,
    searchDomain: BACKTRACK_LABEL_STRESS_SEARCH_DOMAIN,
    candidateCountPerMode: inputs.length,
    modes: MODES.map(({ id, dlois, livingdead }) => ({ id, dlois, livingdead })),
    selectedFixtures,
    records,
  }
  await mkdir(fileURLToPath(new URL('./output/', import.meta.url)), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({
    schemaVersion: report.schemaVersion,
    candidateCountPerMode: report.candidateCountPerMode,
    selectedFixtures: report.selectedFixtures,
    output: OUTPUT_PATH,
  }, null, 2))
  await modules.server.close()
}

await main()
