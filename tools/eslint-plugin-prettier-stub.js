const prettierRule = {
    meta: {
        type: 'layout',
        docs: {
            description:
                'Stub rule for environments without eslint-plugin-prettier.',
        },
        schema: [
            {
                type: 'object',
            },
        ],
    },
    create() {
        return {};
    },
};

const stubPlugin = {
    meta: {
        name: 'eslint-plugin-prettier-stub',
        version: '0.0.0',
    },
    rules: {
        prettier: prettierRule,
    },
};

export default stubPlugin;
