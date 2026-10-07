import os from 'node:os'
import { performance } from 'node:perf_hooks'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const HOST = '127.0.0.1'

function elapsed(startedAt) {
  return performance.now() - startedAt
}

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true })
  } catch (error) {
    if (!String(error?.message ?? error).includes("Executable doesn't exist")) {
      throw error
    }
    return chromium.launch({ channel: 'chrome', headless: true })
  }
}

async function runNodeBenchmarks(server) {
  const [rangeModule, dxModule, tailModule, clientModule] = await Promise.all([
    server.ssrLoadModule('/src/calculation/RangePlanner.ts'),
    server.ssrLoadModule('/src/calculation/DxCalculator.ts'),
    server.ssrLoadModule('/src/calculation/BinomialSurvival.ts'),
    server.ssrLoadModule('/src/runtime/CalculationClient.ts'),
  ])
  const { planCalculationRanges } = rangeModule
  const { calculateDxDistribution } = dxModule
  const { binomialSurvivalProbability } = tailModule
  const { createCalculationClient } = clientModule
  const scoreInput = ({ dice, critical, shihai }) => ({
    operation: 'score',
    score: { dice, critical, shihai, yousei: 0, skill: 0 },
  })
  const measure = (fn) => {
    const start = performance.now()
    const value = fn()
    return { value, elapsedMs: elapsed(start) }
  }
  const measureAsync = async (fn) => {
    const start = performance.now()
    const value = await fn()
    return { value, elapsedMs: elapsed(start) }
  }
  const measureScore = (name, params) => {
    const planned = measure(() => planCalculationRanges(scoreInput(params)))
    const plan = planned.value.scores[0]
    let distribution = null
    if (planned.value.accepted) {
      const generated = measure(() => calculateDxDistribution(
        { ...params, yousei: 0 },
        { workingLength: plan.workingLength },
      ))
      distribution = {
        elapsedMs: generated.elapsedMs,
        length: generated.value.length,
        mass: generated.value.reduce((sum, probability) => sum + probability, 0),
        positiveBuckets: generated.value.filter((probability) => probability > 0).length,
      }
    }
    return {
      name,
      plannerMs: planned.elapsedMs,
      accepted: planned.value.accepted,
      rejectionReasons: planned.value.rejectionReasons,
      operations: plan.operations,
      cpuWork: planned.value.estimates.cpuWork,
      workingLength: plan.workingLength,
      float64Bytes: plan.float64Bytes,
      modeledMax: plan.workingMax,
      tailBound: plan.tail.bound,
      distribution,
    }
  }
  const cases = [
    measureScore('case-a-score-planner-and-producer', {
      dice: 100_000_000,
      critical: 10,
      shihai: 50_000_000,
    }),
    measureScore('case-b-score-planner-and-producer', {
      dice: 1_000_000,
      critical: 10,
      shihai: 500_000,
    }),
    measureScore('normal-8d', { dice: 8, critical: 8, shihai: 2 }),
    measureScore('normal-20d', { dice: 20, critical: 8, shihai: 5 }),
    measureScore('normal-100d', { dice: 100, critical: 10, shihai: 10 }),
  ]
  const centralTail = measure(() => binomialSurvivalProbability(
    100_000_000,
    50_000_001,
    0.5,
  ))
  const checkParams = {
    action: { dice: 1_000_000, critical: 10, skill: 0, yousei: 0, shihai: 500_000 },
    reaction: { dice: 1_000_000, critical: 10, skill: 0, yousei: 0, shihai: 500_000 },
  }
  const client = createCalculationClient()
  const checkPlan = measure(() => client.planCheck(checkParams))
  const check = await measureAsync(() => client.calculateCheck(
    checkParams,
    { opposed: true, target: 0 },
  ))
  const mass = (envelope) => (
    envelope.result.values.reduce((sum, probability) => sum + probability, 0)
    + (envelope.result.overflow?.probability
      ?? envelope.result.overflow?.probabilityUpperBound
      ?? 0)
  )
  return {
    cases,
    centralTail: {
      elapsedMs: centralTail.elapsedMs,
      probability: centralTail.value,
    },
    check: {
      plannerMs: checkPlan.elapsedMs,
      accepted: checkPlan.value.accepted,
      rejectionReasons: checkPlan.value.rejectionReasons,
      cpuWork: checkPlan.value.estimates.cpuWork,
      workingLengths: checkPlan.value.scores.map((score) => score.workingLength),
      calculationMs: check.elapsedMs,
      actionMass: mass(check.value.score.action),
      reactionMass: mass(check.value.score.reaction),
    },
  }
}

