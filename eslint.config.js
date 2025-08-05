import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        files: ['*.js'],
        ignores: ['eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                chrome: 'readonly',
                console: 'readonly',
                document: 'readonly',
                window: 'readonly',
                navigator: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                alert: 'readonly',
                CustomEvent: 'readonly',
                self: 'readonly'
            }
        },
        rules: {
            'indent': ['error', 4],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'no-unused-vars': ['warn'],
            'no-console': ['warn'],
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'all']
        }
    }
];
