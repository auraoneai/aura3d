import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOORS, KILL_HOUSE } from "../../../apps/showcase-bunker-zero/src/maps";
import { cellCenter, createSim, defaultLoadout, ENEMY_BODY_R, PLAYER_R, type Sim } from "../../../apps/showcase-bunker-zero/src/sim";
import { autopilotInput, createAutopilot } from "../../../apps/showcase-bunker-zero/src/autopilot";

const NO = { moveX: 0, moveZ: 0, turn: 0, pitchDelta: 0, fire: false, firePressed: false, reload: false, use: false };
const DT = 1 / 60;
/** Deterministic frame-time jitter (20-144 fps), the browser's variable dt. */
const jitter = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return 1 / (20 + (seed / 4294967296) * 124); };

/** Floor 1's long top corridor: the player at (2,1) facing +x, one guard two cells ahead; every other enemy removed. */
function corridor(kind: "guard" | "dog" | "gunner" | "boss" = "guard"): { sim: Sim; e: Sim["state"]["enemies"][number] } {
  const sim = createSim(FLOORS[0]!, { ox: 0, mode: "descent", seed: 1337, loadout: defaultLoadout() });
  const p = sim.state.player;
  p.x = cellCenter(2); p.z = cellCenter(1); p.yaw = Math.PI / 2; p.hp = 1e9;
  const e = sim.state.enemies.find((en) => en.kind === "guard")!;
  for (const o of sim.state.enemies) if (o !== e) { o.state = "dead"; o.hp = 0; o.deathT = 99; }
  e.kind = kind; e.x = cellCenter(4); e.z = cellCenter(1);
  e.state = "pain"; e.painT = 1e9; // held in place: only the blocking moves it
  return { sim, e };
}

describe("bunker zero player-vs-enemy blocking", () => {
  it("walking straight into a standing enemy stops at its body instead of passing through", () => {
    for (const kind of ["guard", "dog", "gunner", "boss"] as const) {
      const { sim, e } = corridor(kind);
      const p = sim.state.player;
      const min = PLAYER_R + ENEMY_BODY_R[kind];
      let closest = Infinity;
      for (let i = 0; i < 4 * 60; i++) {
        sim.tick(DT, { ...NO, moveZ: 1 });
        closest = Math.min(closest, Math.hypot(p.x - e.x, p.z - e.z));
      }
      expect(p.x, kind).toBeLessThan(e.x); // never got past it
      expect(closest, kind).toBeGreaterThan(min - 0.02);
    }
  });

  it("strafing against an enemy slides along it; a dead enemy no longer blocks", () => {
    const { sim, e } = corridor();
    const p = sim.state.player;
    for (let i = 0; i < 2 * 60; i++) sim.tick(DT, { ...NO, moveZ: 1 });
    const stopX = p.x;
    expect(stopX).toBeLessThan(e.x);
    e.state = "dead"; e.hp = 0;
    for (let i = 0; i < 2 * 60; i++) sim.tick(DT, { ...NO, moveZ: 1 });
    expect(p.x).toBeGreaterThan(e.x + 1);
  });

  it("a chasing enemy never ends a tick inside the player", () => {
    const sim = createSim(KILL_HOUSE, { ox: 0, mode: "killhouse", seed: 1344, loadout: defaultLoadout() });
    const p = sim.state.player;
    p.hp = 1e9;
    let worst = Infinity;
    for (let i = 0; i < 30 * 60; i++) {
      sim.tick(DT, NO);
      for (const e of sim.state.enemies) {
        if (e.state === "dead") continue;
        worst = Math.min(worst, Math.hypot(p.x - e.x, p.z - e.z) - (PLAYER_R + ENEMY_BODY_R[e.kind]));
      }
    }
    expect(worst).toBeGreaterThan(-0.02);
  });
});

