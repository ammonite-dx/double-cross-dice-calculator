import { describe, expect, it } from 'vitest'

import {
  createCheckInputSnapshot,
} from '../src/features/check/model/CheckInputSnapshot'

function createDraft() {
  return {
    difficulty: { opposed: true, target: 17 },
    params: {
      action: { dice: 7, critical: 8, skill: 3, yousei: 1, shihai: 0 },
      reaction: { dice: 5, critical: 9, skill: -2, yousei: 0, shihai: 4 },
    },
  }
}

describe('CheckInputSnapshot', () => {
  it('creates an opposed calculation input with both validated score sides', () => {
    expect(createCheckInputSnapshot(createDraft())).toEqual({
      kind: 'opposed',
      action: { dice: 7, critical: 8, skill: 3, yousei: 1, shihai: 0 },
      reaction: { dice: 5, critical: 9, skill: -2, yousei: 0, shihai: 4 },
    })
  })

  it('omits hidden reaction input from a fixed request without inspecting it', () => {
    const draft = createDraft()
    draft.difficulty.opposed = false
    draft.params.reaction.dice = -1
    expect(createCheckInputSnapshot(draft)).toEqual({
      kind: 'fixed',
      action: { dice: 7, critical: 8, skill: 3, yousei: 1, shihai: 0 },
      target: 17,
    })
  })

  it('does not alias draft score objects', () => {
    const draft = createDraft()
    const snapshot = createCheckInputSnapshot(draft)

    expect(snapshot).not.toBe(draft)
    expect(snapshot.action).not.toBe(draft.params.action)
    if (snapshot.kind !== 'opposed') {
      throw new Error('expected opposed snapshot')
    }
    expect(snapshot.reaction).not.toBe(draft.params.reaction)

    draft.difficulty.target = 99
    draft.params.action.dice = 99
    snapshot.reaction.skill = 99

    expect(snapshot.action.dice).toBe(7)
    expect(draft.params.reaction.skill).toBe(-2)
  })
})
