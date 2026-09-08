const HASH_OFFSET = 2_166_136_261
const HASH_PRIME = 16_777_619

function updateHash(state, value) {
  const text = String(value)
  for (let index = 0; index < text.length; index += 1) {
    state.hash ^= text.charCodeAt(index)
    state.hash = Math.imul(state.hash, HASH_PRIME) >>> 0
  }
}

function isTypedArray(value) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView)
}

function digestValue(value, state, seen) {
  if (value === null) {
    updateHash(state, 'null;')
    return
  }
  if (typeof value === 'number') {
    updateHash(state, `number:${Number.isNaN(value) ? 'NaN' : value};`)
    state.leafCount += 1
    return
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    updateHash(state, `${typeof value}:${value};`)
    state.leafCount += 1
    return
  }
  if (typeof value === 'undefined') {
    updateHash(state, 'undefined;')
    state.leafCount += 1
    return
  }
  if (typeof value !== 'object') {
    updateHash(state, `${typeof value};`)
    state.leafCount += 1
    return
  }
  if (seen.has(value)) {
    throw new TypeError('result digest does not accept circular values')
  }
  seen.add(value)

  if (isTypedArray(value)) {
    updateHash(state, `typed-array:${value.constructor.name}:${value.length}[`)
    state.byteCount += value.byteLength
    for (const entry of value) {
      digestValue(entry, state, seen)
    }
    updateHash(state, '];')
    seen.delete(value)
    return
  }
  if (Array.isArray(value)) {
    updateHash(state, `array:${value.length}[`)
    for (const entry of value) {
      digestValue(entry, state, seen)
    }
    updateHash(state, '];')
    seen.delete(value)
    return
  }

  const keys = Object.keys(value).sort()
  updateHash(state, `object:${keys.length}{`)
  for (const key of keys) {
    updateHash(state, `${key}:`)
    digestValue(value[key], state, seen)
  }
  updateHash(state, '};')
  seen.delete(value)
}

/**
 * Produce a deterministic, lightweight digest for a calculation result.
 * This is used outside timed sections to check transport parity without
 * retaining a second copy of large probability buffers.
 */
export function createResultDigest(value) {
  const state = {
    hash: HASH_OFFSET,
    byteCount: 0,
    leafCount: 0,
  }
  digestValue(value, state, new WeakSet())
  return `fnv1a32-${state.hash.toString(16).padStart(8, '0')}`
    + `-bytes-${state.byteCount}-leaves-${state.leafCount}`
}

function estimateValueBytesInternal(value, seen) {
  if (value === null || typeof value !== 'object') {
    return 8
  }
  if (seen.has(value)) {
    return 0
  }
  seen.add(value)
  if (isTypedArray(value)) {
    return value.byteLength
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (total, entry) => total + estimateValueBytesInternal(entry, seen),
      0
    )
  }
  return Object.entries(value).reduce(
    (total, [key, entry]) => total + key.length * 2
      + estimateValueBytesInternal(entry, seen),
    0
  )
}

/** Estimate payload size for the measurement report, not a clone budget. */
export function estimateValueBytes(value) {
  return estimateValueBytesInternal(value, new WeakSet())
}
