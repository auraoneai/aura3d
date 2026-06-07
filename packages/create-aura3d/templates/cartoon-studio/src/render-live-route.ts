/**
 * render-live-route.ts — a REAL 3D render path for Cartoon Studio.
 *
 * This is an ADDITIVE, second route (it does not touch `main.ts` or any existing
 * `tests/`). Where the `createAuraApp` storyboard route cannot skin GLB
 * characters, this route proves the renderer CAN: it loads two real rigged GLB
 * characters, builds a skinning-capable animation runtime for each, renders them
 * on a ground plane with the advanced-runtime `A3DRenderer`, and exposes a seek
 * hook so a headless capturer can pose any animation time and read back pixels
 * that visibly change as the skeleton moves.
 *
 * Imports resolve from the template's own `@aura3d/engine` (published build):
 *   - `A3DRenderer`        via `@aura3d/engine/advanced-runtime`
 *   - `createTypedGLBActor` via `@aura3d/engine/production-runtime`
 *   - render primitives     via `@aura3d/engine/rendering`
 * All three exist in the published engine, so the in-browser skinned render works
 * with the template's shipped dependencies.
 *
 * TOON SHADING NOTE (honest): the published `@aura3d/engine` build does NOT ship
 * `CartoonToonMaterial` or register the `aura3d/cartoon-toon` GLSL program, so a
 * banded toon MATERIAL cannot compile in-browser from the template's deps. The
 * toon treatment is therefore applied as a real pixel post-pass in the capture
 * script (`scripts/render-live.ts`), which resolves the monorepo source build of
 * `@aura3d/rendering` (banded ramp + Sobel outline + storybook grade). This file
 * focuses on the half only the renderer can do: skinned GLB animation in pixels.
 */

