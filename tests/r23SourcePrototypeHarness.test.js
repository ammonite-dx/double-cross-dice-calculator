import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  applyExactReplacements,
  countLiteralOccurrences,
  readPrototypeSources,
  restorePrototypeSources,
  withTemporarySourcePrototype,
} from '../experiments/r23-ui-review/source-prototype-harness.mjs'
import {
  SOURCE_PROTOTYPE_VARIANTS,
  getSourcePrototypeVariant,
  validateSourcePrototypeDefinitions,
} from '../experiments/r23-ui-review/source-prototype-definitions.js'

describe('R23 source prototype definitions', () => {
  it('has unique ids and valid replacement declarations', () => {
    expect(validateSourcePrototypeDefinitions()).toEqual([])
    expect(new Set(Object.keys(SOURCE_PROTOTYPE_VARIANTS)).size)
      .toBe(Object.keys(SOURCE_PROTOTYPE_VARIANTS).length)
  })

  it('rejects duplicate ids and duplicate target files', () => {
    const variant = getSourcePrototypeVariant('advanced-setting-inline-source')
    expect(validateSourcePrototypeDefinitions({
      first: variant,
      second: { ...variant, id: variant.id },
    })).toEqual(expect.arrayContaining([
      `variant key does not match id: first`,
      `variant key does not match id: second`,
      `duplicate source prototype id: ${variant.id}`,
    ]))
    expect(validateSourcePrototypeDefinitions({
      [variant.id]: {
        ...variant,
        targets: [variant.targets[0], variant.targets[0]],
      },
    })).toContain(
      `duplicate source target: ${variant.id} / ${variant.targets[0].file}`,
    )
  })

  it('rejects unknown variants before any source operation', () => {
    expect(() => getSourcePrototypeVariant('does-not-exist'))
      .toThrow('unknown source prototype variant: does-not-exist')
  })
})

describe('R23 source prototype replacement harness', () => {
  it('counts exact literals and rejects mismatched expected counts', () => {
    expect(countLiteralOccurrences('a--a--a', 'a')).toBe(3)
    expect(() => applyExactReplacements(
      'alpha',
      [{ from: 'missing', to: 'replacement', expectedCount: 1 }],
      'fixture.vue',
    )).toThrow('source replacement count mismatch: fixture.vue expected=1 actual=0')
  })

  it('restores source bytes exactly after a temporary replacement', async () => {
    const directory = join(tmpdir(), `r23-source-prototype-${process.pid}-${Date.now()}`)
    const path = join(directory, 'fixture.vue')
    await mkdir(directory, { recursive: true })
    try {
      const original = Buffer.from('\ufeffalpha\r\nbeta\n', 'utf8')
      await writeFile(path, original)
      const snapshot = await readPrototypeSources(directory, {
        targets: [{
          file: 'fixture.vue',
          replacements: [{ from: 'alpha', to: 'candidate', expectedCount: 1 }],
        }],
      })
      await writeFile(path, snapshot.transformed[0].source)
      expect((await readFile(path)).toString('utf8')).toContain('candidate')
      await restorePrototypeSources(snapshot.snapshots)
      expect(await readFile(path)).toEqual(original)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps the UI-06 style block at the SFC top level', async () => {
    for (const variantId of [
      'backtrack-compound-label-source',
      'backtrack-compound-label-aligned-source',
    ]) {
      const variant = getSourcePrototypeVariant(variantId)
      const { transformed } = await readPrototypeSources(process.cwd(), variant)
      const candidate = transformed[0].source.toString('utf8')
      const templateOpenIndex = candidate.indexOf('<template>')
      const templateCloseIndex = candidate.lastIndexOf('</template>')
      const styleOpenIndex = candidate.indexOf('<style scoped>')
      const styleCloseIndex = candidate.indexOf('</style>', styleOpenIndex)

      expect(templateOpenIndex).toBeGreaterThanOrEqual(0)
      expect(templateCloseIndex).toBeGreaterThan(templateOpenIndex)
      expect(styleOpenIndex).toBeGreaterThan(templateCloseIndex)
      expect(styleCloseIndex).toBeGreaterThan(styleOpenIndex)
      expect(candidate.slice(templateOpenIndex, templateCloseIndex))
        .not.toContain('<style scoped>')
    }
  })

  it('keeps the aligned UI-06 revision limited to utility typography and label offset', async () => {
    const variant = getSourcePrototypeVariant('backtrack-compound-label-aligned-source')
    const { transformed } = await readPrototypeSources(process.cwd(), variant)
    const candidate = transformed[0].source.toString('utf8')

    expect(candidate).toContain('text-caption text-medium-emphasis')
    expect(candidate).toContain('inset-block-start: 4px;')
    expect(candidate).not.toContain('font-size: 0.75rem;')
    expect(candidate).not.toContain('line-height: 1.333;')
  })

  it('restores production source when build fails', async () => {
    const root = join(tmpdir(), `r23-source-prototype-build-${process.pid}-${Date.now()}`)
    const path = join(root, 'fixture.vue')
    await mkdir(root, { recursive: true })
    try {
      const original = Buffer.from('before')
      await writeFile(path, original)
      await expect(withTemporarySourcePrototype({
        root,
        variant: {
          id: 'test',
          targets: [{
            file: 'fixture.vue',
            replacements: [{ from: 'before', to: 'candidate', expectedCount: 1 }],
          }],
        },
        build: async () => { throw new Error('synthetic build failure') },
        capture: async () => null,
      })).rejects.toThrow('synthetic build failure')
      expect(await readFile(path)).toEqual(original)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not leave a production source diff after a successful build', async () => {
    const root = join(tmpdir(), `r23-source-prototype-success-${process.pid}-${Date.now()}`)
    const path = join(root, 'fixture.vue')
    const original = Buffer.from('before')
    await mkdir(root, { recursive: true })
    try {
      const variant = {
        id: 'fixture',
        targets: [{
          file: 'fixture.vue',
          replacements: [{ from: 'before', to: 'after', expectedCount: 1 }],
        }],
      }
      await writeFile(path, original)
      const source = await readPrototypeSources(root, variant)
      await writeFile(path, source.transformed[0].source)
      await restorePrototypeSources(source.snapshots)
      expect(await readFile(path)).toEqual(original)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
