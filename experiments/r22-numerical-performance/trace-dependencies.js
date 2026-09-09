function now() {
  return globalThis.performance.now()
}

function round(value) {
  return Number(value.toFixed(3))
}

function percentile(sorted, probability) {
  return sorted[Math.min(
    sorted.length - 1,
    Math.ceil(probability * sorted.length) - 1
  )]
}

function summarize(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .slice()
    .sort((left, right) => left - right)
  if (sorted.length === 0) {
    return null
  }
  return {
    sampleCount: sorted.length,
    minMs: round(sorted[0]),
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted.at(-1)),
    totalMs: round(sorted.reduce((sum, value) => sum + value, 0)),
  }
}

export function createTraceRecorder() {
  const records = []

  function record(name, kind, elapsedMs, error = null) {
    records.push({
      name,
      kind,
      elapsedMs: round(elapsedMs),
      error: error === null ? null : String(error?.message ?? error),
    })
  }

  function measure(name, operation) {
    if (typeof operation !== 'function') {
      throw new TypeError('trace operation must be a function')
    }
    const startedAt = now()
    let result
    try {
      result = operation()
    } catch (error) {
      record(name, 'sync', now() - startedAt, error)
      throw error
    }
    if (result !== null && typeof result === 'object'
      && typeof result.then === 'function') {
      return Promise.resolve(result).then(
        (value) => {
          record(name, 'async', now() - startedAt)
          return value
        },
        (error) => {
          record(name, 'async', now() - startedAt, error)
          throw error
        }
      )
    }
    record(name, 'sync', now() - startedAt)
    return result
  }

  function wrap(name, operation) {
    return (...args) => measure(name, () => operation(...args))
  }

  function slice(fromIndex = 0) {
    return records.slice(fromIndex)
  }

  function summarizeRecords(fromIndex = 0) {
    const groups = new Map()
    for (const record of records.slice(fromIndex)) {
      const key = `${record.name}:${record.kind}`
      const group = groups.get(key) ?? {
        name: record.name,
        kind: record.kind,
        values: [],
        errors: 0,
      }
      group.values.push(record.elapsedMs)
      if (record.error !== null) {
        group.errors += 1
      }
      groups.set(key, group)
    }
    return Array.from(groups.values())
      .map(({ name, kind, values, errors }) => ({
        name,
        kind,
        ...summarize(values),
        errors,
      }))
      .sort((left, right) => right.totalMs - left.totalMs)
  }

  return {
    get size() {
      return records.length
    },
    measure,
    wrap,
    slice,
    summarizeRecords,
    clear() {
      records.length = 0
    },
  }
}

export function summarizeSamples(samples) {
  return summarize(samples)
}

export function rankSyncHotspots(records) {
  const values = records
    .filter((record) => record.kind === 'sync' && record.error === null)
  const groups = new Map()
  for (const record of values) {
    const group = groups.get(record.name) ?? []
    group.push(record.elapsedMs)
    groups.set(record.name, group)
  }
  return Array.from(groups, ([name, durations]) => ({
    name,
    ...summarize(durations),
  }))
    .sort((left, right) => right.totalMs - left.totalMs)
}

