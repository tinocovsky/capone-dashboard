// ESLint flat config (Next 15+ recomenda em vez de .eslintrc)
// Strict: warnings viram errors, mais regras de correctness
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  // Base recomendado do ESLint + typescript-estrict
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  // CommonJS nos configs
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/dist/**",
      "next-env.d.ts",
    ],
  },

  // Regras específicas do projeto
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser / Node comuns
        window: "readonly",
        document: "readonly",
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        Response: "readonly",
        Request: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        Buffer: "readonly",
        global: "readonly",
        React: "readonly",
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Strict mode: relaxar algumas regras que dão muito ruído em Next 15
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": "warn",
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "no-undef": "off", // typescript-eslint já cuida
    },
  },

  // Arquivos de config: regras mais brandas
  {
    files: ["*.config.{js,mjs,ts}", "scripts/**/*.{js,mjs,ts}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
];
