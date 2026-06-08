import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runCleanRoom,
  runPackagingAudits
} from "../../../tools/animation-studio-clean-room/index";

/**
 * PRD Phase I1 — clean-room packaging audits. The audits must DETECT the exact packaging defects
 * that break an external install (monorepo-alias leak, missing AnimationToonMaterial, stale dist,
 * stale Cartoon names) and PASS on a clean package. These run with no network (static reads).
 */

const TEMPLATE = "packages/create-aura3d/templates/animation-studio";
const RENDERER_SRC = "packages/rendering/src/animation";
const RENDERER_DIST = "dist/rendering/animation";

describe("I1 clean-room packaging audits", () => {
  it("PASSES every audit on a clean package fixture", () => {
    const root = cleanFixture();
    const audits = runPackagingAudits(root);
    const byId = Object.fromEntries(audits.map((a) => [a.id, a]));
    expect(byId["no-monorepo-alias-leak"]!.ok).toBe(true);
    expect(byId["animation-toon-material-exported"]!.ok).toBe(true);
    expect(byId["dist-generated-from-source"]!.ok).toBe(true);
    expect(byId["no-stale-cartoon-names"]!.ok).toBe(true);
  });

  it("DETECTS a monorepo-only alias / deep dist relative-import leak", () => {
    const root = cleanFixture();
    // Inject the exact leak pattern the real template carries (won't resolve in a clean install).
    writeFile(root, `${TEMPLATE}/src/leaky.ts`, 'import { x } from "../../../../../dist/animation/index.js";\n');
    const audit = runPackagingAudits(root).find((a) => a.id === "no-monorepo-alias-leak")!;
    expect(audit.ok).toBe(false);
    expect(audit.hits?.join(",")).toMatch(/leaky\.ts/);
  });

  it("DETECTS a workspace: alias leak in template source", () => {
    const root = cleanFixture();
    writeFile(root, `${TEMPLATE}/src/ws.ts`, 'import { y } from "workspace:@aura3d/engine";\n');
    const audit = runPackagingAudits(root).find((a) => a.id === "no-monorepo-alias-leak")!;
    expect(audit.ok).toBe(false);
  });

  it("DETECTS a missing AnimationToonMaterial dist artifact", () => {
    const root = cleanFixture({ skipRendererDist: true });
    const audit = runPackagingAudits(root).find((a) => a.id === "animation-toon-material-exported")!;
    expect(audit.ok).toBe(false);
    expect(audit.detail).toMatch(/dist artifact: NO/);
  });

  it("DETECTS a stale dist (dist older than source)", () => {
    const root = cleanFixture({ staleDist: true });
    const audit = runPackagingAudits(root).find((a) => a.id === "dist-generated-from-source")!;
    expect(audit.ok).toBe(false);
    expect(audit.detail).toMatch(/OLDER|stale/i);
  });

  it("DETECTS a stale `Cartoon` name in the public API", () => {
    const root = cleanFixture();
    writeFile(root, `${TEMPLATE}/src/legacy.ts`, "export class CartoonMaterial {}\n");
    const audit = runPackagingAudits(root).find((a) => a.id === "no-stale-cartoon-names")!;
    expect(audit.ok).toBe(false);
    expect(audit.hits?.join(",")).toMatch(/legacy\.ts/);
  });

  it("static-only run reports stoppedAt without faking a pass, and surfaces blockers", () => {
    const root = cleanFixture();
    // Corrupt one audit so we can confirm blockers propagate to ok=false.
    writeFile(root, `${TEMPLATE}/src/leaky.ts`, 'import { x } from "../../../../../dist/animation/index.js";\n');
    const report = runCleanRoom(root, { execute: false, generatedAt: "2026-06-07T00:00:00.000Z" });
    expect(report.schema).toBe("animation-studio-clean-room/v1");
    expect(report.ok).toBe(false);
    expect(report.stoppedAt).toBe("execute disabled (static audits only)");
    expect(report.blockers.join("\n")).toMatch(/no-monorepo-alias-leak/);
    // Never hard-codes a pass: no forbidden flag on the report.
    expect(JSON.stringify(report)).not.toMatch(/"passed":\s*true/);
  });
});

interface FixtureOptions {
  skipRendererDist?: boolean;
  staleDist?: boolean;
}

/** A minimal clean repo fixture: a leak-free template + the rendering source/dist. */
function cleanFixture(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), "clean-room-fixture-"));
  // Leak-free template source + scripts.
  writeFile(root, `${TEMPLATE}/package.json`, JSON.stringify({ name: "aura3d-animation-studio", dependencies: { "@aura3d/engine": "1.2.0" } }, null, 2));
  writeFile(root, `${TEMPLATE}/src/main.ts`, 'import { createAuraApp } from "@aura3d/engine";\nexport const app = createAuraApp;\n');
  writeFile(root, `${TEMPLATE}/scripts/render.ts`, 'import { x } from "@aura3d/engine";\nexport const r = x;\n');
  // Rendering source always exports AnimationToonMaterial.
  writeFile(root, `${RENDERER_SRC}/index.ts`, 'export { AnimationToonMaterial } from "./AnimationToonMaterial";\n');
  const srcMaterial = `${RENDERER_SRC}/AnimationToonMaterial.ts`;
  writeFile(root, srcMaterial, "export class AnimationToonMaterial {}\n");

  if (!options.skipRendererDist) {
    const distMaterial = `${RENDERER_DIST}/AnimationToonMaterial.js`;
    writeFile(root, distMaterial, "export class AnimationToonMaterial {}\n");
    if (options.staleDist) {
      // Make the dist artifact OLDER than its source.
      const old = Date.now() / 1000 - 3600;
      const fresh = Date.now() / 1000;
      utimesSync(join(root, distMaterial), old, old);
      utimesSync(join(root, srcMaterial), fresh, fresh);
    }
  }
  return root;
}

function writeFile(root: string, path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}
