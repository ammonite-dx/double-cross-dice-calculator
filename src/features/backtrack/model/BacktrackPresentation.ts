import {
  getBacktrackRule,
} from '../../../domain/BacktrackRules'
import type { BacktrackParams } from '../../../domain/BacktrackRules'
import type { DistributionResult } from '../../../domain/DistributionResultTypes'
import {
  validateDistributionResult,
} from '../../../calculation/DistributionResult'

export const BACKTRACK_PRESENTATION_VERSION = 2 as const

export const BACKTRACK_PRESENTATION_ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'invalid-input',
  INVALID_PARAMS: 'invalid-params',
  MISSING_RESULT: 'missing-result',
  INVALID_RESULT: 'invalid-result',
  INCOMPLETE_SUPPORT: 'incomplete-support',
  UNSUPPORTED_OVERFLOW: 'unsupported-overflow',
  UNEXPECTED_ERROR: 'unexpected-error',
})

export type BacktrackChartKey = 'single' | 'double' | 'second'

export interface BacktrackChartPresentation {
  readonly key: BacktrackChartKey
  readonly labels: readonly string[]
  readonly probabilities: readonly number[]
  readonly backgroundColors: readonly string[]
  readonly title?: string
  readonly accessibleName: string
}

export interface BacktrackPresentation {
  readonly version: typeof BACKTRACK_PRESENTATION_VERSION
  readonly kind: 'backtrack-presentation'
  readonly charts: Readonly<{
    single: BacktrackChartPresentation
    double: BacktrackChartPresentation
    second: BacktrackChartPresentation
  }>
}

const RESULT_KEYS: readonly BacktrackChartKey[] = Object.freeze([
  'single',
  'double',
  'second',
])

const STANDARD_SINGLE_LABELS: readonly string[] = Object.freeze([
  '100%〜',
  '71〜99%',
  '51〜70%',
  '31〜50%',
  '0〜30%',
])

const NIGHTMARE_SINGLE_LABELS: readonly string[] = Object.freeze([
  '120%～',
  '100〜119%',
  '71〜99%',
  '51〜70%',
  '31〜50%',
  '0〜30%',
])

const BINARY_LABELS: readonly string[] = Object.freeze([
  '失敗',
  '成功',
])

const STANDARD_SINGLE_COLORS: readonly string[] = Object.freeze([
  '#EC1D2C',
  '#FE6F2F',
  '#F9A829',
  '#FAD23C',
  '#5EBB68',
])

const NIGHTMARE_SINGLE_COLORS: readonly string[] = Object.freeze([
  '#EC1D2C',
  '#ED551B',
  '#FE6F2F',
  '#F9A829',
  '#FAD23C',
  '#5EBB68',
])

const BINARY_COLORS: readonly string[] = Object.freeze([
  '#EC1D2C',
  '#5EBB68',
])

type RecordValue = Record<string, unknown>

