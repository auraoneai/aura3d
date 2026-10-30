import { existsSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GU47 eint EF-1 (E-F handoff to `tools/finalize-dist`): the root tarball ships the built-in VFX sprite pages where
 * the emitted `FlipbookAtlas.js` resolves them (`dist/assets/vfx/`), so npm consumers stop falling back to the soft
 * dot (`VFX_SPRITE_UNAVAILABLE`). The full build is not run in phase 1; this pins the copy, its order and the path.
 */
const root = resolve(__dirname, "../../../..");

describe("GU47 eint EF-1: finalize-dist ships the VFX pages", () => {
  const finalize = readFileSync(resolve(root, "tools/finalize-dist/index.ts"), "utf8");

  it("copies both pages (and the licence note) into dist/assets/vfx after the package loop recreated dist/assets", () => {
    expect(finalize).toContain('const targetDir = join(rootDist, "assets", "vfx");');
    expect(finalize).toContain('for (const name of ["aura-vfx-1k.png", "aura-vfx-2k.png"]) {');
    const lastPackageLoop = finalize.lastIndexOf("for (const packageName of packageNames) {", finalize.indexOf("copyEngineVfxPages();"));
    expect(lastPackageLoop).toBeGreaterThan(0);
    expect(finalize.indexOf("copyEngineVfxPages();")).toBeGreaterThan(lastPackageLoop);
    for (const page of ["aura-vfx-1k.png", "aura-vfx-2k.png"]) expect(existsSync(resolve(root, "packages/engine/assets/vfx", page)), page).toBe(true);
  });

  it("dist/assets/vfx is where the emitted FlipbookAtlas.js looks, and dist/assets is in the published files", () => {
    const atlas = readFileSync(resolve(root, "packages/engine/src/production-runtime/effects/FlipbookAtlas.ts"), "utf8");
    const url = /new URL\("([^"]+aura-vfx-2k\.png)", import\.meta\.url\)/.exec(atlas)?.[1];
    expect(url).toBe("../../../assets/vfx/aura-vfx-2k.png");
    expect(posix.join(posix.dirname("dist/engine/production-runtime/effects/FlipbookAtlas.js"), url!)).toBe("dist/assets/vfx/aura-vfx-2k.png");
    const files = (JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { files: string[] }).files;
    expect(files).toContain("dist/assets");
  });

  it("the tarball audit (which bans .png) allows exactly the two pages", () => {
    const audit = readFileSync(resolve(root, "tools/package-tarball-audit/index.ts"), "utf8");
    const source = /const allowedPathPatterns = \[\/(.+)\/\];/.exec(audit)?.[1];
    expect(source).toBeDefined();
    const allowed = new RegExp(source!);
    expect(allowed.test("dist/assets/vfx/aura-vfx-1k.png")).toBe(true);
    expect(allowed.test("dist/assets/vfx/aura-vfx-2k.png")).toBe(true);
    expect(allowed.test("dist/assets/vfx/aura-vfx-2k-decals.png")).toBe(false);
    expect(allowed.test("dist/engine/screenshot.png")).toBe(false);
    expect(audit).toContain("!allowedPathPatterns.some((pattern) => pattern.test(path))");
  });
});
