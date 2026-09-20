import {
  calculateFinalEncroachment as calculateCoreFinalEncroachment,
} from '../calculation/BacktrackCalculator'
import {
  calculateDamageOnDemand,
} from '../calculation/DamageCalculator'
import {
  createDistributionResult,
} from '../calculation/DistributionResult'
import {
  getDamageStatistics,
  getTotalDamageStatistics,
} from '../calculation/DamageStatistics'
import {
  planDamageAggregation,
  sumDamage,
} from '../calculation/DamageAggregation'
import {
  calculateDxDistribution,
  normalizeDxOptions,
} from '../calculation/DxCalculator'
import {
  createD10DistributionProvider,
} from '../calculation/D10Calculator'
import {
  calculateScore as calculateCoreScore,
  calculateScoreResolution as calculateCoreScoreResolution,
} from '../calculation/ScoreCalculator'
import { getScoreStatistics } from '../calculation/ScoreStatistics'
import { planCalculationRanges } from '../calculation/RangePlanner'
import {
  normalizeAttackCalculationInput,
  normalizeBacktrackParams,
  normalizeDifficultyInput,
  normalizeScoreInput,
} from '../domain/CalculationInputNormalization'
import { createCheckRangePolicy } from './CheckRangePolicy'
import { createRuntimeDamageRollClient } from './RuntimeDamageRollClient'
import { createResourceGuard } from './ResourceGuard'
import type {
  AttackCalculationInput,
  CheckInputSnapshot,
  DisplayRequestSnapshot,
  DifficultyInput,
} from '../domain/CalculationInputs'
import type { BacktrackParams } from '../domain/BacktrackRules'
import type {
  NormalizedBacktrackParams,
  NormalizedScoreInput,
} from '../domain/CalculationInputNormalization'
import type { ScoreResolution } from '../domain/ScoreResolution'
import type {
  AggregatedDamageEnvelope,
  TotalDamageCalculationOptions,
} from '../calculation/DamageAggregationTypes'
import type {
  AttackCalculationRangePlan,
  BacktrackCalculationRangePlan,
  BacktrackRangePlan,
  CalculationRangePlan,
  RangePlannerParams,
  RangePolicyInput,
  RolledScoreRangePlan,
  ScoreRangePlan,
} from '../calculation/planning/RangePlannerTypes'
import type {
  DistributionEnvelope,
} from '../domain/DistributionResultTypes'
import type {
  AttackCalculationResult,
  BacktrackCalculationResult,
  TotalDamageResult,
} from '../domain/CalculationResultTypes'
import type {
  ScoreEnvelope,
  ScorePair,
} from '../domain/ScoreResultTypes'
import type { ResourceGuard, ResourceLease, ResourceLeaseResult, ResourceReservationPlan } from './ResourceGuardTypes'
import type {
  AttackCalculationOptions,
  BacktrackCalculationOptions,
  CalculationClient,
  CalculationRequestOptions,
  CheckCalculationOptions,
  TotalDamageClientOptions,
} from './CalculationClientTypes'
import type {
  CalculationClientDependencies,
  CompleteCalculationClientDependencies,
  CalculationRuntimeOptions,
  NormalizedDxOptions,
  PositionalDxDistributionProvider,
} from './CalculationClientDependencyTypes'

const RUNTIME_DX_CACHE_SIZE = 32
const runtimeDamageRollClient = createRuntimeDamageRollClient()
const runtimeD10DistributionProvider = createD10DistributionProvider()
const defaultResourceGuard = createResourceGuard()

function calculateScoreAdapter(
  params: NormalizedScoreInput,
  getDistribution: PositionalDxDistributionProvider | undefined,
  scoreRangePlan?: RolledScoreRangePlan,
): ScoreEnvelope {
  if (typeof getDistribution !== 'function') {
    throw new TypeError(
      'calculateScore requires a runtime distribution provider'
    )
  }
  return calculateCoreScore(
    params,
    { getDxDistribution: getDistribution },
    scoreRangePlan,
  )
}

