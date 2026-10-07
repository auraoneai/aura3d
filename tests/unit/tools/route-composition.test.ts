import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs tool, no typings
import { analyzeRoute, compose } from "../../../tools/quality-rebuild-capture/route-composition.mjs";

const scratchRoots: string[] = [];

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-route-comp-"));
  scratchRoots.push(root);
  const app = join(root, "apps", "showcase-fixture");
  mkdirSync(join(app, "src", "generated"), { recursive: true });
  mkdirSync(join(app, "scripts"), { recursive: true });
  mkdirSync(join(app, "tests"), { recursive: true });
  writeFileSync(join(app, "src", "main.ts"), [
    `import { createAuraApp } from "@aura3d/engine";`,
    ``,
    `const visualReviewCapture = new URLSearchParams(window.location.search).get("capture") === "review";`,
    ``,
    `const proof = { lines: 2 };`,
    `window.__FIXTURE_PROOF__ = proof;`,
    ``,
    `function buildArena(): void {`,
    `  const floor = 1;`,
    `  const wall = 2;`,
    `  app.addMany();`,
    `}`,
    ``,
    `function tick(dt: number): void {`,
    `  ball.integrate(dt);`,
    `  if (pocketed) window.__FIXTURE_PROOF__ = { pocketed: true };`,
    `}`,
    ``,
    `const fog = visualReviewCapture ? "dense" : "light";`,
    `const fov = visualReviewCapture ? 35 : 55;`,
    `export {};`,
  ].join("\n"));
  writeFileSync(join(app, "src", "physics.ts"), "// gameplay file\nexport function integrate() {}\n");
  writeFileSync(join(app, "src", "hud.ts"), "// presentation file\nexport function renderHud() {}\n");
  writeFileSync(join(app, "src", "fixture-audio.ts"), [
    `export type FixtureCue = "strike" | "drop";`,
    `export const cues = {`,
    `  "strike": { url: "strike.wav" },`,
    `  "drop": { url: "drop.wav" },`,
    `};`,
    `// author: "Aura3D synthesis"`,
    `export function play(cue: FixtureCue) { return new Audio(cues[cue].url); }`,
  ].join("\n"));
  writeFileSync(join(app, "src", "generated", "kit.ts"), "// generated\n".repeat(40));
  writeFileSync(join(app, "src", "aura-assets.ts"), "// generated\n".repeat(20));
  writeFileSync(join(app, "scripts", "build-sfx.mjs"), "// evidence dir\n".repeat(10));
  writeFileSync(join(app, "tests", "x.test.ts"), "// evidence dir\n".repeat(5));
  writeFileSync(join(app, "src", "proof.ts"), "// evidence name\n".repeat(7));
  mkdirSync(join(root, "tools", "quality-rebuild-capture"), { recursive: true });
  writeFileSync(
    join(root, "tools", "quality-rebuild-capture", "games.json"),
    JSON.stringify({ games: [{ id: "showcase-fixture", appDir: "showcase-fixture" }] }),
  );
  return root;
}

describe("route-composition classifier", () => {
  it("splits LOC into evidence / presentation / gameplay / generated", () => {
    const root = fixture();
    const r = analyzeRoute(join(root, "apps", "showcase-fixture"), "apps/showcase-fixture");
    expect(r.loc.generated).toBe(62); // 40 + 20 lines + trailing-newline splits
    expect(r.loc.evidence).toBeGreaterThanOrEqual(15 + 1); // dirs + proof.ts + evidence stmts
    expect(r.loc.gameplay).toBeGreaterThan(0);
    expect(r.loc.presentation).toBeGreaterThan(0); // hud.ts + buildArena statement
    expect(r.loc.classified).toBe(r.loc.evidence + r.loc.presentation + r.loc.gameplay);
  });

  it("counts capture-flag branches but not the declaration line", () => {
    const root = fixture();
    const r = analyzeRoute(join(root, "apps", "showcase-fixture"), "apps/showcase-fixture");
    expect(r.captureBranches.ART + r.captureBranches.FRAMING).toBe(2); // fog + camFov reads
    expect(r.captureFlag).toEqual(["?capture=review"]);
    expect(r.globals).toContain("__FIXTURE_PROOF__");
  });

  it("marks html-audio provenance for Audio() cues", () => {
    const root = fixture();
    const r = analyzeRoute(join(root, "apps", "showcase-fixture"), "apps/showcase-fixture");
    expect(r.cues["html-audio"]).toBe(2);
    expect(r.cues.synth).toBe(0);
  });

  it("discovers routes from games.json under --root", () => {
    const root = fixture();
    const report = compose(root, null);
    expect(Object.keys(report.routes)).toEqual(["showcase-fixture"]);
    expect(report.totals.captureBranches.ART).toBeGreaterThanOrEqual(1);
  });
});
