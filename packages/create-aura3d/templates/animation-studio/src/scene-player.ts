/**
 * scene-player.ts — the GENERIC animation scene player.
 *
 * It consumes an EpisodeDocument and renders it. It contains ZERO scene-specific
 * constants — blocking, camera framing, the clip per beat, prop layout, the set + lights,
 * and the dim→sparkle world-state all come from the document via the sampling functions.
 * It can play ANY document; the Moon Garden specifics live in `moon-garden-document.ts`.
 *
 * Dialogue/caption/viseme still come from the episode (`render-plan.ts`) — that timed
 * track is the AuraVoice contract and is shared across the pipeline.
 *
 * Imports resolve from the published `@aura3d/engine` (advanced-runtime A3DRenderer +
 * production-runtime typed GLB actors + rendering primitives), exactly as the old route.
 */

import { A3DRenderer, TextureBinding as EngineTextureBinding } from "@aura3d/engine/advanced-runtime";
import { createStudioLighting, createTypedGLBActor, type TypedGLBActor } from "@aura3d/engine/production-runtime";
import { createCameraPathFromPreset, sampleCameraPath, type CameraPath } from "@aura3d/engine";
// I1 clean-room correctness: import the rendering/scene PRIMITIVES from the engine's own subpaths
// (`@aura3d/engine/rendering` / `@aura3d/engine/scene`) — the SAME copy the A3DRenderer uses — NOT
// the standalone `@aura3d/rendering` / `@aura3d/scene` packages. In a clean-room (tarball) install
// those standalone packages are a SECOND copy of the rendering code, so a `Geometry`/`PBRMaterial`/
// `TextureBinding` built from them is a DIFFERENT class than the renderer's, and the renderer's
// `MaterialBinding.bind` (`value instanceof TextureBinding`) rejects EVERY PBR material with a
// `MaterialBindingError` ("u_environmentMapTexture must be texture2d"). Importing through the engine
// gives ONE shared copy, so the bindings match. (In the monorepo these resolve to the same deduped
// dist either way, so this never changes the monorepo render.)
import { Geometry, PBRMaterial, type CollectedLight, type RenderItem, type RenderSource } from "@aura3d/engine/rendering";
import { bakeSetHdri, type BakedHdri } from "./procedural-hdri";
import { composeMat4, multiplyMat4, perspectiveMat4, PointLight, quatFromEuler, type Mat4 } from "@aura3d/engine/scene";
import {
  sampleBlocking,
  sampleCaption,
  sampleVisemeOpenness,
  sampleWorldStateGlow,
  shotAtTime,
  type EpisodeDocument,
  type SetPiece,
  type Vec3
} from "./episode-document";
// I2 — GLOBAL BLEND/alpha ghost fix policy + cel/render-mode clarification (one canonical home).
import { forceOpaqueAcrossRenderItems } from "./render-modes";
import {
  loadSharedClipLibrary,
  createPerformanceRig,
  resolveIntent,
  embeddedClipForIntent,
  type PerformanceRig,
  type ClipDecision,
  type ClipSource
} from "./animation-performance";
// B6 — rig-capability + true-foot-IK helpers. These come from the SAME freshly-built monorepo
// dist that `animation-performance.ts` imports (vite aliases @aura3d/* to dist; this relative path
// is the one specifier the route does NOT alias — @aura3d/animation — so we reach it by path, just
// like animation-performance.ts does). `gradeRig` tells us whether a rig actually HAS the
// leg/knee/ankle/foot chain a two-bone foot-IK solve needs; `createFootIkRig` is the engine's real
// two-bone solver (used only for rigs that have the chain). On sparse/mascot rigs we keep the
// honest `rootGrounding` (root pinned to the ground mark — NOT IK).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at runtime to the freshly-built monorepo dist (has co-located .d.ts).
import {
  gradeRig,
  inferHumanoidRig,
  createFootIkRig,
  type RigQualityReport,
  type FootIkRig,
  type GroundRaycaster
} from "@aura3d/animation";