describe("bunker zero autopilot never stalls (many seeds, variable frame time)", () => {
  it("leaves the spawn and never pushes in place for 5 s on any floor", () => {
    const bad: string[] = [];
    for (let f = 0; f < FLOORS.length; f++) {
      for (let seed = 0; seed < 14; seed++) {
        const sim = createSim(FLOORS[f]!, { ox: 0, mode: "descent", seed: seed === 0 ? 1337 + f * 97 : 4000 + seed * 31 + f, loadout: defaultLoadout() });
        const pilot = createAutopilot();
        const p = sim.state.player;
        const sx = p.x, sz = p.z;
        const dtOf = seed % 2 ? jitter(seed * 97 + f) : () => DT;
        let t = 0, left = Infinity, still = 0, maxStill = 0, lx = p.x, lz = p.z, prog = "";
        while (t < 45 && p.alive && !sim.state.finished) {
          const dt = dtOf();
          sim.tick(dt, autopilotInput(pilot, sim, dt));
          t += dt;
          if (left === Infinity && Math.hypot(p.x - sx, p.z - sz) > 3) left = t;
          const now = `${sim.state.kills}|${sim.state.score}|${Math.round(p.hp)}`;
          if (Math.hypot(p.x - lx, p.z - lz) > 0.25 || now !== prog) { still = 0; lx = p.x; lz = p.z; prog = now; } else still += dt;
          maxStill = Math.max(maxStill, still);
        }
        if (left > 8 || maxStill >= 5) bad.push(`floor ${f + 1} seed ${seed}: left spawn at ${left.toFixed(1)} s, max still ${maxStill.toFixed(1)} s`);
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it("backs off and strafes when pinned against a prop footprint (the F6 crate case)", () => {
    const sim = createSim(FLOORS[5]!, { ox: 0, mode: "descent", seed: 1337 + 5 * 97, loadout: defaultLoadout() });
    for (const e of sim.state.enemies) { e.state = "dead"; e.hp = 0; }
    const p = sim.state.player;
    // inside the crate's cell (9,4), west of its footprint, facing it: the route east runs through the crate
    p.x = 27.33; p.z = 13.5; p.yaw = Math.PI / 2;
    const pilot = createAutopilot();
    for (let i = 0; i < 5 * 60; i++) sim.tick(DT, autopilotInput(pilot, sim, DT));
    expect(Math.hypot(p.x - 27.33, p.z - 13.5)).toBeGreaterThan(2);
  });
});

describe("bunker zero F6 perf + autoplay wiring (main.ts)", () => {
  const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");
  it("mounts every floor's surfaces at boot (runtime adds make every node write rebuild the scene) unless ?deferfloors=1", () => {
    expect(MAIN).toContain('const DEFER_FLOOR_SURFACES = bootParams.get("deferfloors") === "1" &&');
  });
  it("keeps the shadowed moon (and its god rays) opt-in and warms programs with the boot floor's light set", () => {
    expect(MAIN).toContain('const BZ_GOD_RAYS = bootParams.get("godrays") === "1";');
    expect(MAIN).toContain("moonKey: () => BZ_GOD_RAYS");
    expect(MAIN).toMatch(/lightRig\.applyFloor\(activeSlot\(\)\);\s+loading\.set\(0\.97, "Warming shaders"\);/);
  });
  it("warms the wet program variants at boot and draws each new floor once from overhead behind the elevator card", () => {
    expect(MAIN).toContain("const wet = Math.max(...BZ_WETNESS);");
    expect(MAIN).toContain('case "next": playDescent(); startFloor(floorIdx + 1, "descent", { loadout: captureLoadout(sim) }); void prewarmActiveFloor(); break;');
    expect(MAIN).toContain("if (!appReady || !sim || bootWarming || floorWarming) return;");
    expect(MAIN).toMatch(/try \{ await warmFloorFromAbove\(activeSlot\(\)\); \}/);
    // the overhead pose's up vector must not leak into the first-person camera (GPU capture: rolled views)
    expect(MAIN).toContain("finally { app.camera?.setPose({ up: [0, 1, 0] }); }");
    expect(MAIN).toMatch(/app\.camera\?\.setPose\(\{\s+\/\/[^\n]*\n\s+up: \[0, 1, 0\],\s+position: \[p\.x \+ ox/);
  });
  it("under ?autoplay=1 a click or scroll does not take the controls from the pilot", () => {
    expect(MAIN).toContain("const pilotKeepsMouse = () => AUTOPLAY_BOOT && autoPilot && !pointerLocked;");
    expect(MAIN).toContain("if (!DEMO && !pilotKeepsMouse()) { autoPilot = false;");
    expect((MAIN.match(/if \(pilotKeepsMouse\(\)\) return;/g) ?? []).length).toBe(2);
  });
});
