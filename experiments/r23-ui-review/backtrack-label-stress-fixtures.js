/**
 * Deterministic winners from find-backtrack-label-stress.mjs.
 *
 * These are intentionally small, named fixtures for the visual capture. The
 * complete search report remains ignored output; changing the search domain
 * requires regenerating this file and the accompanying review evidence.
 */

export const BACKTRACK_LABEL_STRESS_FIXTURES = Object.freeze({
  ordinary: Object.freeze({
    id: 'backtrack-label-stress-ordinary',
    mode: 'ordinary',
    params: Object.freeze({
      encroachment: 70,
      lois: 0,
      elois: 0,
      dice: 1,
      value: 10,
      dlois: 'なし',
    }),
    selectedSlice: Object.freeze({
      chart: 'single',
      label: '31〜50%',
      probability: 10,
      distanceFrom10Percent: 0,
    }),
  }),
  livingdead: Object.freeze({
    id: 'backtrack-label-stress-livingdead',
    mode: 'livingdead',
    params: Object.freeze({
      encroachment: 130,
      lois: 1,
      elois: 3,
      dice: 5,
      value: 0,
      dlois: '屍人',
    }),
    selectedSlice: Object.freeze({
      chart: 'single',
      label: '100%〜',
      probability: 10,
      distanceFrom10Percent: 0,
    }),
  }),
})

