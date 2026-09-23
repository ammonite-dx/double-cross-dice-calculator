import { describe, expect, it } from 'vitest'

import {
  createCheckInputSnapshot,
  normalizeCheckInputDraft,
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
  it('normalizes the form draft to the calculation snapshot shape', () => {
    expect(normalizeCheckInputDraft(createDraft())).toEqual({
      difficulty: { opposed: true, target: 17 },
      params: {
        action: { dice: 7, critical: 8, skill: 3, yousei: 1, shihai: 0 },
        reaction: { dice: 5, critical: 9, skill: -2, yousei: 0, shihai: 4 },
      },
    })
  })

  it('does not alias the draft or any nested input object', () => {
    const draft = createDraft()
    const snapshot = createCheckInputSnapshot(draft)

    expect(snapshot).not.toBe(draft)
    expect(snapshot.difficulty).not.toBe(draft.difficulty)
    expect(snapshot.params).not.toBe(draft.params)
    expect(snapshot.params.action).not.toBe(draft.params.action)
    expect(snapshot.params.reaction).not.toBe(draft.params.reaction)

    draft.difficulty.target = 99
    draft.params.action.dice = 99
    snapshot.params.reaction.skill = 99

    expect(snapshot.difficulty.target).toBe(17)
    expect(snapshot.params.action.dice).toBe(7)
    expect(draft.params.reaction.skill).toBe(-2)
  })
})
