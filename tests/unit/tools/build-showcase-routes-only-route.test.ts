import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GIT_LFS_POINTER_HEADER } from "../../../marketing/scripts/git-lfs-pointer.mjs";
import { assertBuiltRoutes, assertShowcaseAssetsMaterialized, resolveOnlyRoute } from "../../../marketing/scripts/build-showcase-routes.mjs";

// AURA3D_ONLY_ROUTE scopes the build script's whole-site assertions to the one route, so a checkout with LFS pointers
// elsewhere (or with `showcase-index` unbuilt) still builds that route and exits 0. Fixture-only: no vite build runs.
const ROUTE = "showcase-heatsink";
const roots: string[] = [];
const pointer = `${GIT_LFS_POINTER_HEADER}\noid sha256:00\nsize 1\n`;

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-only-route-"));
  roots.push(root);
  return root;
}

function write(file: string, content: string): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("AURA3D_ONLY_ROUTE single-route build", () => {
  it("resolves the route, ignores blank values and rejects unknown routes", () => {
    expect(resolveOnlyRoute(undefined)).toBeUndefined();
    expect(resolveOnlyRoute("  ")).toBeUndefined();
    expect(resolveOnlyRoute(` ${ROUTE} `)).toBe(ROUTE);
    expect(() => resolveOnlyRoute("not-a-route")).toThrow(/not a public showcase route/);
  });

  it("skips the all-assets LFS pointer scan for unrelated routes", () => {
    const root = fixtureRoot();
    write(join(root, "public/aura-assets/shared.glb"), pointer);
    write(join(root, "apps/showcase-other/public/aura-assets/other.glb"), pointer);
    write(join(root, `apps/${ROUTE}/public/aura-assets/own.glb`), "glTF");
    expect(() => assertShowcaseAssetsMaterialized(ROUTE, root)).not.toThrow();
    expect(() => assertShowcaseAssetsMaterialized(undefined, root)).toThrow(/Git LFS pointer/);
  });

  it("still fails when the selected route's own assets are pointers", () => {
    const root = fixtureRoot();
    write(join(root, `apps/${ROUTE}/public/aura-assets/own.glb`), pointer);
    expect(() => assertShowcaseAssetsMaterialized(ROUTE, root)).toThrow(/Git LFS pointer/);
  });

  it("checks only the built route: no showcase-index requirement, unrelated pointers ignored", () => {
    const dist = fixtureRoot();
    write(join(dist, `apps/${ROUTE}/index.html`), "<!doctype html>");
    write(join(dist, "apps/showcase-other/model.glb"), pointer);
    expect(() => assertBuiltRoutes(ROUTE, dist)).not.toThrow();
    expect(() => assertBuiltRoutes(undefined, dist)).toThrow();
  });

  it("fails when the selected route did not build", () => {
    const dist = fixtureRoot();
    mkdirSync(join(dist, "apps", ROUTE), { recursive: true });
    expect(() => assertBuiltRoutes(ROUTE, dist)).toThrow(/did not build/);
  });
});
