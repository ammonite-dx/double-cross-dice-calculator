import { createTraceRecorder } from './trace-dependencies.js'

/**
 * Build an experiment-local runtime using the production calculation facade.
 * The tracer wraps dependency boundaries without changing their arguments or
 * return values, so the same object can be used for parity checks.
 */
export function createInstrumentedRuntime(modules, {
  tracer = createTraceRecorder(),
  runtimeDamageRollClient = null,
} = {}) {
  const {
    calculateD10Distribution,
    calculateDamageOnDemand,
    calculateDxDistribution,
    calculateFinalEncroachment,
    calculateScore,
    convolveDistributions,
    createCalculationClient,
    createCalculationDependencies,
    createD10DistributionProvider,
    getDamageStatistics,
    getScoreStatistics,
    getTotalDamageStatistics,
    planCalculationRanges,
    planDamageAggregation,
    sumDamage,
    generateMixedDamageDistribution,
    createResourceGuard,
  } = modules

  const d10Provider = createD10DistributionProvider()
  const rollProvider = runtimeDamageRollClient === null
    ? generateMixedDamageDistribution
    : (...args) => runtimeDamageRollClient.calculate(...args)

  // CalculationClient passes a distribution-provider function to its score
  // dependency. The production client adapts that function to the core
  // ScoreCalculator dependency object; keep the experiment wrapper at the
  // same boundary so fixed-evasion and ordinary score paths are comparable.
  const calculateScoreAdapter = (
    params,
    getDistribution,
    scoreRangePlan,
    fix = false
  ) => calculateScore(
    params,
    { getDxDistribution: getDistribution },
    scoreRangePlan,
    fix
  )

  const traced = {
    calculateD10Distribution: tracer.wrap(
      'calculateD10Distribution',
      calculateD10Distribution
    ),
    calculateDamageOnDemand: tracer.wrap(
      'calculateDamageOnDemand',
      calculateDamageOnDemand
    ),
    calculateDxDistribution: tracer.wrap(
      'calculateDxDistribution',
      calculateDxDistribution
    ),
    calculateFinalEncroachment: tracer.wrap(
      'calculateFinalEncroachment',
      (params, runtimeOptions, plan) => calculateFinalEncroachment(
        params,
        undefined,
        runtimeOptions,
        plan
      )
    ),
    calculateScore: tracer.wrap('calculateScore', calculateScoreAdapter),
    convolveDistributions: tracer.wrap(
      'convolveDistributions',
      convolveDistributions
    ),
    getDamageStatistics: tracer.wrap('getDamageStatistics', getDamageStatistics),
    getScoreStatistics: tracer.wrap('getScoreStatistics', getScoreStatistics),
    getTotalDamageStatistics: tracer.wrap(
      'getTotalDamageStatistics',
      getTotalDamageStatistics
    ),
    planCalculationRanges: tracer.wrap(
      'planCalculationRanges',
      planCalculationRanges
    ),
    planDamageAggregation: tracer.wrap(
      'planDamageAggregation',
      planDamageAggregation
    ),
    sumDamage: tracer.wrap('sumDamage', sumDamage),
    getD10Distribution: tracer.wrap(
      'getD10Distribution',
      d10Provider
    ),
    getDamageRollDistribution: tracer.wrap(
      'getDamageRollDistribution',
      rollProvider
    ),
  }

  const dependencies = createCalculationDependencies({
    calculateDamageOnDemand: traced.calculateDamageOnDemand,
    calculateDxDistribution: traced.calculateDxDistribution,
    calculateScore: traced.calculateScore,
    getDamageStatistics: traced.getDamageStatistics,
    getScoreStatistics: traced.getScoreStatistics,
    getTotalDamageStatistics: traced.getTotalDamageStatistics,
    getDamageRollDistribution: traced.getDamageRollDistribution,
    getD10Distribution: traced.getD10Distribution,
    getFinalEncroachment: traced.calculateFinalEncroachment,
    planCalculationRanges: traced.planCalculationRanges,
    planDamageAggregation: traced.planDamageAggregation,
    resourceGuard: createResourceGuard(),
    sumDamage: traced.sumDamage,
  })

  return {
    client: createCalculationClient(dependencies),
    dependencies,
    tracer,
    traced,
  }
}