function calculateScoreResolutionAdapter(
  resolution: ScoreResolution,
  getDistribution: PositionalDxDistributionProvider | undefined,
  scoreRangePlan?: ScoreRangePlan,
): ScoreEnvelope {
  if (resolution?.kind === 'rolled-score') {
    if (getDistribution === undefined) {
      throw new TypeError(
        'calculateScore requires a runtime distribution provider',
      )
    }
    return calculateScoreAdapter(
      resolution.params,
      getDistribution,
      scoreRangePlan as RolledScoreRangePlan | undefined,
    )
  }
  return calculateCoreScoreResolution(
    resolution,
    { getDxDistribution: getDistribution },
    scoreRangePlan
  )
}

function getFinalEncroachmentAdapter(
  params: BacktrackParams,
  runtimeOptions: CalculationRuntimeOptions = {},
  backtrackRangePlan?: BacktrackRangePlan,
): BacktrackCalculationResult {
  return calculateCoreFinalEncroachment(
    params,
    undefined,
    runtimeOptions,
    backtrackRangePlan
  )
}

function createAbortError(operation = 'Calculation') {
  const error = new Error(`${operation} calculation was aborted`)
  error.name = 'AbortError'
  return error
}

function throwIfAborted(
  options: Pick<CalculationRequestOptions, 'signal'> | undefined,
  operation = 'Calculation',
): void {
  if (options?.signal?.aborted) {
    throw createAbortError(operation)
  }
}

const defaultDependencies: CompleteCalculationClientDependencies = {
  calculateDamageOnDemand,
  calculateDxDistribution,
  calculateScore: calculateScoreAdapter,
  calculateScoreResolution: calculateScoreResolutionAdapter,
  getScoreStatistics,
  getDamageStatistics,
  getTotalDamageStatistics,
  getDamageRollDistribution: runtimeDamageRollClient.calculate,
  getFinalEncroachment: getFinalEncroachmentAdapter,
  getD10Distribution: runtimeD10DistributionProvider,
  planDamageAggregation,
  planCalculationRanges,
  resourceGuard: defaultResourceGuard,
  sumDamage: sumDamage as unknown as CompleteCalculationClientDependencies['sumDamage'],
}

export class CalculationRangeError extends Error {
  readonly plan: CalculationRangePlan
  readonly rejectionReasons: readonly string[]

  constructor(plan: CalculationRangePlan) {
    const rejectionReasons = plan?.rejectionReasons ?? []
    super(
      rejectionReasons.length > 0
        ? `Calculation range rejected: ${rejectionReasons.join(', ')}`
        : 'Calculation range rejected'
    )
    this.name = 'CalculationRangeError'
    this.plan = plan
    this.rejectionReasons = rejectionReasons
  }
}

function snapshotScoreParams(
  params: unknown,
  label = 'score',
): NormalizedScoreInput {
  return normalizeScoreInput(params, label)
}

function rolledScoreResolution(params: NormalizedScoreInput): ScoreResolution {
  return { kind: 'rolled-score', params }
}

type NormalizedAttackCalculationInput = ReturnType<
  typeof normalizeAttackCalculationInput
>

function snapshotAttackParams(params: unknown): NormalizedAttackCalculationInput {
  return normalizeAttackCalculationInput(params)
}

function snapshotBacktrackParams(params: unknown): NormalizedBacktrackParams {
  return normalizeBacktrackParams(params)
}

function createCheckRangeParams(
  request: Readonly<{
    action: NormalizedScoreInput
    reaction: NormalizedScoreInput
  }>,
  displayRequest?: DisplayRequestSnapshot,
): RangePlannerParams {
  const params = {
    operation: 'check' as const,
    score: {
      action: rolledScoreResolution(request.action),
      reaction: rolledScoreResolution(request.reaction),
    },
  }
  if (displayRequest !== undefined) {
    return {
      ...params,
      display: {
        min: displayRequest.min,
        max: displayRequest.max,
      },
    }
  }
  return params
}

function getCheckRangePolicy(
  options: CheckCalculationOptions,
): RangePolicyInput | undefined {
  return options.displayRequest === undefined
    ? options.rangePolicy
    : createCheckRangePolicy(options.displayRequest, options.rangePolicy)
}

