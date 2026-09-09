import { fileURLToPath } from 'node:url'

import { defineConfig, mergeConfig } from 'vite'

import baseConfig from '../../vite.config.js'

export default mergeConfig(
  baseConfig,
  defineConfig({
    build: {
      emptyOutDir: true,
      outDir: 'dist-r22-numerical-performance',
      rollupOptions: {
        input: fileURLToPath(
          new URL('./benchmark.html', import.meta.url)
        ),
      },
    },
  })
)
