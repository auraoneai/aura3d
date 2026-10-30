import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOORS, KILL_HOUSE } from "../../../apps/showcase-bunker-zero/src/maps";
import {
  betterMedal, cloneBindings, scaleHex, wallAlbedo, wallGain, cosmeticRng, DEFAULT_BINDINGS, keyLabel, parseBindings, rebind, runTotals, type BindAction
} from "../../../apps/showcase-bunker-zero/src/flow";
import { VIEWMODEL_ASSET } from "../../../apps/showcase-bunker-zero/src/weapons-view";

const APP = path.resolve("apps/showcase-bunker-zero");
const SRC = (f: string) => readFileSync(path.join(APP, "src", f), "utf8");
const MAIN = SRC("main.ts");
const HTML = readFileSync(path.join(APP, "index.html"), "utf8");

describe("bunker zero flow and wiring", () => {
  it("C10: every default key does one thing; E is Use only, F is Fire only", () => {
    const owner = new Map<string, BindAction>();
    for (const [action, codes] of Object.entries(DEFAULT_BINDINGS) as [BindAction, readonly string[]][]) {
      for (const c of codes) { expect(owner.has(c), `${c} bound to ${owner.get(c)} and ${action}`).toBe(false); owner.set(c, action); }
    }
    expect(owner.get("KeyE")).toBe("use");
    expect(owner.get("KeyF")).toBe("fire");
    expect(DEFAULT_BINDINGS.turnRight).not.toContain("KeyE");
  });

  it("C21: remapping moves a key off any other action and survives a round trip", () => {
    const b = rebind(cloneBindings(), "use", "KeyF");
    expect(b.use[0]).toBe("KeyF");
    expect(b.fire).not.toContain("KeyF");
    expect(parseBindings(JSON.stringify(b))).toEqual(b);
    expect(parseBindings("{bad json")).toEqual(cloneBindings());
    expect(parseBindings(JSON.stringify({ fire: ["<script>"] })).fire).toEqual([...DEFAULT_BINDINGS.fire]);
    expect(keyLabel("KeyW")).toBe("W");
    expect(keyLabel("ArrowUp")).toBe("UP");
  });

  it("C11: Enter, Tab and Space are swallowed in play and buttons give focus back", () => {
    expect(MAIN).toMatch(/if \(boundCodes\(\)\.has\(e\.code\)\) e\.preventDefault\(\);/);
    expect(DEFAULT_BINDINGS.map).toContain("Tab");
    expect(MAIN).toMatch(/setTimeout\(\(\) => b\.blur\(\), 0\)/);
    // the advertised map exists
    expect(HTML).toMatch(/<canvas id="bz-map"/);
    expect(MAIN).toMatch(/function drawMap\(\)/);
  });

  it("C13: the sim is gated on pause (menu, lock loss, P/Esc, intro card)", () => {
    expect(MAIN).toMatch(/if \(!qaFrozen && !paused && !campaignDone\) stepSim\(dt, inp\);/);
    expect(MAIN).toMatch(/function openMenu\(\) \{[^}]*setPaused\("menu", true\)/);
    expect(HTML).toMatch(/id="bz-pause"/);
  });

  it("C12: a touch layer with targets of at least 44 px and the feed lifted off the status bar on phones", () => {
    for (const id of ["move", "look", "fire", "use", "reload", "swap", "pause"]) expect(HTML).toContain(`data-control="${id}"`);
    const sizes = [...HTML.matchAll(/#bz-touch[^{]*\{[^}]*?width: (\d+)px; height: (\d+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(sizes.length).toBeGreaterThan(3);
    for (const [w, h] of sizes) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
    expect(HTML).toMatch(/@media \(max-width: 760px\)[\s\S]*#bz-feed \{ bottom: auto; top:/);
  });

  it("C17: cosmetic jitter never draws from the sim RNG", () => {
    expect(MAIN).not.toMatch(/sim\.state\.rng\(\)/);
    const a = cosmeticRng(7), b = cosmeticRng(7);
    for (let i = 0; i < 50; i++) { const v = a(); expect(v).toBe(b()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });

  it("C26: the dog tag is never written as markup and floor changes refresh the quick bar", () => {
    expect(MAIN).not.toMatch(/innerHTML/);
    expect(MAIN).toMatch(/function startFloor[\s\S]{0,1600}setModeButtons\(\);/);
  });

  it("C22: HUD tint, medal marks and the retry text are real features", () => {
    expect(HTML).not.toMatch(/CAMO TINT \(viewmodel\)/);
    expect(MAIN).toMatch(/--bz-amber/);
    expect(betterMedal(undefined, "bronze")).toBe("bronze");
    expect(betterMedal("gold", "silver")).toBe("gold");
    expect(betterMedal("silver", "gold")).toBe("gold");
    expect(MAIN).toMatch(/pending\?\.kind === "retry" && pending\.age > 0\.6\) \{ runPending\(\);/);
  });

  it("C3/C27: run totals add up floors; the score is the carried score of the last floor", () => {
    const t = runTotals([
      { floor: 1, name: "a", time: 100, kills: 3, totalEnemies: 4, secrets: 1, totalSecrets: 2, medal: "gold", score: 900 },
      { floor: 2, name: "b", time: 50, kills: 2, totalEnemies: 2, secrets: 0, totalSecrets: 2, medal: "silver", score: 1500 }
    ]);
    expect(t).toMatchObject({ floors: 2, time: 150, kills: 5, totalEnemies: 6, secrets: 1, totalSecrets: 4, score: 1500, medals: { gold: 1, silver: 1, bronze: 0 } });
    expect(HTML).toMatch(/id="bz-results"/);
    expect(HTML).toMatch(/id="bz-intro"/);
    expect(HTML).toMatch(/id="bz-vulnerable"/);
  });

  it("C21: shake and head bob scale down under reduced motion", () => {
    expect(MAIN).toMatch(/prefers-reduced-motion: reduce/);
    expect(MAIN).toMatch(/const shake = \(sim\.state\.shake \+ \(p\.hurtT > 0 \? 0\.3 : 0\)\) \* motion;/);
    expect(HTML).not.toMatch(/\.bz-label \{ display: block; font-size: 9px/);
  });

  it("C25: the HUD is keyed on whole seconds and evidence publishes at 4 Hz", () => {
    expect(MAIN).not.toMatch(/\$\{sim\.state\.time\}\|/);
    expect(MAIN).toMatch(/now - lastEvidenceAt < 250/);
  });

  it("C15/C18 (GU47 BZ-15): doors slide sideways with y constant; inactive floors are hidden", () => {
    expect(MAIN).toMatch(/doorOffset\(d\.open, alongX, CELL\)/);
    expect(MAIN).toMatch(/node\.setPosition\(cellX\(slot, d\.cx\) \+ offX, 0, cellCenter\(d\.cz\) \+ offZ\)/);
    expect(MAIN).not.toMatch(/-d\.open \* WALL_H/);
    expect(MAIN).toMatch(/for \(const id of SLOT_IDS\[s\]!\) opt\(id\)\?\.setVisible\(false\)/);
  });

  it("RH-06: the game no longer imports the shared root catalog, and its subset covers every key it reads", () => {
    for (const f of ["main.ts", "aura-assets.ts", "sim.ts", "maps.ts", "flow.ts", "autopilot.ts", "weapons-view.ts", "enemy-facing.ts"]) {
      expect(SRC(f), f).not.toMatch(/from\s+["'](?:\.\.\/)+src\/aura-assets["']/);
    }
    const subset = SRC("aura-assets.root.ts") + SRC("aura-assets.local.ts");
    const declared = new Set([...subset.matchAll(/^ {2}readonly "([A-Za-z0-9]+)":/gm)].map((m) => m[1]));
    const used = new Set([...MAIN.matchAll(/assets\.([A-Za-z0-9]+)/g)].map((m) => m[1]).concat(Object.values(VIEWMODEL_ASSET)));
    for (const id of used) expect(declared.has(id), id).toBe(true);
    execFileSync(process.execPath, [path.join(APP, "scripts/extract-assets.mjs"), "--check"], { encoding: "utf8" });
  });

  it("wall albedo: no floor's walls fall below 45% of floor 1's (floor 6 drew black at about 1/12)", () => {
    const shade = (hex: string, amt: number) => {
      const n = parseInt(hex.slice(1), 16);
      const c = (v: number) => Math.max(0, Math.min(255, v + amt * 255));
      return `#${((Math.round(c((n >> 16) & 255)) << 16) | (Math.round(c((n >> 8) & 255)) << 8) | Math.round(c(n & 255))).toString(16).padStart(6, "0")}`;
    };
    const ref = FLOORS[0]!.palette;
    const albedo = (wall: string, k: number) => wallAlbedo(shade(wall, 0.14), k) * wallAlbedo(shade(wall, 0.12), k);
    const refAlbedo = albedo(ref.wall, 1);
    expect(wallGain(shade(ref.wall, 0.14), shade(ref.wall, 0.12), shade(ref.wall, 0.14), shade(ref.wall, 0.12))).toBe(1);
    for (const def of [...FLOORS, KILL_HOUSE]) {
      const k = wallGain(shade(def.palette.wall, 0.14), shade(def.palette.wall, 0.12), shade(ref.wall, 0.14), shade(ref.wall, 0.12));
      const a = albedo(def.palette.wall, k);
      expect(a / refAlbedo, def.name).toBeGreaterThan(0.43); // 45% before 8-bit rounding of the hex colours
      expect(a / refAlbedo, def.name).toBeLessThanOrEqual(1.0001);
      // unscaled, the dark palettes sit far below
      if (def.id === 5) expect(albedo(def.palette.wall, 1) / refAlbedo).toBeLessThan(0.15);
    }
    expect(scaleHex("#808080", 1)).toBe("#808080");
  });
});
