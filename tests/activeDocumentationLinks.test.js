import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const docsRoot = resolve(repositoryRoot, 'docs')
const archiveRoot = resolve(docsRoot, 'archive')
const markdownLinkPattern = /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\)/g

function listMarkdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      return path === archiveRoot ? [] : listMarkdownFiles(path)
    }
    return path.endsWith('.md') ? [path] : []
  })
}

function extractLinkTargets(markdown) {
  const withoutFencedCode = markdown.replace(/^```[\s\S]*?^```/gm, '')
  return Array.from(
    withoutFencedCode.matchAll(markdownLinkPattern),
    ([, rawTarget]) => rawTarget.startsWith('<')
      ? rawTarget.slice(1, -1)
      : rawTarget,
  )
}

function localTargetPath(sourcePath, target) {
  if (
    target.startsWith('#')
    || /^(https?:|mailto:|\/\/)/i.test(target)
  ) {
    return null
  }

  const path = target.split(/[?#]/, 1)[0]
  if (path.length === 0) {
    return null
  }

  const decodedPath = decodeURIComponent(path)
  return decodedPath.startsWith('/')
    ? resolve(repositoryRoot, decodedPath.slice(1))
    : resolve(dirname(sourcePath), decodedPath)
}

describe('active documentation links', () => {
  it('points local Markdown links to existing files or directories', () => {
    const documents = [
      resolve(repositoryRoot, 'README.md'),
      resolve(repositoryRoot, 'CONTRIBUTING.md'),
      ...listMarkdownFiles(docsRoot),
    ]
    const brokenLinks = documents.flatMap((sourcePath) => {
      const markdown = readFileSync(sourcePath, 'utf8')
      return extractLinkTargets(markdown).flatMap((target) => {
        const destination = localTargetPath(sourcePath, target)
        return destination !== null && !existsSync(destination)
          ? [`${relative(repositoryRoot, sourcePath)} -> ${target}`]
          : []
      })
    })

    expect(brokenLinks).toEqual([])
  })
})
