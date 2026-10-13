import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertNoGitLfsPointers,
  assertNotGitLfsPointer,
  GIT_LFS_POINTER_HEADER,
  isGitLfsPointerFile
} from "../../../marketing/scripts/git-lfs-pointer.mjs";

const buildScript = readFileSync("marketing/scripts/build-showcase-routes.mjs", "utf8");
const engineSource = (function agentApiSource() {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".ts") ? [join(d, e.name)] : []);
  return walk("packages/engine/src/agent-api").map((f) => readFileSync(f, "utf8")).join("\n");
})();
// `showcase-public-racing-presentation-proof` and `showcase-public-platformer-presentation-proof` were
// deleted in 1.5.0 as superseded by Turbo Drift Circuit and Skyline Runner, so the retained public game
// routes are the two current ones.
const publicGameRouteSources = [
  "apps/showcase-turbo-drift-circuit/src/main.ts",
  "apps/showcase-turbo-drift-circuit/src/legacy/main.ts",
  "apps/showcase-skyline-runner/src/main.ts",
  "apps/showcase-skyline-runner/src/legacy/main.ts"
].filter((file) => existsSync(file)).map((file) => readFileSync(file, "utf8")).join("\n");

/*
 * Helpers the **retained** public game routes actually call.
 *
 * The previous list named the eleven granular helpers (`racingRoadMesh`, `platformerGroundMesh`, ...),
 * which only the two deleted presentation proofs used. Turbo Drift Circuit and Skyline Runner call the
 * composed surfaces instead, so keeping the old list would have asserted against source that no longer
 * exists. Each entry below is verified present in the retained route sources, so this stays a real guard
 * rather than a list that happens to pass.
 */
const requiredPublicGameHelpers = [
  // Turbo and Skyline single-path rebuilds call the public racing and
  // platformer kits directly; the composed presentation surfaces remain
  // guarded as engine exports below.
  "racing",
  "platformer"
] as const;

/** Granular helpers that must remain exported for template and downstream use, even if unused here. */
const requiredEngineExportedGameHelpers = [
  "racingRoadMesh",
  "racingStartFinish",
  "publicRacingPresentation",
  "certifyRacingPresentation",
  "platformerGroundMesh",
  "platformerPlatformMesh",
  "platformerHazard",
  "platformerCheckpoint",
  "platformerFinish",
  "publicPlatformerPresentation",
  "certifyPlatformerPresentation"
] as const;

describe("marketing showcase route build", () => {
  it("bundles showcase routes against the current public agent-api source", () => {
    // invariant: source must keep `\` — bundles showcase routes against the current public agent-api source
    expect(buildScript).toContain("\"packages\", \"engine\", \"src\", \"agent-api\", \"index.ts\"");
    expect(buildScript).toContain("assertRequiredEngineSourceHelpers");
    expect(buildScript).not.toContain("\"node_modules\", \"@aura3d\", \"engine\", \"dist\", \"engine\", \"agent-api\", \"index.js\"");
  });

  it("guards every public game presentation helper used by the routes", () => {
    for (const helper of requiredPublicGameHelpers) {
      expect(publicGameRouteSources, `retained routes must call game.${helper}`).toContain(`game.${helper}`);
      expect(engineSource, `${helper} must stay exported`).toContain(`${helper}:`);
    }
  });

  it("keeps the granular public game helpers exported even where no retained route calls them", () => {
    // Deleting the two presentation proofs removed the only callers of these helpers. They remain part
    // of the published surface, so their removal from the engine must still be caught here.
    for (const helper of requiredEngineExportedGameHelpers) {
      expect(engineSource, `${helper} must stay exported`).toContain(`${helper}:`);
    }
  });
  it("publishes current game presentations, prunes deleted routes, and excludes diagnostic harnesses", () => {
    for (const route of ["showcase-turbo-drift-circuit", "showcase-skyline-runner"]) {
      expect(buildScript).toContain(`"${route}"`);
    }
    // The two deleted presentation proofs must stay in the prune list so a stale `dist/` from an older
    // build is still cleaned, even though their source no longer exists.
    for (const deleted of [
      "showcase-public-racing-presentation-proof",
      "showcase-public-platformer-presentation-proof"
    ]) {
      expect(buildScript).toContain(`"${deleted}"`);
    }
    expect(buildScript).toContain("release-ready game route must be published by marketing build");
    /*
     * The game-layer diagnostic publish guard was removed with its routes.
     *
     * showcase-racing-game-layer-proof and showcase-platformer-game-layer-proof were
     * deleted as discontinued examples, so a guard asserting they are not published had
     * nothing left to guard. The release-ready assertion above still proves the build
     * publishes the routes it must.
     */
    expect(buildScript).not.toContain("showcase-racing-game-layer-proof");
    expect(buildScript).not.toContain("showcase-platformer-game-layer-proof");
  });

  it("rejects unresolved Git LFS pointers instead of publishing them as game assets", () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-lfs-pointer-"));
    try {
      const pointer = join(root, "model.glb");
      const realAsset = join(root, "real.glb");
      writeFileSync(pointer, `${GIT_LFS_POINTER_HEADER}\noid sha256:abc\nsize 123\n`);
      writeFileSync(realAsset, Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0, 0, 0]));

      expect(isGitLfsPointerFile(pointer)).toBe(true);
      expect(isGitLfsPointerFile(realAsset)).toBe(false);
      expect(() => assertNotGitLfsPointer(realAsset)).not.toThrow();
      expect(() => assertNotGitLfsPointer(pointer)).toThrow(/git lfs pull/);
      expect(() => assertNoGitLfsPointers(root, "fixture assets")).toThrow(/fixture assets/);
      expect(buildScript).toContain("assertShowcaseAssetsMaterialized");
      expect(buildScript).toContain("assertNoGitLfsPointers(distDir, \"marketing/dist\")");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("builds every showcase game route the production capture manifest expects to exist", () => {
    // showcase-orbital-defense was captured against https://aura3d.auraone.ai but missing from
    // showcaseRoutes, so marketing/dist never contained it and the live route 404'd.
    const games = readFileSync("tools/quality-rebuild-capture/games.json", "utf8");
    const routes = [...games.matchAll(/"route":\s*"\/apps\/(showcase-[^/"]+)\/"/g)].map((m) => m[1]);
    expect(routes).toContain("showcase-orbital-defense");
    for (const route of new Set(routes)) {
      expect(buildScript, `${route} must be in showcaseRoutes`).toContain(`"${route}"`);
    }
  });

});
