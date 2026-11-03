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
// deleted in 1.5.0 as superseded by Turbo Drift Circuit and Skyline Runner; those two routes were in turn
// retired in 4.0.1 (46bca99f1; docs/project/showcase/apps-classification.md: "app source and route health
// are absent, and the marketing build redirects its URL to the showcase index"). No published route calls
// the composed presentation helpers any more, so they are guarded as exported engine surface only.
const retiredPresentationRoutes = ["showcase-turbo-drift-circuit", "showcase-skyline-runner"] as const;
const retiredRouteList = (buildScript.match(/const retiredPrototypeRoutes = \[([\s\S]*?)\];/)?.[1] ?? "");
const showcaseRouteList = (buildScript.match(/const showcaseRoutes = \[([\s\S]*?)\];/)?.[1] ?? "");

/*
 * Composed presentation helpers (formerly called by Turbo Drift Circuit and Skyline Runner). They stay
 * part of the published game surface after the 4.0.1 route retirement.
 */
const requiredPublicGameHelpers = [
  "racingPresentationTrack",
  "platformerPresentationSurfaces"
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
      expect(engineSource, `${helper} must stay exported`).toContain(`${helper}:`);
    }
    // The routes that called them were retired in 4.0.1: their source is gone and the build redirects them.
    for (const route of retiredPresentationRoutes) {
      expect(existsSync(`apps/${route}/src/main.ts`), `${route} source was retired`).toBe(false);
      expect(retiredRouteList, `${route} must redirect`).toContain(`"${route}"`);
      expect(showcaseRouteList, `${route} must not be built as a live route`).not.toContain(`"${route}"`);
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
    // 4.0.1 retired the two game presentation routes: they are redirected, never published as live routes.
    for (const route of retiredPresentationRoutes) {
      expect(retiredRouteList).toContain(`"${route}"`);
    }
    // The two deleted presentation proofs must stay in the prune list so a stale `dist/` from an older
    // build is still cleaned, even though their source no longer exists.
    for (const deleted of [
      "showcase-public-racing-presentation-proof",
      "showcase-public-platformer-presentation-proof"
    ]) {
      expect(buildScript).toContain(`"${deleted}"`);
    }
    // Every live route must build (replaces the per-route release-ready guard removed in 4.0.1).
    expect(buildScript).toContain("showcase route did not build: ${builtHtml}");
    expect(buildScript).toContain("for (const route of retiredPrototypeRoutes) {");
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
    // showcase-orbital-defense was once captured against https://aura3d.auraone.ai but missing from
    // showcaseRoutes, so the live route 404'd. It has since been retired (redirected), so the guard is:
    // every captured route is either built live or redirected — never absent from both lists.
    const games = readFileSync("tools/quality-rebuild-capture/games.json", "utf8");
    const routes = [...games.matchAll(/"route":\s*"\/apps\/(showcase-[^/"]+)\/"/g)].map((m) => m[1]);
    expect(routes.length).toBeGreaterThan(0);
    expect(retiredRouteList).toContain('"showcase-orbital-defense"');
    for (const route of new Set(routes)) {
      const listed = showcaseRouteList.includes(`"${route}"`) || retiredRouteList.includes(`"${route}"`);
      expect(listed, `${route} must be in showcaseRoutes or retiredPrototypeRoutes`).toBe(true);
    }
  });

});
