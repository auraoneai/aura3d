// @ts-check
/**
 * ESLint flat config.
 *
 * WS-3.6b (1.6 re-platform PRD). Two defects were found in the previous version of this file and
 * both are fixed here:
 *
 *   1. No parser was configured for `.ts`. ESLint's default parser cannot read type annotations, so
 *      every TypeScript file failed to parse and its rules never produced a result. The
 *      `no-restricted-imports` rule below was therefore a no-op for the entire repository, despite
 *      AGENTS.md claiming it enforced package boundaries.
 *   2. The pattern list contained `@aura3d/*​/*`, which blocks every documented public subpath
 *      (`@aura3d/engine/rendering`, `@aura3d/physics/world`, `@aura3d/assets/browser`, ...). Had it
 *      ever run, it would have failed 19 legitimate imports across `engine`, `workflows` and the
 *      `animation-studio` template.
 *
 * Boundary enforcement is now handled by `tools/eslint-plugin-aura3d-boundaries`, which resolves
 * subpaths through `tsconfig.base.json` `paths` and enforces the WS-3.6a tier direction from the
 * same `tools/package-tiers.ts` module that `pnpm check:package-graph` reads.
 */
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import auraBoundaries from "./tools/eslint-plugin-aura3d-boundaries/index.mjs";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "tests/reports/**",
      "release-artifacts/**",
      "archive/**",
      "benchmark/**/context/**",
      "public/**",
      "**/.vite/**",
      "**/*.d.ts"
    ]
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    // `@typescript-eslint` is registered because template sources carry
    // `eslint-disable-next-line @typescript-eslint/...` directives. Without the plugin those
    // directives reference an unknown rule, which is itself an error. No `@typescript-eslint` rule
    // is switched on here: WS-3.6b is a boundary workstream, and turning on a style ruleset would
    // mix an unrelated (and large) diff into it.
    plugins: { "aura3d-boundaries": auraBoundaries, "@typescript-eslint": tsPlugin },
    linterOptions: {
      // The old config reported unused directives for rules it could not even load. Keep the
      // signal, but it must not be the thing that fails the gate.
      reportUnusedDisableDirectives: "warn"
    },
    rules: {
      "aura3d-boundaries/no-internal-deep-import": "error",
      "aura3d-boundaries/no-upward-package-import": "error"
    }
  },
  {
    // Tier direction is a statement about what a *package* depends on, which is what
    // `pnpm check:package-graph` measures from `src/` and package.json. A package's own tests are
    // allowed to import higher-tier packages: `editor-runtime`'s test suite drives the real
    // `@aura3d/engine` runtime to prove the integration works, and that dependency is devOnly — it
    // ships to nobody. Restricting tests to tier order would force the test to mock the aggregate
    // it exists to verify.
    files: ["packages/*/tests/**", "packages/*/**/*.test.ts", "packages/*/**/*.spec.ts"],
    rules: { "aura3d-boundaries/no-upward-package-import": "off" }
  },
  {
    // Generated route source is emitted as template-literal text by the scaffolder and is not
    // itself part of any package's dependency graph.
    files: ["packages/create-aura3d/src/**/*.ts"],
    rules: { "aura3d-boundaries/no-upward-package-import": "off" }
  }
];
