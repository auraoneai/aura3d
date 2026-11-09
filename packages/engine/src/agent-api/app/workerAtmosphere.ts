/**
 * PRD-07 atmosphere for the render worker.
 *
 * A main-thread app installs the `prd07.atmosphere` C-38 extension: a
 * ProductionEffectSystem tracks the scene's fog/sky nodes on a LiveAtmosphere
 * and the compiler's fog (compiler/fog.ts, A3D_QR_VFX_FOG) reads that live
 * state through the app's runtime owner. The worker has no app, so without
 * this binding its frames took the legacy fog path (an exp2 approximation of
 * an authored linear fog), which drew a different, brighter sky band than the
 * main-thread frame (Aura Hoops ?worker=1).
 *
 * The worker installs the same extension on a minimal app-like owner (its
 * OffscreenCanvas, scene, runtime node registry, frame callbacks) and seals
 * it to the renderer's runtime owner, so the compiler resolves the same fog
 * spec, the VFX render-source overlay feeds the prd07 fog/sky contributors,
 * and the renderer receives the same PRD-07 mount authority as an app mount.
 */
import type { AuraRuntimeNodeRegistry, AuraSceneSnapshot } from "../nodes/types.js";
import type { QrFlags } from "@aura3d/rendering/contracts";
import type { Prd07MountAuthority } from "../vfx/bridge.js";
import type { AuraAppAtmosphere } from "../../contracts/atmosphere.js";

export interface WorkerAtmosphereBinding {
  /** Run the atmosphere's frame callbacks (fog transitions) and note the scene camera before a worker frame. */
  tick(timeMs: number): void;
  /** The app-style PRD-07 mount authority for the renderer (undefined: none issued). */
  mountAuthority(): Prd07MountAuthority | undefined;
  /** 5.4: the atmosphere controls a main-thread app exposes as `app.atmosphere` (host calls are replayed here). */
  readonly controls: AuraAppAtmosphere;
  dispose(): void;
}

type FrameCallback = (frame: { dt: number }) => void;

/** True when the main-thread app would install a real (non-stub) atmosphere for these flags. */
export function workerAtmosphereWanted(flags: QrFlags): boolean {
  return flags.on("A3D_QR_VFX") || flags.on("A3D_QR_VFX_FOG") || flags.on("A3D_QR_VFX_SKY");
}

function cameraPose(scene: AuraSceneSnapshot): { position: [number, number, number]; forward: [number, number, number] } | undefined {
  const camera = scene.camera as { position?: readonly number[]; target?: readonly number[] } | undefined;
  const position = camera?.position;
  if (!position || position.length < 3 || !position.slice(0, 3).every(Number.isFinite)) return undefined;
  const target = camera?.target;
  let forward: [number, number, number] = [0, 0, -1];
  if (target && target.length >= 3 && target.slice(0, 3).every(Number.isFinite)) {
    const dx = target[0]! - position[0]!, dy = target[1]! - position[1]!, dz = target[2]! - position[2]!;
    const length = Math.hypot(dx, dy, dz);
    if (length > 1e-9) forward = [dx / length, dy / length, dz / length];
  }
  return { position: [position[0]!, position[1]!, position[2]!], forward };
}

/**
 * Install the PRD-07 atmosphere for one worker renderer owner. Returns null
 * when the flags keep the stub atmosphere (the compiler then uses its
 * flag-off fog path, as the main thread does).
 */
export async function bindWorkerAtmosphere(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  owner: object,
  scene: AuraSceneSnapshot,
  nodes: AuraRuntimeNodeRegistry,
  flags: QrFlags
): Promise<WorkerAtmosphereBinding | null> {
  if (!workerAtmosphereWanted(flags)) return null;
  const [{ createAtmosphereExtension, bindAtmosphereRuntimeOwner, disposeAtmosphereExtension }, { bindPrd07AppRuntimeOwner, prd07MountAuthorityFor, prd07SystemFor }] = await Promise.all([
    import("../vfx/atmosphere-api.js"), import("../vfx/effects-api.js")
  ]);
  const callbacks = new Set<FrameCallback>();
  const app = {
    canvas,
    scene,
    nodes,
    onFrame(callback: FrameCallback): () => void {
      callbacks.add(callback);
      return () => { callbacks.delete(callback); };
    }
  };
  const asApp = app as unknown as Parameters<typeof createAtmosphereExtension>[0];
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    callbacks.clear();
    disposeAtmosphereExtension(asApp);
  };
  let controls: AuraAppAtmosphere;
  try {
    controls = createAtmosphereExtension(asApp, { flags });
    bindPrd07AppRuntimeOwner(asApp, owner);
    bindAtmosphereRuntimeOwner(asApp, owner);
  } catch (error) {
    try { dispose(); } catch { /* keep the installation failure */ }
    throw error;
  }
  let last: number | undefined;
  return {
    controls,
    tick(timeMs) {
      if (disposed) return;
      const pose = cameraPose(app.scene);
      if (pose) prd07SystemFor(asApp)?.atmosphere.noteCamera(pose.position, pose.forward);
      const dt = last === undefined || !Number.isFinite(timeMs) ? 0 : Math.min(0.1, Math.max(0, (timeMs - last) / 1000));
      if (Number.isFinite(timeMs)) last = timeMs;
      for (const callback of [...callbacks]) {
        if (callbacks.has(callback)) callback({ dt });
      }
    },
    mountAuthority() {
      if (disposed) return undefined;
      return prd07MountAuthorityFor(asApp, canvas as HTMLCanvasElement, owner) ?? undefined;
    },
    dispose
  };
}
