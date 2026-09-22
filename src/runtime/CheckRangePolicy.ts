import type { DisplayRequestSnapshot } from '../domain/CalculationInputs'
import type { RangePolicyInput } from '../calculation/planning/RangePlannerTypes'
import {
  getDisplayRangePointCount,
  isDisplayCoordinate,
  isDisplayMode,
} from '../shared/validation/DisplayRangeRules'

/** Stable error code for invalid calculation/display range policy input. */
export const CHECK_RANGE_POLICY_ERROR_CODE = 'invalid-check-range-policy'

const DISPLAY_REQUEST_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'invalid-display-request',
  INVALID_MIN: 'invalid-display-min',
  INVALID_MAX: 'invalid-display-max',
  INVALID_MODE: 'invalid-display-mode',
})

type PolicyRecord = Record<string, unknown>

function isRecord(value: unknown): value is PolicyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fail(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): never {
  const error = Object.assign(new TypeError(message), {
    code,
    details: Object.freeze({ ...details }),
  })
  throw error
}

function readOwn(request: PolicyRecord, property: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(request, property)) {
    fail(
      DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      `displayRequest.${property} must be an own property`,
      { path: `displayRequest.${property}` },
    )
  }
  return request[property]
}

function normalizeCoordinate(value: unknown, property: 'min' | 'max'): number {
  if (!isDisplayCoordinate(value)) {
    fail(
      property === 'min'
        ? DISPLAY_REQUEST_ERROR_CODES.INVALID_MIN
        : DISPLAY_REQUEST_ERROR_CODES.INVALID_MAX,
      `displayRequest.${property} must be a non-negative safe integer`,
      { path: `displayRequest.${property}`, value },
    )
  }
  return value
}

function normalizeMode(value: unknown): DisplayRequestSnapshot['mode'] {
  if (!isDisplayMode(value)) {
    fail(
      DISPLAY_REQUEST_ERROR_CODES.INVALID_MODE,
      'displayRequest.mode must be a supported Check display mode',
      { path: 'displayRequest.mode', value },
    )
  }
  return value
}

/** Validate the display coordinates without copying them into the policy. */
function normalizeDisplayRequest(
  displayRequest: unknown,
): Pick<DisplayRequestSnapshot, 'min' | 'max'> {
  if (!isRecord(displayRequest)) {
    fail(
      DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      'displayRequest must be an object',
      { path: 'displayRequest' },
    )
  }
  const min = normalizeCoordinate(readOwn(displayRequest, 'min'), 'min')
  const max = normalizeCoordinate(readOwn(displayRequest, 'max'), 'max')
  if (min > max) {
    fail(
      DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      'displayRequest.min must be less than or equal to displayRequest.max',
      { min, max },
    )
  }
  if (getDisplayRangePointCount(min, max) === null) {
    fail(
      DISPLAY_REQUEST_ERROR_CODES.INVALID_REQUEST,
      'displayRequest point count must be a safe integer',
      { min, max },
    )
  }
  normalizeMode(readOwn(displayRequest, 'mode'))
  return { min, max }
}

/** Clone enumerable own string-key values while preserving aliases and cycles. */
function clonePolicyValue<T>(
  value: T,
  seen: WeakMap<object, unknown> = new WeakMap(),
): T {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (seen.has(value)) {
    return seen.get(value) as T
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = []
    seen.set(value, copy)
    for (const entry of value) {
      copy.push(clonePolicyValue(entry, seen))
    }
    return copy as T
  }
  if (!isRecord(value)) {
    fail(
      CHECK_RANGE_POLICY_ERROR_CODE,
      'rangePolicy must contain only objects and arrays',
      { valueType: typeof value },
    )
  }
  const copy: PolicyRecord = {}
  seen.set(value, copy)
  for (const [key, entry] of Object.entries(value)) {
    copy[key] = clonePolicyValue(entry, seen)
  }
  return copy as T
}

function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value
  }
  seen.add(value)
  for (const entry of Object.values(value)) {
    deepFreeze(entry, seen)
  }
  return Object.freeze(value)
}

function validateOptionalPolicyInteger(value: unknown, path: string): void {
  if (value === undefined) {
    return
  }
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    fail(
      CHECK_RANGE_POLICY_ERROR_CODE,
      `${path} must be a non-negative safe integer`,
      { path, value },
    )
  }
}

const POLICY_KEYS = Object.freeze({
  root: new Set(['errorBudget', 'display', 'limits']),
  errorBudget: new Set(['total', 'scoreTail']),
  display: new Set(['maxPoints']),
  limits: new Set([
    'maxCpuWork',
    'estimatedMemoryBytes',
    'workingLength',
    'fftLength',
  ]),
})

function validatePolicySchema(
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (value === null || value === undefined) {
    return
  }
  if (!isRecord(value)) {
    fail(
      CHECK_RANGE_POLICY_ERROR_CODE,
      `${path} must be an object`,
      { path },
    )
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)
  for (const property of Reflect.ownKeys(value)) {
    if (typeof property !== 'string' || !allowed.has(property)) {
      fail(
        CHECK_RANGE_POLICY_ERROR_CODE,
        `${path}.${String(property)} is not a supported range policy key`,
        { path: `${path}.${String(property)}` },
      )
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'errorBudget')) {
    validatePolicySchema(
      value.errorBudget,
      `${path}.errorBudget`,
      POLICY_KEYS.errorBudget,
      seen,
    )
  }
  if (Object.prototype.hasOwnProperty.call(value, 'display')) {
    validatePolicySchema(
      value.display,
      `${path}.display`,
      POLICY_KEYS.display,
      seen,
    )
  }
  if (Object.prototype.hasOwnProperty.call(value, 'limits')) {
    validatePolicySchema(
      value.limits,
      `${path}.limits`,
      POLICY_KEYS.limits,
      seen,
    )
  }
}

/**
 * Snapshot the calculation policy needed by a Check request. Display
 * coordinates are validated here, but remain planner parameters rather than
 * being copied into the resource policy.
 */
export function createCheckRangePolicy(
  displayRequest: DisplayRequestSnapshot,
  suppliedPolicy: RangePolicyInput = {},
): RangePolicyInput {
  normalizeDisplayRequest(displayRequest)
  const rawPolicy: unknown = suppliedPolicy
  if (!isRecord(rawPolicy)) {
    fail(
      CHECK_RANGE_POLICY_ERROR_CODE,
      'rangePolicy must be an object',
      { path: 'rangePolicy' },
    )
  }

  const clonedPolicy: unknown = clonePolicyValue(rawPolicy)
  if (!isRecord(clonedPolicy)) {
    fail(
      CHECK_RANGE_POLICY_ERROR_CODE,
      'rangePolicy must be an object',
      { path: 'rangePolicy' },
    )
  }
  const policy = clonedPolicy
  validatePolicySchema(policy, 'rangePolicy', POLICY_KEYS.root)
  const suppliedDisplay = policy.display ?? {}
  if (!isRecord(suppliedDisplay)) {
    fail(
      CHECK_RANGE_POLICY_ERROR_CODE,
      'rangePolicy.display must be an object',
      { path: 'rangePolicy.display' },
    )
  }
  validateOptionalPolicyInteger(
    suppliedDisplay.maxPoints,
    'rangePolicy.display.maxPoints',
  )

  return deepFreeze(policy) as RangePolicyInput
}
