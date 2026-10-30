import { camera, createAuraApp, effects, lights, material, primitives, scene, type AuraSceneBuilder } from "@aura3d/engine";

/**
 * GU47 WP-6 (E-F) receipt harness, root public API only. Open with `?vfxdebug=1` so the effect system publishes
 * `window.__AURA_VFX_DEBUG__()` (sprite load state, live trails, notes).
 *
 * - `?mode=sprites`: four emitters side by side, left to right: the analytic soft-dot (reference), then the atlas
 *   sprites `smoke-a`, `dust-mote` and `splash`. Receipt `vfx-atlas-sprites`: the three sprite emitters render as
 *   their sprites, not as dots.
 * - `?mode=trail`: a sphere runs along +X at 25 m/s and back; `app.effects.trail(runner, { width, life: 1.5 })`
 *   follows it. Receipt `vfx-trail`: a ribbon >= 30 m long behind the moving node, no `VFX_TRAIL_PENDING`.
 *
 * Software WebGL2 presents a frame every few seconds; the app loop clamps a frame to 0.1 s of simulation, so the
 * runner advances 2.5 m per presented frame and the spec polls the debug hook instead of sleeping a fixed time.
 */

type Mode = "sprites" | "trail";

interface HarnessState {
  status: "booting" | "ready" | "error";
  mode: Mode;
  error?: string;
  frames: number;
  runnerX?: number;
  trail?: { readonly length: number; readonly pointCount: number; readonly alive: boolean };
}

declare global {
  interface Window {
    __AURA3D_GU47_VFX__?: HarnessState;
  }
}

const params = new URLSearchParams(location.search);
const mode: Mode = params.get("mode") === "trail" ? "trail" : "sprites";
const state: HarnessState = { status: "booting", mode, frames: 0 };
window.__AURA3D_GU47_VFX__ = state;

export const SPRITE_COLUMNS = [
  { name: "reference soft-dot", x: -4.5, sprite: undefined },
  { name: "smoke-a", x: -1.5, sprite: "smoke-a" },
  { name: "dust-mote", x: 1.5, sprite: "dust-mote" },
  { name: "splash", x: 4.5, sprite: "splash" }
] as const;

function spritesScene(): AuraSceneBuilder {
  const builder = scene().background("#0b1018").camera(camera.perspective({ position: [0, 1.4, 9], target: [0, 1.2, 0], fov: 50 }));
  builder.add(primitives.plane({ name: "gu47 ground", material: material.pbr({ color: "#1a212c", roughness: 0.95, metallic: 0 }) }).position(0, 0, 0).scale([16, 1, 8]).toJSON());
  builder.add(lights.studio({ intensity: 0.6 }).toJSON());
  for (const column of SPRITE_COLUMNS) {
    builder.add(effects.particles({
      name: `gu47 sprite ${column.name}`,
      position: [column.x, 1.2, 0],
      emitter: "ambient",
      radius: 0.35,
      particleCount: 48,
      emissionRate: 24,
      lifetime: [1.6, 2.4],
      size: [0.7, 1.0],
      speed: 0.25,
      gravity: 0,
      materialMode: "soft-alpha",
      color: "#f2f0ea",
      seed: 1414,
      ...(column.sprite ? { sprite: column.sprite } : {})
    }).toJSON());
  }
  return builder;
}

function trailScene(): AuraSceneBuilder {
  const builder = scene().background("#0b1018").camera(camera.perspective({ position: [0, 22, 44], target: [0, 0, 0], fov: 55 }));
  builder.add(primitives.plane({ name: "gu47 track", material: material.pbr({ color: "#1d2430", roughness: 0.9, metallic: 0 }) }).position(0, 0, 0).scale([90, 1, 14]).toJSON());
  builder.add(primitives.sphere({ name: "gu47 runner", material: material.emissive({ color: "#ffd27a", emissive: "#ffb347", emissiveIntensity: 1.4 }) }).position(-40, 1, 0).scale(0.8).runtime({ id: "gu47-runner" }).toJSON());
  builder.add(lights.studio({ intensity: 0.6 }).toJSON());
  return builder;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const app = createAuraApp(canvas, {
    scene: mode === "trail" ? trailScene() : spritesScene(),
    pixelRatio: 1,
    resize: false,
    loop: { maxFrameDt: 0.1 },
    qualityRebuild: { flags: ["vfx"] }
  } as never) as unknown as {
    onFrame(cb: (frame: { dt: number }) => void): () => void;
    nodes: { get(id: string): { setPosition(x: number, y: number, z: number): unknown } | undefined };
    effects?: { trail(target: string, options: { width: number; life: number; color: string }): { readonly length: number; readonly pointCount: number; readonly alive: boolean } };
  };
  if (mode === "trail") {
    const trail = app.effects?.trail("gu47-runner", { width: 0.6, life: 1.5, color: "#ffcc66" });
    let x = -40;
    let direction = 1;
    app.onFrame((frame) => {
      x += direction * 25 * frame.dt;
      if (x > 40) direction = -1;
      if (x < -40) direction = 1;
      app.nodes.get("gu47-runner")?.setPosition(x, 1, 0);
      state.runnerX = x;
      state.trail = trail ? { length: trail.length, pointCount: trail.pointCount, alive: trail.alive } : undefined;
    });
  }
  app.onFrame(() => { state.frames += 1; });
  state.status = "ready";
}

boot().catch((error: unknown) => {
  state.status = "error";
  state.error = error instanceof Error ? error.message : String(error);
});
