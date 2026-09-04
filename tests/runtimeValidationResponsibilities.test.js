import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  ATTACK_DISPLAY_MODES,
  createAttackRangePolicy,
} from '../src/features/attack/model/AttackDisplayRequestSnapshot'
import {
  CHECK_DISPLAY_MODES,
} from '../src/features/check/model/CheckDisplayRequestSnapshot'
import { createCheckRangePolicy } from '../src/runtime/CheckRangePolicy'

const targetModules = [
  'src/runtime/CanonicalAttackBatchInput.js',
  'src/features/attack/model/AttackDisplayRequestSnapshot.js',
  'src/features/check/model/CheckDisplayRequestSnapshot.js',
  'src/runtime/CheckRangePolicy.js',
]

const forbiddenReflectionPatterns = [
  /Object\.getOwnPropertyDescriptor\s*\(/,
  /Object\.getPrototypeOf\s*\(/,
  /Reflect\.ownKeys\s*\(/,
  /Object\.defineProperty\s*\(/,
]

function readSource(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

describe('runtime validation responsibilities', () => {
  it('keeps reflection-heavy validation out of the four target modules', () => {
    for (const path of targetModules) {
      const source = readSource(path)
      for (const pattern of forbiddenReflectionPatterns) {
        expect(source, `${path}: ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('deep-freezes ordinary range policy snapshots', () => {
    const attackPolicyInput = {
      limits: { hard: { workingLength: 4096 } },
    }
    const attackPolicy = createAttackRangePolicy({
      min: 0,
      max: 1200,
      mode: ATTACK_DISPLAY_MODES.PMF,
    }, attackPolicyInput)
    expect(attackPolicy.limits.hard.workingLength).toBe(4096)
    expect(Object.isFrozen(attackPolicy.limits.hard)).toBe(true)

    const checkPolicyInput = {
      limits: { hard: { workingLength: 4096 } },
    }
    const checkPolicy = createCheckRangePolicy({
      min: 0,
      max: 1200,
      mode: CHECK_DISPLAY_MODES.PMF,
    }, checkPolicyInput)
    expect(checkPolicy.limits.hard.workingLength).toBe(4096)
    expect(Object.isFrozen(checkPolicy.limits.hard)).toBe(true)
  })
})
