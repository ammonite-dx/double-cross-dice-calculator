import { describe, expect, it } from 'vitest'

import { createLatestValidationGate } from '../src/shared/validation/LatestValidationGate'

describe('LatestValidationGate', () => {
  it('allows only the newest ticket to commit', () => {
    const gate = createLatestValidationGate()
    const first = gate.begin()
    const latest = gate.begin()

    expect(gate.canCommit(first)).toBe(false)
    expect(gate.canCommit(latest)).toBe(true)
  })

  it('invalidates pending work and rejects all work after disposal', () => {
    const gate = createLatestValidationGate()
    const pending = gate.begin()

    gate.invalidate()
    expect(gate.canCommit(pending)).toBe(false)

    const current = gate.begin()
    expect(gate.canCommit(current)).toBe(true)
    gate.dispose()
    expect(gate.canCommit(current)).toBe(false)
    expect(gate.canCommit(gate.begin())).toBe(false)
  })
})
