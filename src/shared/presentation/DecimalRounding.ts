export const ONE_DECIMAL_TIE_TOLERANCE = 1e-9

/**
 * Round to one decimal place while treating only floating-point noise around
 * a representable half-step as an exact tie.
 */
export function roundToOneDecimal(value: number): number {
  const scaled = value * 10
  const lower = Math.floor(scaled)
  const midpoint = lower + 0.5
  const isRepresentableMidpoint = midpoint - lower === 0.5
  const stabilized = isRepresentableMidpoint
    && Math.abs(scaled - midpoint) <= ONE_DECIMAL_TIE_TOLERANCE
    ? midpoint
    : scaled
  const rounded = Math.round(stabilized) / 10

  return Object.is(rounded, -0) ? 0 : rounded
}