function createAttackRangeParams(
  request: NormalizedAttackCalculationInput,
  scoreDisplayRequest?: DisplayRequestSnapshot | null,
): RangePlannerParams {
  const params = {
    operation: 'attack' as const,
    score: {
      action: request.action.score,
      reaction: request.reaction.score,
    },
    attack: { ...request.action.damage },
    defence: { ...request.reaction.damage },
  }
  if (scoreDisplayRequest !== undefined && scoreDisplayRequest !== null) {
    return {
      ...params,
      display: {
        min: scoreDisplayRequest.min,
        max: scoreDisplayRequest.max,
      },
    }
  }
  return params
}

function createBacktrackRangeParams(
  request: NormalizedBacktrackParams,
): RangePlannerParams {
  const params: RangePlannerParams = {
    operation: 'backtrack' as const,
    backtrack: { ...request },
  }
  return params
}

function getRuntimeOptions(
  options: object,
): CalculationRuntimeOptions {
  const source = options as Record<string, unknown>
  if (
    !('rangePolicy' in source) &&
    !('onRangePlan' in source)
  ) {
    return source as CalculationRuntimeOptions
  }

  const runtimeOptions: Record<string, unknown> = { ...source }
  delete runtimeOptions.rangePolicy
  delete runtimeOptions.onRangePlan
  delete runtimeOptions.scoreDisplayRequest
  return runtimeOptions
}

function acquirePlanLease(
  resourceGuard: ResourceGuard,
  plan: ResourceReservationPlan,
  options: CalculationRequestOptions,
  operation: string,
): ResourceLeaseResult {
  return resourceGuard.acquirePlan(plan, {
    signal: options.signal,
    requestId: options.requestId,
    operation,
  })
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false
  }
  const candidate = value as { then?: unknown }
  return typeof candidate.then === 'function'
}

function hasOwn(object: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, property)
}

const TOTAL_DAMAGE_AGGREGATION_OPTION_NAMES = Object.freeze([
  'maxValuesLength',
  'maxFftLength',
  'maxResourceBytes',
  'maxComponents',
  'signal',
  'onFftLength',
] as const satisfies readonly (keyof TotalDamageCalculationOptions)[])

function createTotalDamageAggregationOptions(
  options: TotalDamageClientOptions,
  defaultOnFftLength?: (fftLength: number) => void,
): TotalDamageCalculationOptions {
  const aggregationOptions: {
    maxValuesLength?: number
    maxFftLength?: number
    maxResourceBytes?: number
    maxComponents?: number
    signal?: AbortSignal
    onFftLength?: (fftLength: number) => void
  } = {}
  if (hasOwn(options, 'maxValuesLength')) {
    aggregationOptions.maxValuesLength = options.maxValuesLength
  }
  if (hasOwn(options, 'maxFftLength')) {
    aggregationOptions.maxFftLength = options.maxFftLength
  }
  if (hasOwn(options, 'maxResourceBytes')) {
    aggregationOptions.maxResourceBytes = options.maxResourceBytes
  }
  if (hasOwn(options, 'maxComponents')) {
    aggregationOptions.maxComponents = options.maxComponents
  }
  if (hasOwn(options, 'signal')) {
    aggregationOptions.signal = options.signal
  }
  if (hasOwn(options, 'onFftLength')) {
    aggregationOptions.onFftLength = options.onFftLength
  } else if (typeof defaultOnFftLength === 'function') {
    aggregationOptions.onFftLength = defaultOnFftLength
  }
  return aggregationOptions
}

function copyTotalDamageEnvelope<T>(totalDamage: T): T {
  const candidate = totalDamage !== null && typeof totalDamage === 'object'
    ? totalDamage as Record<string, unknown>
    : null
  const result = candidate?.result
  if (
    candidate === null
    || result === null
    || typeof result !== 'object'
    || !hasOwn(result, 'values')
    || !hasOwn(result, 'offset')
    || !hasOwn(result, 'support')
    || !hasOwn(result, 'overflow')
  ) {
    return totalDamage
  }

  try {
    return Object.freeze({
      ...candidate,
      result: createDistributionResult({
        values: (result as Record<string, unknown>).values,
        offset: (result as Record<string, unknown>).offset,
        support: (result as Record<string, unknown>).support,
        overflow: (result as Record<string, unknown>).overflow,
      }),
    }) as T
  } catch {
    // A dependency-injected test double or an invalid upstream result should
    // be reported by its summary/aggregation dependency, not hidden here.
    return totalDamage
  }
}