// ---------------------------------------------------------------------------
// Proof shapes (unchanged from the old route so the capture script keeps working).
// ---------------------------------------------------------------------------
interface LiveRouteSeekProof {
  readonly time: number;
  readonly drawCalls: number;
  readonly skinnedRenderItems: number;
  readonly gardenGlow: number;
  readonly shot: {
    readonly shotId: string;
    readonly presetId: string;
    readonly episodeTime: number;
    readonly cameraPosition: Vec3;
    readonly fov: number;
  };
  readonly caption: { readonly text: string; readonly speakerId: string; readonly captionId: string };
  /**
   * B1 debug overlay — the current clip + intent + source for EVERY character at this frame,
   * inspectable per-seek (e.g. "miko: talk←talk [extracted] 9 bones / 0.412rad").
   */
  readonly debugOverlay: readonly string[];
  readonly characters: readonly {
    readonly id: string;
    readonly clip: string;
    readonly position: Vec3;
    readonly sweeping: boolean;
    readonly tracksApplied: number;
    readonly skinningPalettesUpdated: number;
    readonly skinningBindingCount: number;
    readonly mouthOpenness: number;
    readonly visemeId: string;
    readonly mouthMorphWeight: number;
    readonly mouthMorphIndex: number;
    readonly primitiveMouthOpen: number;
    /** B1 per-character/per-beat clip-decision record (intent/clipId/source/bonesTouched/…). */
    readonly clipDecision: ClipDecision & { readonly characterId: string; readonly time: number };
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
  readonly mouthOverride?: number;
}

type LiveRouteWindow = Window & {
  __AURA_LIVE_ROUTE_READY__?: LiveRouteReadyProof;
  __auraSeek__?: (time: number, options?: LiveSeekOptions) => LiveRouteSeekProof;
  __AURA_LIVE_ROUTE_HEADLESS__?: boolean;
  __AURA_LIVE_ROUTE_ERROR__?: string;
};

interface LiveCharacter {
  readonly id: string;
  readonly actor: TypedGLBActor;
  readonly defaultClip: string;
  readonly availableClips: readonly string[];
  readonly scale: number;
  readonly mouthMorphIndex: number;
  readonly morphRenderables: { morphWeights: number[] }[];
  /** Shared-library performance driver (state graph + retarget map) for this character (Phase 2.5). */
  readonly perf: PerformanceRig;
  /**
   * B6 — body-acting suitability grade for this character's inferred rig (A/B/C/D). Drives the
   * HONEST foot-handling decision: only rigs that actually HAVE a leg/knee/ankle/foot chain
   * (grade A/B with ankles) get true two-bone foot IK; everything else keeps `rootGrounding`.
   */
  readonly rigGrade: RigQualityReport;
  /**
   * B6 — the engine's real two-bone foot-IK rig, present ONLY when this character's rig has the
   * ankle chain. `undefined` ⇒ no true IK is available; the player uses `rootGrounding` and SAYS so.
   */
  readonly footIk?: FootIkRig;
}

// ---------------------------------------------------------------------------
// Shared base geometry (built once; the document scales them via modelMatrix).
// ---------------------------------------------------------------------------
const BASE_GEOMETRY: Record<SetPiece["geometry"], Geometry> = {
  cube: Geometry.litCube(1),
  sphere: Geometry.uvSphere(0.5, 24, 16),
  cylinder: Geometry.cylinder({ radius: 0.5, height: 1, segments: 20, capped: true })
};

/**
 * Resolve a requested clip to the GLB's real clip list (exact → substring). Returns `undefined`
 * when NO real clip matches — an unknown/fictional clip name must FALL THROUGH to the shared
 * library (B3), NOT silently collapse to clip #0 (which is how a whole cast ended up looping one
 * embedded idle). Callers treat `undefined` as "no embedded clip; use the library pose."
 */
function pickClip(requested: string, available: readonly string[]): string | undefined {
  if (available.length === 0) return undefined;
  const want = requested.toLowerCase();
  const exact = available.find((c) => c.toLowerCase() === want);
  if (exact) return exact;
  return available.find((c) => c.toLowerCase().includes(want) || want.includes(c.toLowerCase()));
}

/** Right-handed look-at view matrix (column-major, matches perspectiveMat4). */
function lookAtViewMatrix(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  const fx = target[0] - eye[0];
  const fy = target[1] - eye[1];
  const fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  const f: [number, number, number] = [fx / fl, fy / fl, fz / fl];
  let sx = f[1] * up[2] - f[2] * up[1];
  let sy = f[2] * up[0] - f[0] * up[2];
  let sz = f[0] * up[1] - f[1] * up[0];
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl;
  sy /= sl;
  sz /= sl;
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
  time: number,
  aspect: number
): { readonly viewProjectionMatrix: Mat4; readonly position: Vec3; readonly fov: number } {
  const sample = sampleCameraPath(path, time);
  const view = lookAtViewMatrix(sample.position as Vec3, sample.target as Vec3);
  const projection = perspectiveMat4((sample.fov * Math.PI) / 180, aspect, 0.1, 100);
  return {
    viewProjectionMatrix: multiplyMat4(projection, view),
    position: sample.position as Vec3,
    fov: sample.fov
  };
}

const SHADOW_MATERIAL = new PBRMaterial({
  name: "live-route-contact-shadow",
  baseColor: [0.03, 0.08, 0.07, 1],
  metallic: 0,
  roughness: 1,
  emissiveColor: [0, 0, 0],
  emissiveStrength: 0
});

/**
 * Mount the generic player for `doc`. Loads its assets, builds its set/lights/props,
 * exposes the headless `__auraSeek__` hook + ready proof, and renders.
 */
export async function mountScenePlayer(doc: EpisodeDocument): Promise<void> {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("scene-player: missing #app root element.");
  root.innerHTML = `
    <main style="margin:0;background:#0b0f1a;min-height:100vh;display:grid;place-items:center;position:relative;">
      <canvas id="live-canvas" width="960" height="540"
        style="width:960px;height:540px;display:block;background:#0b0f1a;"></canvas>
      <pre id="aura-debug-overlay" aria-hidden="true" style="
        position:absolute;left:8px;top:8px;margin:0;padding:6px 8px;max-width:944px;
        font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:#9effa2;
        background:rgba(8,12,22,0.72);border:1px solid rgba(158,255,162,0.35);border-radius:6px;
        white-space:pre-wrap;pointer-events:none;display:none;"></pre>
    </main>
  `;
  const canvas = root.querySelector<HTMLCanvasElement>("#live-canvas");
  if (!canvas) throw new Error("scene-player: missing #live-canvas.");

  // B1 — per-character clip + intent debug overlay, gated behind AURA_DEBUG_OVERLAY=1 (surfaced to
  // the browser route via Vite as VITE_AURA_DEBUG_OVERLAY). Off by default; when on, the proof DOM
  // shows the live clip←intent [source] + body-motion numbers per character per frame.
  const debugOverlayEnabled =
    String(
      (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_AURA_DEBUG_OVERLAY ?? ""
    ).trim() === "1";
  const debugOverlayEl = root.querySelector<HTMLPreElement>("#aura-debug-overlay");
  if (debugOverlayEl && debugOverlayEnabled) debugOverlayEl.style.display = "block";

  const liveWindow = window as LiveRouteWindow;
  const width = canvas.width;
  const height = canvas.height;
  const aspect = width / height;

  // 1. Characters.
  // Shared, rig-neutral clip library (idle/talk/gesture/point/nod/walk/run/react) built ONCE and
  // reused by every character's performance rig. B3: the EXTRACTED universal catalog library
  // (public/clip-library/<intent>.json) is the DEFAULT first choice; intents with no usable
  // extracted clip fall back to the procedural standard baseline (both logged).
  const sharedLibrary = await loadSharedClipLibrary();
  const sharedClipRegistry = sharedLibrary.registry;
  const characters: LiveCharacter[] = [];
  for (const spec of doc.assets.characters) {
    const actor = await createTypedGLBActor({ asset: { url: spec.url }, id: spec.id, name: spec.id, width, height });
    // FIX (ghost characters): many catalog GLBs — especially Sketchfab/FBX exports — set
    // alphaMode=BLEND on an OPAQUE (opacity 1) material, so the textured character renders
    // as a translucent white silhouette. The GLOBAL ghost-fix policy (render-modes.ts) forces
    // each opaque-but-BLENDed material OPAQUE (blend off, depth write/test on) so its real
    // textures show solid. The SAME policy runs on props + set dressing below, so the fix is
    // provably global (not character-only).
    forceOpaqueAcrossRenderItems(actor.collectRenderItems());
    const snapshot = actor.snapshot();
    if (snapshot.clips.length < 1) throw new Error(`scene-player: ${spec.id} GLB exposes no animation clips.`);
    const scene = actor.pipeline.resources.scene;
    const morphRenderables: { morphWeights: number[] }[] = scene
      .collectRenderables()
      .map((entry) => entry.renderable)
      .filter((renderable) => renderable.morphWeights.length > 0);
    const mouthMorphIndex = spec.mouthMorphIndex ?? (morphRenderables.length > 0 ? 0 : -1);

    // Phase 2.5: infer this GLB's humanoid rig from its skeleton node names and build a performance
    // rig (retarget map standard-library-rig → this rig + a performance state graph). This is what
    // lets EVERY character — even a catalog GLB that ships only a single embedded idle — talk,
    // gesture, walk and react from the SHARED clip library instead of looping one embedded clip.
    const nodeNames: string[] = [];
    scene.root.traverse((node) => {
      if (node.name) nodeNames.push(node.name);
    });
    const perf = createPerformanceRig(sharedClipRegistry, {
      nodeNames,
      embeddedClips: snapshot.clips,
      sources: sharedLibrary.sources
    });

    // B6 — HONEST foot handling. Grade the inferred rig: only rigs that actually carry a
    // leg/knee/ankle/foot chain (grade A/B with `hasAnkles`) can run TRUE two-bone foot IK.
    // Sparse/mascot rigs (grade C — head+torso, stub arms, no ankle chain) keep `rootGrounding`
    // (root pinned to the ground mark — NOT IK) and we LOG exactly that, never claiming IK.
    const rig = inferHumanoidRig(nodeNames);
    const rigGrade = gradeRig(rig);
    let footIk: FootIkRig | undefined;
    const canFootIk = rigGrade.hasLegs && rigGrade.hasKnees && rigGrade.hasAnkles;
    if (canFootIk) {
      try {
        // Flat ground at y=0 (the staged ground mark): a downward ray returns the floor under
        // each ankle. This is a REAL two-bone solve (hip→knee→ankle) with foot-lock, not a pin.
        const flatGround: GroundRaycaster = {
          raycastDown(origin, maxDistance) {
            const distance = origin[1] - 0;
            if (distance < 0 || distance > maxDistance) return undefined;
            return { point: [origin[0], 0, origin[2]], normal: [0, 1, 0], distance };
          }
        };
        // Rest-pose leg chains in the standard (meters) frame; per-frame ankle targets come from
        // the staged ground in `solveFootPlacement`. Hip≈0.9m, knee≈0.5m, ankle≈0.08m.
        footIk = createFootIkRig({
          raycaster: flatGround,
          legs: [
            { side: "left", hip: [-0.1, 0.9, 0], knee: [-0.1, 0.5, 0.02], ankle: [-0.1, 0.08, 0] },
            { side: "right", hip: [0.1, 0.9, 0], knee: [0.1, 0.5, 0.02], ankle: [0.1, 0.08, 0] }
          ]
        });
        console.info(`[scene-player] ${spec.id}: true two-bone foot IK enabled (rig grade ${rigGrade.grade}: has leg/knee/ankle chain).`);
      } catch (err) {
        footIk = undefined;
        console.warn(`[scene-player] ${spec.id}: foot-IK rig construction failed (${(err as Error).message}) → rootGrounding.`);
      }
    } else {
      console.info(
        `[scene-player] ${spec.id}: rootGrounding (rig grade ${rigGrade.grade}: no ankle chain → true foot IK unavailable).`
      );
    }

    characters.push({
      id: spec.id,
      actor,
      defaultClip: spec.defaultClip,
      availableClips: snapshot.clips,
      scale: spec.scale,
      mouthMorphIndex,
      morphRenderables,
      perf,
      rigGrade,
      footIk
    });
  }

  // 2. Props (loaded once; instanced per set-dressing placement).
  const propActors = new Map<string, TypedGLBActor>();
  for (const prop of doc.assets.props) {
    // A prop with no url is a prompt-derived object with no resolved mesh — recorded in the doc for
    // provenance, but there is nothing to load. Skip it (procedural set dressing fills the space)
    // instead of 404-ing on a fictional GLB.
    if (!prop.url) continue;
    const propActor = await createTypedGLBActor({ asset: { url: prop.url }, id: prop.id, name: prop.id, width, height });
    // Same GLOBAL ghost fix as characters: catalog prop GLBs can also ship opaque-but-BLENDed
    // materials that render as translucent ghosts; force them opaque here too.
    forceOpaqueAcrossRenderItems(propActor.collectRenderItems());
    propActors.set(prop.id, propActor);
  }
  function collectSetDressing(): RenderItem[] {
    const items: RenderItem[] = [];
    for (const placement of doc.setDressing) {
      const actor = propActors.get(placement.propId);
      if (!actor) continue;
      actor.pipeline.resources.scene.root.transform
        .setPosition(placement.position[0], placement.feetOffset * placement.scale, placement.position[2])
        .setRotation(0, 0, 0, 1)
        .setScale(placement.scale, placement.scale, placement.scale);
      items.push(...actor.collectRenderItems());
    }
    return items;
  }

  // 3. Set pieces (primitive geometry + materials from the document) + glow registry.
  // M2 — IN-SHADER CEL BY DEFAULT for STYLIZED renders. NON-GLOW pieces render with the engine's
  // REAL AnimationToonMaterial (GPU banded N·L + Fresnel rim). Glow pieces stay on PBR because the
  // dim→sparkle world-state drives their emissive uniform.
  //
  // Default policy (M2): stylized is the DEFAULT, so cel is ON unless the document/flag picks PBR.
  //   - `doc.set.inShaderCel === false`  → explicit PBR opt-out (realistic asset / PBR mode).
  //   - `import.meta.env.VITE_AURA_RENDER_STYLE === "pbr"` → flag opt-out (mirrors the server-side
  //     AURA_RENDER_STYLE=toon|pbr; the browser route reads it via Vite's import.meta.env).
  //   - otherwise (undefined / true)     → stylized → cel ON.
  // M2 — resolve the REAL engine cel material LAZILY + NON-FATALLY: if the aliased @aura3d/rendering
  // build predates AnimationToonMaterial the import yields undefined and we fall back to PBR — never
  // a hard module-link crash.
  const renderStylePbr =
    ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_AURA_RENDER_STYLE ?? "")
      .trim()
      .toLowerCase() === "pbr";
  const inShaderCel = doc.set.inShaderCel !== false && !renderStylePbr;
  const celKeyDir: Vec3 = [0.4, 0.82, 0.45]; // upper-front key, matching the softbox/3-point key
  type CelCtor = new (o: { name: string; baseColor: [number, number, number, number]; bands: number; shadowFloor: number; lightDirection: Vec3; rimColor?: [number, number, number]; rimPower?: number; rimIntensity: number }) => RenderItem["material"];
  let CelMaterial: CelCtor | undefined;
  if (inShaderCel) {
    try {
      const mod = (await import("@aura3d/rendering")) as unknown as { AnimationToonMaterial?: CelCtor };
      CelMaterial = mod.AnimationToonMaterial;
      if (!CelMaterial) console.warn("[scene-player] inShaderCel (stylized default) requested but AnimationToonMaterial absent from the build; falling back to PBR.");
      else console.info("[scene-player] inShaderCel ON (stylized default): non-glow set pieces use AnimationToonMaterial.");
    } catch (err) {
      console.warn(`[scene-player] AnimationToonMaterial import failed (${(err as Error).message}) → PBR set pieces.`);
    }
  } else {
    console.info(`[scene-player] inShaderCel OFF → PBR set pieces (${renderStylePbr ? "VITE_AURA_RENDER_STYLE=pbr" : "doc.set.inShaderCel=false"}).`);
  }
  const glowPieces: { material: PBRMaterial; dim: number; full: number }[] = [];
  const setItems: RenderItem[] = doc.set.pieces.map((piece) => {
    const rgba = [...piece.baseColor];
    const material: RenderItem["material"] =
      CelMaterial && !piece.glow
        ? new CelMaterial({
            name: `set-${piece.id}`,
            baseColor: [rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0, rgba[3] ?? 1],
            // M2 cel tuning for a CLEAN look: 4 bands give crisp, readable cel steps without the
            // posterized banding 5+ produces on smooth primitives; shadowFloor 0.32 keeps the
            // darkest band off pure black so shapes stay readable in shadow; a soft, tight rim
            // (cool color, power 3) pops the silhouette without haloing.
            bands: 4,
            shadowFloor: 0.32,
            lightDirection: celKeyDir,
            rimColor: [0.7, 0.82, 1],
            rimPower: 3,
            rimIntensity: 0.4
          })
        : new PBRMaterial({
            name: `set-${piece.id}`,
            baseColor: [...piece.baseColor],
            metallic: piece.metallic ?? 0,
            roughness: piece.roughness ?? 0.85,
            emissiveColor: piece.emissiveColor ? [...piece.emissiveColor] : [0, 0, 0],
            emissiveStrength: piece.glow ? piece.glow.dim : piece.emissiveStrength ?? 0
          });
    if (piece.glow && material instanceof PBRMaterial) glowPieces.push({ material, dim: piece.glow.dim, full: piece.glow.full });
    return {
      label: piece.id,
      geometry: BASE_GEOMETRY[piece.geometry],
      material,
      modelMatrix: composeMat4([...piece.position], quatFromEuler(0, 0, piece.roll ?? 0), [...piece.scale]) as Mat4,
      includeInAutoFrame: piece.includeInAutoFrame ?? false
    };
  });
  /** Drive every glow piece's emissive from the eased dim→sparkle world-state. */
  function applyWorldGlow(eased: number): void {
    for (const g of glowPieces) g.material.setParameter("u_emissiveStrength", g.dim + (g.full - g.dim) * eased);
  }
  applyWorldGlow(sampleWorldStateGlow(doc, 0));

  // 4. Lights: M3 — a REAL 3-point rig (key/fill/rim) balanced for characters + the document's
  // point rig. The `inspection` preset is a true 3-point setup (warm front key with shadows, cool
  // side fill, warm back rim) that reads as intentional studio lighting and separates the character
  // from the backdrop; the softbox preset previously used had NO rim (flat). The key (and only the
  // key) casts shadow maps so we get one clean shadow, not three.
  //
  // M3 — SHADOWS DEFAULT-ON for the studio render unless a flag disables. Real shadow maps ground
  // the character (cast/receive) and add depth. Disable paths:
  //   - `doc.set.realShadows === false`  → explicit document opt-out.
  //   - `import.meta.env.VITE_AURA_SHADOWS === "off"` → flag opt-out.
  // The cheap contact-shadow blobs below still ground every character regardless.
  const shadowsDisabledByFlag =
    ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_AURA_SHADOWS ?? "")
      .trim()
      .toLowerCase() === "off";
  const realShadows = doc.set.realShadows !== false && !shadowsDisabledByFlag;
  console.info(`[scene-player] real shadow maps ${realShadows ? "ON (studio key casts shadows)" : "OFF"}; 3-point key/fill/rim lighting rig.`);
  const lights: readonly CollectedLight[] = [
    ...createStudioLighting({ preset: "inspection", shadows: realShadows, intensityScale: doc.set.studioLightingScale }),
    ...doc.set.lights.map((l): CollectedLight => {
      const source = new PointLight(l.id);
      source.intensity = l.intensity;
      source.range = l.range;
      return {
        kind: "point",
        color: l.color,
        intensity: l.intensity,
        position: l.position,
        direction: [0, -1, 0],
        range: l.range,
        spotAngle: 0,
        penumbra: 0,
        castsShadow: false,
        layerMask: 0xffffffff,
        source
      };
    })
  ];

