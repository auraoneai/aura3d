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
import {
  createCameraPathFromPreset,
  sampleCameraPath,
  sampleVisemeTrack,
  type CameraPath,
  type CameraPresetId
} from "@aura3d/engine";
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
import { composeMat4, multiplyMat4, perspectiveMat4, quatFromEuler, type Mat4 } from "@aura3d/scene";
import { visemeTrack } from "./render-plan";
import { episode } from "./episode";

interface LiveCharacter {
  readonly actor: TypedGLBActor;
  readonly clip: string;
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly scale: number;
  readonly tint: readonly [number, number, number, number];
  /** Scene-graph node whose world transform tracks the head (for mouth placement). */
  readonly headNode: { readonly transform: { readonly worldMatrix: Mat4 } } | undefined;
  /**
   * Renderables that carry GLB morph weights, if any. miko has 3 (robot-expressive
   * Angry/Surprised/Sad); luma (Mixamo soldier) has none — see MORPH HONESTY below.
   */
  readonly morphRenderables: { morphWeights: number[] }[];
  /** Index of the morph weight driven for mouth-open (Surprised on miko), or -1. */
  readonly mouthMorphIndex: number;
}

interface LiveRouteSeekProof {
  readonly time: number;
  readonly drawCalls: number;
  readonly skinnedRenderItems: number;
  readonly shot: {
    readonly shotId: string;
    readonly presetId: string;
    readonly episodeTime: number;
    readonly cameraPosition: readonly [number, number, number];
    readonly fov: number;
  };
  readonly characters: readonly {
    readonly id: string;
    readonly clip: string;
    readonly tracksApplied: number;
    readonly skinningPalettesUpdated: number;
    readonly skinningBindingCount: number;
    /** AuraVoice mouth-open (0..1) sampled at this shot's episode time. */
    readonly mouthOpenness: number;
    readonly visemeId: string;
    /** GLB morph weight actually written onto the renderables (miko only; -1 if no morphs). */
    readonly mouthMorphWeight: number;
    readonly mouthMorphIndex: number;
    /** Open height of the primitive mouth indicator quad (the VISIBLE lip-sync). */
    readonly primitiveMouthOpen: number;
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

interface LiveSeekOptions {
  /**
   * Optional override forcing every character's mouth openness to a fixed value
   * (0..1), ignoring the viseme track. Used by the capture script to render an
   * isolated mouth-open vs mouth-closed A/B pair at an otherwise identical pose +
   * camera, proving the lip-sync indicator alone changes pixels.
   */
  readonly mouthOverride?: number;
}

type LiveRouteWindow = Window & {
  __AURA_LIVE_ROUTE_READY__?: LiveRouteReadyProof;
  /** Headless seek hook: pose every character at `time` seconds and render one frame. */
  __auraSeek__?: (time: number, options?: LiveSeekOptions) => LiveRouteSeekProof;
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

// MORPH HONESTY: miko's GLB exposes 3 head morph targets (robot-expressive
// Angry/Surprised/Sad). We drive index 1 (Surprised) for "mouth open". The morph
// WEIGHT is written through the real renderer morph path and reported in the seek
// proof — but this particular GLB's morph POSITION deltas are ~0 (authored near
// degenerate; verified maxAbsDelta < 0.005 units, and read back as 0 through the
// loader), so the morph alone moves no pixels. The VISIBLE lip-sync is therefore a
// primitive mouth-indicator quad parented to each character's head (below), which
// the cartoon viseme contract explicitly allows as the primitive-mouth fallback.
const MIKO_MOUTH_MORPH_INDEX = 1;

// Per-shot camera framing. The live route captures animation-clip time (0..~2s),
// while the episode shot timeline / viseme track live on the 0..60s episode
// timeline. We map clip-capture time onto the three episode shots so consecutive
// captured frames cut between distinct framings (wide → two-shot → push-in) AND
// sample the viseme track at a real dialogue beat. `episodeTime` is chosen inside
// each shot's dialogue window so a speaking character's mouth is open.
interface LiveShot {
  readonly shotId: string;
  readonly presetId: CameraPresetId;
  /** Clip-time window (seconds) of the captures assigned to this shot. */
  readonly clipTimeStart: number;
  readonly clipTimeEnd: number;
  /** Episode time the camera is framed at (stable per shot). */
  readonly episodeTime: number;
  /** Episode-time window swept for viseme sampling so the mouth opens AND closes. */
  readonly visemeStart: number;
  readonly visemeEnd: number;
}

function buildShotPlan(): readonly LiveShot[] {
  const shots = episode.shotTimeline.shots;
  // Distinct framings, one per episode shot. Falls back gracefully if shot count differs.
  const presets: CameraPresetId[] = ["establishing", "two-shot", "close-up"];
  const clipSpan = 2.1; // total captured clip-time span (see CAPTURE_TIMES in render-live.ts)
  const slot = clipSpan / Math.max(1, shots.length);
  return shots.map((shot, index) => {
    // The full episode-time span of this shot's dialogue cues (covers open + closed).
    const shotCues = visemeTrack.cues.filter((cue) => (cue.lineId ?? "").startsWith(`${shot.shotId}:`));
    const visemeStart = shotCues.length > 0 ? Math.min(...shotCues.map((cue) => cue.startTime)) : shot.startTime;
    const visemeEnd = shotCues.length > 0 ? Math.max(...shotCues.map((cue) => cue.endTime)) : shot.endTime;
    // Frame the camera mid-dialogue.
    const episodeTime = (visemeStart + visemeEnd) / 2;
    return {
      shotId: shot.shotId,
      presetId: presets[index] ?? presets[presets.length - 1]!,
      clipTimeStart: index * slot,
      clipTimeEnd: (index + 1) * slot,
      episodeTime,
      visemeStart,
      visemeEnd
    };
  });
}

function shotForClipTime(plan: readonly LiveShot[], clipTime: number): LiveShot {
  let chosen = plan[0]!;
  for (const shot of plan) {
    if (clipTime >= shot.clipTimeStart) chosen = shot;
  }
  return chosen;
}

/** Episode time to sample visemes at: sweeps the shot's dialogue window so the
 * mouth animates open→closed across the captures assigned to this shot. */
function visemeTimeForShot(shot: LiveShot, clipTime: number): number {
  const span = Math.max(1e-3, shot.clipTimeEnd - shot.clipTimeStart);
  const fraction = Math.min(1, Math.max(0, (clipTime - shot.clipTimeStart) / span));
  return shot.visemeStart + fraction * (shot.visemeEnd - shot.visemeStart);
}

/** Right-handed look-at view matrix (column-major, matches perspectiveMat4). */
function lookAtViewMatrix(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
  up: readonly [number, number, number] = [0, 1, 0]
): Mat4 {
  const fx = target[0] - eye[0];
  const fy = target[1] - eye[1];
  const fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f: [number, number, number] = [fx / fl, fy / fl, fz / fl];
  // s = normalize(cross(f, up))
  let sx = f[1] * up[2] - f[2] * up[1];
  let sy = f[2] * up[0] - f[0] * up[2];
  let sz = f[0] * up[1] - f[1] * up[0];
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl;
  sy /= sl;
  sz /= sl;
  // u = cross(s, f)
  const ux = sy * f[2] - sz * f[1];
  const uy = sz * f[0] - sx * f[2];
  const uz = sx * f[1] - sy * f[0];
  return [
    sx, ux, -f[0], 0,
    sy, uy, -f[1], 0,
    sz, uz, -f[2], 0,
    -(sx * eye[0] + sy * eye[1] + sz * eye[2]),
    -(ux * eye[0] + uy * eye[1] + uz * eye[2]),
    f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2],
    1
  ];
}

function cameraViewProjection(
  path: CameraPath,
  episodeTime: number,
  aspect: number
): { readonly viewProjectionMatrix: Mat4; readonly position: readonly [number, number, number]; readonly fov: number } {
  const sample = sampleCameraPath(path, episodeTime);
  const view = lookAtViewMatrix(sample.position, sample.target);
  const projection = perspectiveMat4((sample.fov * Math.PI) / 180, aspect, 0.1, 100);
  return {
    viewProjectionMatrix: multiplyMat4(projection, view),
    position: sample.position,
    fov: sample.fov
  };
}

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

    // Discover the head-ish node (for mouth placement) and morph-bearing renderables.
    const scene = actor.pipeline.resources.scene;
    let headNode: LiveCharacter["headNode"];
    scene.traverse((node) => {
      if (!headNode && /head/i.test(node.name)) headNode = node as LiveCharacter["headNode"];
    });
    const morphRenderables: { morphWeights: number[] }[] = scene
      .collectRenderables()
      .map((entry) => entry.renderable)
      .filter((renderable) => renderable.morphWeights.length > 0);
    const mouthMorphIndex = spec.id === "miko" && morphRenderables.length > 0 ? MIKO_MOUTH_MORPH_INDEX : -1;

    characters.push({
      actor,
      clip,
      position: spec.position,
      yaw: spec.yaw,
      scale: spec.scale,
      tint: spec.tint,
      headNode,
      morphRenderables,
      mouthMorphIndex
    });
  }

