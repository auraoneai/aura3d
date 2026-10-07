/**
 * eslint/qr/no-route-capture-flags.js — PRD-09.
 *
 * Bans route-local `?capture` flag reads (the ~395 ternary branches that make
 * review screenshots diverge from the shipped game).
 *
 * Severity: `error` for routes whose `src/main.ts` already imports
 * `@aura3d/game` — computed at config load by scanning the app dirs
 * (plus the STATIC_ERROR_ROUTES override), `warn` for everything else.
 * `@aura3d/game/capture` imports are banned outside scenario directories.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Routes to force error severity on even before their main.ts imports @aura3d/game. */
export const STATIC_ERROR_ROUTES = [];

const migratedRoutes = () => {
  const routes = new Set(STATIC_ERROR_ROUTES);
  const appsDir = join(repoRoot, "apps");
  try {
    for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const main = join(appsDir, entry.name, "src", "main.ts");
      if (existsSync(main) && readFileSync(main, "utf8").includes('"@aura3d/game"')) {
        routes.add(entry.name);
      }
    }
  } catch {
    /* apps dir absent — warn-only */
  }
  return routes;
};

const MESSAGE =
  "aura3d/no-route-capture-flags: route-local ?capture reads are banned (PRD-09) — use @aura3d/game captureFromUrl/lookSignature; the shared runtime resolves capture once";
const MESSAGE_IDENT =
  "aura3d/no-route-capture-flags: route-local capture flag identifiers are banned (PRD-09) — delete divergent capture branches, do not preserve them";

const captureSyntax = (severity) => ({
  "no-restricted-syntax": [
    severity,
    {
      selector: 'CallExpression[callee.property.name="get"][arguments.0.value="capture"]',
      message: MESSAGE
    },
    {
      selector:
        "Identifier[name=/^(visualReviewCapture|visualCaptureCamera|reviewCapture|captureMode|isCapture|CAPTURE_REVIEW)$/]",
      message: MESSAGE_IDENT
    }
  ]
});

const ROUTE_FILES = [
  "apps/*/src/**/*.ts",
  "apps/*/src/**/*.tsx",
  "packages/create-aura3d/templates/*/src/**/*.ts",
  "packages/create-aura3d/templates/*/src/**/*.tsx"
];

const errorRoutes = [...migratedRoutes()];

export default [
  {
    name: "qr/prd09/no-route-capture-flags:fleet",
    files: ROUTE_FILES,
    rules: captureSyntax("warn")
  },
  ...errorRoutes.map((route) => ({
    name: `qr/prd09/no-route-capture-flags:error:${route}`,
    files: [
      `apps/${route}/src/**/*.ts`,
      `apps/${route}/src/**/*.tsx`,
      `packages/create-aura3d/templates/${route}/src/**/*.ts`,
      `packages/create-aura3d/templates/${route}/src/**/*.tsx`
    ],
    rules: captureSyntax("error")
  })),
  {
    name: "qr/prd09/no-route-capture-flags:game-capture-import",
    files: ROUTE_FILES,
    ignores: ["**/src/scenarios/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@aura3d/game/capture",
              message:
                "aura3d/no-route-capture-flags: only src/scenarios/** may import @aura3d/game/capture — the shared runtime resolves capture once per mount"
            }
          ]
        }
      ]
    }
  }
];
