// Pip's Big Leap shell wiring (audit 2026-10-29 rows C5, C7, C8, C9, C10, C14, C15, C16, C19, C21, C23, C24).
// These rows live in DOM/main.ts glue that has no pure seam, so the contract is checked on the source.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorld, nodeName } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";

const read = (p: string) => readFileSync(resolve(process.cwd(), "apps/showcase-pips-big-leap", p), "utf8");
const main = read("src/main.ts");
const html = read("index.html");
const css = read("src/styles.css");
const hud = read("src/game/hud.ts");

describe("pips-big-leap shell", () => {
  it("C8: a 44 px HUD pause button and KeyP pause", () => {
    expect(html).toMatch(/id="pbl-pause-btn"[^>]*aria-label="Pause"/);
    expect(css).toMatch(/\.pbl-pause-btn \{[^}]*width: 44px; height: 44px;[^}]*pointer-events: auto;/);
    expect(main).toContain('pause: ["Escape", "KeyP"]');
    expect(main).toContain('bind("pbl-pause-btn"');
  });

  it("C9: overlays opened from Pause keep the sim paused, and any open overlay stops the sim", () => {
    expect(main).not.toMatch(/bind\("pbl-pause-(atlas|studio)", \(\) => \{ setPaused\(false\)/);
    expect(main).toMatch(/isActive: \(\) => appReady && !run\.paused && !overlayOpen\(\)/);
  });

  it("C14: aria-live only on the objective and toast; timer written on change; reduced-motion CSS", () => {
    expect(html).toMatch(/<div id="pbl-hud" class="pbl-hud">/);
    expect(html).toMatch(/id="pbl-objective"[^>]*aria-live="polite"/);
    expect(html).toMatch(/id="pbl-toast"[^>]*aria-live="polite"/);
    expect(hud).toContain("if (text !== timerText)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("C7: no cap row (Pip's GLB has one baked material); the cape shows at rest", () => {
    expect(html).not.toContain("pbl-cap-swatches");
    expect(Object.keys(nodeName)).not.toContain("heroCap");
    expect(main).toContain('cape?.setVisible(p.state !== "dead")');
  });

  it("C10: a failed world swap restores the previous run and tells the player", () => {
    expect(main).not.toContain(".catch(() => undefined)");
    expect(main).toMatch(/mountedWorld = previousWorld;[\s\S]*run = previousRun;/);
    expect(main).toContain('console.error("[pips-big-leap] world swap failed"');
  });

  it("C15/C16/C23/C24: heart at full health stays, death respawns at the checkpoint, double jump from W2 on, distinct cues", () => {
    expect(main).toMatch(/if \(run\.player\.hearts >= 3\) return;\s*run\.heartsGot\.add\(id\)/);
    expect(main).not.toContain("run.player.checkpoint = fresh.checkpoint");
    expect(main).toContain("spec.order >= 2");
    expect(main).toContain('cue("heart")');
    expect(main).toContain('cue("respawn")');
    expect(main).toMatch(/"amb-open": \{.*loop: true, bus: "ambience"/);
  });

  it("C5: no hint promises a crown seed", () => {
    expect(read("src/game/worlds.ts")).not.toMatch(/claim the crown seed/);
  });

  it("C19: every NPC is a camera obstacle", () => {
    for (const id of ["academy", "w1", "w2"] as const) {
      const spec = worldSpec(id);
      const built = buildWorld(spec);
      for (const n of spec.npcs) {
        expect(built.cameraObstacles.some((o) => o.x === n.x && o.z === n.z), `${id} ${n.id}`).toBe(true);
      }
    }
  });

  it("C11: spinning pickups do not cast shadow-map shadows", () => {
    const nodes = (buildWorld(worldSpec("w1")).scene.toJSON() as unknown as { nodes: { kind: string; name?: string; castShadow?: boolean }[] }).nodes;
    const pickups = nodes.filter((n) => /^(seed|acorn|heart):/.test(n.name ?? ""));
    expect(pickups.length).toBeGreaterThan(10);
    expect(pickups.every((n) => n.castShadow === false)).toBe(true);
  });

  it("C21: node handles are cached and the evidence global is throttled", () => {
    expect(main).toContain("const nodeCache = new Map");
    expect(main).toContain("EVIDENCE_INTERVAL_MS = 250");
  });
});
