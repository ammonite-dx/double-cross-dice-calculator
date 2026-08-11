import { fileURLToPath } from 'node:url'

import { defineConfig, mergeConfig } from 'vite'

import baseConfig from '../../vite.config.js'

export default mergeConfig(
  baseConfig,
  defineConfig({
    build: {
      emptyOutDir: true,
      outDir: 'dist-dynamic-distribution-ranges',
      rollupOptions: {
        input: fileURLToPath(new URL('./browser-benchmark.html', import.meta.url)),
      },
    },
  })
)
