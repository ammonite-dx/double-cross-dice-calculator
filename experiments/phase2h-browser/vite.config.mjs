import { fileURLToPath } from 'node:url'

import { defineConfig, mergeConfig } from 'vite'

import baseConfig from '../../vite.config.js'

export default mergeConfig(
  baseConfig,
  defineConfig({
    build: {
      emptyOutDir: true,
      outDir: 'dist-phase2h-browser',
      rollupOptions: {
        input: {
          canonicalAttack: fileURLToPath(
            new URL('./canonical-attack-worker-benchmark.html', import.meta.url)
          ),
          fullTailAttack: fileURLToPath(
            new URL('./full-tail-attack-resource-benchmark.html', import.meta.url)
          ),
        },
      },
    },
  })
)
