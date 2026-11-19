import { describe, expect, it } from "vitest";
import { createRun, defaultCareer, stepRun, SIM_STEP } from "../../../examples/roadster-hours-port/sim";
import { DEFAULT_PARAMS, autopilot } from "../../../examples/roadster-hours-port/autopilot";
import { LEVELS } from "../../../examples/roadster-hours-port/course";
import { buildWorld } from "../../../examples/roadster-hours-port/world";

/**
 * GPU QA (Nov 18): a runtime node lookup placed above the `node` helper in `bind` threw "Cannot access before initialization"
 * on the routes with vents (Redline, Halo) and the route never started. Bind every route against a permissive fake app and
 * run a few seconds of autopilot frames through `update`, recording every node id the runtime requires and every pose sent.
 */
function fakeApp() {
  const required = new Set<string>();
  const poses: { position: number[]; up: number[] }[] = [];
  const chain = (): unknown => new Proxy(function () { /* no-op */ }, {
    get: (_t, key) => (key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : chain()),
    apply: () => chain()
  });
  const handle = () => new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : () => handle()) });
  const app = new Proxy({}, {
    get: (_t, key) => {
      if (key === "camera") return { setPose: (p: { position: number[]; up: number[] }) => { poses.push({ position: [...p.position], up: [...p.up] }); } };
      if (key === "nodes") return { require: (id: string) => { required.add(id); return handle(); }, get: (id: string) => { required.add(id); return handle(); } };
      if (key === "then") return undefined;
      return chain();
    }
  });
  return { app, required, poses };
}

describe("Saltwind Highway runtime binds and runs on every route", () => {
  it("binds each route and steps autopilot frames without throwing; the camera pose stays finite", () => {
    LEVELS.forEach((_level, li) => {
      const world = buildWorld(li, "gu47");
      const { app, required, poses } = fakeApp();
      const runtime = world.bind(app as never);
      const career = { ...defaultCareer(), unlocked: LEVELS.length - 1 };
      const run = createRun(li, career);
      for (let f = 0; f < 60 * 6; f++) {
        for (let k = 0; k < 2; k++) stepRun(run, run.phase === "running" ? autopilot(run, DEFAULT_PARAMS) : {}, SIM_STEP, career);
        runtime.update(run, 1 / 60, f / 60, 16 / 9, run.events);
      }
      expect(poses.length).toBeGreaterThan(100);
      for (const p of poses) for (const v of [...p.position, ...p.up]) expect(Number.isFinite(v)).toBe(true);
      if (world.level.hazards.some((h) => h.type === "vent")) expect([...required].some((id) => id.startsWith("hazard-vent-"))).toBe(true);
    });
  });
});
