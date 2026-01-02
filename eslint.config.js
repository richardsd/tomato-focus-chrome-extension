import js from '@eslint/js';

const loadPlugin = async (moduleName, fallbackPath) =>
    import(moduleName)
        .then((module) => module.default ?? module)
        .catch(async () => {
            const fallbackModule = await import(fallbackPath);
            return fallbackModule.default ?? fallbackModule;
        });

const htmlPlugin = await loadPlugin(
    'eslint-plugin-html',
    './tools/eslint-plugin-html-stub.js'
);
const prettierPlugin = await loadPlugin(
    'eslint-plugin-prettier',
    './tools/eslint-plugin-prettier-stub.js'
);

const ignores = [
    'node_modules/**',
    '.git/**',
    'docs/**',
    'icons/**',
    '**/*.min.js',
    'eslint.config.js',
];

const sharedGlobals = {
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
    fetch: 'readonly',
    btoa: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    self: 'readonly',
    URL: 'readonly',
};

const noopHtmlParser = {
    parse(text) {
        const lines = text.split(/\r?\n/);
        const lineCount = lines.length;
        const lastLine = lines[lineCount - 1] ?? '';

        return {
            type: 'Program',
            body: [],
            sourceType: 'module',
            range: [0, text.length],
            loc: {
                start: { line: 1, column: 0 },
                end: { line: lineCount, column: lastLine.length },
            },
            tokens: [],
            comments: [],
        };
    },
};

export default [
    {
        ignores,
    },
    js.configs.recommended,
    {
        files: ['*.js', 'src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: sharedGlobals,
        },
        plugins: {
            prettier: prettierPlugin,
        },
        rules: {
            'no-unused-vars': ['warn'],
            'no-console': 'off',
            eqeqeq: ['error', 'always'],
            curly: ['error', 'all'],
            'prettier/prettier': 'error',
        },
    },
    {
        files: ['*.html', 'src/**/*.html', 'popup.html', 'offscreen.html'],
        languageOptions: {
            parser: noopHtmlParser,
        },
        plugins: {
            html: htmlPlugin,
            prettier: prettierPlugin,
        },
        rules: {
            'prettier/prettier': [
                'error',
                {
                    parser: 'html',
                },
            ],
        },
    },
];
