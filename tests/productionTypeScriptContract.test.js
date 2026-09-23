import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const tsconfig = JSON.parse(
  readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'),
)

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listSourceFiles(path) : [path]
  })
}

describe('production TypeScript boundary', () => {
  it('contains no JavaScript production source files', () => {
    const javascriptFiles = listSourceFiles(sourceRoot)
      .filter((path) => extname(path) === '.js')

    expect(javascriptFiles).toEqual([])
  })

  it('marks every Vue script block as TypeScript', () => {
    const vueFiles = listSourceFiles(sourceRoot)
      .filter((path) => extname(path) === '.vue')
    const scriptTags = vueFiles.flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return Array.from(source.matchAll(/<script\b[^>]*>/g), ([tag]) => ({
        path,
        tag,
      }))
    })

    expect(scriptTags.length).toBeGreaterThan(0)
    for (const { path, tag } of scriptTags) {
      expect(tag, path).toMatch(/\blang=["']ts["']/)
    }
  })

  it('does not enable JavaScript as a TypeScript input', () => {
    expect(tsconfig.compilerOptions.allowJs).not.toBe(true)
    expect(tsconfig.include).not.toContain('src/**/*.js')
  })
})