/**
 * Plans a request and publishes the plan before calculation starts.
 *
 * `onRangePlan` is a synchronous notification. Its return value is ignored;
 * asynchronous callbacks are not part of the CalculationClient contract.
 */
function runRangePreflight<TPlan extends CalculationRangePlan>(
  planner: (params: RangePlannerParams, policy?: RangePolicyInput) => CalculationRangePlan,
  plannerParams: RangePlannerParams,
  rangePolicy: RangePolicyInput | undefined,
  onRangePlan?: (plan: TPlan) => void,
): TPlan {
  const plan = planner(plannerParams, rangePolicy)
  if (typeof onRangePlan === 'function') {
    onRangePlan(plan as TPlan)
  }
  if (!plan.accepted) {
    throw new CalculationRangeError(plan)
  }
  return plan as TPlan
}

function createRuntimeDxProvider(
  calculateDistribution: CalculationClientDependencies['calculateDxDistribution'],
): PositionalDxDistributionProvider {
  if (typeof calculateDistribution !== 'function') {
    throw new TypeError('createRuntimeDxProvider requires a distribution provider')
  }
  const cache = new Map<string, ReturnType<NonNullable<
    CalculationClientDependencies['calculateDxDistribution']
  >>>()

  return (shihai, dice, critical, options, yousei = 0) => {
    const normalizedOptions = normalizeDxOptions(options)
    const key = [
      dice,
      critical,
      shihai,
      yousei,
      normalizedOptions.workingLength,
      normalizedOptions.fftLength ?? '',
    ].join(':')
    const cached = cache.get(key)
    if (cached !== undefined) {
      const distribution = cached
      cache.delete(key)
      cache.set(key, distribution)
      return distribution
    }

    const distribution = calculateDistribution(
      { dice, critical, shihai, yousei },
      normalizedOptions
    )
    cache.set(key, distribution)
    while (cache.size > RUNTIME_DX_CACHE_SIZE) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) {
        cache.delete(oldest)
      }
    }
    return distribution
  }
}

