import js from '@eslint/js';

export default [
    {
        ignores: ['node_modules/**', '.git/**', 'docs/**', 'icons/**', '**/*.min.js', 'eslint.config.js']
    },
    js.configs.recommended,
    {
        files: ['*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
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
                self: 'readonly',
                fetch: 'readonly'
            }
        },
        rules: {
            'indent': ['error', 4],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'no-unused-vars': ['warn'],
            'no-console': 'off',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'all']
        }
    }
];
