import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: [
      '.pytest_cache/**',
      '.ruff_cache/**',
      '.uv-cache/**',
      '.wrangler/**',
      'coverage/**',
      'dist/**',
      'dist-phase2h-browser/**',
      'generator/.pytest_cache/**',
      'generator/.ruff_cache/**',
      'generator/.venv/**',
      'node_modules/**',
    ],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-mutating-props': ['error', { shallowOnly: true }],
    },
  },
  {
    files: [
      'src/components/**/*.{js,vue}',
      'src/router/**/*.js',
      'src/views/**/*.vue',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          '@/data/BacktrackCalculator',
          '@/data/DamageCalculator',
          '@/data/PrecomputedDataRepository',
          '@/data/ScoreCalculator',
        ],
        patterns: ['@/calculation', '@/calculation/*'],
      }],
    },
  },
]