export function createCalculationClient(
  dependencies: CalculationClientDependencies = defaultDependencies,
): CalculationClient {
  const resourceGuard = dependencies.resourceGuard ?? defaultResourceGuard
  const planner = dependencies.planCalculationRanges ?? planCalculationRanges
  const damagePlan =
    dependencies.planDamageAggregation
    ?? planDamageAggregation
  const damageSum: NonNullable<CalculationClientDependencies['sumDamage']> =
    dependencies.sumDamage
    ?? (sumDamage as unknown as NonNullable<
      CalculationClientDependencies['sumDamage']
    >)
  const totalDamageStatistics =
    dependencies.getTotalDamageStatistics
    ?? getTotalDamageStatistics
  const hasRuntimeDxDependency =
    typeof dependencies.calculateDxDistribution === 'function'
  const getDxDistribution = hasRuntimeDxDependency
    ? createRuntimeDxProvider(dependencies.calculateDxDistribution)
    : null
  const scoreResolutionCalculator = (() => {
    const calculateRolled = (
      params: NormalizedScoreInput,
      scoreRangePlan?: RolledScoreRangePlan,
    ): ScoreEnvelope | null => {
      if (typeof dependencies.calculateScore === 'function') {
        return dependencies.calculateScore(
          params,
          getDxDistribution ?? undefined,
          scoreRangePlan
        )
      }
      if (getDxDistribution !== null) {
        return calculateScoreAdapter(
          params,
          getDxDistribution,
          scoreRangePlan
        )
      }
      return null
    }

    return (
      resolution: ScoreResolution,
      scoreRangePlan?: ScoreRangePlan,
    ): ScoreEnvelope => {
      if (resolution?.kind === 'rolled-score') {
        const result = calculateRolled(
          resolution.params,
          scoreRangePlan as RolledScoreRangePlan | undefined,
        )
        if (result === null) {
          throw new Error(
            'CalculationClient requires calculateScore or runtime score dependencies'
          )
        }
        return result
      }

      if (typeof dependencies.calculateScoreResolution === 'function') {
        return dependencies.calculateScoreResolution(
          resolution,
          getDxDistribution ?? undefined,
          scoreRangePlan
        )
      }
      return calculateCoreScoreResolution(
        resolution,
        { getDxDistribution: getDxDistribution ?? undefined },
        scoreRangePlan
      )
    }
  })()

  const scoreStatisticsCalculator =
    dependencies.getScoreStatistics ?? getScoreStatistics

  const getDamageStatisticsForClient = (
    damage: unknown,
  ) => {
    if (typeof dependencies.getDamageStatistics !== 'function') {
      throw new TypeError(
        'CalculationClient requires getDamageStatistics for attack calculations',
      )
    }
    return dependencies.getDamageStatistics(damage)
  }

  async function runAttackCalculation(
    params: AttackCalculationInput,
    options: AttackCalculationOptions,
  ): Promise<AttackCalculationResult> {
    const request = snapshotAttackParams(params)
    const plan = runRangePreflight(
      planner,
      createAttackRangeParams(request, options.scoreDisplayRequest),
      options.rangePolicy,
      options.onRangePlan
    )
    const leaseRequest = acquirePlanLease(
      resourceGuard,
      plan,
      options,
      'attack'
    )
    const lease = isPromiseLike(leaseRequest)
      ? await leaseRequest
      : leaseRequest
    const runtimeOptions = getRuntimeOptions(options)

    try {
      throwIfAborted(options, 'Attack')

      const score = {
        action: scoreResolutionCalculator(
          request.action.score,
          plan.scores?.[0]
        ),
        reaction: scoreResolutionCalculator(
          request.reaction.score,
          plan.scores?.[1]
        ),
      }
      if (typeof dependencies.calculateDamageOnDemand !== 'function') {
        throw new TypeError(
          'CalculationClient requires calculateDamageOnDemand for attack calculations',
        )
      }
      const finalizedDamage = await dependencies.calculateDamageOnDemand(
        score,
        request.action.damage,
        request.reaction.damage,
        {
          getDamageRollDistribution: dependencies.getDamageRollDistribution,
          getD10Distribution: dependencies.getD10Distribution,
          onFftLength: dependencies.onFftLength,
        },
        runtimeOptions,
        plan
      )
      throwIfAborted(options, 'Attack')

      const scoreStatistics = scoreStatisticsCalculator(score)
      return {
        score,
        scoreStatistics,
        damage: finalizedDamage,
        damageStatistics:
          getDamageStatisticsForClient(finalizedDamage),
      }
    } finally {
      lease.release()
    }
  }

  async function calculateAttack(
    params: AttackCalculationInput,
    options: AttackCalculationOptions = {},
  ): Promise<AttackCalculationResult> {
    return runAttackCalculation(params, options)
  }

  async function runTotalDamage(
    damages: readonly DistributionEnvelope[],
    options: TotalDamageClientOptions = {},
    aggregationOptionsOverride: TotalDamageCalculationOptions | null = null,
  ): Promise<TotalDamageResult> {
    // Snapshot the caller's array before planning or waiting for a resource
    // lease. The aggregation plan is then tied to this private snapshot.
    const damageSnapshot: readonly DistributionEnvelope[] = Array.isArray(damages)
      ? damages.map(copyTotalDamageEnvelope)
      : damages
    const calculationOptions = options ?? {}
    const aggregationOptions = aggregationOptionsOverride
      ?? createTotalDamageAggregationOptions(
        calculationOptions,
        dependencies.onFftLength
      )
    const plan = damagePlan(
      damageSnapshot,
      aggregationOptions
    )
    const leaseRequest = resourceGuard.acquirePlan(plan, {
      signal: calculationOptions.signal,
      requestId: calculationOptions.requestId,
      operation: 'total-damage',
    })
    const lease = isPromiseLike(leaseRequest)
      ? await leaseRequest
      : leaseRequest

    try {
      throwIfAborted(calculationOptions, 'total damage')
      const aggregate: AggregatedDamageEnvelope = damageSum(
        damageSnapshot,
        { ...aggregationOptions, plan },
      )
      throwIfAborted(calculationOptions, 'total damage')
      const summary = totalDamageStatistics(aggregate)
      return {
        totalDamage: copyTotalDamageEnvelope(aggregate),
        totalDamageStatistics: summary,
      }
    } finally {
      lease.release()
    }
  }

  return {
    planCheck(
      params: CheckInputSnapshot['params'],
      _difficulty?: Partial<DifficultyInput>,
      policy: RangePolicyInput = {},
    ): ReturnType<CalculationClient['planCheck']> {
      const request = {
        action: snapshotScoreParams(params.action, 'check.action'),
        reaction: snapshotScoreParams(params.reaction, 'check.reaction'),
      }
      return planner(createCheckRangeParams(request), policy) as
        ReturnType<CalculationClient['planCheck']>
    },

    planAttackCombo(
      params: AttackCalculationInput,
      policy: RangePolicyInput = {},
    ): AttackCalculationRangePlan {
      const request = snapshotAttackParams(params)
      return planner(
        createAttackRangeParams(request),
        policy
      ) as AttackCalculationRangePlan
    },

    planBacktrack(
      params: Partial<BacktrackParams>,
      policy: RangePolicyInput = {},
    ): BacktrackCalculationRangePlan {
      const request = snapshotBacktrackParams(params)
      return planner(createBacktrackRangeParams(request), policy) as
        BacktrackCalculationRangePlan
    },

    async calculateCheck(
      params: CheckInputSnapshot['params'],
      difficulty?: Partial<DifficultyInput>,
      options: CheckCalculationOptions = {},
    ) {
      const request = {
        action: snapshotScoreParams(params.action, 'check.action'),
        reaction: snapshotScoreParams(params.reaction, 'check.reaction'),
      }
      const difficultyRequest = normalizeDifficultyInput(difficulty)
      const plan = runRangePreflight(
        planner,
        createCheckRangeParams(request, options.displayRequest),
        getCheckRangePolicy(options),
        options.onRangePlan
      )
      const leaseRequest = acquirePlanLease(
        resourceGuard,
        plan,
        options,
        'check'
      )
      const lease = isPromiseLike(leaseRequest)
        ? await leaseRequest
        : leaseRequest

      try {
        throwIfAborted(options, 'check')
        const score = {
          action: scoreResolutionCalculator(
            rolledScoreResolution(request.action),
            plan.scores?.[0]
          ),
          reaction: scoreResolutionCalculator(
            rolledScoreResolution(request.reaction),
            plan.scores?.[1]
          ),
        }
        throwIfAborted(options, 'check')
        return {
          score,
          scoreStatistics: scoreStatisticsCalculator(
            score,
            difficultyRequest
          ),
        }
      } finally {
        lease.release()
      }
    },

    async calculateAttack(
      params: AttackCalculationInput,
      options: AttackCalculationOptions = {},
    ): Promise<AttackCalculationResult> {
      return calculateAttack(params, options)
    },

    async calculateTotalDamage(
      damages: readonly DistributionEnvelope[],
      options: TotalDamageClientOptions = {},
    ): Promise<TotalDamageResult> {
      return runTotalDamage(damages, options)
    },

    async calculateBacktrack(
      params: Partial<BacktrackParams>,
      options: BacktrackCalculationOptions = {},
    ): Promise<BacktrackCalculationResult> {
      const request = snapshotBacktrackParams(params)
      const plan = runRangePreflight(
        planner,
        createBacktrackRangeParams(request),
        options.rangePolicy,
        options.onRangePlan
      )
      const leaseRequest = acquirePlanLease(
        resourceGuard,
        plan,
        options,
        'backtrack'
      )
      const lease = isPromiseLike(leaseRequest)
        ? await leaseRequest
        : leaseRequest
      try {
        throwIfAborted(options, 'backtrack')
        if (typeof dependencies.getFinalEncroachment !== 'function') {
          throw new TypeError(
            'CalculationClient requires getFinalEncroachment for backtrack calculations',
          )
        }
        const result = await dependencies.getFinalEncroachment(
          request,
          getRuntimeOptions(options),
          plan.backtrack
        )
        throwIfAborted(options, 'backtrack')
        return result
      } finally {
        lease.release()
      }
    },
  }
}

export function createCalculationDependencies(
  overrides: CalculationClientDependencies = {},
): CompleteCalculationClientDependencies {
  return {
    ...defaultDependencies,
    ...overrides,
    resourceGuard: overrides.resourceGuard ?? createResourceGuard(),
  } as CompleteCalculationClientDependencies
}

export const calculationDependencies = defaultDependencies
export const calculationResourceGuard = defaultResourceGuard
export const calculationClient = createCalculationClient()
