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

const retiredArchitectureLayerPattern = internalPattern(
  ['application', 'presentation'],
  'The retired application and presentation paths must not be reintroduced.',
)

const corePackagePattern = {
  regex: '^(?:vue|vuetify|vue-router|chart\\.js|vue-chartjs|chartjs-plugin-[^/]+)(?:/|$)',
  message: 'Core modules must remain independent of Vue, UI, routing, and chart packages.',
}

const coreInternalPattern = internalPattern(
  ['application', 'components', 'views', 'router', 'plugins', 'layouts', 'presentation', 'features', 'runtime'],
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

const sharedThemeInternalPattern = internalPattern(
  ['application', 'calculation', 'core', 'domain', 'features', 'presentation', 'components', 'views', 'router', 'plugins', 'layouts', 'tooling', 'data', 'runtime'],
  'Shared theme utilities must remain independent of application, calculation, core, domain, feature, UI, and reference layers.',
)

const sharedThemeParentPattern = {
  regex: `^${relativeOrAlias}shared/(?!theme(?:/|$))`,
  message: 'Shared theme utilities must not depend on other shared subsystems.',
}

const sharedThemeSiblingPattern = {
  regex: '^(?:\\.\\./)+(?:validation|chart)(?:/|$)',
  message: 'Shared theme utilities must not depend on other shared subsystems.',
}

const sharedValidationInternalPattern = internalPattern(
  ['application', 'components', 'views', 'router', 'plugins', 'layouts', 'presentation', 'features', 'calculation', 'core', 'data', 'tooling', 'runtime'],
  'Shared validation must remain independent of application, UI, feature, calculation, probability, and reference layers.',
)

const sharedChartInternalPattern = internalPattern(
  ['application', 'components', 'views', 'router', 'plugins', 'layouts', 'presentation', 'features', 'calculation', 'core', 'data', 'domain', 'tooling', 'shared', 'runtime'],
  'Shared chart infrastructure must remain independent of application, feature, calculation, probability, data, domain, reference, and other shared layers.',
)

const runtimeInternalPattern = internalPattern(
  ['application', 'components', 'views', 'router', 'plugins', 'layouts', 'presentation', 'features', 'tooling', 'data'],
  'Runtime modules must remain independent of feature, UI, presentation, and reference layers.',
)

const runtimePackagePattern = {
  regex: '^(?:vue|vuetify|vue-router|chart\\.js|vue-chartjs|chartjs-plugin-[^/]+)(?:/|$)',
  message: 'Runtime modules must remain framework-independent.',
}

const runtimeNodePattern = {
  regex: '^node:',
  message: 'Runtime modules must remain browser-independent and must not import Node modules.',
}

const sharedPresentationInternalPattern = internalPattern(
  ['application', 'components', 'views', 'router', 'plugins', 'layouts', 'presentation', 'features', 'runtime', 'tooling', 'data'],
  'Shared presentation must remain independent of runtime, feature, UI, and reference layers.',
)

const sharedPresentationCalculationPattern = {
  regex: `^${relativeOrAlias}calculation/(?!DistributionResult(?:\\.js)?(?:/|$))`,
  message: 'Shared presentation may read only the canonical DistributionResult contract from calculation.',
}

const sharedPresentationCorePattern = internalPattern(
  ['core', 'domain'],
  'Shared presentation must remain independent of calculation core and domain layers.',
)

const sharedPresentationSharedPattern = {
  regex: `^${relativeOrAlias}shared/(?:chart|theme|validation)(?:/|$)`,
  message: 'Shared presentation must remain independent of other shared subsystems.',
}

const sharedPresentationSiblingPattern = {
  regex: '^(?:\\.\\./)+(?:chart|theme|validation)(?:/|$)',
  message: 'Shared presentation must remain independent of other shared subsystems.',
}

const sharedPresentationPackagePattern = {
  regex: '^(?:vue|vuetify|vue-router|chart\\.js|vue-chartjs|chartjs-plugin-[^/]+)(?:/|$)',
  message: 'Shared presentation adapters must remain framework-independent and pure.',
}

const sharedPresentationNodePattern = {
  regex: '^node:',
  message: 'Shared presentation must not import Node modules.',
}

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
        patterns: [
          referenceToolingPattern,
          legacyDataPattern,
          retiredArchitectureLayerPattern,
        ],
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
    files: ['src/runtime/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          runtimeInternalPattern,
          runtimePackagePattern,
          runtimeNodePattern,
          referenceToolingPattern,
          legacyDataPattern,
        ],
      }],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Runtime modules must not access the browser window directly.' },
        { name: 'document', message: 'Runtime modules must not access the browser document directly.' },
        { name: 'fetch', message: 'Runtime modules must not perform network requests directly.' },
      ],
    },
  },
  {
    files: ['src/shared/presentation/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          sharedPresentationInternalPattern,
          sharedPresentationCalculationPattern,
          sharedPresentationCorePattern,
          sharedPresentationSharedPattern,
          sharedPresentationSiblingPattern,
          sharedPresentationPackagePattern,
          sharedPresentationNodePattern,
          referenceToolingPattern,
          legacyDataPattern,
        ],
      }],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Shared presentation must not access the browser window directly.' },
        { name: 'document', message: 'Shared presentation must not access the browser document directly.' },
        { name: 'fetch', message: 'Shared presentation must not perform network requests directly.' },
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
    files: ['src/shared/theme/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          sharedThemeInternalPattern,
          sharedThemeParentPattern,
          sharedThemeSiblingPattern,
          corePackagePattern,
          coreNodePattern,
          referenceToolingPattern,
          legacyDataPattern,
        ],
      }],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Shared theme utilities must not access the browser window directly.' },
        { name: 'document', message: 'Shared theme utilities must not access the browser document directly.' },
        { name: 'fetch', message: 'Shared theme utilities must not perform network requests directly.' },
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
          retiredArchitectureLayerPattern,
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
            ['views', 'components', 'router', 'plugins', 'layouts', 'application', 'presentation'],
            'Feature models must remain independent of application UI modules.',
          ),
          featureModelUiPattern,
          referenceToolingPattern,
          legacyDataPattern,
        ],
      }],
    },
  },
]
