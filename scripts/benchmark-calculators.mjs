import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

import { createServer } from 'vite'

const assetDirectory = new URL(
  '../public/data/schema-v2/revision-1/',
  import.meta.url
)

async function readAsset(relativePath) {
  return JSON.parse(
    await readFile(new URL(relativePath, assetDirectory), 'utf8')
  )
}

function benchmark(name, iterations, operation) {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    operation()
  }

  const started = performance.now()
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    operation()
  }
  const elapsed = performance.now() - started

  return {
    name,
    iterations,
    millisecondsPerOperation: elapsed / iterations,
  }
}

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const repository = await server.ssrLoadModule(
    '/src/data/PrecomputedDataRepository.js'
  )
  const { getScore } = await server.ssrLoadModule(
    '/src/data/ScoreCalculator.js'
  )
  const { getDamage, getTotalDamage } = await server.ssrLoadModule(
    '/src/data/DamageCalculator.js'
  )

  repository.registerDxAsset(await readAsset('dx/shihai-0.json'))
  repository.registerDrAsset(await readAsset('dr/kazanari-0.json'))
  repository.registerD10Asset(await readAsset('d10.json'))

  const basicParams = {
    dice: 10,
    critical: 8,
    skill: 5,
    yousei: 0,
    shihai: 0,
  }
  const reactionParams = {
    dice: 5,
    critical: 10,
    skill: 3,
    yousei: 0,
    shihai: 0,
  }
  const score = {
    action: getScore(basicParams),
    reaction: getScore(reactionParams),
  }
  const attack = { dice: 4, value: 12, kazanari: 0 }
  const defence = { dice: 2, value: 5 }
  const damage = getDamage(score, attack, defence)
  const combos = Array.from(
    { length: 10 },
    () => ({ data: { damage } })
  )

  const results = [
    benchmark('getScore basic', 1000, () => getScore(basicParams)),
    benchmark('getScore yousei=9', 20, () =>
      getScore({ ...basicParams, yousei: 9 })
    ),
    benchmark('getDamage basic', 100, () =>
      getDamage(score, attack, defence)
    ),
    benchmark('getTotalDamage 10 combos', 50, () =>
      getTotalDamage(combos)
    ),
  ]

  for (const result of results) {
    console.log(
      `${result.name}: ${result.millisecondsPerOperation.toFixed(3)} ms/op ` +
      `(${result.iterations} iterations)`
    )
  }
} finally {
  await server.close()
}