  // Build the per-shot camera plan + a camera path per shot (distinct framings).
  const shotPlan = buildShotPlan();
  const aspect = width / height;
  // Per-shot subject the camera centers on. Wider shots frame the two-robot
  // midpoint; the close-up push-in centers on miko (screen-left, the morph/lip-sync
  // subject). The preset targets are already at head height, so we only offset in X
  // (a Y offset would push the framing above the head).
  const mikoX = CHARACTER_SPECS.find((spec) => spec.id === "miko")?.position[0] ?? -0.95;
  const subjectFor = (preset: CameraPresetId): [number, number, number] =>
    preset === "close-up" ? [mikoX, 0, 0] : [0, 0.4, 0];
  const cameraPathByShot = new Map<string, CameraPath>(
    shotPlan.map((shot) => [
      shot.shotId,
      createCameraPathFromPreset({
        id: `live-cam:${shot.shotId}`,
        presetId: shot.presetId,
        startTime: shot.episodeTime - 0.5,
        endTime: shot.episodeTime + 0.5,
        subjectPosition: subjectFor(shot.presetId)
      })
    ])
  );

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

  // Primitive mouth-indicator quads, rebuilt each frame from the current viseme
  // sample (the actually-visible lip-sync — see MORPH HONESTY above).
  let mouthItems: RenderItem[] = [];