function hasOwn(object: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, property)
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPlainRecord(value: unknown): value is RecordValue {
  if (!isRecord(value)) {
    return false
  }
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function freezeDetails(details: unknown): Readonly<RecordValue> {
  return Object.freeze(isPlainRecord(details) ? { ...details } : {})
}

export class BacktrackPresentationError extends Error {
  readonly code: string
  readonly details: Readonly<RecordValue>
  readonly backtrackPresentation = true as const

  constructor(
    code: string,
    message: string,
    details: unknown = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'BacktrackPresentationError'
    this.code = code
    this.details = freezeDetails(details)
    if (cause !== undefined && this.cause === undefined) {
      this.cause = cause
    }
  }
}

export class BacktrackPresentationValidationError
  extends BacktrackPresentationError {
  readonly validation = true as const

  constructor(
    code: string,
    message: string,
    details: unknown = {},
    cause?: unknown,
  ) {
    super(code, message, details, cause)
    this.name = 'BacktrackPresentationValidationError'
  }
}

export function isBacktrackPresentationError(
  error: unknown,
): error is BacktrackPresentationError {
  return isRecord(error)
    && error.backtrackPresentation === true
    && typeof error.code === 'string'
}

export function isBacktrackPresentationValidationError(
  error: unknown,
): error is BacktrackPresentationValidationError {
  return isBacktrackPresentationError(error)
    && isRecord(error)
    && error.validation === true
}

function fail(
  code: string,
  message: string,
  details: unknown = {},
): never {
  throw new BacktrackPresentationValidationError(code, message, details)
}

function normalizeParams(params: unknown): BacktrackParams {
  if (!isPlainRecord(params)) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_PARAMS,
      'backtrack params must be a plain record',
      { path: 'params' },
    )
  }

  const encroachmentValue = params.encroachment ?? 0
  if (
    typeof encroachmentValue !== 'number'
    || !Number.isSafeInteger(encroachmentValue)
  ) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_PARAMS,
      'params.encroachment must be a safe integer',
      { path: 'params.encroachment', value: encroachmentValue },
    )
  }

  const valueCandidate = params.value ?? 0
  if (
    typeof valueCandidate !== 'number'
    || !Number.isSafeInteger(valueCandidate)
    || valueCandidate < 0
  ) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_PARAMS,
      'params.value must be a non-negative safe integer',
      { path: 'params.value', value: valueCandidate },
    )
  }

  const dlois = params.dlois ?? 'なし'
  if (typeof dlois !== 'string') {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_PARAMS,
      'params.dlois must be a string',
      { path: 'params.dlois', value: dlois },
    )
  }

  return {
    encroachment: encroachmentValue,
    lois: typeof params.lois === 'number' ? params.lois : 0,
    elois: typeof params.elois === 'number' ? params.elois : 0,
    dice: typeof params.dice === 'number' ? params.dice : 0,
    value: valueCandidate,
    dlois,
  }
}

function normalizeDistribution(
  resultRecord: RecordValue,
  key: BacktrackChartKey,
): DistributionResult {
  if (!hasOwn(resultRecord, key)) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.MISSING_RESULT,
      `backtrack result is missing ${key}`,
      { path: key },
    )
  }

  const result = resultRecord[key]
  try {
    validateDistributionResult(result)
  } catch (cause) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_RESULT,
      `backtrack ${key} is not a valid DistributionResult`,
      { path: key, causeCode: isRecord(cause) ? cause.code : undefined },
    )
  }

  const distribution = result as DistributionResult
  if (distribution.support.kind !== 'finite') {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INCOMPLETE_SUPPORT,
      `backtrack ${key} must have complete finite support`,
      { path: `${key}.support` },
    )
  }
  if (distribution.overflow !== null) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.UNSUPPORTED_OVERFLOW,
      `backtrack ${key} must not contain overflow`,
      { path: `${key}.overflow` },
    )
  }

  const explicitMax = distribution.values.length === 0
    ? null
    : distribution.offset + distribution.values.length - 1
  if (explicitMax === null || distribution.support.max !== explicitMax) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INCOMPLETE_SUPPORT,
      `backtrack ${key} must explicitly cover its finite support`,
      {
        path: key,
        explicitMax,
        supportMax: distribution.support.max,
      },
    )
  }

  return distribution
}

function normalizeResults(
  result: unknown,
): Readonly<Record<BacktrackChartKey, DistributionResult>> {
  if (!isPlainRecord(result)) {
    fail(
      BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_INPUT,
      'backtrack result must be a plain record',
      { path: 'result' },
    )
  }

  const normalized = {} as Record<BacktrackChartKey, DistributionResult>
  for (const key of RESULT_KEYS) {
    normalized[key] = normalizeDistribution(result, key)
  }
  return normalized
}

function roundPercentage(probability: number): number {
  const rounded = Math.round(probability * 1000) / 10
  return Object.is(rounded, -0) ? 0 : rounded
}