  // 5. Contact shadows (one per character, at its staged ground position).
  const shadowState = new Map<string, { position: Vec3; scale: number }>();
  function collectCharacterShadows(): RenderItem[] {
    const items: RenderItem[] = [];
    for (const [, s] of shadowState) {
      const r = 0.4 * s.scale;
      items.push({
        label: "contact-shadow",
        geometry: BASE_GEOMETRY.sphere,
        material: SHADOW_MATERIAL,
        modelMatrix: composeMat4([s.position[0], 0.02, s.position[2] + 0.05], quatFromEuler(0, 0, 0), [r, 0.01, r * 0.7]) as Mat4,
        includeInAutoFrame: false
      });
    }
    return items;
  }

  // 6. Per-shot camera paths (framing from the document).
  const cameraPathByShot = new Map<string, CameraPath>(
    doc.shots.map((shot) => [
      shot.shotId,
      createCameraPathFromPreset({
        id: `live-cam:${shot.shotId}`,
        presetId: shot.presetId,
        startTime: shot.startTime,
        endTime: shot.endTime,
        subjectPosition: [...shot.cameraSubject]
      })
    ])
  );

  // 7. Renderer + render source.
  const renderer = await A3DRenderer.create({
    canvas,
    width,
    height,
    backend: "webgl2",
    alpha: false,
    clearColor: [...doc.set.clearColor]
  });

