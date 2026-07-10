import eslint from '@eslint/js';
import babelParser from '@babel/eslint-parser';

const mochaGlobals = {
    suite: 'readonly',
    test: 'readonly',
    setup: 'readonly',
    teardown: 'readonly',
    suiteSetup: 'readonly',
    suiteTeardown: 'readonly'
};

export default [
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: babelParser,
            parserOptions: {
                requireConfigFile: false,
                babelOptions: {
                    plugins: ['@babel/plugin-syntax-typescript']
                }
            }
        }
    },
    eslint.configs.recommended,
    {
        ignores: ['out/**', 'node_modules/**', '**/*.d.ts']
    },
    {
        files: ['src/test/**/*.ts'],
        languageOptions: {
            globals: mochaGlobals
        }
    },
    {
        rules: {
            curly: 'warn',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: 'warn',
            'no-unused-vars': ['warn', { vars: 'all', args: 'after-used', argsIgnorePattern: '^_' }]
        }
    }
];
