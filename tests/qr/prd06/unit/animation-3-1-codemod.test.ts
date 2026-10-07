/**
 * PRD-06 T1.13 — `animation-3.1` codemod (tools/codemods/animation-3.1.mjs,
 * registered via commands/prd06 → C-39). Covers the three reported constructs:
 * non-exact clip names at .animate/.play/resolveGLTFClipName call sites,
 * every `speed:` property, and `bindRuntimeNode({ applyPose })` — plus the
 * WorldWarXApp.ts:1071 shape (`"idle-ready"` + `speed: 0.44`) the PRD names.
 */
import { describe, expect, it } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore: .mjs codemod impl resolved by vitest/node at runtime.
import { transform } from "../../../../tools/codemods/animation-3.1.mjs";
import { codemodFor } from "../../../../packages/aura3d-cli/src/contracts/commands";
import "../../../../packages/aura3d-cli/src/commands/prd06/index";

const here = dirname(fileURLToPath(import.meta.url));
// Clip universe lives in tests/qr/prd06/fixtures/aura-assets.ts: ["Idle","Walk","Run"].
const APP_FILE = resolve(here, "../fixtures/codereview-app/src/WorldWarXApp.ts");

const WORLD_WAR_X_SHAPE = `class WorldWarXApp {
  ready() {
    this.soldier.animation.play({ clip: "idle-ready", speed: 0.44 });
    this.hero.animate({ clip: "sprint-fast", loop: true });
    this.walker.animate({ clip: "Walk" });
  }
  bind() {
    bindRuntimeNode({ applyPose: (p) => this.apply(p) });
  }
  name() {
    return resolveGLTFClipName(this.asset, "walking");
  }
}`;

describe("animation-3.1 codemod (T1.13)", () => {
  it("is registered under owner prd06", () => {
    const mod = codemodFor("animation-3.1");
    expect(mod).toBeDefined();
    expect(mod?.owner).toBe("prd06");
  });

  it("flags non-exact clip names at play/animate/resolveGLTFClipName and every speed:", () => {
    const { rows } = transform(WORLD_WAR_X_SHAPE, APP_FILE);
    const constructs = rows.map((r: { construct: string }) => r.construct);
    expect(constructs).toContain('play clip "idle-ready"');
    expect(constructs).toContain('animate clip "sprint-fast"');
    expect(constructs).toContain('resolveGLTFClipName clip "walking"');
    expect(constructs).toContain("speed: 0.44");
    expect(constructs).toContain("bindRuntimeNode({ applyPose })");
    // "Walk" resolves exactly — no row.
    expect(constructs.some((c: string) => c.includes('"Walk"'))).toBe(false);
    // every row carries file + line
    for (const row of rows) {
      expect(row.file).toBe(APP_FILE);
      expect(row.line).toBeGreaterThan(0);
    }
  });

  it("--write output rewrites misses to nearest clip names with TODO markers", () => {
    const { code } = transform(WORLD_WAR_X_SHAPE, APP_FILE);
    // "idle-ready" → "Idle", "sprint-fast" → "Run" or "Walk", "walking" → "Walk"
    // (marker comments quote the old name, so assert on the call-site patterns)
    expect(code).toContain('clip: "Idle"');
    expect(code).not.toContain('clip: "idle-ready"');
    expect(code).not.toContain('clip: "sprint-fast"');
    expect(code).toContain('"Walk")');
    expect(code).not.toContain(', "walking")');
    expect(code).toContain("TODO(animation-3.1)");
    expect(code).toContain('"Walk"');
    // exact names and speed values are untouched by the rewrite
    expect(code).toContain("speed: 0.44");
  });

  it("keeps exact clip names row-free and emits no edits", () => {
    const src = `hero.animate({ clip: "Idle" });\nrunner.play("Run");\nresolveGLTFClipName(asset, "Walk");\n`;
    const { code, rows } = transform(src, APP_FILE);
    expect(code).toBe(src);
    expect(rows).toHaveLength(0);
  });

  it("no clip universe → fallback: \"first\" instead of a rewrite", () => {
    const { code, rows } = transform(`app.play({ clip: "idle-ready" });`, "tmp/orphan/file.ts");
    expect(code).toContain('fallback: "first"');
    expect(code).toContain("TODO(animation-3.1)");
    expect(rows.some((r: { construct: string }) => r.construct === 'play clip "idle-ready"')).toBe(true);
  });
});
