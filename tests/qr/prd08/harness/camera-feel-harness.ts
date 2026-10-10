/**
 * L-8 lane benchmark harness: `createAuraApp` + `FixedStepDriver` (no
 * `createGameApp` dependency) presenting a scene of 20 runtime nodes that move
 * every sim step. Playwright drives `requestAnimationFrame` with a scripted
 * clock (frame-pacing.spec.ts); this page only records per-presented-frame:
 *   `performance.now()`, `simTime`, presented (interpolated) node positions,
 *   `renderSubmissionsLastTick` — into `window.__AURA3D_PRD08_HARNESS__`.
 *
 * Query params:
 *   ?fixedDt=1/60            loop fixed step seconds (default)
 *   ?maxSubSteps=6           overload cap (S2 uses 6)
 *   ?interpolation=0|1       interpolation flag (default on)
 *   ?renderPerSubstep=1      legacy one-render-per-substep behaviour (S1 fail)
 *   ?overload=clamp|slow-motion|catch-up
 */
import {
  camera,
  createAuraApp,
  lights,
  primitives,
  scene,
  type AuraApp,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { createFixedStepDriver, createInterpolationStore } from "@aura3d/engine/lanes";
import { resolveQrFlags } from "@aura3d/engine/contracts";

interface FrameRecord {
  readonly t: number;
  readonly simTime: number;
  readonly alpha: number;
  readonly realDt: number;
  readonly renderSubmissionsLastTick: number;
  readonly positions: readonly (readonly [number, number, number])[];
}

interface HarnessState {
  status: "booting" | "ready" | "error";
  error?: string;
  records: FrameRecord[];
  driver?: { renderSubmissionsLastTick: number; step(dt: number): unknown; dispose(): void };
  /** Scripted mode only (?scripted=1): pump one presented frame at dtMs. */
  tick?: (dtMs: number) => void;
  /** The mounted app (verbatim) — camera-feel.spec.ts drives app.camera/app.feel. */
  app?: AuraApp;
  csv(): string;
}

declare global {
  interface Window {
    __AURA3D_PRD08_HARNESS__?: HarnessState;
  }
}

const NODE_COUNT = 20;
const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => {
  const v = Number(params.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

function makeScene() {
  let builder = scene().add(lights.studio({ intensity: 1.2 }));
  for (let i = 0; i < NODE_COUNT; i += 1) {
    const a = (i / NODE_COUNT) * Math.PI * 2;
    builder = builder.add(
      primitives.box({
        name: `harness-node-${i}`,
        size: [0.4, 0.4, 0.4],
        position: [Math.cos(a) * 4, 1 + (i % 3) * 0.4, Math.sin(a) * 4],
        material: { name: `harness-node-${i}`, color: `#${((0x33 + i * 9) << 16 | 0x80 << 8 | 0xe0).toString(16).padStart(6, "0")}` }
      }).runtime({ id: `harness-node-${i}` })
    );
  }
  return builder.camera(
    camera.perspective({ position: [0, 7, 12], target: [0, 1, 0], fov: 50 })
  );
}

async function boot() {
  const state: HarnessState = {
    status: "booting",
    records: [],
    csv() {
      const lines = ["t,simTime,alpha,realDt,renderSubmissionsLastTick,positions"];
      for (const r of state.records) {
        lines.push(
          `${r.t.toFixed(3)},${r.simTime.toFixed(4)},${r.alpha.toFixed(4)},${r.realDt.toFixed(4)},${r.renderSubmissionsLastTick},"${r.positions
            .map((p) => `${p[0].toFixed(3)} ${p[1].toFixed(3)} ${p[2].toFixed(3)}`)
            .join("|")}"`
        );
      }
      return lines.join("\n");
    }
  };
  window.__AURA3D_PRD08_HARNESS__ = state;
  try {
    const mount = document.getElementById("mount")!;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    mount.append(canvas);
    const app: AuraApp = createAuraApp(canvas, {
      scene: makeScene(),
      pixelRatio: 1,
      resize: false,
      qualityRebuild: { flags: ["camera", "camera.loop", "camera.interpolation"] }
    });

    const handles: AuraRuntimeNodeHandle[] = [];
    const store = createInterpolationStore();
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const handle = app.nodes.get(`harness-node-${i}`) as AuraRuntimeNodeHandle | undefined;
      if (!handle) throw new Error(`harness-node-${i} missing`);
      store.attachTimeExtension(handle);
      (handle as { interpolate?: boolean }).interpolate = true;
      handles.push(handle);
    }

    // Sim: each node orbits its seed radius once per ~4 s; positions move on
    // every substep so interpolation differences are visible in records.
    const centers = handles.map((h) => [...h.position] as [number, number, number]);
    let simTime = 0;
    const moveNodes = (dt: number) => {
      simTime += dt;
      for (let i = 0; i < handles.length; i += 1) {
        const a = simTime * (Math.PI / 2) + (i / handles.length) * Math.PI * 2;
        const c = centers[i]!;
        const r = Math.hypot(c[0], c[2]) || 4;
        handles[i]!.setPosition(Math.cos(a) * r, c[1] + Math.sin(simTime * 2 + i) * 0.25, Math.sin(a) * r);
      }
    };

    const flags = resolveQrFlags({ options: ["camera.loop", "camera.interpolation"] });
    const scripted = params.get("scripted") === "1";
    // Scripted mode: own the rAF queue + the loop clock so each tick() pumps
    // exactly one presented frame at a caller-chosen interval (60/120/144 Hz,
    // 100/250 ms gaps) — the L-9 scripted-clock path of §20.
    let virtualNow = 0;
    const rafQueue: ((t: number) => void)[] = [];
    const driver = createFixedStepDriver(
      {
        advance: (dt: number) => {
          moveNodes(dt);
          app.advance(dt);
        },
        step: (dt: number) => app.step(dt)
      },
      {
        // useRaf stays true: scripted mode swaps the callback transport
        // (requestFrame) rather than disabling the loop's rAF path.
        useRaf: true,
        autoStart: true,
        requestFrame: scripted
          ? (cb) => {
              rafQueue.push(cb);
              return rafQueue.length;
            }
          : undefined,
        cancelFrame: scripted ? (h) => void (rafQueue[h - 1] = () => undefined) : undefined,
        now: scripted ? () => virtualNow : undefined,
        fixedDt: num("fixedDt", 1 / 60),
        maxSubSteps: params.has("maxSubSteps") ? Math.floor(num("maxSubSteps", 5)) : 5,
        overload: (params.get("overload") as "clamp" | "slow-motion" | "catch-up" | null) ?? undefined,
        renderPerSubstep: params.get("renderPerSubstep") === "1",
        interpolation: params.get("interpolation") !== "0",
        interpolationStore: store,
        flags
      }
    );
    state.driver = driver;
    if (scripted) {
      state.tick = (dtMs: number) => {
        virtualNow += dtMs;
        const pending = rafQueue.splice(0, rafQueue.length);
        for (const cb of pending) cb(virtualNow);
      };
    }

    driver.onRender((frame) => {
      const records = state.records;
      if (records.length > 2000) records.shift();
      records.push({
        t: performance.now(),
        simTime: frame.simTime,
        alpha: frame.alpha,
        realDt: frame.realDt,
        renderSubmissionsLastTick: driver.renderSubmissionsLastTick,
        positions: handles.map((h) => {
          const resolved = store.resolveHandle(h.id, frame.alpha);
          const p = resolved?.position ?? h.position;
          return [p[0], p[1], p[2]] as const;
        })
      });
    });

    // Feel/camera spec surface (camera-feel.spec.ts): the mounted app is
    // exposed verbatim so the spec drives app.camera / app.feel exactly as a
    // game would — no test-only hooks.
    state.app = app;

    const hud = document.getElementById("hud");
    setInterval(() => {
      if (!hud) return;
      const last = state.records.at(-1);
      hud.textContent = `prd08 harness\nframes ${state.records.length}\nsim ${last?.simTime.toFixed(2) ?? "0.00"}s\nalpha ${last?.alpha.toFixed(2) ?? "-"}\nrenders/tick ${last?.renderSubmissionsLastTick ?? "-"}`;
    }, 250);

    state.status = "ready";
  } catch (error) {
    state.status = "error";
    state.error = error instanceof Error ? error.stack ?? error.message : String(error);
  }
}

void boot();
