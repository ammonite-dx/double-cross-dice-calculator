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

const referenceToolingPattern = {
  regex: `^${relativeOrAlias}tooling/reference-data(?:/|$)`,
  message: 'Reference precomputed data is verification-only and must not enter the production path.',
}

const legacyDataPattern = {
  regex: `^${relativeOrAlias}data/(?:Distribution|FFT|ColorSetter|ReferencePrecomputedDataRepository|PrecomputedDataSchema)(?:\\.js)?(?:/|$)`,
  message: 'The retired src/data path must not be reintroduced; import the owning module from its current boundary.',
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

const coreSharedPattern = internalPattern(
  ['shared'],
  'Calculation and domain core must not depend on shared validation modules.',
)

const sharedValidationInternalPattern = internalPattern(
  ['application', 'components', 'views', 'router', 'plugins', 'layouts', 'presentation', 'features', 'calculation', 'core', 'data', 'tooling'],
  'Shared validation must remain independent of application, UI, feature, calculation, probability, and reference layers.',
)

const sharedChartInternalPattern = internalPattern(
  ['application', 'components', 'views', 'router', 'plugins', 'layouts', 'presentation', 'features', 'calculation', 'core', 'data', 'domain', 'tooling', 'shared'],
  'Shared chart infrastructure must remain independent of application, feature, calculation, probability, data, domain, reference, and other shared layers.',
)

const uiCalculationPattern = internalPattern(
  ['calculation'],
  'UI must access probability calculation through CalculationClient.',
)

const uiProbabilityPattern = {
  regex: `^${relativeOrAlias}core/probability(?:/|$)`,
  message: 'UI must not import calculation primitives directly.',
}

const featureModelUiPattern = {
  regex: `^${relativeOrAlias}(?:ui|features/[^/]+/ui)(?:/|$)`,
  message: 'Feature models must not depend on feature UI modules.',
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
        patterns: [referenceToolingPattern, legacyDataPattern],
      }],
    },
  },
  {
    files: [
      'src/calculation/**/*.{js,ts}',
      'src/domain/**/*.{js,ts}',
      'src/core/probability/**/*.{js,ts}',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          corePackagePattern,
          coreInternalPattern,
          coreSharedPattern,
          coreNodePattern,
          referenceToolingPattern,
          legacyDataPattern,
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
    files: ['src/shared/validation/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          corePackagePattern,
          sharedValidationInternalPattern,
          coreNodePattern,
          referenceToolingPattern,
          legacyDataPattern,
        ],
      }],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Shared validation must not access the browser window directly.' },
        { name: 'document', message: 'Shared validation must not access the browser document directly.' },
        { name: 'fetch', message: 'Shared validation must not perform network requests directly.' },
      ],
    },
  },
  {
    files: ['src/shared/chart/**/*.{js,ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          sharedChartInternalPattern,
          coreNodePattern,
        ],
      }],
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
      'src/features/*/ui/**/*.{js,ts,vue}',
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
          uiProbabilityPattern,
          referenceToolingPattern,
          legacyDataPattern,
        ],
      }],
    },
  },
  {
    files: ['src/features/*/model/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          internalPattern(
            ['views', 'components', 'router', 'plugins', 'layouts'],
            'Feature models must remain independent of application UI modules.',
          ),
          featureModelUiPattern,
          referenceToolingPattern,
          legacyDataPattern,
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
          referenceToolingPattern,
          legacyDataPattern,
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
          referenceToolingPattern,
          legacyDataPattern,
        ],
      }],
    },
  },
]