function aggregate(
  result: DistributionResult,
  categoryCount: number,
  getCategory: (finalEncroachment: number) => number,
): readonly number[] {
  const buckets = Array.from({ length: categoryCount }, () => 0)
  for (let index = 0; index < result.values.length; index += 1) {
    const finalEncroachment = result.offset + index
    buckets[getCategory(finalEncroachment)] += result.values[index]
  }
  return Object.freeze(buckets.map(roundPercentage))
}

function getSingleCategory(
  finalEncroachment: number,
  nightmare: boolean,
): number {
  const boundaries = nightmare
    ? [120, 100, 71, 51, 31]
    : [100, 71, 51, 31]
  const category = boundaries.findIndex((boundary) =>
    finalEncroachment >= boundary,
  )
  return category >= 0 ? category : boundaries.length
}

function getBinaryCategory(
  finalEncroachment: number,
  nightmare: boolean,
): number {
  return finalEncroachment >= (nightmare ? 120 : 100) ? 0 : 1
}

function createChart(
  key: BacktrackChartKey,
  labels: readonly string[],
  probabilities: readonly number[],
  backgroundColors: readonly string[],
  accessibleName: string,
  title?: string,
): BacktrackChartPresentation {
  const chart = {
    key,
    labels,
    probabilities,
    backgroundColors,
    accessibleName,
  }
  return Object.freeze(title === undefined ? chart : { ...chart, title })
}

function createCharts(
  results: Readonly<Record<BacktrackChartKey, DistributionResult>>,
  params: BacktrackParams,
): Readonly<BacktrackPresentation['charts']> {
  const nightmare = getBacktrackRule(params.dlois).nightmare === true
  const single = aggregate(
    results.single,
    nightmare ? 6 : 5,
    (finalEncroachment) => getSingleCategory(finalEncroachment, nightmare),
  )
  const binaryCategory = (finalEncroachment: number) =>
    getBinaryCategory(finalEncroachment, nightmare)

  return Object.freeze({
    single: createChart(
      'single',
      nightmare ? NIGHTMARE_SINGLE_LABELS : STANDARD_SINGLE_LABELS,
      single,
      nightmare ? NIGHTMARE_SINGLE_COLORS : STANDARD_SINGLE_COLORS,
      nightmare
        ? '最終侵蝕率分布 一倍振り（屍人・悪夢）'
        : '最終侵蝕率分布 一倍振り',
      nightmare ? undefined : '一倍振り',
    ),
    double: createChart(
      'double',
      BINARY_LABELS,
      aggregate(results.double, 2, binaryCategory),
      BINARY_COLORS,
      '最終侵蝕率分布 二倍振り',
      '二倍振り',
    ),
    second: createChart(
      'second',
      BINARY_LABELS,
      aggregate(results.second, 2, binaryCategory),
      BINARY_COLORS,
      '最終侵蝕率分布 二倍振りと追加振り',
      '二倍振り+追加振り',
    ),
  })
}

export function createBacktrackPresentation(
  result: unknown,
  params: unknown,
): BacktrackPresentation {
  try {
    if (arguments.length !== 2) {
      fail(
        BACKTRACK_PRESENTATION_ERROR_CODES.INVALID_INPUT,
        'createBacktrackPresentation expects result and params',
        { path: 'arguments' },
      )
    }
    const normalizedParams = normalizeParams(params)
    const results = normalizeResults(result)
    return Object.freeze({
      version: BACKTRACK_PRESENTATION_VERSION,
      kind: 'backtrack-presentation' as const,
      charts: createCharts(results, normalizedParams),
    })
  } catch (error: unknown) {
    if (isBacktrackPresentationError(error)) {
      throw error
    }
    throw new BacktrackPresentationError(
      BACKTRACK_PRESENTATION_ERROR_CODES.UNEXPECTED_ERROR,
      'backtrack presentation failed unexpectedly',
      {},
      error,
    )
  }
}
