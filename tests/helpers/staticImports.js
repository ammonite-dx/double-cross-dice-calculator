import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

function readModuleSource(modulePath) {
  const path = modulePath instanceof URL ? fileURLToPath(modulePath) : modulePath
  const source = readFileSync(path, 'utf8')

  if (!path.endsWith('.vue')) {
    return source
  }

  return Array.from(source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi),
    (match) => match[1],
  ).join('\n')
}

export function getStaticImportSpecifiers(modulePath) {
  const source = readModuleSource(modulePath)
  const sourceFile = ts.createSourceFile(
    String(modulePath),
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const specifiers = []

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}