  // M3 IBL — if the set carries an `hdri` spec, BAKE a 1024×512 equirectangular environment image
  // and wire it as the engine's real `environmentMapTexture` (image-based lighting for PBR mode). It
  // composes ON TOP of the procedural ambient: the procedural map stays the floor, the sampled HDRI
  // adds image-based diffuse/specular + a directional sun highlight. Absent → procedural map only.
  let bakedHdri: BakedHdri | undefined;
  const hdriSpec = doc.set.environment.hdri;
  if (hdriSpec) {
    bakedHdri = bakeSetHdri(doc.id, hdriSpec);
    console.info(
      `[scene-player] IBL ON — baked 1024×512 equirect HDRI (env map intensity ${bakedHdri.intensity}, specular ${bakedHdri.specularIntensity})${hdriSpec.sun ? " + sun disc" : ""}.`
    );
  } else {
    console.info("[scene-player] IBL — procedural environment map only (no per-set HDRI bitmap).");
  }
  // I1 clean-room hardening: the baked HDRI env map is an OPTIONAL enhancement on top of the
  // procedural ambient — it must NEVER be a hard render requirement. The binding MUST degrade
  // gracefully (warn + continue without IBL) instead of crashing the render.
  //
  // Root cause of the clean-room crash (diagnosed by rendering it): in the monorepo a SINGLE deduped
  // @aura3d/engine is loaded, so every `TextureBinding` — ours, the engine's auto-generated env-map
  // mip chain, and its BRDF-LUT — is the SAME class and the renderer's `MaterialBinding.bind`
  // (`value instanceof TextureBinding`, see rendering/MaterialBinding.ts) accepts them. In a CLEAN-ROOM
  // install from tarballs the engine resolves into SEVERAL Vite-prebundled chunks: the app's
  // `@aura3d/rendering` (which builds our env map) and `@aura3d/engine/advanced-runtime` (the renderer,
  // which builds the internal env-map/BRDF-LUT bindings) get DIFFERENT `TextureBinding` class objects,
  // so the `instanceof` check fails and the renderer throws `MaterialBindingError`
  // ("u_environmentMapTexture must be texture2d" / "Unsupported uniform value"). This is unfixable from
  // the template (the engine's OWN internal BRDF-LUT binding crosses the chunk boundary too), and a
  // failed render permanently poisons the engine's environment resources — so we must decide BEFORE any
  // render and never bind the env map when the engine is multi-chunk.
  //
  // The reliable, NON-POISONING signal is exactly that class-identity divergence: if our baked binding
  // (from `@aura3d/rendering`) is NOT `instanceof` the engine renderer's own `TextureBinding` (from
  // `@aura3d/engine/advanced-runtime`), the engine is multi-chunk and its internal env bindings will be
  // rejected too → skip IBL. When they ARE the same class (the monorepo / a correctly-deduped install)
  // IBL stays on, so this never changes the monorepo render's success.
  let iblBinding:
    | {
        readonly environmentMapTexture: BakedHdri["binding"];
        readonly environmentMapIntensity: number;
        readonly environmentMapSpecularIntensity: number;
        readonly environmentMapEncoding: "srgb";
        readonly environmentMapMipCount: number;
      }
    | undefined;
  if (bakedHdri) {
    const engineWillAcceptBinding = bakedHdri.binding instanceof EngineTextureBinding;
    if (engineWillAcceptBinding) {
      iblBinding = {
        environmentMapTexture: bakedHdri.binding,
        environmentMapIntensity: bakedHdri.intensity,
        environmentMapSpecularIntensity: bakedHdri.specularIntensity,
        environmentMapEncoding: "srgb" as const,
        environmentMapMipCount: 1
      };
    } else {
      console.warn(
        `[scene-player] IBL DISABLED — the baked HDRI env map cannot be bound by the renderer ` +
          `(its TextureBinding is a different class than the engine renderer's, i.e. @aura3d/engine resolved ` +
          `into multiple chunks). Continuing with procedural ambient lighting only; the scene still renders ` +
          `WITHOUT image-based lighting. (Expected in a clean-room install; IBL is an enhancement, not a requirement.)`
      );
    }
  }

