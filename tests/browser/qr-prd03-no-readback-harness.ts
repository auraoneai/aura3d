/**
 * PRD-03 §6.9 (Phase 3): the v2 post chain never touches the CPU. This
 * harness mounts a post-heavy flag-on app — S2 GTAO (`ambient-occlusion`),
 * S4 god rays (`volumetric-fog` + a directional light), S9 bloom and the
 * LDR tail (`vignette`, `film-grain`, `chromatic-aberration`) — steps it 300
 * frames, and counts readbacks two ways:
 *
 *  - `device.counters().readbacks` as surfaced through
 *    `diagnostics().frame.readbacksThisFrame` (C-28 wrap of `readPixels`,
 *    `readFloatPixels`, `readDepthPixels`, `readPixelsAsync`,
 *    `readFloatPixelsAsync`), and
 *  - a raw `gl.readPixels` wrap on the app's own context — any path that
 *    bypasses the device interface is still caught.
 *
 * Also returns `diagnostics().post.skipped` so the spec can assert the S2
 * pending marker and the stage list.
 */
import { camera, createAuraApp, effects, lights, material, primitives, scene } from "@aura3d/engine";

export interface NoReadbackResult {
  readonly frames: number;
  readonly deviceReadbacks: number;
  readonly glReadbacks: number;
  readonly skipped: readonly string[];
  readonly stages: readonly string[];
  readonly error?: string;
}

export async function runPostNoReadbackProbe(frameCount = 300): Promise<NoReadbackResult> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-2000px;top:0;width:320px;height:320px;";
  document.body.appendChild(host);
  try {
    const built = scene()
      .background("#04070c")
      .camera(camera.perspective({ position: [0, 1.4, 6], target: [0, 0.8, -4], fov: 50, near: 0.1, far: 80 }))
      .add(lights.directional({ name: "key", color: "#cfd8ff", intensity: 2.4, position: [4, 7, 2], target: [0, 0, -4] }))
      .add(lights.ambient({ name: "amb", color: "#1a2233", intensity: 0.4 }))
      .add(primitives.plane({ name: "floor", size: [30, 1, 30], material: material.pbr({ color: "#141a24", roughness: 0.95 }) }).position(0, 0, -6))
      .add(primitives.box({ name: "crate", size: [1, 1, 1], material: material.pbr({ color: "#232c38", roughness: 0.85 }) }).position(0.3, 0.5, -4))
      .add(primitives.cylinder({ name: "pillar", size: [0.4, 3, 0.4], material: material.pbr({ color: "#1d2530", roughness: 0.9 }) }).position(-1.6, 1.5, -6))
      .add(effects.ambientOcclusion({ radius: 0.35, intensity: 0.9 }))
      .add(effects.volumetricFog({ intensity: 0.5, density: 0.12, color: "#8b9ec7" }))
      .add(effects.bloom({ intensity: 0.4, threshold: 1.1 }))
      .add(effects.vignette({ intensity: 0.4 }))
      .add(effects.filmGrain({ intensity: 0.05 }))
      .add(effects.chromaticAberration({ intensity: 0.002 }));
    const app = createAuraApp(host, {
      scene: built,
      renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
      pixelRatio: 1,
      resize: false,
      autoStart: false,
      qualityRebuild: { flags: ["A3D_QR_POST"] }
    });
    await app.ready();

    const canvas = host.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") as WebGL2RenderingContext | null;
    let glReadbacks = 0;
    const original = gl?.readPixels;
    if (gl && original) {
      gl.readPixels = function wrappedReadPixels(this: WebGL2RenderingContext, ...args: Parameters<WebGL2RenderingContext["readPixels"]>) {
        glReadbacks += 1;
         
        return (original as any).apply(this, args);
      } as WebGL2RenderingContext["readPixels"];
    }

    let deviceReadbacks = 0;
    for (let i = 0; i < frameCount; i += 1) {
      app.step(1 / 60);
      const frame = (app.diagnostics() as { frame?: { readbacksThisFrame?: number } }).frame;
      deviceReadbacks += frame?.readbacksThisFrame ?? 0;
    }
    if (gl && original) {
      gl.readPixels = original;
    }
    const diagnostics = app.diagnostics() as { post?: { skipped?: readonly string[]; stages?: readonly string[] } };
    const skipped = diagnostics.post?.skipped ?? [];
    const stages = diagnostics.post?.stages ?? [];
    app.dispose();
    return { frames: frameCount, deviceReadbacks, glReadbacks, skipped, stages };
  } catch (error) {
    return {
      frames: 0,
      deviceReadbacks: -1,
      glReadbacks: -1,
      skipped: [],
      stages: [],
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    host.remove();
  }
}

(window as unknown as { runQrPrd03NoReadback: typeof runPostNoReadbackProbe }).runQrPrd03NoReadback = runPostNoReadbackProbe;
