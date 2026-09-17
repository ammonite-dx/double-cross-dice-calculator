import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.js'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/reference/**/*.test.js'],
      exclude: configDefaults.exclude,
    },
  })
)