import { A3DRenderer } from "@aura3d/engine/advanced-runtime";
import { createStudioLighting, createTypedGLBActor, type TypedGLBActor } from "@aura3d/engine/production-runtime";
// Import render types from `@aura3d/rendering` (not `@aura3d/engine/rendering`):
// `A3DRenderer` and `createTypedGLBActor` are typed against `@aura3d/rendering`,
// and the published install keeps those as a distinct type identity, so using the
// same package here keeps `RenderItem` / `RenderSource` / `Geometry` compatible.
import {
  Geometry,
  PBRMaterial,
  type CollectedLight,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering";
import { composeMat4, quatFromEuler, type Mat4 } from "@aura3d/scene";

interface LiveCharacter {
  readonly actor: TypedGLBActor;
  readonly clip: string;
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly scale: number;
  readonly tint: readonly [number, number, number, number];
}

interface LiveRouteSeekProof {
  readonly time: number;
  readonly drawCalls: number;
  readonly skinnedRenderItems: number;
  readonly characters: readonly {
    readonly id: string;
    readonly clip: string;
    readonly tracksApplied: number;
    readonly skinningPalettesUpdated: number;
    readonly skinningBindingCount: number;
  }[];
}

interface LiveRouteReadyProof {
  readonly ready: true;
  readonly backend: string;
  readonly characters: readonly {
    readonly id: string;
    readonly url: string;
    readonly clip: string;
    readonly clips: readonly string[];
    readonly skinningBindingCount: number;
    readonly skinnedRenderItemCount: number;
  }[];
}

type LiveRouteWindow = Window & {
  __AURA_LIVE_ROUTE_READY__?: LiveRouteReadyProof;
  /** Headless seek hook: pose every character at `time` seconds and render one frame. */
  __auraSeek__?: (time: number) => LiveRouteSeekProof;
};

const GROUND_Y = 0;

// Two distinct rigged GLBs the template already ships in /public/aura-assets.
// Both are real skinned characters with multiple animation clips (verified by
// parsing the GLBs: miko has Idle/Walking/Dance/Punch/..., luma has Idle/Run/Walk).
const CHARACTER_SPECS = [
  {
    id: "miko",
    url: "/aura-assets/miko.047f5e5f.glb",
    clip: "Walking",
    position: [-0.95, GROUND_Y, 0] as const,
    yaw: Math.PI * 0.12,
    // miko's GLB is authored very large; scale it down so the full body frames.
    scale: 0.6,
    tint: [0.96, 0.62, 0.32, 1] as const
  },
  {
    id: "luma",
    url: "/aura-assets/luma.humanoid-fixture.glb",
    clip: "Run",
    position: [1.0, GROUND_Y, 0] as const,
    yaw: -Math.PI * 0.12,
    // luma's GLB is authored small; scale it up to read at a comparable height.
    scale: 1.5,
    tint: [0.42, 0.72, 1, 1] as const
  }
] as const;

export async function mountLiveRenderRoute(): Promise<void> {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("render-live-route: missing #app root element.");
  root.innerHTML = `
    <main style="margin:0;background:#0b0f1a;min-height:100vh;display:grid;place-items:center;">
      <canvas id="live-canvas" width="960" height="540"
        style="width:960px;height:540px;display:block;background:#0b0f1a;"></canvas>
    </main>
  `;
  const canvas = root.querySelector<HTMLCanvasElement>("#live-canvas");
  if (!canvas) throw new Error("render-live-route: missing #live-canvas.");

  const liveWindow = window as LiveRouteWindow;
  const width = canvas.width;
  const height = canvas.height;

  // 1. Load each rigged GLB into a skinning-capable typed actor.
  const characters: LiveCharacter[] = [];
  for (const spec of CHARACTER_SPECS) {
    const actor = await createTypedGLBActor({
      asset: { url: spec.url },
      id: spec.id,
      name: spec.id,
      width,
      height,
      tint: { baseColor: spec.tint, emissiveColor: [spec.tint[0] * 0.18, spec.tint[1] * 0.18, spec.tint[2] * 0.18], emissiveStrength: 0.12 }
    });
    const snapshot = actor.snapshot();
    if (snapshot.skinningBindingCount < 1) {
      throw new Error(`render-live-route: ${spec.id} GLB bound no skinning palettes (skinningBindingCount=${snapshot.skinningBindingCount}).`);
    }
    const clip = snapshot.clips.includes(spec.clip) ? spec.clip : snapshot.clips[0];
    if (!clip) throw new Error(`render-live-route: ${spec.id} GLB has no animation clips.`);
    characters.push({ actor, clip, position: spec.position, yaw: spec.yaw, scale: spec.scale, tint: spec.tint });
  }

  // 2. Create the advanced-runtime renderer (real WebGL2 forward pass + skinning).
  const renderer = await A3DRenderer.create({
    canvas,
    width,
    height,
    backend: "webgl2",
    alpha: false,
    clearColor: [0.043, 0.058, 0.101, 1]
  });

  // 3. Ground plane so the characters are clearly grounded and lit.
  const groundItems = createGroundItems();

  // Real directional key/fill/rim rig from the published production runtime.
  const lights: readonly CollectedLight[] = createStudioLighting({ preset: "softbox", shadows: false, intensityScale: 1 });

  const source: RenderSource = {
    collectRenderItems: () => [
      ...groundItems,
      ...characters.flatMap(collectCharacterItems)
    ],
    cameraPolicy: "auto-frame",
    cameraFrameBounds: { min: [-2.6, -0.1, -1.6], max: [2.6, 3.4, 1.6] },
    collectedLights: lights,
    // A procedural environment map is required so the PBR materials get their
    // env-map + BRDF LUT bindings (the forward pass validates these uniforms).
    environmentLighting: {
      color: [0.4, 0.46, 0.58],
      intensity: 0.5,
      proceduralMap: {
        skyColor: [0.16, 0.22, 0.34],
        horizonColor: [0.22, 0.26, 0.32],
        groundColor: [0.05, 0.06, 0.08],
        specularColor: [0.85, 0.9, 1],
        intensity: 0.6,
        specularIntensity: 0.85
      }
    }
  };

  // Pose every character at `time` and place its root on the ground plane.
  const poseAt = (time: number): LiveRouteSeekProof => {
    const characterProofs: LiveRouteSeekProof["characters"] = characters.map((character) => {
      const apply = character.actor.playClip(character.clip, time);
      const root = character.actor.pipeline.resources.scene.root;
      const rotation = quatFromEuler(0, character.yaw, 0);
      root.transform
        .setPosition(character.position[0], character.position[1], character.position[2])
        .setRotation(rotation[0], rotation[1], rotation[2], rotation[3])
        .setScale(character.scale, character.scale, character.scale);
      return {
        id: character.actor.id,
        clip: apply.clipName,
        tracksApplied: apply.tracksApplied,
        skinningPalettesUpdated: apply.skinningPalettesUpdated,
        skinningBindingCount: character.actor.snapshot().skinningBindingCount
      };
    });
    const diagnostics = renderer.render(source);
    const skinnedRenderItems = characters.reduce(
      (sum, character) => sum + character.actor.collectRenderItems().filter((item) => item.skinning).length,
      0
    );
    return { time, drawCalls: diagnostics.drawCalls, skinnedRenderItems, characters: characterProofs };
  };

  // Expose the headless seek hook + a ready proof for the capturer.
  liveWindow.__auraSeek__ = poseAt;
  liveWindow.__AURA_LIVE_ROUTE_READY__ = {
    ready: true,
    backend: renderer.device.kind,
    characters: characters.map((character) => {
      const snapshot = character.actor.snapshot();
      return {
        id: character.actor.id,
        url: character.actor.asset.url,
        clip: character.clip,
        clips: snapshot.clips,
        skinningBindingCount: snapshot.skinningBindingCount,
        skinnedRenderItemCount: character.actor.evidence.skinnedRenderItemCount
      };
    })
  };

  // Live preview loop (skipped during headless seek capture, which drives poseAt
  // directly). Provides a moving on-screen render when opened in a browser.
  let start = performance.now();
  const loop = (): void => {
    if (!liveWindow.__AURA_LIVE_ROUTE_HEADLESS__) {
      poseAt((performance.now() - start) / 1000);
    }
    window.requestAnimationFrame(loop);
  };
  // Render one deterministic frame immediately so the canvas is never blank.
  poseAt(0);
  start = performance.now();
  window.requestAnimationFrame(loop);
}

function collectCharacterItems(character: LiveCharacter): RenderItem[] {
  return character.actor.collectRenderItems();
}

function createGroundItems(): RenderItem[] {
  const cube = Geometry.litCube(1);
  const ground = new PBRMaterial({
    name: "live-route-ground",
    baseColor: [0.13, 0.15, 0.2, 1],
    metallic: 0.04,
    roughness: 0.92,
    emissiveColor: [0.02, 0.03, 0.05],
    emissiveStrength: 0.06
  });
  return [groundItem("ground", cube, ground, [0, -0.06, 0], [6, 0.12, 4])];
}

function groundItem(
  label: string,
  geometry: Geometry,
  material: PBRMaterial,
  position: readonly [number, number, number],
  scale: readonly [number, number, number]
): RenderItem {
  return {
    label,
    geometry,
    material,
    modelMatrix: composeMat4([...position], quatFromEuler(0, 0, 0), [...scale]) as Mat4,
    includeInAutoFrame: true
  };
}

declare global {
  interface Window {
    __AURA_LIVE_ROUTE_HEADLESS__?: boolean;
  }
}

void mountLiveRenderRoute().catch((error: unknown) => {
  const diagnostics = (error as { diagnostics?: readonly string[] })?.diagnostics;
  const baseMessage = error instanceof Error ? error.message : String(error);
  const message = diagnostics && diagnostics.length > 0 ? `${baseMessage} :: ${diagnostics.join(" | ")}` : baseMessage;
  const liveWindow = window as LiveRouteWindow & { __AURA_LIVE_ROUTE_ERROR__?: string };
  liveWindow.__AURA_LIVE_ROUTE_ERROR__ = message;
  const root = document.querySelector<HTMLDivElement>("#app");
  if (root) {
    root.innerHTML = `<pre style="color:#f88;background:#0b0f1a;padding:24px;white-space:pre-wrap;">render-live-route failed: ${message}</pre>`;
  }
  // eslint-disable-next-line no-console
  console.error("render-live-route failed", error);
});
