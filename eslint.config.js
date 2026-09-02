import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import globals from 'globals'

const relativeOrAlias = '(?:@/|\\.\\.?/)+'

function internalPattern(layers, message) {
  return {
    regex: `^${relativeOrAlias}(?:${layers.join('|')})(?:/|$)`,
    message,
  }
}

const referenceRepositoryPattern = {
  regex: `^${relativeOrAlias}data/ReferencePrecomputedDataRepository(?:\\.js)?(?:/|$)`,
  message: 'Reference precomputed data is verification-only and must not enter the production path.',
}

const precomputedSchemaPattern = {
  regex: `^${relativeOrAlias}data/PrecomputedDataSchema(?:\\.js)?(?:/|$)`,
  message: 'Published-data schema support belongs to the reference boundary, not this layer.',
}

const corePackagePattern = {
  regex: '^(?:vue|vuetify|vue-router|chart\\.js|vue-chartjs|chartjs-plugin-[^/]+)(?:/|$)',
  message: 'Core modules must remain independent of Vue, UI, routing, and chart packages.',
}

const coreInternalPattern = internalPattern(
  ['application', 'components', 'views', 'router', 'plugins', 'layouts', 'presentation'],
  'Core modules must not depend on application, UI, or presentation layers.',
)

const coreNodePattern = {
  regex: '^node:',
  message: 'Production calculation core must remain browser-independent and must not import Node modules.',
}

const uiCalculationPattern = internalPattern(
  ['calculation'],
  'UI must access probability calculation through CalculationClient.',
)

const uiDataPattern = {
  regex: `^${relativeOrAlias}data/(?:Distribution|FFT)(?:\\.js)?(?:/|$)`,
  message: 'UI must not import calculation primitives directly.',
}

const applicationUiPattern = internalPattern(
  ['views', 'components', 'router', 'plugins', 'layouts'],
  'Application orchestration must not depend on Vue UI modules.',
)

const presentationUiPattern = internalPattern(
  ['views', 'components', 'router', 'plugins', 'layouts'],
  'Presentation adapters must remain independent of Vue UI modules.',
)

const presentationApplicationPattern = internalPattern(
  ['application'],
  'Presentation adapters must not execute calculations through CalculationClient.',
)

const presentationPackagePattern = {
  regex: '^(?:vue|vuetify|vue-router|chart\\.js|vue-chartjs|chartjs-plugin-[^/]+)(?:/|$)',
  message: 'Presentation adapters must remain framework-independent and pure.',
}

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
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // R2 parses TypeScript for architecture rules; type-aware lint is deferred.
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['src/**/*.{js,mjs,ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [referenceRepositoryPattern],
      }],
    },
  },
  {
    files: [
      'src/calculation/**/*.{js,ts}',
      'src/domain/**/*.{js,ts}',
      'src/data/Distribution.js',
      'src/data/FFT.js',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          corePackagePattern,
          coreInternalPattern,
          coreNodePattern,
          referenceRepositoryPattern,
          precomputedSchemaPattern,
        ],
      }],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Core modules must not access the browser window directly.' },
        { name: 'document', message: 'Core modules must not access the browser document directly.' },
        { name: 'fetch', message: 'Core modules must not perform network requests directly.' },
      ],
    },
  },
  {
    files: [
      'src/App.vue',
      'src/main.{js,ts}',
      'src/plugins/**/*.{js,ts}',
      'src/components/**/*.{js,ts,vue}',
      'src/router/**/*.{js,ts}',
      'src/views/**/*.{js,ts,vue}',
      'src/layouts/**/*.{js,ts,vue}',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          '@/data/BacktrackCalculator',
          '@/data/DamageCalculator',
          '@/data/PrecomputedDataRepository',
          '@/data/ScoreCalculator',
        ],
        patterns: [
          uiCalculationPattern,
          uiDataPattern,
          referenceRepositoryPattern,
          precomputedSchemaPattern,
        ],
      }],
    },
  },
  {
    files: ['src/application/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          applicationUiPattern,
          referenceRepositoryPattern,
          precomputedSchemaPattern,
        ],
      }],
    },
  },
  {
    files: ['src/presentation/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          presentationUiPattern,
          presentationApplicationPattern,
          presentationPackagePattern,
          referenceRepositoryPattern,
          precomputedSchemaPattern,
        ],
      }],
    },
  },
]
