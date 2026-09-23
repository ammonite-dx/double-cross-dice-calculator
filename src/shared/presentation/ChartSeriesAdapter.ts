import type {
  ChartJsData,
  ChartMaterializerOptions,
  ReadyDistributionProjection,
} from './DistributionProjectionTypes'

// This module is deliberately limited to the Chart.js boundary. Projection
// decisions and window allocation belong to DistributionProjection.
/** @typedef {import('./DistributionProjectionTypes').ReadyDistributionProjection} ReadyDistributionProjection */
/** @typedef {import('./DistributionProjectionTypes').ChartMaterializerOptions} ChartMaterializerOptions */
/** @typedef {import('./DistributionProjectionTypes').ChartJsData} ChartJsData */

export const CHART_SERIES_ERROR_CODES = Object.freeze({
  INVALID_SERIES: 'invalid-series',
  INVALID_MATERIALIZER_OPTIONS: 'invalid-materializer-options',
  RANGE_OVERFLOW: 'range-overflow',
})

function hasOwn(value: object, property: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, property)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function freezeDetails(details: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze(isRecord(details) ? { ...details } : {})
}

export class ChartSeriesError extends Error {
  readonly code: string
  readonly details: Readonly<Record<string, unknown>>
  readonly chartSeries = true

  constructor(code: string, message: string, details: unknown = {}) {
    super(message)
    this.name = 'ChartSeriesError'
    this.code = code
    this.details = freezeDetails(details)
  }
}

export function isChartSeriesError(error: unknown): error is ChartSeriesError {
  return isRecord(error)
    && error.chartSeries === true
    && typeof error.code === 'string'
}

function fail(code: string, message: string, details: unknown = {}): never {
  throw new ChartSeriesError(code, message, details)
}

function getOwnDataProperty(
  value: Record<string, unknown>,
  property: string,
  code: string,
  path: string,
): unknown {
  if (!hasOwn(value, property)) {
    fail(code, `${path}.${property} must be an own data property`, {
      path: `${path}.${property}`,
      property,
    })
  }
  return value[property]
}

function requireRecord(
  value: unknown,
  code: string,
  path: string,
  message: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(code, message ?? `${path} must be an object`, { path })
  }
  return value
}

function requireReadySeries(series: unknown): ReadyDistributionProjection {
  // ReadyDistributionProjection is produced by the trusted projection stage.
  // The Chart.js boundary only needs to reject an unavailable result; schema
  // and numeric validation belong to the earlier presentation boundaries.
  if (!isRecord(series) || series.status !== 'ready') {
    fail(
      CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      'only ready projections can be materialized',
      { path: 'series.status', status: isRecord(series) ? series.status : undefined }
    )
  }
  return series as unknown as ReadyDistributionProjection
}

function normalizeMaterializerOptions(
  options: ChartMaterializerOptions | undefined,
): Required<Pick<ChartMaterializerOptions, 'includeLabels'>>
  & Omit<ChartMaterializerOptions, 'includeLabels'> {
  const supplied: unknown = options === undefined ? {} : options
  const suppliedRecord = requireRecord(
    supplied,
    CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
    'options',
    'Chart.js materializer options must be an object'
  )
  const includeLabels = hasOwn(suppliedRecord, 'includeLabels')
    ? getOwnDataProperty(
        suppliedRecord,
        'includeLabels',
        CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : true
  if (typeof includeLabels !== 'boolean') {
    fail(
      CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
      'options.includeLabels must be boolean',
      { includeLabels }
    )
  }
  const label = hasOwn(suppliedRecord, 'label')
    ? getOwnDataProperty(
        suppliedRecord,
        'label',
        CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : undefined
  if (label !== undefined && typeof label !== 'string') {
    fail(
      CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
      'options.label must be a string when supplied',
      { label }
    )
  }
  const backgroundColor = hasOwn(suppliedRecord, 'backgroundColor')
    ? getOwnDataProperty(
        suppliedRecord,
        'backgroundColor',
        CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : undefined
  const borderColor = hasOwn(suppliedRecord, 'borderColor')
    ? getOwnDataProperty(
        suppliedRecord,
        'borderColor',
        CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : undefined
  return { includeLabels, label, backgroundColor, borderColor }
}

/**
 * Materialize a ready distribution projection at the Chart.js
 * boundary. Labels are allocated only here; the projection remains a dense
 * typed array with no Chart.js-specific objects.
 *
 * @param {ReadyDistributionProjection} series
 * @param {ChartMaterializerOptions} [options]
 * @returns {ChartJsData}
 */
export function materializeChartJsData(
  series: ReadyDistributionProjection,
  options: ChartMaterializerOptions = {},
): ChartJsData {
  const readySeries = requireReadySeries(series)
  const materializerOptions = normalizeMaterializerOptions(options)
  const dataset: {
    data: Float64Array
    parsing: true
    label?: string
    backgroundColor?: unknown
    borderColor?: unknown
  } = {
    data: readySeries.values,
    parsing: true,
  }
  if (materializerOptions.label !== undefined) {
    dataset.label = materializerOptions.label
  }
  if (materializerOptions.backgroundColor !== undefined) {
    dataset.backgroundColor = materializerOptions.backgroundColor
  }
  if (materializerOptions.borderColor !== undefined) {
    dataset.borderColor = materializerOptions.borderColor
  }

  const result: {
    datasets: readonly [typeof dataset]
    labels?: readonly number[]
  } = {
    datasets: Object.freeze([
      Object.freeze(dataset),
    ] as [typeof dataset]),
  }
  if (materializerOptions.includeLabels) {
    const labels = Array.from(
      { length: readySeries.displayWindow.pointCount },
      (_, index) => readySeries.displayWindow.min + index
    )
    result.labels = Object.freeze(labels)
  }
  return Object.freeze(result)
}
