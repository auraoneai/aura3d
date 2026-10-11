/**
 * PRD-08 harness scenes (camera-feel-harness.ts `?scene=`): each scene lists
 * its runtime nodes and binds a sim mover that runs once per fixed substep
 * (`FixedStepDriver` → `app.advance(fixedDt)`), so presented frames sample
 * real sim state through the interpolation store.
 *
 *   orbiters (default) — 20 bodies on circles (L-9 frame pacing, S1/S2/S3)
 *   fighters           — tests/qr/prd08/fixtures/fighters.json: two fighters
 *                        + bystander for S5 global vs scoped hit-stop
 *   chase              — one subject at 20 u/s straight along +z (S6)
 *   wall               — a box wall on the r = 8 orbit circle (S8 collision)
 *   drift              — one car on `createGameArcadeVehicle` (S12)
 *   tier               — S19 budgets: a subject circling behind a wall that
 *                        occludes it from the static camera, plus six pillars
 *                        the camera probe sweeps (scenarios-tier.ts)
 *
 * Movers that must honour scoped hit-stop scale their step by the handle's
 * own `timeScale` (C-37 member attached by the interpolation store) — the same
 * semantics as tests/qr/prd08/unit/hit-stop.test.ts.
 */
import { camera, createGameArcadeVehicle, lights, primitives, scene, type AuraRuntimeNodeHandle } from "@aura3d/engine";

export type HarnessSceneKind = "orbiters" | "fighters" | "chase" | "wall" | "drift" | "tier";

export interface HarnessNodeSpec {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: string;
}

export interface HarnessVehicleInput {
  steer?: number;
  throttle?: number;
  brake?: number;
  handbrake?: boolean;
}

export interface HarnessSceneBinding {
  /** Advance the scene's sim by one fixed substep. */
  move(dt: number): void;
  /** Per-presented-frame scene telemetry (recorded verbatim). */
  telemetry?(): Readonly<Record<string, number | boolean>>;
  /** Mutable vehicle input (drift scene only). */
  readonly vehicleInput?: HarnessVehicleInput;
}

export interface HarnessScene {
  readonly kind: HarnessSceneKind;
  readonly nodes: readonly HarnessNodeSpec[];
  readonly camera: { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly fov: number };
  bind(handles: readonly AuraRuntimeNodeHandle[]): HarnessSceneBinding;
}

interface FighterFixture {
  readonly fighters: readonly {
    readonly id: string;
    readonly spawn: readonly [number, number, number];
    readonly script: { readonly kind: "advance" | "wander"; readonly speed: number; readonly axis: "x" | "y" | "z"; readonly dir?: number; readonly period?: number };
  }[];
}

const NODE_COUNT = 20;
const scaleOf = (h: AuraRuntimeNodeHandle) => (h as { timeScale?: number }).timeScale ?? 1;

/** Scene graph for a harness scene: studio light, one runtime box per node. */
export function buildHarnessScene(def: HarnessScene) {
  let builder = scene().add(lights.studio({ intensity: 1.2 }));
  for (const n of def.nodes) {
    builder = builder.add(
      primitives.box({
        name: n.id,
        size: [n.size[0], n.size[1], n.size[2]],
        position: [n.position[0], n.position[1], n.position[2]],
        material: { name: n.id, color: n.color }
      }).runtime({ id: n.id })
    );
  }
  return builder.camera(
    camera.perspective({
      position: [def.camera.position[0], def.camera.position[1], def.camera.position[2]],
      target: [def.camera.target[0], def.camera.target[1], def.camera.target[2]],
      fov: def.camera.fov
    })
  );
}

function orbiters(): HarnessScene {
  const nodes: HarnessNodeSpec[] = [];
  for (let i = 0; i < NODE_COUNT; i += 1) {
    const a = (i / NODE_COUNT) * Math.PI * 2;
    nodes.push({
      id: `harness-node-${i}`,
      position: [Math.cos(a) * 4, 1 + (i % 3) * 0.4, Math.sin(a) * 4],
      size: [0.4, 0.4, 0.4],
      color: `#${(((0x33 + i * 9) << 16) | (0x80 << 8) | 0xe0).toString(16).padStart(6, "0")}`
    });
  }
  return {
    kind: "orbiters",
    nodes,
    camera: { position: [0, 7, 12], target: [0, 1, 0], fov: 50 },
    bind(handles) {
      // Each node orbits its seed radius once per ~4 s; positions move on
      // every substep so interpolation differences are visible in records.
      const centers = handles.map((h) => [...h.position] as [number, number, number]);
      let simTime = 0;
      return {
        move(dt) {
          simTime += dt;
          for (let i = 0; i < handles.length; i += 1) {
            const a = simTime * (Math.PI / 2) + (i / handles.length) * Math.PI * 2;
            const c = centers[i]!;
            const r = Math.hypot(c[0], c[2]) || 4;
            handles[i]!.setPosition(Math.cos(a) * r, c[1] + Math.sin(simTime * 2 + i) * 0.25, Math.sin(a) * r);
          }
        }
      };
    }
  };
}