  const source: RenderSource = {
    collectRenderItems: () => [
      ...setItems,
      ...collectSetDressing(),
      ...collectCharacterShadows(),
      ...characters.flatMap((c) => c.actor.collectRenderItems())
    ],
    cameraPolicy: "auto-frame",
    cameraFrameBounds: { min: [-2.6, -0.1, -1.6], max: [2.6, 3.4, 1.6] },
    collectedLights: lights,
    environmentLighting: {
      color: [...doc.set.environment.color],
      intensity: doc.set.environment.intensity,
      proceduralMap: {
        skyColor: [...doc.set.environment.proceduralMap.skyColor],
        horizonColor: [...doc.set.environment.proceduralMap.horizonColor],
        groundColor: [...doc.set.environment.proceduralMap.groundColor],
        specularColor: [...doc.set.environment.proceduralMap.specularColor],
        intensity: doc.set.environment.proceduralMap.intensity,
        specularIntensity: doc.set.environment.proceduralMap.specularIntensity
      },
      // Real IBL: equirect 2D environment map sampled for diffuse irradiance + specular reflection.
      // `iblBinding` is set above ONLY when the baked env map is the engine's own `TextureBinding`
      // class (so the renderer's `instanceof` validator accepts it); otherwise it is undefined and
      // IBL is skipped, leaving the procedural ambient as the lighting floor.
      ...(iblBinding ?? {})
    }
  };

