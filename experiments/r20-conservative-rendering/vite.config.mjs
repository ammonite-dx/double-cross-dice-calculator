import { fileURLToPath } from 'node:url'

import { defineConfig, mergeConfig } from 'vite'

import baseConfig from '../../vite.config.js'

export default mergeConfig(
  baseConfig,
  defineConfig({
    build: {
      emptyOutDir: true,
      outDir: 'dist-r20-conservative-rendering',
      rollupOptions: {
        input: fileURLToPath(
          new URL('./benchmark.html', import.meta.url)
        ),
      },
    },
  })
)
