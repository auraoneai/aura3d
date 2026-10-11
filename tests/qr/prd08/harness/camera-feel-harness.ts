/**
 * L-8 lane benchmark harness page: `createAuraApp` on a canvas + the DOM-free
 * pipeline (`pipeline.ts`: `FixedStepDriver` on the app's C-23 `app.time`, the
 * interpolation store, the scripted rAF clock, per-presented-frame records)
 * over a harness scene (`scenes.ts`). Playwright drives `requestAnimationFrame`
 * with a scripted clock; this page only exposes the pipeline and the mounted
 * app on `window.__AURA3D_PRD08_HARNESS__`.
 *
 * Query params:
 *   ?scene=orbiters|fighters|chase|wall|drift|tier   harness scene (default orbiters)
 *   ?model=bicycle|unicycle  drift scene vehicle model
 *   ?scripted=1              scripted rAF clock (tick(dtMs) pumps one frame)
 *   ?fixedDt=1/60            loop fixed step seconds (default)
 *   ?maxSubSteps=6           overload cap (S2 uses 6)
 *   ?interpolation=0|1       interpolation flag (default on)
 *   ?renderPerSubstep=1      legacy one-render-per-substep behaviour (S1 fail)
 *   ?overload=slow-motion|catch-up   (default: the loop's clamp policy)
 *   ?coi=1                   served cross-origin isolated (COOP/COEP, dev-server.ts)
 *                            so performance.now() has 5 µs resolution (S19 CPU)
 */
import { createAuraApp, type AuraApp } from "@aura3d/engine";
import { createChaseRig, createFightingRig, createOrbitRig, createRailRig } from "@aura3d/engine/lanes";
import { mountHarnessPipeline, type FrameRecord } from "./pipeline";
import { runScenario } from "./scenarios";
import { buildHarnessScene, loadHarnessScene, type HarnessScene, type HarnessVehicleInput } from "./scenes";

interface HarnessState {
  status: "booting" | "ready" | "error";
  error?: string;
  scene?: HarnessScene["kind"];
  nodeIds: readonly string[];
  records: FrameRecord[];
  driver?: { renderSubmissionsLastTick: number; step(dt: number): unknown; dispose(): void };
  /** Scripted mode only (?scripted=1): pump one presented frame at dtMs. */
  tick?: (dtMs: number) => void;
  /** The mounted app (verbatim) — camera-feel.spec.ts drives app.camera/app.feel. */
  app?: AuraApp;
  /** Drift scene: mutable vehicle input read by the sim mover each substep. */
  vehicleInput?: HarnessVehicleInput;
  /**
   * Rig modules register their `camera.rigs.<name>` factory on import and
   * tree-shake otherwise (S19); referencing them here keeps chase / orbit /
   * rail / fighting mounted for the spec, as a game importing them would.
   */
  rigFactories: Readonly<Record<string, unknown>>;
  /** Run a named scenario (scenarios.ts) against the mounted app; JSON out. */
  run?: (name: string, opts?: unknown) => unknown;
  csv(): string;
}

declare global {
  interface Window {
    __AURA3D_PRD08_HARNESS__?: HarnessState;
  }
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const state: HarnessState = {
    status: "booting",
    nodeIds: [],
    records: [],
    rigFactories: { createChaseRig, createFightingRig, createOrbitRig, createRailRig },
    csv: () => ""
  };
  window.__AURA3D_PRD08_HARNESS__ = state;
  try {
    const def = await loadHarnessScene(params.get("scene"), params);
    state.scene = def.kind;
    const mount = document.getElementById("mount")!;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    mount.append(canvas);
    const app: AuraApp = createAuraApp(canvas, {
      scene: buildHarnessScene(def),
      pixelRatio: 1,
      resize: false,
      qualityRebuild: { flags: ["camera", "camera.loop", "camera.interpolation"] }
    });
    const pipeline = mountHarnessPipeline(app, def, params);
    state.nodeIds = pipeline.nodeIds;
    state.records = pipeline.records;
    state.driver = pipeline.driver;
    state.tick = pipeline.tick;
    state.vehicleInput = pipeline.vehicleInput;
    state.csv = () => pipeline.csv();
    state.run = (name, opts) => runScenario({ app, pipeline }, name, opts);
    // Feel/camera spec surface: the mounted app is exposed verbatim so the
    // spec drives app.camera / app.feel / app.time exactly as a game would.
    state.app = app;

    const hud = document.getElementById("hud");
    setInterval(() => {
      if (!hud) return;
      const last = state.records.at(-1);
      hud.textContent = `prd08 harness (${def.kind})\nframes ${state.records.length}\nsim ${last?.simTime.toFixed(2) ?? "0.00"}s\nalpha ${last?.alpha.toFixed(2) ?? "-"}\nrenders/tick ${last?.renderSubmissionsLastTick ?? "-"}`;
    }, 250);

    state.status = "ready";
  } catch (error) {
    state.status = "error";
    state.error = error instanceof Error ? error.stack ?? error.message : String(error);
  }
}

void boot();