  // 8. Pose at episode time `t`, drive camera + lip-sync + world-state, render.
  const poseAt = (time: number, options: LiveSeekOptions = {}): LiveRouteSeekProof => {
    const shot = shotAtTime(doc, time);
    const gardenGlow = sampleWorldStateGlow(doc, time);
    applyWorldGlow(gardenGlow);

    // Resolve the active speaker (the AuraVoice dialogue contract) once per frame: it drives both
    // the per-character intent (talk vs react/listen) and the look-at (everyone faces the speaker).
    const captionNow = sampleCaption(doc, time);
    const activeSpeakerId = captionNow.speakerId;
    const anyDialogue = activeSpeakerId.length > 0;
    // Stage each character's ground mark first so look-at can aim non-speakers at the speaker.
    const staged = characters.map((character) => ({
      character,
      blocking: sampleBlocking(doc, character.id, time, { position: [0, 0, 0], yaw: 0, clip: character.defaultClip })
    }));
    const speakerMark = staged.find((s) => s.character.id === activeSpeakerId)?.blocking.position;

    // B6 — per-character foot-handling status for this frame (surfaced in the free-form debug
    // overlay below). `rootGrounding` for sparse rigs; `footIK(n grounded)` where true IK ran.
    const footStatus = new Map<string, string>();

    const characterProofs: LiveRouteSeekProof["characters"] = staged.map(({ character, blocking }) => {
      const speaking = character.id === activeSpeakerId;
      // Run when traversing a long distance (the standard `run` intent); else walk while moving.
      const running = blocking.moving && /run|sprint/i.test(blocking.clip);
      // B7 — speaking performance: a talking beat must move MORE than the mouth. `resolveIntent`
      // returns `talk` for the active speaker (independent of whether the rig even HAS a mouth
      // morph), so `poseFor("talk")` below plays the standard talk clip — head + torso/shoulder
      // body motion — for EVERY speaker, including mouthless rigs (mouthMorphIndex < 0). The mouth
      // morph (when present) is layered ON TOP, never a substitute for the body performance.
      const intent = resolveIntent({
        clip: blocking.clip,
        moving: blocking.moving,
        running,
        speaking,
        anyDialogue
      });

      // 2.6 / B7 lip-sync: mouth-openness from the dialogue/viseme track (speaker only). The morph
      // (if the rig has one) is driven below. B7 — prevent a long STATIC mouth-open hold: the viseme
      // must PULSE with the dialogue. `sampleVisemeOpenness` oscillates but never closes (min ≈0.18),
      // so a held line would read as a frozen open mouth. We gate it with a faster syllable-cadence
      // pulse (≈3.3 Hz) that dips toward closed between syllables — only while this character is the
      // active speaker — so the mouth visibly opens AND closes across the line instead of holding open.
      const viseme = sampleVisemeOpenness(doc, time, character.id);
      let mouthOpenness = options.mouthOverride ?? viseme.mouthOpenness;
      if (options.mouthOverride === undefined && speaking && mouthOpenness > 0) {
        // Syllable gate in [0,1]: a raised-cosine pulse that returns near 0 between syllables, so the
        // mouth closes (not just dims) between beats. ~3.3 syllables/sec ≈ natural speaking cadence.
        const syllableGate = 0.5 - 0.5 * Math.cos(time * Math.PI * 2 * 3.3);
        // Map the (never-closing) sampled openness through the gate: full open at a syllable peak,
        // near-closed in the trough — eliminating the static open hold while keeping lip motion lively.
        mouthOpenness = mouthOpenness * (0.18 + 0.82 * syllableGate);
      }

      // B3 motion-source order (explicit + logged via decision.source):
      //   (1) extracted universal-catalog clip for this intent → (2) procedural standard clip
      //       — both produced by `poseFor` (the library is the DEFAULT first choice),
      //   (3) a RICH, genuinely-matching embedded GLB clip ONLY when the library pose is empty
      //       (idle-fallback) or carries no real body motion,
      //   (4) idle last resort (already handled inside `poseFor`).
      const libraryResult = character.perf.poseFor(intent, time);
      let decision: ClipDecision = libraryResult.decision;

      // A rich embedded clip is a fallback, not the default: only consider it when the library gave
      // us nothing usable for this intent (no body motion) AND the GLB ships a non-trivial match.
      const libraryWeak = decision.source === "idle-fallback" || decision.bonesTouched === 0;
      const embedded =
        libraryWeak && character.perf.preferEmbedded
          ? pickClip(embeddedClipForIntent(intent, character.availableClips) ?? "", character.availableClips)
          : undefined;

      let apply: ReturnType<TypedGLBActor["playClip"]>;
      let resolvedClip: string;
      if (embedded) {
        apply = character.actor.playClip(embedded, time);
        resolvedClip = embedded;
        // We played the GLB's own embedded clip; record that as the motion source. (Per-bone body
        // amplitude isn't measured for embedded playback here — the gate treats embedded as a
        // distinct, lower-confidence source than the rig-neutral library pose.)
        decision = { ...decision, clipId: intent, source: "embedded" as ClipSource };
      } else {
        const pose = libraryResult.pose;
        // GLTFScenePose accepts {x,y,z}/{x,y,z,w} transforms; same shape the retargeter emits.
        apply = character.actor.applyRetargetedPose(pose as never, time);
        resolvedClip = intent;
      }
      // B1 — the pose/clip actually reached the GLB skeleton at runtime when the actor reported it
      // wrote ≥1 skinned track (tracksApplied) or updated ≥1 skinning palette. A decision whose
      // motion never touched a real skeleton node (tracksApplied===0) is a SILENT no-op and must NOT
      // be trusted by the gate as "the body moved" — `reachedGLBRuntime:false` surfaces that.
      decision = {
        ...decision,
        reachedGLBRuntime: apply.tracksApplied > 0 || apply.skinningPalettesUpdated > 0
      };

      // 2.7 look-at: non-speakers turn to face the active speaker; otherwise honor the directed yaw.
      let yaw = blocking.yaw;
      if (!speaking && speakerMark && !blocking.moving) {
        const dx = speakerMark[0] - blocking.position[0];
        const dz = speakerMark[2] - blocking.position[2];
        if (Math.hypot(dx, dz) > 0.05) yaw = Math.atan2(dx, dz);
      }
      const rotation = quatFromEuler(0, yaw, 0);
      // B6 — `rootGrounding` (NOT true IK): pin the staged root at y from the blocking mark
      // (ground = 0) so the retargeted hip-bob / walk cycle animates the body WITHOUT the
      // character floating off the floor. This is honest root grounding — it does NOT solve the
      // leg chain. It is the baseline for EVERY character and the ONLY foot handling for sparse /
      // mascot rigs (grade C, no ankle chain). The contact-shadow blob tracks the same mark below.
      let rootY = blocking.position[1];
      // B6 — TRUE foot IK: ONLY for rigs that actually carry the leg/knee/ankle/foot chain (set up
      // at load time as `character.footIk`). The engine's real two-bone solver drops the hip so the
      // lower foot reaches the ground and foot-locks a planted foot in world space (no slide). We
      // apply the solved hip offset on top of rootGrounding; sparse rigs skip this entirely.
      let footIkGroundedFeet = -1; // -1 ⇒ rootGrounding only (no true IK on this rig).
      if (character.footIk) {
        try {
          const ik = character.footIk.solveFootPlacement();
          rootY += ik.hipOffset; // hipOffset ≤ 0: lower the hip so the planted foot reaches ground.
          footIkGroundedFeet = ik.groundedFeet;
        } catch {
          // Non-fatal: fall back to rootGrounding for this frame if the solve throws.
          footIkGroundedFeet = -1;
        }
      }
      character.actor.pipeline.resources.scene.root.transform
        .setPosition(blocking.position[0], rootY, blocking.position[2])
        .setRotation(rotation[0], rotation[1], rotation[2], rotation[3])
        .setScale(character.scale, character.scale, character.scale);
      footStatus.set(
        character.id,
        footIkGroundedFeet >= 0
          ? `footIK(grade ${character.rigGrade.grade}, ${footIkGroundedFeet} grounded)`
          : `rootGrounding(grade ${character.rigGrade.grade})`
      );
      shadowState.set(character.id, { position: blocking.position, scale: character.scale });

      let mouthMorphWeight = -1;
      if (character.mouthMorphIndex >= 0) {
        mouthMorphWeight = mouthOpenness;
        for (const renderable of character.morphRenderables) {
          while (renderable.morphWeights.length <= character.mouthMorphIndex) renderable.morphWeights.push(0);
          renderable.morphWeights[character.mouthMorphIndex] = mouthMorphWeight;
        }
      }

      return {
        id: character.id,
        clip: embedded ? `${resolvedClip} (embedded:${intent})` : `${intent} (${decision.source})`,
        position: blocking.position,
        sweeping: blocking.sweeping,
        tracksApplied: apply.tracksApplied,
        skinningPalettesUpdated: apply.skinningPalettesUpdated,
        skinningBindingCount: character.actor.snapshot().skinningBindingCount,
        mouthOpenness,
        visemeId: viseme.visemeId,
        mouthMorphWeight,
        mouthMorphIndex: character.mouthMorphIndex,
        primitiveMouthOpen: 0,
        clipDecision: { ...decision, characterId: character.id, time: +time.toFixed(3) }
      };
    });

    const captionCue = sampleCaption(doc, time);
    const caption = { text: captionCue.text, speakerId: captionCue.speakerId, captionId: captionCue.lineId };

    const path = cameraPathByShot.get(shot.shotId)!;
    const camera = cameraViewProjection(path, time, aspect);
    const diagnostics = renderer.render(source, { viewProjectionMatrix: camera.viewProjectionMatrix });

    const skinnedRenderItems = characters.reduce(
      (sum, character) => sum + character.actor.collectRenderItems().filter((item) => item.skinning).length,
      0
    );
    // B1 debug overlay: one inspectable line per character with clip←intent [source] + body motion.
    const debugOverlay = characterProofs.map((c) => {
      const d = c.clipDecision;
      const foot = footStatus.get(c.id) ?? "rootGrounding";
      const glb = d.reachedGLBRuntime ? "GLB✓" : "GLB✗";
      return `${c.id}: ${d.clipId}←${d.intent} [${d.source}] ${d.bonesTouched}bones ${d.maxRotAmplitudeRad.toFixed(3)}rad transΔ${d.maxTransAmplitude.toFixed(3)} rootΔ${d.rootTranslation.toFixed(3)} ${glb} ${foot}`;
    });
    // B1 — paint the overlay into the proof DOM each frame (only when AURA_DEBUG_OVERLAY=1). The
    // overlay element is always present so a test can assert it exists; it stays hidden otherwise.
    if (debugOverlayEl && debugOverlayEnabled) {
      debugOverlayEl.textContent = `t=${time.toFixed(2)}s  shot=${shot.shotId}\n${debugOverlay.join("\n")}`;
    }
    return {
      time,
      drawCalls: diagnostics.drawCalls,
      skinnedRenderItems,
      gardenGlow,
      shot: {
        shotId: shot.shotId,
        presetId: String(shot.presetId),
        episodeTime: (shot.startTime + shot.endTime) / 2,
        cameraPosition: camera.position,
        fov: camera.fov
      },
      caption,
      debugOverlay,
      characters: characterProofs
    };
  };

  liveWindow.__auraSeek__ = poseAt;
  liveWindow.__AURA_LIVE_ROUTE_READY__ = {
    ready: true,
    backend: renderer.device.kind,
    characters: characters.map((character) => {
      const snapshot = character.actor.snapshot();
      return {
        id: character.id,
        url: character.actor.asset.url,
        clip: pickClip(character.defaultClip, character.availableClips) ?? character.defaultClip,
        clips: snapshot.clips,
        skinningBindingCount: snapshot.skinningBindingCount,
        skinnedRenderItemCount: character.actor.evidence.skinnedRenderItemCount
      };
    })
  };

  // Live preview loop (skipped during headless seek capture).
  let start = performance.now();
  const loop = (): void => {
    if (!liveWindow.__AURA_LIVE_ROUTE_HEADLESS__) poseAt((performance.now() - start) / 1000);
    window.requestAnimationFrame(loop);
  };
  poseAt(0);
  start = performance.now();
  window.requestAnimationFrame(loop);
}
