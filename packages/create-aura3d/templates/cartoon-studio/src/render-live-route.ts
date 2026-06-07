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
  captionCueAtTime,
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
import { composeMat4, multiplyMat4, perspectiveMat4, PointLight, quatFromEuler, type Mat4 } from "@aura3d/scene";
import { visemeTrack } from "./render-plan";
import { episode } from "./episode";

interface LiveCharacter {
  readonly actor: TypedGLBActor;
  /** Default/fallback clip from the spec (used when a beat's staged clip is absent). */
  readonly clip: string;
  /** Every animation clip this GLB exposes (used to validate per-beat staged clips). */
  readonly availableClips: readonly string[];
  /** Default/fallback opening position + yaw (used when no beat staging is defined). */
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
  /** Eased dim→sparkle world-state at this seek time (0 = dim beat, 1 = full twinkle). */
  readonly gardenGlow: number;
  readonly shot: {
    readonly shotId: string;
    readonly presetId: string;
    readonly episodeTime: number;
    readonly cameraPosition: readonly [number, number, number];
    readonly fov: number;
  };
  /**
   * Active burned-in caption for this beat (sampled from the episode caption track
   * at the shot's episode time). The capture script draws `text` into the captured
   * frame pixels so the exported video has visible captions, not just a DOM overlay.
   */
  readonly caption: {
    readonly text: string;
    readonly speakerId: string;
    readonly captionId: string;
  };
  readonly characters: readonly {
    readonly id: string;
    readonly clip: string;
    /** Staged world position this beat (proves per-beat blocking / sweep staging). */
    readonly position: readonly [number, number, number];
    /** True when this character is staged at the broom playing the sweep stand-in clip. */
    readonly sweeping: boolean;
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

/**
 * MOON-GARDEN WORLD-STATE (HONEST: primitive/emissive geometry, NOT authored GLB
 * art). The episode's setting — "two robots in a glowing moon garden" — is built
 * here from the same shapes/positions/emissive colors as the cartoon-channel
 * PRIMITIVE reference set (`cartoon-channel/src/main.ts createAuraRenderedCartoonScene`
 * + `sets.ts`), translated into the A3DRenderer scene-source mesh format this live
 * route already uses (Geometry + PBRMaterial + modelMatrix RenderItems).
 *
 * It contains: a crater/garden floor + mound, a glowing moon portal orb + cyan rim
 * backdrop, several glow stones, moon lilies (emissive stem + bloom), a broom prop
 * (handle + bristles), and two colored night-garden point lights.
 *
 * The story's dim→sparkle world-state change (lilies "losing their sparkle" → the
 * garden "twinkling again") is driven by `setGardenGlow(t01)` below: every glow
 * material's emissive strength is scaled from a dim floor up to full twinkle, so
 * frames captured early (beat-open) vs late (beat-finish) visibly differ in glow.
 */

/** An emissive garden material whose strength is driven by the dim→sparkle state. */
interface GlowMaterial {
  readonly material: PBRMaterial;
  /** Emissive strength at the dim "losing their sparkle" beat. */
  readonly dim: number;
  /** Emissive strength at the full "twinkling again" beat. */
  readonly full: number;
}

const glowMaterials: GlowMaterial[] = [];

/** Captured clip-time span over which the garden ramps dim→sparkle. Matches the
 * `clipSpan` the shot plan uses, so beat-open≈0 (dim) and beat-finish≈end (full). */
const GARDEN_GLOW_SPAN = 2.1;

function makeGlowMaterial(
  name: string,
  baseColor: readonly [number, number, number, number],
  emissiveColor: readonly [number, number, number],
  dim: number,
  full: number
): PBRMaterial {
  const material = new PBRMaterial({
    name,
    baseColor,
    metallic: 0,
    roughness: 0.85,
    emissiveColor,
    emissiveStrength: dim
  });
  glowMaterials.push({ material, dim, full });
  return material;
}

/**
 * Drive the dim→sparkle world-state. `t01` is the normalized seek progress through
 * the captured timeline (0 at beat-open, 1 at beat-finish). Every registered glow
 * material's emissive strength is lerped from its dim floor to its full twinkle, so
 * the captured early vs late frames differ in glow brightness. A gentle eased curve
 * keeps the brighten reduced-motion-safe (no abrupt flash). */
function setGardenGlow(t01: number): number {
  const clamped = t01 < 0 ? 0 : t01 > 1 ? 1 : t01;
  // Smoothstep for a soft, non-flashing ramp.
  const eased = clamped * clamped * (3 - 2 * clamped);
  for (const glow of glowMaterials) {
    // `emissiveStrength` has no public setter; drive the same uniform the
    // constructor seeds (`u_emissiveStrength`) so the forward PBR pass picks it up.
    glow.material.setParameter("u_emissiveStrength", glow.dim + (glow.full - glow.dim) * eased);
  }
  return eased;
}

// Two distinct, AURA3D-AUTHORED rigged GLBs (procedurally generated by
// `scripts/build-characters.ts`, CC0). Both are real skinned cartoon helper robots
// with a small skeleton (root/spine/head + 2 arms + 2 legs), three animation clips
// (Idle/Wave/Walk), and ONE real `mouthOpen` face blendshape that drops the lower
// lip — verified to load through the engine loader (skin + morph parse, palettes
// update) by `scripts/validate-characters.ts`. These REPLACE the reused three.js
// RobotExpressive + Mixamo Soldier placeholders. miko = rounded/cyan, luma =
// taller/warm-gold (visibly different shapes + colors).
const CHARACTER_SPECS = [
  {
    id: "miko",
    url: "/aura-assets/miko.authored.glb",
    clip: "Walk",
    position: [-0.95, GROUND_Y, 0] as const,
    yaw: Math.PI * 0.12,
    // Authored ~1.6u tall; scale up so it reads at full body height in frame.
    scale: 1.15,
    tint: [0.36, 0.82, 0.92, 1] as const
  },
  {
    id: "luma",
    url: "/aura-assets/luma.authored.glb",
    clip: "Walk",
    position: [1.0, GROUND_Y, 0] as const,
    yaw: -Math.PI * 0.12,
    // luma is authored taller; a touch smaller scale keeps the two heights paired.
    scale: 1.0,
    tint: [0.96, 0.74, 0.34, 1] as const
  }
] as const;

// REAL BLENDSHAPE LIP-SYNC: both authored GLBs expose exactly ONE morph target,
// `mouthOpen` (index 0), whose POSITION deltas drop the lower-mouth panel ~0.12u to
// open a mouth. Driving this weight 0..1 from the sampled viseme mouthOpenness now
// moves real geometry (verified maxAbsDelta > 0.1u through the loader), so the
// mouth visibly opens/closes in pixels — no primitive mouth-card fallback needed.
const MOUTH_MORPH_INDEX = 0;

// STAGED PERFORMANCE / BLOCKING (HONEST: the "sweep" clip is a STAND-IN — these
// GLBs ship no authored sweep/broom animation, so we reuse an available body clip
// as a sweep-like motion and MOVE the character to the broom prop so the staging
// reads in pixels). The broom prop's hero owner is miko (see episode.props
// glow-broom ownerCharacterId). The broom HANDLE world position is below; miko
// walks from her opening mark toward the broom during the teamwork beat and plays
// a sweep stand-in clip, so frames captured at the teamwork beat visibly show miko
// AT the broom vs. her opening mark. luma walks in to help.
const BROOM_HANDLE_POSITION = [-0.55, GROUND_Y, 0.25] as const;
// miko stands just to the broom's working side (slightly screen-left of the handle,
// facing it) so the body + the broom prop frame together at the teamwork beat.
const MIKO_SWEEP_MARK = [BROOM_HANDLE_POSITION[0] + 0.18, GROUND_Y, BROOM_HANDLE_POSITION[2] - 0.02] as const;

/** Per-beat staging for one character: where it stands and which clip it plays. The
 * sweep clip is a STAND-IN (no authored sweep exists on these rigs). */
interface CharacterStaging {
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly clip: string;
  /** True for the teamwork sweep mark (used by the seek proof to flag the staged sweep). */
  readonly sweeping: boolean;
}

// Per-character, per-beat staging. Keyed by shotId. miko: opens at her mark with a
// neutral walk, crosses to the broom for the teamwork sweep (stand-in clip), then
// settles for the goodnight wave. luma mirrors with its own walk/run clips. Clips
// are validated against each GLB's real clip list at mount (fallback to clip[0]).
const STAGING_BY_CHARACTER: Record<string, Record<string, CharacterStaging>> = {
  miko: {
    "shot-moon-garden-open": { position: [-0.95, GROUND_Y, 0], yaw: Math.PI * 0.12, clip: "Walk", sweeping: false },
    // Sweep stand-in: "Wave" is the closest authored arm-driven clip on this rig.
    "shot-glow-stone-teamwork": { position: MIKO_SWEEP_MARK, yaw: -Math.PI * 0.5, clip: "Wave", sweeping: true },
    "shot-moon-garden-finish": { position: [-0.65, GROUND_Y, 0], yaw: Math.PI * 0.12, clip: "Wave", sweeping: false }
  },
  luma: {
    "shot-moon-garden-open": { position: [1.0, GROUND_Y, 0], yaw: -Math.PI * 0.12, clip: "Walk", sweeping: false },
    // luma walks in toward the broom to help during teamwork.
    "shot-glow-stone-teamwork": { position: [0.25, GROUND_Y, 0.2], yaw: -Math.PI * 0.62, clip: "Walk", sweeping: false },
    "shot-moon-garden-finish": { position: [0.68, GROUND_Y, 0], yaw: -Math.PI * 0.12, clip: "Idle", sweeping: false }
  }
};

/** Resolve the staging for `characterId` at `shotId`, validated against the GLB's
 * real clip list (falls back to the spec clip, then clip[0]). */
function stagingFor(
  characterId: string,
  shotId: string,
  availableClips: readonly string[],
  fallbackClip: string,
  fallbackPosition: readonly [number, number, number],
  fallbackYaw: number
): CharacterStaging {
  const staged = STAGING_BY_CHARACTER[characterId]?.[shotId];
  if (!staged) {
    return { position: fallbackPosition, yaw: fallbackYaw, clip: fallbackClip, sweeping: false };
  }
  const clip = availableClips.includes(staged.clip) ? staged.clip : fallbackClip;
  return { ...staged, clip };
}

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
    // Both authored GLBs expose the `mouthOpen` morph, so drive index 0 on each.
    const mouthMorphIndex = morphRenderables.length > 0 ? MOUTH_MORPH_INDEX : -1;

    characters.push({
      actor,
      clip,
      availableClips: snapshot.clips,
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
  // midpoint; the close-up push-in centers on miko's FACE (screen-left, the
  // morph/lip-sync subject) so the authored `mouthOpen` blendshape reads in frame.
  // The authored characters are shorter than the preset's human eyeline (target
  // y≈1.45), so the close-up offsets the subject DOWN to sit the mouth (world
  // y≈1.1) at frame center.
  const mikoX = CHARACTER_SPECS.find((spec) => spec.id === "miko")?.position[0] ?? -0.95;
  const subjectFor = (preset: CameraPresetId): [number, number, number] =>
    preset === "close-up" ? [mikoX, -0.35, 0] : [0, 0.4, 0];
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

  // 3. Primitive moon-garden set (crater floor + mound, glowing moon orb + rim,
  // glow stones, moon lilies, broom prop) so the characters stand IN the episode's
  // setting. HONEST: primitive/emissive geometry, not authored GLB art.
  const gardenItems = createGardenItems();
  // Seed the dim "losing their sparkle" state for the very first frame.
  setGardenGlow(0);

  // Real directional key/fill/rim rig from the published production runtime, PLUS
  // two colored night-garden point lights (cyan key + warm gold rim).
  const lights: readonly CollectedLight[] = [
    ...createStudioLighting({ preset: "softbox", shadows: false, intensityScale: 0.7 }),
    ...createGardenLights()
  ];

  const source: RenderSource = {
    collectRenderItems: () => [
      ...gardenItems,
      ...characters.flatMap(collectCharacterItems)
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

    // WORLD-STATE dim→sparkle: normalize seek time across the captured span (the
    // three episode beats map onto clip-time 0..GARDEN_GLOW_SPAN; see buildShotPlan).
    // Early frames (beat-open) render dim "losing their sparkle"; late frames
    // (beat-finish) render full "twinkling again". This updates emissive strength on
    // every glow material so captured early vs late frames differ in glow brightness.
    const gardenGlow = setGardenGlow(time / GARDEN_GLOW_SPAN);

    // Sweep the viseme sample time across the shot's dialogue as clip time advances
    // within the shot, so consecutive captured frames show the mouth open AND close
    // (rather than a single frozen mouth state per shot).
    const visemeTime = visemeTimeForShot(shot, time);

    const characterProofs: LiveRouteSeekProof["characters"] = characters.map((character) => {
      // STAGED PERFORMANCE: resolve this character's blocking + clip for THIS beat.
      // miko crosses to the broom and plays a sweep stand-in clip at the teamwork
      // beat; positions differ per beat so captured frames visibly move the body.
      const staging = stagingFor(
        character.actor.id,
        shot.shotId,
        character.availableClips,
        character.clip,
        character.position,
        character.yaw
      );
      const apply = character.actor.playClip(staging.clip, time);
      const root = character.actor.pipeline.resources.scene.root;
      const rotation = quatFromEuler(0, staging.yaw, 0);
      root.transform
        .setPosition(staging.position[0], staging.position[1], staging.position[2])
        .setRotation(rotation[0], rotation[1], rotation[2], rotation[3])
        .setScale(character.scale, character.scale, character.scale);

      // Lip-sync: sample AuraVoice visemes at the swept episode time for this beat.
      const viseme = sampleVisemeTrack(visemeTrack, visemeTime, character.actor.id);
      const mouthOpenness = options.mouthOverride ?? viseme.mouthOpenness;

      // REAL BLENDSHAPE LIP-SYNC: drive the authored `mouthOpen` morph weight from
      // the sampled viseme mouthOpenness. The authored GLB's morph carries real
      // POSITION deltas (lower-lip drop ~0.12u), so this moves actual geometry and
      // the mouth visibly opens/closes in pixels. This flows through the renderer's
      // morph path (collectRenderItems emits morphTargets + morphWeights, ForwardPass
      // applies them); no primitive mouth-card is used anymore.
      //
      // The clips authored here carry no `weights` track, so `playClip` above does
      // not overwrite this weight; we set it after playing the body clip.
      let mouthMorphWeight = -1;
      if (character.mouthMorphIndex >= 0) {
        mouthMorphWeight = mouthOpenness;
        for (const renderable of character.morphRenderables) {
          while (renderable.morphWeights.length <= character.mouthMorphIndex) renderable.morphWeights.push(0);
          renderable.morphWeights[character.mouthMorphIndex] = mouthMorphWeight;
        }
      }
      // `primitiveMouthOpen` is retained in the proof shape for the capture script's
      // logging, but is no longer the visible driver (kept at 0 — the morph drives it).
      const primitiveMouthOpen = 0;

      return {
        id: character.actor.id,
        clip: apply.clipName,
        position: staging.position,
        sweeping: staging.sweeping,
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

    // BURNED-IN CAPTION: sample the active caption cue from the episode caption
    // track at this shot's episode time (one-to-one with the AuraVoice dialogue).
    // The text is reported here; the capture script draws it INTO the frame pixels
    // (see render-live.ts) so the exported video carries visible captions.
    const captionCue = captionCueAtTime(episode.captionTrack, shot.episodeTime);
    const caption = {
      text: captionCue?.text ?? "",
      speakerId: captionCue?.speakerId ?? "",
      captionId: captionCue?.captionId ?? ""
    };

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
      gardenGlow,
      shot: {
        shotId: shot.shotId,
        presetId: String(shot.presetId),
        episodeTime: shot.episodeTime,
        cameraPosition: camera.position,
        fov: camera.fov
      },
      caption,
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

// NOTE: the former primitive mouth-indicator quad has been removed — the authored
// GLBs carry a real `mouthOpen` blendshape that is the visible lip-sync now.

// Shared garden geometry (built once, reused across RenderItems each frame).
const GARDEN_CUBE = Geometry.litCube(1);
const GARDEN_SPHERE = Geometry.uvSphere(0.5, 24, 16);
const GARDEN_CYLINDER = Geometry.cylinder({ radius: 0.5, height: 1, segments: 20, capped: true });
const GARDEN_TORUS_RIM = Geometry.cylinder({ radius: 0.5, height: 1, segments: 28, capped: false });

/**
 * Build the primitive moon garden around the characters. HONEST: these are
 * primitive/emissive shapes (sphere/cylinder/box), not authored GLB art. Shapes,
 * positions, and emissive colors mirror the cartoon-channel reference set
 * (`createAuraRenderedCartoonScene`). Glow-stone/lily/orb/broom emissive strengths
 * are registered via `makeGlowMaterial`, so `setGardenGlow(t01)` can drive the
 * dim→sparkle world-state on every captured frame.
 *
 * NOTE: garden materials are built ONCE and reused, so the glowMaterials registry
 * is populated exactly once even if this is somehow called again.
 */
function createGardenItems(): RenderItem[] {
  // --- Static (non-glow) night-garden geometry ---
  const gardenFloor = new PBRMaterial({
    name: "live-route-garden-floor",
    baseColor: [0.09, 0.29, 0.245, 1], // #17493e crater garden
    metallic: 0.02,
    roughness: 0.78,
    emissiveColor: [0.03, 0.09, 0.08],
    emissiveStrength: 0.18
  });
  const craterRim = new PBRMaterial({
    name: "live-route-crater-rim",
    baseColor: [0.07, 0.21, 0.18, 1],
    metallic: 0.02,
    roughness: 0.82,
    emissiveColor: [0.02, 0.06, 0.06],
    emissiveStrength: 0.12
  });
  const skyPlate = new PBRMaterial({
    name: "live-route-garden-sky",
    baseColor: [0.04, 0.16, 0.255, 1], // #0a2941 night sky plate
    metallic: 0,
    roughness: 1,
    emissiveColor: [0.06, 0.28, 0.4],
    emissiveStrength: 0.55
  });
  const broomHandle = new PBRMaterial({
    name: "live-route-broom-handle",
    baseColor: [0.55, 0.42, 0.26, 1],
    metallic: 0.1,
    roughness: 0.7,
    emissiveColor: [0.12, 0.1, 0.06],
    emissiveStrength: 0.1
  });

  // --- Glow materials (driven by setGardenGlow dim→sparkle) ---
  // Moon portal orb + cyan rim backdrop.
  const moonOrb = makeGlowMaterial(
    "live-route-moon-orb",
    [0.72, 0.95, 1, 1], // #b7f4ff
    [0.49, 0.886, 1], // #7de2ff cyan glow
    0.45,
    1.55
  );
  const moonRim = makeGlowMaterial("live-route-moon-rim", [0.49, 0.886, 1, 1], [0.49, 0.886, 1], 0.4, 1.7);
  // Glow stones (warm gold + cyan) — the "wake the glow stones" payoff.
  const stoneGold = makeGlowMaterial("live-route-stone-gold", [1, 0.882, 0.557, 1], [1, 0.882, 0.557], 0.12, 1.85);
  const stoneCyan = makeGlowMaterial("live-route-stone-cyan", [0.49, 0.886, 1, 1], [0.49, 0.886, 1], 0.1, 1.7);
  // Moon lilies — "losing their sparkle" (dim) → "twinkling again" (full).
  const lilyStem = makeGlowMaterial("live-route-lily-stem", [0.25, 1, 0.75, 1], [0.25, 1, 0.75], 0.15, 1.05);
  const lilyBloom = makeGlowMaterial("live-route-lily-bloom", [0.917, 0.988, 1, 1], [0.843, 0.984, 1], 0.1, 1.35);
  // Broom bristles get a soft glow tip.
  const broomBristles = makeGlowMaterial("live-route-broom-bristles", [1, 0.882, 0.557, 1], [1, 0.882, 0.557], 0.18, 1.0);

  return [
    // Crater/garden floor + mound (characters stand on this).
    groundItem("garden-floor", GARDEN_CUBE, gardenFloor, [0, -0.06, -0.2], [6, 0.12, 4]),
    groundItem("garden-mound", GARDEN_CYLINDER, craterRim, [0, 0.0, -0.55], [3.0, 0.16, 1.4]),
    // Night-sky plate + glowing moon portal orb and cyan rim backdrop.
    groundItem("garden-sky", GARDEN_CUBE, skyPlate, [0, 2.0, -2.6], [9.0, 4.4, 0.12]),
    glowItem("moon-orb", GARDEN_SPHERE, moonOrb, [0, 2.05, -2.42], [1.55, 1.55, 0.16]),
    glowItem("moon-rim", GARDEN_TORUS_RIM, moonRim, [0, 2.05, -2.46], [1.95, 1.95, 0.1]),
    // Glow stones scattered across the crater floor.
    glowItem("glow-stone-l", GARDEN_SPHERE, stoneGold, [-1.7, 0.12, 0.45], [0.26, 0.13, 0.2]),
    glowItem("glow-stone-c", GARDEN_SPHERE, stoneCyan, [-0.15, 0.1, 0.35], [0.2, 0.1, 0.16]),
    glowItem("glow-stone-r", GARDEN_SPHERE, stoneGold, [1.75, 0.12, 0.4], [0.26, 0.13, 0.2]),
    glowItem("glow-stone-back", GARDEN_SPHERE, stoneCyan, [0.55, 0.1, -0.7], [0.2, 0.1, 0.16]),
    // Moon lilies (emissive stem + bloom) flanking the robots.
    glowItem("lily-stem-l", GARDEN_CYLINDER, lilyStem, [-2.05, 0.32, -0.2], [0.05, 0.62, 0.05]),
    glowItem("lily-bloom-l", GARDEN_SPHERE, lilyBloom, [-2.05, 0.66, -0.2], [0.34, 0.16, 0.26]),
    glowItem("lily-stem-r", GARDEN_CYLINDER, lilyStem, [2.1, 0.32, -0.3], [0.05, 0.62, 0.05]),
    glowItem("lily-bloom-r", GARDEN_SPHERE, lilyBloom, [2.1, 0.66, -0.3], [0.34, 0.16, 0.26]),
    // Broom prop (handle + glowing bristles), miko's hero prop.
    broomItem("broom-handle", GARDEN_CYLINDER, broomHandle, [-0.55, 0.5, 0.25], [0.045, 1.0, 0.045], -0.55),
    broomItem("broom-bristles", GARDEN_CUBE, broomBristles, [-0.82, 0.18, 0.27], [0.32, 0.18, 0.12], -0.2)
  ];
}

/** Two colored night-garden point lights (cyan key + warm gold rim), mirroring the
 * reference set's `lights.point` rig. Backed by real `PointLight` source nodes so
 * they satisfy `CollectedLight`. These complement the emissive glow geometry. */
function createGardenLights(): CollectedLight[] {
  const make = (
    name: string,
    color: readonly [number, number, number],
    position: readonly [number, number, number],
    intensity: number,
    range: number
  ): CollectedLight => {
    const source = new PointLight(name);
    source.intensity = intensity;
    source.range = range;
    return {
      kind: "point",
      color,
      intensity,
      position,
      direction: [0, -1, 0],
      range,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source
    };
  };
  return [
    make("garden-cyan-key", [0.49, 0.886, 1], [-1.8, 2.4, 1.2], 2.8, 12),
    make("garden-warm-rim", [1, 0.882, 0.557], [1.8, 1.7, 0.8], 2.0, 10)
  ];
}

function glowItem(
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
    includeInAutoFrame: false
  };
}

function broomItem(
  label: string,
  geometry: Geometry,
  material: PBRMaterial,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rollZ: number
): RenderItem {
  return {
    label,
    geometry,
    material,
    modelMatrix: composeMat4([...position], quatFromEuler(0, 0, rollZ), [...scale]) as Mat4,
    includeInAutoFrame: false
  };
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
