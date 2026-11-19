import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOORS } from "../../../apps/showcase-bunker-zero/src/maps";
import { createSim } from "../../../apps/showcase-bunker-zero/src/sim";
import { autopilotInput, createAutopilot } from "../../../apps/showcase-bunker-zero/src/autopilot";
import { STAND_SPEED, drawnEnemyState, nextGroundSpeed } from "../../../apps/showcase-bunker-zero/src/flow";
import {
  BULLET_TRACER_HOLD_S, BULLET_TRACER_MIN_RANGE, BULLET_TRAIL_LIFE_S, ENEMY_TRACER_CLEAR, ENEMY_TRACER_MAX_LEN, bulletTracerVisible, enemyTracerSpan
} from "../../../apps/showcase-bunker-zero/src/weapons-view";

// Real-GPU audit (2026-11-18): (1) the player's bullet tracer read as an upright shell beside the pistol and its trail
// streaked up from where the dart was parked; (2) soldiers waiting out an attack cooldown played the run clip in place.
const MAIN = readFileSync(path.resolve("apps/showcase-bunker-zero/src/main.ts"), "utf8");
const DT = 1 / 60;

describe("bunker zero bullet tracer near the camera", () => {
  it("stays hidden beside the gun and holds longer than its trail lives", () => {
    // the trail in main.ts uses the same life the hold is sized against
    expect(MAIN).toMatch(new RegExp(`name: \`projectile trail \\$\\{i\\}\`, target: \`tracer-\\$\\{i\\}\`[^)]*life: ${BULLET_TRAIL_LIFE_S}`));
    expect(BULLET_TRACER_HOLD_S).toBeGreaterThan(BULLET_TRAIL_LIFE_S + 1 / 30);
    expect(bulletTracerVisible(0, 0.55)).toBe(false);
    expect(bulletTracerVisible(BULLET_TRACER_HOLD_S - 0.01, 5)).toBe(false);
    expect(bulletTracerVisible(BULLET_TRACER_HOLD_S, BULLET_TRACER_MIN_RANGE - 0.01)).toBe(false);
    expect(bulletTracerVisible(BULLET_TRACER_HOLD_S, BULLET_TRACER_MIN_RANGE)).toBe(true);
  });

  it("the first drawn frame of every autopilot bullet is well clear of the eye (no dart beside the pistol)", () => {
    const sim = createSim(FLOORS[0]!, { ox: 0, mode: "descent", seed: 1337 });
    const pilot = createAutopilot();
    const seen = new Map<object, { born: number }>();
    let checked = 0;
    for (let t = 0; t < 30 && !sim.state.finished; t += DT) {
      sim.tick(DT, autopilotInput(pilot, sim, DT));
      const p = sim.state.player;
      for (const r of sim.state.rockets) {
        if (r.fromEnemy || r.kind === "rocket") continue;
        if (!seen.has(r)) seen.set(r, { born: sim.state.time });
        const s = seen.get(r)!;
        if ((s as { drawn?: boolean }).drawn) continue;
        if (bulletTracerVisible(sim.state.time - s.born, r.t * r.speed)) {
          (s as { drawn?: boolean }).drawn = true;
          checked++;
          expect(Math.hypot(r.x - p.x, r.z - p.z)).toBeGreaterThan(2);
        }
      }
    }
    expect(checked).toBeGreaterThan(3);
  });
});

describe("bunker zero enemy tracer toward the camera", () => {
  it("is short and its near end stays clear of the player at every range and phase", () => {
    for (let len = 0.5; len <= 16; len += 0.25) {
      for (let k = 0; k <= 1; k += 0.1) {
        const sp = enemyTracerSpan(len, k);
        if (len < 2.3) expect(sp).toBeNull();
        if (!sp) continue;
        expect(sp.length).toBeLessThanOrEqual(ENEMY_TRACER_MAX_LEN);
        expect(sp.along - sp.length / 2).toBeGreaterThanOrEqual(-1e-9); // never behind the shooter
        expect(len - (sp.along + sp.length / 2)).toBeGreaterThanOrEqual(ENEMY_TRACER_CLEAR - 1e-9);
      }
    }
    expect(MAIN).toMatch(/enemyTracerSpan\(Math\.hypot\(s\.x1 - s\.x0, s\.z1 - s\.z0\), s\.t \/ 0\.12\)/);
    expect(MAIN).toContain("enemyTracerNodes[i]!.setScale([0.045, 0.045, span.length]);");
  });
});

describe("bunker zero enemies do not run in place", () => {
  it("drawn state: standing chase is alert (hound idle); moving keeps the run", () => {
    expect(drawnEnemyState("chase", "guard", 0)).toBe("alert");
    expect(drawnEnemyState("chase", "dog", 0)).toBe("idle");
    expect(drawnEnemyState("chase", "boss", STAND_SPEED + 0.5)).toBe("chase");
    expect(drawnEnemyState("attack", "guard", 0)).toBe("attack");
    expect(nextGroundSpeed(1, 0, 0)).toBe(1);
  });

  it("autopilot floors 1-3: run clip only while the body moves, and the clip does not flicker", () => {
    for (const fi of [0, 1, 2]) {
      const sim = createSim(FLOORS[fi]!, { ox: 0, mode: "descent", seed: 1337 + fi * 97 });
      const pilot = createAutopilot();
      const gait = new Map<object, { x: number; z: number; speed: number; drawn: string; switches: number; runStill: number; maxRunStill: number; alive: number }>();
      for (let t = 0; t < 40 && !sim.state.finished && sim.state.player.alive; t += DT) {
        sim.tick(DT, autopilotInput(pilot, sim, DT));
        for (const e of sim.state.enemies) {
          if (e.state === "dead") continue;
          let g = gait.get(e);
          if (!g) gait.set(e, (g = { x: e.x, z: e.z, speed: 0, drawn: "", switches: 0, runStill: 0, maxRunStill: 0, alive: 0 }));
          const moved = Math.hypot(e.x - g.x, e.z - g.z);
          g.speed = nextGroundSpeed(g.speed, moved, DT);
          g.x = e.x; g.z = e.z; g.alive += DT;
          const drawn = drawnEnemyState(e.state, e.kind, g.speed);
          if (g.drawn && drawn !== g.drawn && (drawn === "chase" || g.drawn === "chase")) g.switches++;
          g.drawn = drawn;
          g.runStill = drawn === "chase" && moved < 1e-4 ? g.runStill + DT : 0;
          g.maxRunStill = Math.max(g.maxRunStill, g.runStill);
        }
      }
      for (const g of gait.values()) {
        // the smoothed speed lags a stop by a few frames at most
        expect(g.maxRunStill).toBeLessThan(0.25);
        // run <-> stand changes at most ~3 per second of life (no frame-to-frame flicker)
        expect(g.switches).toBeLessThanOrEqual(Math.ceil(g.alive * 3) + 1);
      }
    }
  });

  it("main.ts poses the drawn state, not the raw sim state", () => {
    expect(MAIN).toContain("const poseState = drawnEnemyState(e.state, e.kind,");
    expect(MAIN).toMatch(/state: poseState,/);
    expect(MAIN).toMatch(/\}\), e\.kind, poseState, \{ stateT:/);
  });
});
