// eslint.config.js — ESLint 9+ flat config (Oct 2025)

import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginImport from "eslint-plugin-import";
import globals from "globals";

// If you also want TypeScript or React, see the notes below.

export default [
    // 1) Ignore build artifacts and vendor dirs early.
    { ignores: ["dist/**", "build/**", "coverage/**", "node_modules/**"] },

    // 2) Start from ESLint's recommended base for modern JS.
    js.configs.recommended,

    // 3) Project rules: browser + worker + node globals, ESM, and import hygiene.
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,          // fetch, URL, etc.
                ...globals.serviceworker,    // addEventListener("fetch"), caches, etc.
                ...globals.node,             // useful for tooling scripts
            },
        },
        plugins: {
            import: pluginImport,
        },
        rules: {
            // Pragmatic defaults
            "no-console": "off",
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

            // Import correctness and tidy ordering
            "import/no-unresolved": "error",
            "import/order": [
                "warn",
                {
                    groups: ["builtin", "external", "internal", "parent", "sibling", "index", "object", "type"],
                    "newlines-between": "always",
                    alphabetize: { order: "asc", caseInsensitive: true },
                },
            ],
        },
    },

    // 4) Keep formatting conflicts out of ESLint. Run Prettier separately.
    //    This flat-config variant turns off style rules that clash with Prettier.
    eslintConfigPrettier,
];
