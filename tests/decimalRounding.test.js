import { describe, expect, it } from 'vitest'

import {
  ONE_DECIMAL_TIE_TOLERANCE,
  roundToOneDecimal,
} from '../src/shared/presentation/DecimalRounding'

describe('stable one-decimal rounding', () => {
  it('snaps only floating-point noise around a representable half-step', () => {
    expect(ONE_DECIMAL_TIE_TOLERANCE).toBe(1e-9)
    expect(roundToOneDecimal(79.55)).toBe(79.6)
    expect(roundToOneDecimal(79.54999999999997)).toBe(79.6)
    expect(roundToOneDecimal(79.55000000000003)).toBe(79.6)
    expect(roundToOneDecimal(79.5499999)).toBe(79.5)
    expect(roundToOneDecimal(79.5500001)).toBe(79.6)
  })

  it('preserves Math.round behavior for negative ties and normalizes negative zero', () => {
    expect(roundToOneDecimal(-1.25)).toBe(-1.2)
    expect(Object.is(roundToOneDecimal(-0.04), -0)).toBe(false)
  })
})
