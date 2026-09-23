import { describe, expect, it } from 'vitest'

import {
  createBacktrackInputSnapshot,
  normalizeBacktrackInputDraft,
} from '../src/features/backtrack/model/BacktrackInputSnapshot'

function createDraft() {
  return {
    params: {
      encroachment: 87,
      lois: 3,
      elois: 2,
      dice: 4,
      value: 11,
      dlois: '屍人',
    },
  }
}

describe('BacktrackInputSnapshot', () => {
  it('normalizes every Backtrack form field without changing its value', () => {
    expect(normalizeBacktrackInputDraft(createDraft())).toEqual({
      params: {
        encroachment: 87,
        lois: 3,
        elois: 2,
        dice: 4,
        value: 11,
        dlois: '屍人',
      },
    })
  })

  it('does not alias the draft or its nested params object', () => {
    const draft = createDraft()
    const snapshot = createBacktrackInputSnapshot(draft)

    expect(snapshot).not.toBe(draft)
    expect(snapshot.params).not.toBe(draft.params)

    draft.params.encroachment = 99
    draft.params.dlois = 'なし'
    snapshot.params.value = 999

    expect(snapshot.params.encroachment).toBe(87)
    expect(snapshot.params.dlois).toBe('屍人')
    expect(draft.params.value).toBe(11)
  })
})
