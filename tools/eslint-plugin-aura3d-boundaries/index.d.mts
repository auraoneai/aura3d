/**
 * Type surface for the boundary plugin.
 *
 * The plugin itself is authored as `.mjs` because `eslint.config.js` loads it directly without a
 * build step. `tests/unit/tooling/eslint-boundaries.test.ts` imports it to assert the rules fire,
 * and under `strict` + `noImplicitAny` that import fails typecheck without this declaration. Only
 * the shape the test depends on is declared; the rule bodies stay untyped JS.
 */
import type { Rule } from "eslint";

declare const plugin: {
  readonly rules: Readonly<Record<string, Rule.RuleModule>>;
};

export default plugin;
