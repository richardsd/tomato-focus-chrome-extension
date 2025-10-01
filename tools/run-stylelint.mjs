import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const loadStylelint = async () =>
    import('stylelint')
        .then((module) => module.default ?? module)
        .catch(() => null);

const shouldIgnore = (relativePath) =>
    relativePath.includes(`${join('/', 'node_modules')}`) ||
    relativePath.includes(`${join('/', '.git')}`) ||
    relativePath.includes(`${join('/', 'icons')}`) ||
    relativePath.includes(`${join('/', 'docs')}`);

const collectCssFiles = (directory) => {
    const results = [];
    const entries = readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
        const absolutePath = join(directory, entry.name);

        if (shouldIgnore(absolutePath)) {
            continue;
        }

        if (entry.isDirectory()) {
            results.push(...collectCssFiles(absolutePath));
            continue;
        }

        if (entry.isFile() && absolutePath.endsWith('.css')) {
            results.push(absolutePath);
        }
    }

    return results;
};

const runFallbackLint = (files) => {
    let hasFailures = false;

    for (const file of files) {
        const content = readFileSync(file, 'utf8');
        const lines = content.split(/\r?\n/);

        lines.forEach((line, index) => {
            if (!line) {
                return;
            }

            if (line.includes('\t')) {
                console.error(`${file}:${index + 1} contains a tab character`);
                hasFailures = true;
            }
        });
    }

    if (hasFailures) {
        process.exitCode = 1;
        console.error('Fallback CSS linting failed.');
        return;
    }

    console.log('Fallback CSS linting passed.');
};

const main = async () => {
    const root = resolve('.');
    const cssFiles = collectCssFiles(root);

    const stylelint = await loadStylelint();

    if (stylelint) {
        const configFile = resolve('.stylelintrc');
        const result = await stylelint.lint({
            files: cssFiles,
            configFile,
        });

        if (result.errored) {
            console.error(result.output);
            process.exitCode = 1;
            return;
        }

        console.log(result.output);
        return;
    }

    runFallbackLint(cssFiles);
};

await main();
