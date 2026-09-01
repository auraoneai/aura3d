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
import { join, resolve } from "node:path";
import { compileShowcaseSpecFile } from "../../packages/create-aura3d/src/showcase-spec-compiler.js";

interface RouteSpec {
  readonly routeId: string;
  readonly specPath: string;
  readonly reportDir: string;
  readonly geometrySuffix: string;
}

const ROUTES: readonly RouteSpec[] = [
  { routeId: "showcase-turbo-drift-circuit", specPath: "tests/fixtures/showcase-spec/turbo-drift-circuit.json", reportDir: "turbo-drift-circuit", geometrySuffix: "racing-track-topology" },
  { routeId: "showcase-skyline-runner", specPath: "tests/fixtures/showcase-spec/skyline-runner.json", reportDir: "skyline-runner", geometrySuffix: "platformer-playable-surfaces" }
];

const root = resolve(process.cwd());
const selected = new Set(process.argv.slice(2));
let changed = 0;

for (const route of ROUTES.filter((entry) => selected.size === 0 || selected.has(entry.routeId))) {
  const specPath = resolve(root, route.specPath);
  if (!existsSync(specPath)) {
    console.warn(`skip ${route.routeId}: spec not found at ${route.specPath}`);
    continue;
  }
  // Keep the ephemeral compiler output inside the repository so the compiler's
  // containment guard is allowed to regenerate composition and geometry from
  // current evidence. An OS-temp output can only consume retained fixtures,
  // which is how stale 33-point topology leaked back into the app metadata.
  const outputDir = mkdtempSync(resolve(root, "tests", "reports", `.aura3d-geometry-${route.routeId}-`));
  try {
    // Fixture specs deliberately point at retained fixture evidence so compiler
    // unit tests remain hermetic.  App metadata, however, must point at the
    // current report producers.  Compile a temporary promoted copy and copy only
    // compiler-owned artifacts into the app; never hand-edit generated JSON.
    const promotedSpecPath = join(outputDir, "showcase-spec.current.json");
    const fixtureSpec = readFileSync(specPath, "utf8");
    writeFileSync(promotedSpecPath, promoteFixtureEvidencePaths(fixtureSpec));
    const report = compileShowcaseSpecFile({ specPath: promotedSpecPath, outputDir });
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
    } else {
      writeFileSync(target, next);
      changed += 1;
      const hasSurface = next.includes("surfaceY");
      console.log(`updated ${route.routeId}${hasSurface ? " (carries measured surfaceY)" : ""}`);
    }

    for (const artifact of [
      "route-health.json",
      "showcase-evidence-checklist.json",
      "showcase-spec-compile-report.json"
    ]) {
      const generatedArtifact = join(outputDir, artifact);
      if (!existsSync(generatedArtifact)) continue;
      writeFileSync(resolve(root, "apps", route.routeId, artifact), readFileSync(generatedArtifact));
    }

    // The geometry report and generated contract are one compiler-owned proof pair.
    // Updating only the module left the retained report bound to the previous asset
    // hash, so every later composition validator correctly rejected the mismatch.
    const geometryFile = `${route.routeId}-${route.geometrySuffix}.json`;
    const generatedGeometryReport = join(outputDir, "game-template", geometryFile);
    if (existsSync(generatedGeometryReport)) {
      const geometryReportContents = readFileSync(generatedGeometryReport);
      writeFileSync(
        resolve(root, "tests", "reports", "showcase-spec-compiler", route.reportDir, "game-template", geometryFile),
        geometryReportContents
      );
      // The app-local game-template copy is public scaffold/evidence input too. Keeping
      // only the tests/reports copy current left the installed route advertising an old
      // asset hash and seam even though its generated runtime contract was current.
      const appTemplateDir = resolve(root, "apps", route.routeId, "game-template");
      if (existsSync(appTemplateDir)) {
        writeFileSync(resolve(appTemplateDir, geometryFile), geometryReportContents);
      }
    }
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

console.log(`\n${changed} contract(s) updated.`);

function promoteFixtureEvidencePaths(source: string): string {
  const promoted = source
    .replaceAll(
      "tests/fixtures/showcase-spec/evidence/showcase-route-primary-probes/",
      "tests/reports/showcase-route-primary-probes/"
    )
    .replaceAll(
      "tests/fixtures/showcase-spec/evidence/showcase-gameplay/",
      "tests/reports/showcase-gameplay/"
    )
    .replaceAll(
      "tests/fixtures/showcase-spec/evidence/showcase-release-asset-probes/",
      "tests/reports/showcase-release-asset-probes/"
    )
    .replaceAll(
      "tests/fixtures/showcase-spec/evidence/showcase-spec-compiler/",
      "tests/reports/showcase-spec-compiler/"
    );

  // Fixture specs intentionally retain the asset hashes used by their hermetic
  // evidence bundle. A promoted compile consumes the live manifest and live
  // evidence, so hash-bound gameplay geometry must be promoted as well. Without
  // this synchronization a legitimate asset regeneration produces a contract
  // whose top-level geometry hash is current while levelDesign still advertises
  // the fixture hash.
  const spec = JSON.parse(promoted) as {
    platformer?: { levelDesign?: { playableSurfaceMap?: { assetId?: string; assetHash?: string } } };
  };
  const manifest = JSON.parse(readFileSync(resolve(root, "aura.assets.json"), "utf8")) as {
    assets?: readonly { id?: string; hash?: string }[];
  };
  const surfaceMap = spec.platformer?.levelDesign?.playableSurfaceMap;
  if (surfaceMap?.assetId) {
    const asset = manifest.assets?.find((entry) => entry.id === surfaceMap.assetId);
    if (!asset?.hash?.startsWith("sha256-")) {
      throw new Error(`${surfaceMap.assetId} is missing a current sha256 manifest hash`);
    }
    surfaceMap.assetHash = asset.hash;
  }

  return `${JSON.stringify(spec, null, 2)}\n`;
}
