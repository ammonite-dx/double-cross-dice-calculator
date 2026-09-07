/**
 * Numeric result contracts shared by the calculation core and presentation
 * boundary. A certificate describes what the producer can prove about a
 * value; it is not a display format.
 */

export type CertifiedValueExact = Readonly<{
  kind: 'exact'
  value: number
}>

export type CertifiedValueBounded = Readonly<{
  kind: 'bounded'
  lowerBound: number
  upperBound: number
}>

export type CertifiedValueLowerBound = Readonly<{
  kind: 'lower-bound'
  lowerBound: number
}>

export type CertifiedValue =
  | CertifiedValueExact
  | CertifiedValueBounded
  | CertifiedValueLowerBound

export type CertifiedProbabilityExact = CertifiedValueExact
export type CertifiedProbabilityBounded = CertifiedValueBounded
export type CertifiedProbability =
  | CertifiedProbabilityExact
  | CertifiedProbabilityBounded

function assertFinite(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`)
  }
}

function assertProbability(value: number, label: string): void {
  assertFinite(value, label)
  if (value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1`)
  }
}

export function createExactCertifiedValue(value: number): CertifiedValueExact {
  assertFinite(value, 'value')
  return Object.freeze({ kind: 'exact', value })
}

export function createBoundedCertifiedValue(
  lowerBound: number,
  upperBound: number,
): CertifiedValueBounded {
  assertFinite(lowerBound, 'lowerBound')
  assertFinite(upperBound, 'upperBound')
  if (upperBound < lowerBound) {
    throw new RangeError('upperBound must be greater than or equal to lowerBound')
  }
  return Object.freeze({ kind: 'bounded', lowerBound, upperBound })
}

export function createLowerBoundCertifiedValue(
  lowerBound: number,
): CertifiedValueLowerBound {
  assertFinite(lowerBound, 'lowerBound')
  return Object.freeze({ kind: 'lower-bound', lowerBound })
}

export function createExactProbability(value: number): CertifiedProbabilityExact {
  assertProbability(value, 'probability')
  return Object.freeze({ kind: 'exact', value })
}

export function createBoundedProbability(
  lowerBound: number,
  upperBound: number,
): CertifiedProbabilityBounded {
  assertProbability(lowerBound, 'lowerBound')
  assertProbability(upperBound, 'upperBound')
  if (upperBound < lowerBound) {
    throw new RangeError('upperBound must be greater than or equal to lowerBound')
  }
  return Object.freeze({ kind: 'bounded', lowerBound, upperBound })
}