function fighters(fixture: FighterFixture): HarnessScene {
  const palette = ["#ef4444", "#3b82f6", "#a3e635"];
  return {
    kind: "fighters",
    nodes: fixture.fighters.map((f, i) => ({ id: f.id, position: f.spawn, size: [0.6, 1.0, 0.6], color: palette[i % palette.length]! })),
    camera: { position: [3, 3.5, 10], target: [3, 0.5, 1], fov: 50 },
    bind(handles) {
      // Per-node sim clocks: a scoped stop (timeScale 0) pauses only that
      // node's script, exactly like the unit rig's `scriptStep`.
      const clocks = handles.map(() => 0);
      return {
        move(dt) {
          for (let i = 0; i < handles.length; i += 1) {
            const h = handles[i]!;
            const f = fixture.fighters[i]!;
            const scaled = dt * scaleOf(h);
            clocks[i] += scaled;
            const p: [number, number, number] = [h.position[0], h.position[1], h.position[2]];
            const step = f.script.speed * scaled;
            if (f.script.kind === "advance") {
              const axis = f.script.axis === "x" ? 0 : f.script.axis === "y" ? 1 : 2;
              p[axis] += step * (f.script.dir ?? 1);
            } else {
              const axis = f.script.axis === "z" ? 2 : 0;
              p[axis] += Math.cos((clocks[i]! / (f.script.period ?? 3)) * Math.PI * 2) * step;
            }
            h.setPosition(p[0], p[1], p[2]);
          }
        }
      };
    }
  };
}

function chase(): HarnessScene {
  const SPEED = 20;
  return {
    kind: "chase",
    nodes: [{ id: "hero", position: [0, 0, 0], size: [0.8, 1.8, 0.8], color: "#f59e0b" }],
    camera: { position: [0, 2, -6], target: [0, 0, 0], fov: 50 },
    bind(handles) {
      const hero = handles[0]!;
      return {
        move(dt) {
          hero.setPosition(hero.position[0], hero.position[1], hero.position[2] + SPEED * dt);
        },
        telemetry: () => ({ speed: SPEED })
      };
    }
  };
}

function wall(): HarnessScene {
  // A box wall straddling the r = 8 orbit circle at +x: an orbit without
  // collision puts the eye inside it; with collision the arm pulls in.
  return {
    kind: "wall",
    nodes: [{ id: "wall", position: [8, 1.5, 0], size: [1, 3, 4], color: "#94a3b8" }],
    camera: { position: [0, 2, 8], target: [0, 0.5, 0], fov: 50 },
    bind: () => ({ move() {} })
  };
}

function drift(model: "bicycle" | "unicycle"): HarnessScene {
  return {
    kind: "drift",
    nodes: [{ id: "car", position: [0, 0.4, 0], size: [1.8, 0.8, 4.0], color: "#22d3ee" }],
    camera: { position: [0, 40, -10], target: [0, 0, 20], fov: 60 },
    bind(handles) {
      const car = handles[0]!;
      const vehicle = createGameArcadeVehicle({ maxSpeed: 60, model, tyre: { mu: 1 } });
      const vehicleInput: HarnessVehicleInput = {};
      // Slip measured from the node's own motion this substep: angle between
      // the displacement written to the node and the vehicle heading.
      let motionSlip = 0;
      return {
        vehicleInput,
        move(dt) {
          const before = vehicle.snapshot();
          const s = vehicle.step(dt, { ...vehicleInput });
          const dx = s.x - before.x;
          const dz = s.z - before.z;
          if (Math.hypot(dx, dz) > 1e-6) {
            const d = Math.atan2(dz, dx) - s.heading;
            motionSlip = Math.atan2(Math.sin(d), Math.cos(d));
          }
          car.setPosition(s.x, 0.4, s.z);
          // Vehicle heading h moves along [cos h, 0, sin h]; node yaw maps
          // local +z onto that direction.
          car.setRotation(0, Math.atan2(Math.cos(s.heading), Math.sin(s.heading)), 0);
        },
        telemetry: () => {
          const s = vehicle.snapshot();
          return {
            x: s.x,
            z: s.z,
            heading: s.heading,
            speed: s.speed,
            slipAngle: s.slipAngle ?? 0,
            motionSlip,
            drifting: s.drifting ?? false
          };
        }
      };
    }
  };
}

function tier(): HarnessScene {
  const nodes: HarnessNodeSpec[] = [
    { id: "tier-subject", position: [3, 0.9, 0], size: [0.8, 1.8, 0.8], color: "#f59e0b" },
    // Between the static camera ([0,6,14] → [0,1,0]) and the subject circle.
    { id: "tier-wall", position: [0, 2.5, 7], size: [7, 3, 0.4], color: "#94a3b8" }
  ];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    nodes.push({ id: `tier-pillar-${i}`, position: [Math.cos(a) * 7, 1.5, Math.sin(a) * 7], size: [0.6, 3, 0.6], color: "#64748b" });
  }
  return {
    kind: "tier",
    nodes,
    camera: { position: [0, 6, 14], target: [0, 1, 0], fov: 50 },
    bind(handles) {
      const subject = handles[0]!;
      let simTime = 0;
      return {
        move(dt) {
          simTime += dt;
          subject.setPosition(Math.cos(simTime * 0.8) * 3, 0.9, Math.sin(simTime * 0.8) * 3);
        }
      };
    }
  };
}

/**
 * Resolve the `?scene=` scene. The fighters fixture is fetched from the dev
 * server by default; the unit suite injects the same JSON file's contents.
 */
export async function loadHarnessScene(
  kind: string | null,
  params: URLSearchParams,
  loadFighters: () => Promise<unknown> = async () => {
    const res = await fetch("/tests/qr/prd08/fixtures/fighters.json");
    if (!res.ok) throw new Error(`fighters fixture: HTTP ${res.status}`);
    return res.json();
  }
): Promise<HarnessScene> {
  switch (kind ?? "orbiters") {
    case "orbiters":
      return orbiters();
    case "fighters":
      return fighters((await loadFighters()) as FighterFixture);
    case "chase":
      return chase();
    case "wall":
      return wall();
    case "tier":
      return tier();
    case "drift": {
      const model = params.get("model") ?? "bicycle";
      if (model !== "bicycle" && model !== "unicycle") throw new Error(`drift: unknown model ${model}`);
      return drift(model);
    }
    default:
      throw new Error(`unknown harness scene ${kind}`);
  }
}
