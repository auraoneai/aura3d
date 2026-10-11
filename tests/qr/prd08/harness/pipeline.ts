/**
 * PRD-08 harness pipeline — the DOM-free core of camera-feel-harness.ts:
 * `FixedStepDriver` on the app's C-23 `app.time`, the interpolation store over
 * the scene's runtime nodes, the scripted rAF clock and the per-presented-
 * frame records. The page mounts it on a canvas app; the unit suite
 * (`unit/harness-pipeline.test.ts`) mounts the same code on a headless app so
 * the browser specs' numeric assertions are exercised before a remote run.
 */
import type { AuraApp, AuraRuntimeNodeHandle } from "@aura3d/engine";
import {
  TimeController,
  createFixedStepDriver,
  createInterpolationStore,
  type FixedStepDriver
} from "@aura3d/engine/lanes";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { HarnessScene, HarnessVehicleInput } from "./scenes";

export type Vec3 = readonly [number, number, number];

export interface FrameRecord {
  readonly t: number;
  readonly simTime: number;
  readonly alpha: number;
  readonly realDt: number;
  readonly renderSubmissionsLastTick: number;
  readonly positions: readonly Vec3[];
  /** Sim-state (un-interpolated) node positions — what rigs track. */
  readonly simPositions: readonly Vec3[];
  readonly camera: { readonly position: Vec3; readonly target: Vec3; readonly fov: number; readonly roll: number };
  /** `app.camera.evidence().viewProjection` (column-major) this frame. */
  readonly viewProjection: readonly number[];
  readonly layerEnergy: number;
  readonly telemetry?: Readonly<Record<string, number | boolean>>;
}

export interface HarnessPipeline {
  readonly driver: FixedStepDriver;
  readonly records: FrameRecord[];
  readonly nodeIds: readonly string[];
  readonly vehicleInput?: HarnessVehicleInput;
  /** Scripted mode only: pump one presented frame at dtMs. */
  readonly tick?: (dtMs: number) => void;
  csv(): string;
}

interface CameraSurface {
  presented(): { position: readonly number[]; target: readonly number[]; fov: number; roll: number };
  evidence(): { layers: readonly { energy: number }[]; viewProjection: readonly number[] };
  present(realDt: number, timeMs: number, subjectPosition?: (id: string) => readonly number[] | undefined): unknown;
}

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];

function numParam(params: URLSearchParams, key: string, fallback: number): number {
  const v = Number(params.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** `?overload=` → the loop policy (default: the loop's own clamp default). */
function overloadParam(params: URLSearchParams): "slow-motion" | "catch-up" | undefined {
  const v = params.get("overload");
  if (v === null) return undefined;
  if (v === "slow-motion" || v === "catch-up") return v;
  throw new Error(`unknown ?overload=${v} (slow-motion | catch-up)`);
}

export function mountHarnessPipeline(
  app: AuraApp,
  def: HarnessScene,
  params: URLSearchParams,
  now: () => number = () => performance.now()
): HarnessPipeline {
  // Fail closed: with A3D_QR_CAMERA off `app.time` is the PR 0a stub and
  // nothing the specs measure would be the real controller.
  const time = (app as unknown as { time?: unknown }).time;
  if (!(time instanceof TimeController)) {
    throw new Error("app.time is not the C-23 TimeController (A3D_QR_CAMERA not on for this app)");
  }
  const cam = (app as unknown as { camera?: CameraSurface }).camera;
  if (!cam || typeof cam.evidence !== "function" || typeof cam.present !== "function") {
    throw new Error("app.camera is not the real C-22 controller (no present seam)");
  }

  const nodeIds = def.nodes.map((n) => n.id);
  const handles: AuraRuntimeNodeHandle[] = [];
  const store = createInterpolationStore();
  for (const id of nodeIds) {
    const handle = app.nodes.get(id) as AuraRuntimeNodeHandle | undefined;
    if (!handle) throw new Error(`${id} missing`);
    store.attachTimeExtension(handle);
    (handle as { interpolate?: boolean }).interpolate = true;
    handles.push(handle);
  }
  const binding = def.bind(handles);

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
        binding.move(dt);
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
      fixedDt: numParam(params, "fixedDt", 1 / 60),
      maxSubSteps: params.has("maxSubSteps") ? Math.floor(numParam(params, "maxSubSteps", 5)) : 5,
      overload: overloadParam(params),
      renderPerSubstep: params.get("renderPerSubstep") === "1",
      interpolation: params.get("interpolation") !== "0",
      interpolationStore: store,
      time,
      camera: cam,
      flags
    }
  );

  const records: FrameRecord[] = [];
  driver.onRender((frame) => {
    if (records.length > 4000) records.shift();
    const pose = cam.presented();
    const evidence = cam.evidence();
    records.push({
      t: now(),
      simTime: frame.simTime,
      alpha: frame.alpha,
      realDt: frame.realDt,
      renderSubmissionsLastTick: driver.renderSubmissionsLastTick,
      // Interpolation off: the presented transform IS the sim state.
      positions: handles.map((h) =>
        v3((driver.interpolation ? store.resolveHandle(h.id, frame.alpha)?.position : undefined) ?? h.position)
      ),
      simPositions: handles.map((h) => v3(h.position)),
      camera: { position: v3(pose.position), target: v3(pose.target), fov: pose.fov, roll: pose.roll },
      viewProjection: [...evidence.viewProjection],
      layerEnergy: evidence.layers.reduce((sum, l) => sum + Math.abs(l.energy), 0),
      telemetry: binding.telemetry?.()
    });
  });

  return {
    driver,
    records,
    nodeIds,
    vehicleInput: binding.vehicleInput,
    tick: scripted
      ? (dtMs: number) => {
          virtualNow += dtMs;
          const pending = rafQueue.splice(0, rafQueue.length);
          for (const cb of pending) cb(virtualNow);
        }
      : undefined,
    csv() {
      const lines = ["t,simTime,alpha,realDt,renderSubmissionsLastTick,positions"];
      for (const r of records) {
        lines.push(
          `${r.t.toFixed(3)},${r.simTime.toFixed(4)},${r.alpha.toFixed(4)},${r.realDt.toFixed(4)},${r.renderSubmissionsLastTick},"${r.positions
            .map((p) => `${p[0].toFixed(3)} ${p[1].toFixed(3)} ${p[2].toFixed(3)}`)
            .join("|")}"`
        );
      }
      return lines.join("\n");
    }
  };
}
