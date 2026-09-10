import { mkdir, writeFile } from 'node:fs/promises'
import { rolldown } from 'rolldown'
import { fileURLToPath } from 'node:url'

import {
  COMBO_TOTAL_FIXTURE_IDS,
  DAMAGE_PRECISION_FIXTURES,
} from './fixtures.js'
import { summarizeRecords } from './summary.mjs'

const OUTPUT_DIRECTORY = fileURLToPath(new URL('./output/', import.meta.url))
const DISPLAY_QUANTUM = 0.1

async function loadRuntimeModules() {
  const entryPoint = fileURLToPath(new URL('./runtime-entry.mjs', import.meta.url))
  const bundle = await rolldown({ input: entryPoint })
  const generated = await bundle.generate({ format: 'esm' })
  const source = generated.output?.[0]?.code
  if (typeof source !== 'string') {
    throw new Error('damage precision audit bundle was not generated')
  }
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  try {
    return await import(moduleUrl)
  } finally {
    await bundle.close?.()
  }
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits))
}

function roundDisplay(value) {
  if (!Number.isFinite(value)) {
    return null
  }
  const rounded = Math.round(value / DISPLAY_QUANTUM) * DISPLAY_QUANTUM
  return Object.is(rounded, -0) ? 0 : round(rounded, 1)
}

function createAuditClient({
  calculateDamageOnDemand,
  calculateDxDistribution,
  getDamageStatistics,
  getDamageRollDistribution,
  getD10Distribution,
  createCalculationClient,
}) {
  return createCalculationClient({
    calculateDamageOnDemand,
    calculateDxDistribution,
    getDamageStatistics,
    getDamageRollDistribution,
    getD10Distribution,
  })
}

function summarizeExpectedValue(expectedValue) {
  const kind = expectedValue?.kind ?? 'unknown'
  const lower = kind === 'exact'
    ? expectedValue.value
    : expectedValue?.lowerBound
  const upper = kind === 'exact'
    ? expectedValue.value
    : expectedValue?.upperBound
  const finiteBounds = Number.isFinite(lower) && Number.isFinite(upper)
  const width = finiteBounds ? upper - lower : null
  const halfWidth = finiteBounds ? width / 2 : null
  const roundedLower = roundDisplay(lower)
  const roundedUpper = roundDisplay(upper)
  const stableRoundedDisplay = roundedLower !== null
    && roundedLower === roundedUpper
  const pointEstimate = kind === 'exact' && Number.isFinite(expectedValue.value)
    ? expectedValue.value
    : null
  return {
    kind,
    lower: Number.isFinite(lower) ? round(lower) : null,
    upper: Number.isFinite(upper) ? round(upper) : null,
    width: width === null ? null : round(width),
    halfWidth: halfWidth === null ? null : round(halfWidth),
    roundedLower,
    roundedUpper,
    stableRoundedDisplay,
    diagnosticMidpoint: finiteBounds ? round((lower + upper) / 2) : null,
    midpointInterpretation: finiteBounds
      ? 'diagnostic-only; never treated as most-likely'
      : null,
    pointEstimate,
    pointEstimateSource: pointEstimate === null
      ? 'not-provided-by-model'
      : 'certified-exact',
  }
}

async function auditEnvelope(client, fixture, source) {
  const result = await client.calculateAttack(fixture.params)
  return {
    id: fixture.id,
    label: fixture.label,
    category: fixture.category,
    source,
    expectedValue: summarizeExpectedValue(
      result.damageStatistics.expectedValue
    ),
  }
}

function createTotalEntries() {
  const byId = new Map(DAMAGE_PRECISION_FIXTURES.map((fixture) => [fixture.id, fixture]))
  return COMBO_TOTAL_FIXTURE_IDS.map((id) => {
    const fixture = byId.get(id)
    return { id: fixture.id, params: fixture.params }
  })
}

async function auditTotals(client) {
  const entries = createTotalEntries()
  const batch = await client.calculateAttackBatch(entries)
  const records = []
  for (const count of [2, 4]) {
    const selected = batch.combos.slice(0, count)
    const total = count === entries.length
      ? batch
      : await client.calculateTotalDamage(selected.map((combo) => combo.damage))
    records.push({
      id: `total-${count}-combos`,
      label: `total damage from ${count} combos`,
      category: `total-${count}`,
      source: 'total',
      expectedValue: summarizeExpectedValue(total.totalDamageStatistics.expectedValue),
    })
  }
  return records
}

const modules = await loadRuntimeModules()
const client = createAuditClient({
  ...modules,
  getDamageRollDistribution: (weights, kazanari, options) =>
    modules.generateMixedDamageDistribution(weights, kazanari, options),
  getD10Distribution: (dice, size, options = {}) =>
    modules.calculateD10Distribution(dice, { size, ...options }),
})
const records = []
for (const fixture of DAMAGE_PRECISION_FIXTURES) {
  records.push(await auditEnvelope(client, fixture, 'combo'))
}
records.push(...await auditTotals(client))

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  displayQuantum: DISPLAY_QUANTUM,
  displayRule: 'show exact or bounded values only when rounded bounds agree',
  records,
  summary: summarizeRecords(records),
}
await mkdir(OUTPUT_DIRECTORY, { recursive: true })
await writeFile(
  fileURLToPath(new URL('./output/report.json', import.meta.url)),
  `${JSON.stringify(report, null, 2)}\n`,
)
console.log(JSON.stringify(report, null, 2))