async function run() {
  const server = await createServer({
    appType: 'spa',
    logLevel: 'silent',
    server: {
      host: HOST,
      port: 0,
      strictPort: false,
    },
  })
  let browser
  try {
    await server.listen()
    const url = server.resolvedUrls?.local?.[0]
    if (!url) {
      throw new Error('Vite did not provide a local development URL')
    }
    const nodeReport = await runNodeBenchmarks(server)
    browser = await launchChromium()
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    const browserReport = await page.evaluate(async () => {
      const [rangeModule, dxModule, tailModule, clientModule] = await Promise.all([
        import('/src/calculation/RangePlanner.ts'),
        import('/src/calculation/DxCalculator.ts'),
        import('/src/calculation/BinomialSurvival.ts'),
        import('/src/runtime/CalculationClient.ts'),
      ])
      const { planCalculationRanges } = rangeModule
      const { calculateDxDistribution } = dxModule
      const { binomialSurvivalProbability } = tailModule
      const { createCalculationClient } = clientModule
      const measure = (fn) => {
        const start = performance.now()
        const value = fn()
        return { value, elapsedMs: performance.now() - start }
      }
      const measureAsync = async (fn) => {
        const start = performance.now()
        const value = await fn()
        return { value, elapsedMs: performance.now() - start }
      }
      const scoreInput = ({ dice, critical, shihai }) => ({
        operation: 'score',
        score: { dice, critical, shihai, yousei: 0, skill: 0 },
      })
      const measureScore = (name, params) => {
        const planned = measure(() => planCalculationRanges(scoreInput(params)))
        const plan = planned.value.scores[0]
        let distribution = null
        if (planned.value.accepted) {
          const generated = measure(() => calculateDxDistribution(
            { ...params, yousei: 0 },
            { workingLength: plan.workingLength },
          ))
          distribution = {
            elapsedMs: generated.elapsedMs,
            length: generated.value.length,
            mass: generated.value.reduce((sum, probability) => sum + probability, 0),
            positiveBuckets: generated.value.filter((probability) => probability > 0).length,
          }
        }
        return {
          name,
          plannerMs: planned.elapsedMs,
          accepted: planned.value.accepted,
          rejectionReasons: planned.value.rejectionReasons,
          operations: plan.operations,
          cpuWork: planned.value.estimates.cpuWork,
          workingLength: plan.workingLength,
          float64Bytes: plan.float64Bytes,
          modeledMax: plan.workingMax,
          tailBound: plan.tail.bound,
          distribution,
        }
      }

      const observerEntries = []
      const observer = typeof PerformanceObserver === 'function'
        ? new PerformanceObserver((list) => {
            observerEntries.push(...list.getEntries().map(({ duration, startTime }) => ({
              duration,
              startTime,
            })))
          })
        : null
      observer?.observe({ entryTypes: ['longtask'] })

      const results = []
      results.push(measureScore('case-a-score-planner-and-producer', {
        dice: 100_000_000,
        critical: 10,
        shihai: 50_000_000,
      }))
      results.push(measureScore('case-b-score-planner-and-producer', {
        dice: 1_000_000,
        critical: 10,
        shihai: 500_000,
      }))
      results.push(measureScore('normal-8d', { dice: 8, critical: 8, shihai: 2 }))
      results.push(measureScore('normal-20d', { dice: 20, critical: 8, shihai: 5 }))
      results.push(measureScore('normal-100d', { dice: 100, critical: 10, shihai: 10 }))

      const centralTail = measure(() => binomialSurvivalProbability(
        100_000_000,
        50_000_001,
        0.5,
      ))
      results.push({
        name: 'central-rank-tail-100m',
        elapsedMs: centralTail.elapsedMs,
        probability: centralTail.value,
      })

      const checkParams = {
        action: { dice: 1_000_000, critical: 10, skill: 0, yousei: 0, shihai: 500_000 },
        reaction: { dice: 1_000_000, critical: 10, skill: 0, yousei: 0, shihai: 500_000 },
      }
      const client = createCalculationClient()
      const checkPlan = measure(() => client.planCheck(checkParams))
      const check = await measureAsync(() => client.calculateCheck(
        checkParams,
        { opposed: true, target: 0 },
      ))
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      observer?.disconnect()
      const distributionMass = (envelope) => (
        envelope.result.values.reduce((sum, probability) => sum + probability, 0)
        + (envelope.result.overflow?.probability
          ?? envelope.result.overflow?.probabilityUpperBound
          ?? 0)
      )
      return {
        browser: navigator.userAgent,
        cases: results,
        check: {
          plannerMs: checkPlan.elapsedMs,
          accepted: checkPlan.value.accepted,
          rejectionReasons: checkPlan.value.rejectionReasons,
          cpuWork: checkPlan.value.estimates.cpuWork,
          workingLengths: checkPlan.value.scores.map((score) => score.workingLength),
          calculationMs: check.elapsedMs,
          actionMass: distributionMass(check.value.score.action),
          reactionMass: distributionMass(check.value.score.reaction),
          longTasks: observerEntries,
        },
      }
    })
    console.log(JSON.stringify({
      node: process.version,
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      nodeMeasurements: nodeReport,
      browser: browserReport.browser,
      cases: browserReport.cases,
      check: browserReport.check,
    }, null, 2))
  } finally {
    await browser?.close()
    await server.close()
  }
}

run().catch((error) => {
  console.error(error?.stack ?? error)
  process.exitCode = 1
})
