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

function finiteOrNull(value) {
  return Number.isFinite(value) ? round(value) : null
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

function summarizeScoreTail(scoreEnvelope) {
  const metadata = scoreEnvelope?.metadata ?? {}
  const massCertificate = metadata.scoreTailCertificate
  const momentCertificate = metadata.scoreTailMomentCertificate
  return {
    massUpperBound: finiteOrNull(massCertificate?.massUpperBound),
    massLowerBound: finiteOrNull(massCertificate?.massLowerBound),
    momentModel: typeof momentCertificate?.model === 'string'
      ? momentCertificate.model
      : null,
    momentUpperBound: finiteOrNull(momentCertificate?.firstMomentUpperBound),
    momentResidualUpperBound: finiteOrNull(
      momentCertificate?.residualUpperBound,
    ),
    momentTailEvaluationErrorBound: finiteOrNull(
      momentCertificate?.tailEvaluationErrorBound,
    ),
    momentNumericalErrorBound: finiteOrNull(
      momentCertificate?.numericalErrorBound
    ),
    momentCertificateStatus: momentCertificate === null
      || typeof momentCertificate !== 'object'
      ? 'unavailable'
      : 'available',
  }
}

function summarizeDamageExpectationCertificate(damage) {
  const certificate = damage?.metadata?.damageExpectationCertificate
  if (certificate === null || typeof certificate !== 'object') {
    return {
      status: 'unavailable',
      lowerBound: null,
      upperBound: null,
      width: null,
      actionTailContributionUpperBound: null,
      reactionTailContributionUpperBound: null,
      numericalErrorBound: null,
    }
  }
  const lowerBound = certificate.lowerBound
  const upperBound = certificate.upperBound
  return {
    status: 'available',
    lowerBound: finiteOrNull(lowerBound),
    upperBound: finiteOrNull(upperBound),
    width: Number.isFinite(lowerBound) && Number.isFinite(upperBound)
      ? finiteOrNull(upperBound - lowerBound)
      : null,
    actionTailContributionUpperBound: finiteOrNull(
      certificate.actionTailContributionUpperBound
    ),
    reactionTailContributionUpperBound: finiteOrNull(
      certificate.reactionTailContributionUpperBound
    ),
    numericalErrorBound: finiteOrNull(certificate.numericalErrorBound),
  }
}

async function auditEnvelope(client, fixture, source) {
  const result = await client.calculateAttack(fixture.params)
  return {
    id: fixture.id,
    label: fixture.label,
    category: fixture.category,
    source,
    scoreTail: {
      action: summarizeScoreTail(result.score.action),
      reaction: summarizeScoreTail(result.score.reaction),
    },
    damageExpectationCertificate:
      summarizeDamageExpectationCertificate(result.damage),
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
      damageExpectationCertificate: {
        status: 'not-applicable',
      },
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