  const source: RenderSource = {
    collectRenderItems: () => [
      ...groundItems,
      ...characters.flatMap(collectCharacterItems),
      ...mouthItems
    ],
    // Fallback only; an explicit per-shot camera is passed to render() below, so
    // auto-frame does not run during normal operation.
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

  // Pose every character at `time`, drive the per-shot camera + lip-sync, render.
  const poseAt = (time: number, options: LiveSeekOptions = {}): LiveRouteSeekProof => {
    const shot = shotForClipTime(shotPlan, time);
    const nextMouthItems: RenderItem[] = [];

    // Sweep the viseme sample time across the shot's dialogue as clip time advances
    // within the shot, so consecutive captured frames show the mouth open AND close
    // (rather than a single frozen mouth state per shot).
    const visemeTime = visemeTimeForShot(shot, time);

    const characterProofs: LiveRouteSeekProof["characters"] = characters.map((character) => {
      const apply = character.actor.playClip(character.clip, time);
      const root = character.actor.pipeline.resources.scene.root;
      const rotation = quatFromEuler(0, character.yaw, 0);
      root.transform
        .setPosition(character.position[0], character.position[1], character.position[2])
        .setRotation(rotation[0], rotation[1], rotation[2], rotation[3])
        .setScale(character.scale, character.scale, character.scale);

      // Lip-sync: sample AuraVoice visemes at the swept episode time for this beat.
      const viseme = sampleVisemeTrack(visemeTrack, visemeTime, character.actor.id);
      const mouthOpenness = options.mouthOverride ?? viseme.mouthOpenness;

      // (a) Drive the real GLB morph weight (miko only). This flows through the
      // renderer's morph path; the weight is reported, but the GLB's near-zero
      // morph deltas mean it does not move pixels on its own.
      let mouthMorphWeight = -1;
      if (character.mouthMorphIndex >= 0) {
        mouthMorphWeight = mouthOpenness;
        for (const renderable of character.morphRenderables) {
          while (renderable.morphWeights.length <= character.mouthMorphIndex) renderable.morphWeights.push(0);
          renderable.morphWeights[character.mouthMorphIndex] = mouthMorphWeight;
        }
      }

      // (b) Primitive mouth indicator quad parented to the head world transform —
      // the actually-visible lip-sync. Open height scales with mouthOpenness.
      const headMatrix = character.headNode?.transform.worldMatrix;
      const primitiveMouthOpen = Math.max(0.04, mouthOpenness * 0.16);
      if (headMatrix) {
        nextMouthItems.push(buildMouthItem(character.actor.id, headMatrix, primitiveMouthOpen, character.scale));
      }

      return {
        id: character.actor.id,
        clip: apply.clipName,
        tracksApplied: apply.tracksApplied,
        skinningPalettesUpdated: apply.skinningPalettesUpdated,
        skinningBindingCount: character.actor.snapshot().skinningBindingCount,
        mouthOpenness,
        visemeId: viseme.visemeId,
        mouthMorphWeight,
        mouthMorphIndex: character.mouthMorphIndex,
        primitiveMouthOpen
      };
    });

    mouthItems = nextMouthItems;

    // Drive the camera explicitly from this shot's preset path.
    const path = cameraPathByShot.get(shot.shotId)!;
    const camera = cameraViewProjection(path, shot.episodeTime, aspect);
    const diagnostics = renderer.render(source, { viewProjectionMatrix: camera.viewProjectionMatrix });

    const skinnedRenderItems = characters.reduce(
      (sum, character) => sum + character.actor.collectRenderItems().filter((item) => item.skinning).length,
      0
    );
    return {
      time,
      drawCalls: diagnostics.drawCalls,
      skinnedRenderItems,
      shot: {
        shotId: shot.shotId,
        presetId: String(shot.presetId),
        episodeTime: shot.episodeTime,
        cameraPosition: camera.position,
        fov: camera.fov
      },
      characters: characterProofs
    };
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

// Shared geometry/material for the primitive mouth indicator (the visible lip-sync).
const MOUTH_GEOMETRY = Geometry.litCube(1);
const MOUTH_MATERIAL = new PBRMaterial({
  name: "live-route-mouth",
  baseColor: [0.06, 0.04, 0.05, 1],
  metallic: 0,
  roughness: 1,
  emissiveColor: [0.03, 0.01, 0.02],
  emissiveStrength: 0.04
});

/**
 * A small flattened box positioned at the head, slightly forward and below center,
 * whose vertical extent scales with mouth openness. This is the actually-visible
 * lip-sync indicator (GLB morphs on these assets carry ~zero geometric delta).
 */
function buildMouthItem(id: string, headWorldMatrix: Mat4, openHeight: number, charScale: number): RenderItem {
  // Head world translation (column-major: indices 12,13,14).
  const hx = headWorldMatrix[12];
  const hy = headWorldMatrix[13];
  const hz = headWorldMatrix[14];
  const faceForward = 0.16 * charScale; // nudge toward the camera-facing front of the head
  const widthScale = 0.07 * charScale;
  const depthScale = 0.02 * charScale;
  return {
    label: `${id}:mouth`,
    geometry: MOUTH_GEOMETRY,
    material: MOUTH_MATERIAL,
    modelMatrix: composeMat4(
      [hx, hy - 0.06 * charScale, hz + faceForward],
      quatFromEuler(0, 0, 0),
      [widthScale, openHeight, depthScale]
    ) as Mat4,
    includeInAutoFrame: false
  };
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
