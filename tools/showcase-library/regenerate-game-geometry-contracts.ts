/**
 * Regenerate the committed per-route game geometry contracts from their specs.
 *
 * ## Why this tool exists
 *
 * `apps/<route>/src/generated/game-geometry.ts` is a committed, generated artifact. Its
 * only producer was the showcase spec compiler running inside unit tests against a temp
 * directory, so the committed file could not be refreshed without hand-editing a file
 * whose header says "Do not edit". Two of the routes' writers were also removed with the
 * deleted game-layer-proof routes.
 *
 * That matters for GameEngine-PRD WS-4: the racing route can only drop its frozen
 * `TRACK_SURFACE_Y` constant if the contract carries the *measured* road surface profile,
 * and the contract can only carry it if there is a way to regenerate the contract.
 *
 * Usage: pnpm exec tsx --tsconfig tsconfig.base.json tools/showcase-library/regenerate-game-geometry-contracts.ts
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compileShowcaseSpecFile } from "../../packages/create-aura3d/src/showcase-spec-compiler.js";

interface RouteSpec {
  readonly routeId: string;
  readonly specPath: string;
}

const ROUTES: readonly RouteSpec[] = [
  { routeId: "showcase-turbo-drift-circuit", specPath: "tests/fixtures/showcase-spec/turbo-drift-circuit.json" },
  { routeId: "showcase-skyline-runner", specPath: "tests/fixtures/showcase-spec/skyline-runner.json" }
];

const root = resolve(process.cwd());
let changed = 0;

for (const route of ROUTES) {
  const specPath = resolve(root, route.specPath);
  if (!existsSync(specPath)) {
    console.warn(`skip ${route.routeId}: spec not found at ${route.specPath}`);
    continue;
  }
  const outputDir = mkdtempSync(join(tmpdir(), `aura3d-geometry-${route.routeId}-`));
  try {
    const report = compileShowcaseSpecFile({ specPath: route.specPath, outputDir });
    const generated = join(outputDir, "src", "generated", "game-geometry.ts");
    if (!existsSync(generated)) {
      console.warn(`skip ${route.routeId}: compiler produced no geometry contract (blockers: ${report.blockers?.join(", ") ?? "none"})`);
      continue;
    }
    const target = resolve(root, "apps", route.routeId, "src", "generated", "game-geometry.ts");
    const next = readFileSync(generated, "utf8");
    const previous = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (next === previous) {
      console.log(`unchanged ${route.routeId}`);
      continue;
    }
    writeFileSync(target, next);
    changed += 1;
    const hasSurface = next.includes("surfaceY");
    console.log(`updated ${route.routeId}${hasSurface ? " (carries measured surfaceY)" : ""}`);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

console.log(`\n${changed} contract(s) updated.`);
