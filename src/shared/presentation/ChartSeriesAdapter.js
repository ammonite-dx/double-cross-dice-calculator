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

function hasOwn(value, property) {
  return Object.prototype.hasOwnProperty.call(value, property)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function freezeDetails(details) {
  return Object.freeze(isRecord(details) ? { ...details } : {})
}

export class ChartSeriesError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ChartSeriesError'
    this.code = code
    this.details = freezeDetails(details)
    this.chartSeries = true
  }
}

export function isChartSeriesError(error) {
  return error?.chartSeries === true && typeof error.code === 'string'
}

function fail(code, message, details = {}) {
  throw new ChartSeriesError(code, message, details)
}

function getOwnDataProperty(value, property, code, path) {
  if (!hasOwn(value, property)) {
    fail(code, `${path}.${property} must be an own data property`, {
      path: `${path}.${property}`,
      property,
    })
  }
  return value[property]
}

function requireRecord(value, code, path, message) {
  if (!isRecord(value)) {
    fail(code, message ?? `${path} must be an object`, { path })
  }
  return value
}

function requireReadySeries(series) {
  // ReadyDistributionProjection is produced by the trusted projection stage.
  // The Chart.js boundary only needs to reject an unavailable result; schema
  // and numeric validation belong to the earlier presentation boundaries.
  if (series?.status !== 'ready') {
    fail(
      CHART_SERIES_ERROR_CODES.INVALID_SERIES,
      'only ready projections can be materialized',
      { path: 'series.status', status: series?.status }
    )
  }
  return series
}

function normalizeMaterializerOptions(options) {
  const supplied = options === undefined ? {} : options
  requireRecord(
    supplied,
    CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
    'options',
    'Chart.js materializer options must be an object'
  )
  const includeLabels = hasOwn(supplied, 'includeLabels')
    ? getOwnDataProperty(
        supplied,
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
  const label = hasOwn(supplied, 'label')
    ? getOwnDataProperty(
        supplied,
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
  const backgroundColor = hasOwn(supplied, 'backgroundColor')
    ? getOwnDataProperty(
        supplied,
        'backgroundColor',
        CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : undefined
  const borderColor = hasOwn(supplied, 'borderColor')
    ? getOwnDataProperty(
        supplied,
        'borderColor',
        CHART_SERIES_ERROR_CODES.INVALID_MATERIALIZER_OPTIONS,
        'options'
      )
    : undefined
  return { includeLabels, label, backgroundColor, borderColor }
}

/**
 * Materialize a ready canonical distribution projection at the Chart.js
 * boundary. Labels are allocated only here; the projection remains a dense
 * typed array with no Chart.js-specific objects.
 *
 * @param {ReadyDistributionProjection} series
 * @param {ChartMaterializerOptions} [options]
 * @returns {ChartJsData}
 */
export function materializeChartJsData(series, options = {}) {
  const readySeries = requireReadySeries(series)
  const materializerOptions = normalizeMaterializerOptions(options)
  const dataset = {
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

  const result = { datasets: Object.freeze([Object.freeze(dataset)]) }
  if (materializerOptions.includeLabels) {
    const labels = Array.from(
      { length: readySeries.displayWindow.pointCount },
      (_, index) => readySeries.displayWindow.min + index
    )
    result.labels = Object.freeze(labels)
  }
  return Object.freeze(result)
}
