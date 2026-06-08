/**
 * animation-performance.ts — the Phase 2.5 KEYSTONE helper for `scene-player.ts`.
 *
 * It turns the SHARED, rig-neutral animation library (`@aura3d/animation`'s standard humanoid
 * clip registry + performance state graph) into per-frame poses that drive ANY character GLB:
 *
 *   beat clip intent  ──▶  performance state graph  ──▶  sample standard library clip
 *                                                          │ (rig-neutral AnimationPose)
 *                                                          ▼
 *                                       retargetHumanoidPose(pose, map)   (→ GLB node names)
 *                                                          │
 *                                                          ▼
 *                                       actor.applyRetargetedPose(pose)
 *
 * The library + retargeting come from the FRESHLY-BUILT monorepo `dist/animation`. The template's
 * own published `node_modules/@aura3d/animation` predates Phase 2.4/2.5 (no clip library / rig
 * inference / state graph), and the render route only aliases a fixed list of `@aura3d/*` specifiers
 * — NOT `@aura3d/animation`. So we import the in-repo build by relative path (the same monorepo dist
 * the rest of the route is validated against; vite's workspace fs.allow covers it).
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at runtime to the freshly-built monorepo dist (has co-located .d.ts).
import {
  inferHumanoidRig,
  createHumanoidRetargetingMap,
  retargetHumanoidPose,
  createStandardHumanoidClipRegistry,
  createStandardHumanoidClipDefinitions,
  createPerformanceStateGraph,
  AnimationClipRegistry,
  AnimationTrack,
  STANDARD_LIBRARY_RIG,
  STANDARD_CLIP_IDS,
  PERFORMANCE_GRAPH_PARAMETERS
} from "@aura3d/animation";

type StandardClipId = (typeof STANDARD_CLIP_IDS)[number];

/**
 * B1/B3 motion-source provenance. `extracted` = a real catalog-mocap clip from the
 * universal `public/clip-library/<intent>.json`; `procedural` = the standard-library
 * synthesized clip; `embedded` = a rich GLB clip shipped by the character itself;
 * `idle-fallback` = the last-resort idle clip (no usable motion for the intent).
 */
export type ClipSource = "extracted" | "procedural" | "embedded" | "idle-fallback";

/** Canonical body bones a downstream gate measures (EXCLUDING mouth morph + caption + camera). */
export const BODY_BONES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm"
] as const;
export type BodyBoneName = (typeof BODY_BONES)[number];

/**
 * One character/one-beat clip-decision record (B1). It is emitted per-frame from the
 * performance rig and bubbled into the route seek proof + the render summary so a
 * downstream gate can prove the BODY moves (not just the mouth morph).
 */
export interface ClipDecision {
  /** The standard intent that was requested for this beat. */
  readonly intent: StandardClipId;
  /** The clip id actually sampled (may differ from intent when the graph auto-returns to idle). */
  readonly clipId: StandardClipId;
  /** Where the sampled motion came from (extracted catalog / procedural / embedded / idle fallback). */
  readonly source: ClipSource;
  /** Count of canonical body bones whose rotation amplitude this frame exceeds a tiny epsilon. */
  readonly bonesTouched: number;
  /** Largest per-body-bone rotation amplitude (radians) applied this frame. */
  readonly maxRotAmplitudeRad: number;
  /**
   * Largest per-body-bone TRANSLATION amplitude (metres) applied this frame across ALL sampled bones
   * (not just the hips root) — a body bone that physically displaces (weight shift, hip bob, hand
   * reach) shows up here even when its rotation is small. B1 contract field.
   */
  readonly maxTransAmplitude: number;
  /** Per-body-bone rotation amplitude (radians) keyed by canonical bone (gate input, mouth-free). */
  readonly bodyBoneRotationRad: Partial<Record<BodyBoneName, number>>;
  /** Root (hips) translation magnitude applied this frame (locomotion / weight shift). */
  readonly rootTranslation: number;
  /**
   * B1 — did this decision's pose actually reach the GLB skeleton at runtime? The library pose only
   * proves the LIBRARY moved; this is set true by `scene-player.ts` once the retargeted pose (or an
   * embedded clip) was applied to ≥1 real skinned skeleton node (`applyRetargetedPose` /
   * `playClip` reported tracks applied). `poseFor` emits it `false`; the player overwrites it.
   */
  readonly reachedGLBRuntime: boolean;
}

/** The 8 standard performance ids (idle/talk/gesture/point/nod/walk/run/react). */
export const STANDARD_INTENTS = STANDARD_CLIP_IDS as readonly StandardClipId[];

const INTENT_SET = new Set<string>(STANDARD_INTENTS);

/** Loop-vs-one-shot per standard clip (one-shots auto-return to idle in the graph). */
const ONE_SHOT = new Set<StandardClipId>(["gesture", "point", "nod", "react"]);

/** Plain pose transform shapes (match `@aura3d/animation`'s AnimationPose). */
interface PoseTransform {
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number; w: number };
}
interface SamplablePose {
  bones: Record<string, PoseTransform>;
  morphTargets?: Record<string, number>;
}

interface SamplableTrack {
  readonly target: string;
  readonly valueType: string;
  sample(time: number): readonly number[];
}
interface LibraryClip {
  readonly id: StandardClipId;
  readonly duration: number;
  readonly loop: boolean;
  readonly tracks: readonly SamplableTrack[];
}

/**
 * Map an episode beat's clip field + motion state to one of the standard performance intents.
 *
 *  - A director-built document already emits a STANDARD intent (`talk`, `react`, `walk`, …) — use it.
 *  - An AUTHORED document (e.g. Moon Garden) carries GLB-clip placeholder names (`Loops`, `Run`,
 *    `Idle`) that are NOT standard intents — derive the intent from speaking/movement so those
 *    characters still perform from the shared library instead of looping one embedded clip.
 *  - Movement always wins (walk/run) so a translating character animates its legs.
 */
export function resolveIntent(input: {
  readonly clip: string;
  readonly moving: boolean;
  readonly running: boolean;
  readonly speaking: boolean;
  readonly anyDialogue: boolean;
}): StandardClipId {
  // Locomotion is VELOCITY-GATED, never name-gated: legs cycle ONLY while the root is actually
  // translating. `moving`/`running` come from the per-frame waypoint velocity (sampleBlocking).
  if (input.running) return "run";
  if (input.moving) return "walk";
  // Stationary now. A shot whose authored clip is walk/run must NOT keep walking in place once the
  // character has reached its mark — that is the treadmill/moonwalk bug. So when stopped, IGNORE a
  // locomotion clip name and fall through to the performance/idle state; honor only a non-locomotion
  // performance clip name (gesture/point/nod/react/talk/idle).
  const raw = input.clip.trim().toLowerCase();
  const isLocomotion = raw === "walk" || raw === "run" || /run|sprint|walk|move|loco|jog|stride/.test(raw);
  if (!isLocomotion) {
    if (INTENT_SET.has(raw)) return raw as StandardClipId;
    // Heuristic mapping for common embedded/authored names → standard intent.
    if (/wave|gesture|emote/.test(raw)) return "gesture";
    if (/point/.test(raw)) return "point";
    if (/nod|agree/.test(raw)) return "nod";
    if (/react|surprise|recoil/.test(raw)) return "react";
    if (/talk|speak|dialog/.test(raw)) return "talk";
  }
  // Locomotion clip but stopped, or no usable name — fall back to the dialogue state.
  if (input.speaking) return "talk";
  if (input.anyDialogue) return "react";
  return "idle";
}

/** One character's shared-library performance driver (state graph + retarget map + clips). */
export interface PerformanceRig {
  /** GLB node names this rig will write to (used to build a clean identity base each frame). */
  readonly targetNodeNames: readonly string[];
  /** Retarget map coverage (standard rig → this GLB rig); low coverage = sparse skeleton. */
  readonly coverage: number;
  /** True when the GLB's own clips are rich enough to be preferred over retargeting (fallback rule). */
  readonly preferEmbedded: boolean;
  /**
   * Produce the GLB-node-keyed pose for `intent` at episode time `t`. Returns a pose whose `bones`
   * keys are the GLB's node names — feed straight into `actor.applyRetargetedPose(pose)` — plus a
   * B1 {@link ClipDecision} measuring the body-bone motion this frame (mouth/caption/camera-free).
   */
  poseFor(intent: StandardClipId, t: number, morph?: Record<string, number>): {
    readonly pose: SamplablePose;
    readonly decision: ClipDecision;
  };
  /** Current state-graph state name (for the proof / debugging). */
  readonly state: string;
}

export interface PerformanceRigOptions {
  /** Flat list of the GLB's skeleton node names (for rig inference). */
  readonly nodeNames: readonly string[];
  /** The GLB's own embedded clip names (used by the fallback rule). */
  readonly embeddedClips: readonly string[];
  /** B3 per-intent motion source (extracted catalog vs procedural) from {@link loadSharedClipLibrary}. */
  readonly sources?: Readonly<Record<StandardClipId, "extracted" | "procedural">>;
}

/** Build the (procedural) shared clip registry once and reuse across characters. */
export function createSharedClipRegistry(): ReturnType<typeof createStandardHumanoidClipRegistry> {
  return createStandardHumanoidClipRegistry();
}

/** A shared registry plus the resolved motion SOURCE per standard intent (B3). */
export interface SharedClipLibrary {
  readonly registry: ReturnType<typeof createStandardHumanoidClipRegistry>;
  /** Per-intent: did the first-choice EXTRACTED catalog clip load, or did we fall to procedural? */
  readonly sources: Readonly<Record<StandardClipId, "extracted" | "procedural">>;
}

/** Shape of a `public/clip-library/<id>.json` file (mirrors build-clip-library.ts serialization). */
interface SerializedClipFile {
  readonly id: StandardClipId;
  readonly name: string;
  readonly duration: number;
  readonly frameRate: number;
  readonly loop: boolean;
  readonly tags?: readonly string[];
  readonly source?: string;
  readonly rig?: string;
  readonly tracks: { target: string; valueType: string; keyframes: unknown[] }[];
  readonly provenance?: { source?: string };
}

/**
 * B3 — load the shared clip registry with the EXTRACTED universal catalog library as the
 * DEFAULT first choice. Mirrors `loadExtractedClipLibrary` from `scripts/build-clip-library.ts`,
 * but uses `fetch` (the player runs in the browser, where `node:fs` is unavailable) to read the
 * SAME `public/clip-library/<intent>.json` files that script writes. We start from the procedural
 * standard clips and OVERRIDE each intent with its real extracted catalog clip when one exists;
 * intents with no usable extracted clip keep the procedural baseline (and are logged as such).
 *
 * Fallback order per intent (logged): extracted catalog clip → procedural standard clip.
 * (The embedded-GLB and idle fallbacks live at the per-character decision layer in `poseFor`.)
 */
export async function loadSharedClipLibrary(
  baseUrl = "/clip-library"
): Promise<SharedClipLibrary> {
  const registry = new AnimationClipRegistry(createStandardHumanoidClipDefinitions());
  const sources: Record<StandardClipId, "extracted" | "procedural"> = Object.create(null);
  for (const id of STANDARD_INTENTS) sources[id] = "procedural";

  // MOTION-SOURCE POLICY (render-verified, TWICE). The extracted catalog mocap DISTORTS the real
  // 21-joint character rig: with legs it removes/collapses them; even "upper-body only" it stretches
  // the arms to the floor and compresses the lower body. Both failures were only caught in a real
  // render (FK overlays + numeric checks passed). So the DEFAULT is the PROCEDURAL baseline — proven
  // to render clean: natural standing, normal arm length, full intact legs. Extracted is opt-in for
  // future per-rig validation only.
  //   - default (off)       → pure procedural baseline (clean, stable) ← DEFAULT
  //   - AURA_EXTRACTED=upper-body → extracted upper-body + stripped legs (distorts arms; validation only)
  //   - AURA_EXTRACTED=full → keep leg tracks too (breaks legs; validation only)
  const extractedMode = (typeof process !== "undefined" && process.env?.AURA_EXTRACTED) || "off";
  if (extractedMode === "off") {
    console.info("[animation-performance] extracted clips OFF → procedural baseline (clean rig; mocap distorts this rig).");
    return { registry, sources };
  }
  const STRIP_LEGS = extractedMode !== "full";
  const LEG_BONE = /(leg|knee|foot|toe|ankle|thigh|shin)/i;

  await Promise.all(
    STANDARD_INTENTS.map(async (id) => {
      try {
        // Locomotion (walk/run) IS the legs — stripping their leg tracks would leave the character
        // gliding with no step. Keep the PROCEDURAL walk/run (real, stable leg cycle); use extracted
        // only for the upper-body-dominant intents (talk/gesture/nod/point/react/idle).
        if (STRIP_LEGS && (id === "walk" || id === "run")) {
          console.info(`[animation-performance] clip-library/${id}.json → procedural (locomotion keeps its leg cycle).`);
          return;
        }
        const res = await fetch(`${baseUrl}/${id}.json`, { cache: "no-cache" });
        if (!res.ok) {
          console.warn(`[animation-performance] clip-library/${id}.json HTTP ${res.status} → procedural baseline.`);
          return;
        }
        const file = (await res.json()) as SerializedClipFile;
        // Only override with a REAL extracted catalog clip; procedural-fallback files are identical
        // to the baseline already registered, so registering them would just be noise.
        if (file.provenance?.source !== "catalog-extracted") {
          console.warn(`[animation-performance] clip-library/${id}.json is "${file.provenance?.source ?? "unknown"}" (not catalog-extracted) → procedural baseline.`);
          return;
        }
        // SANITY GATE: reject extracted clips whose root (hips) motion is in raw/un-normalized
        // units or carries a collapsing static offset — those displace the character to the floor.
        // Clean clips on the standard rig (meters) keep hips translation ≲1m and hips rotation
        // near identity. Until the extraction pipeline normalizes units + rest pose, fall back to
        // the (cranked) procedural baseline for any clip that fails this — so the default is never broken.
        {
          let maxTrans = 0;
          let maxHipsRotOffset = 0;
          // A clip with a baked axis-conversion rest offset (e.g. a constant 90° head/limb
          // rotation from a Z-up source) is INVISIBLE to a range-based check — the bone never
          // moves, it just sits rotated, and retargeting bakes that 90° onto the target rig so
          // the character renders laid-down / contorted. Detect it by the bone that stays
          // FARTHEST from rest the whole clip: for each rotation track take the MIN offset from
          // identity across keyframes (the closest it ever gets to rest); genuine motion passes
          // near rest, a baked offset never does. Reject if any bone's floor exceeds the limit.
          const REST_FLOOR_LIMIT = 0.15; // ≈ a bone pinned ≥64° from rest for the entire clip
          let worstRestFloor = 0;
          let worstRestBone = "";
          for (const tr of file.tracks) {
            const isHipsT = /(^|[.\/])hips\.translation$/i.test(tr.target);
            const isRot = /\.rotation$/i.test(tr.target);
            const isHipsR = /(^|[.\/])hips\.rotation$/i.test(tr.target);
            if (isHipsT) {
              for (const kf of tr.keyframes as { value: number[] }[])
                for (const c of kf.value ?? []) maxTrans = Math.max(maxTrans, Math.abs(c));
            }
            if (isRot) {
              let restFloor = Infinity;
              for (const kf of tr.keyframes as { value: number[] }[]) {
                const v = kf.value ?? [];
                if (v.length < 4) continue;
                const offset = 1 - Math.abs(v[3]!); // |w| far from 1 ⇒ large rotation
                restFloor = Math.min(restFloor, offset);
                if (isHipsR) maxHipsRotOffset = Math.max(maxHipsRotOffset, offset);
              }
              if (restFloor !== Infinity && restFloor > worstRestFloor) {
                worstRestFloor = restFloor;
                worstRestBone = tr.target;
              }
            }
          }
          if (maxTrans > 1.5 || maxHipsRotOffset > 0.25 || worstRestFloor > REST_FLOOR_LIMIT) {
            console.warn(
              `[animation-performance] clip-library/${id}.json rejected (hips trans ${maxTrans.toFixed(2)} / hips rotOffset ${maxHipsRotOffset.toFixed(2)} / ${worstRestBone || "—"} rest-floor ${worstRestFloor.toFixed(2)} — un-normalized or baked rest offset) → procedural baseline.`
            );
            return;
          }
        }
        // Strip leg/foot/toe tracks by default so the extracted mocap drives only the upper body;
        // the legs stay at the clean rest pose (built fresh each frame), which keeps them STABLE on
        // the real character rig. (Hips translation is also a leg-adjacent root signal — drop it too.)
        const usableTracks = STRIP_LEGS
          ? file.tracks.filter((tr) => !LEG_BONE.test(tr.target) && !/hips\.translation$/i.test(tr.target))
          : file.tracks;
        const tracks = usableTracks.map(
          (tr) =>
            new AnimationTrack({
              target: tr.target,
              valueType: tr.valueType as never,
              keyframes: tr.keyframes as never
            })
        );
        registry.register(
          {
            id: file.id,
            name: file.name ?? file.id,
            duration: file.duration,
            frameRate: file.frameRate ?? 30,
            loop: file.loop ?? true,
            tags: file.tags ?? [file.id, "performance", "extracted"],
            source: file.source ?? "aura3d.catalog-extracted",
            tracks: tracks as never,
            metadata: { rig: file.rig ?? STANDARD_LIBRARY_RIG.id, extracted: true }
          } as never,
          { replace: true }
        );
        sources[id] = "extracted";
        console.info(`[animation-performance] clip-library/${id}.json → EXTRACTED catalog clip loaded (${tracks.length} tracks, ${file.duration.toFixed?.(2) ?? file.duration}s).`);
      } catch (err) {
        console.warn(`[animation-performance] clip-library/${id}.json fetch failed (${(err as Error).message}) → procedural baseline.`);
      }
    })
  );

  const extractedCount = STANDARD_INTENTS.filter((id) => sources[id] === "extracted").length;
  console.info(`[animation-performance] shared clip library: ${extractedCount}/${STANDARD_INTENTS.length} intents from EXTRACTED universal catalog, rest procedural.`);
  return { registry, sources };
}

/**
 * Build a {@link PerformanceRig} for one character: infer its humanoid rig from its GLB node names,
 * build a retarget map from the standard library rig onto it, and hold a performance state graph.
 *
 * Fallback rule (Phase 2.5): if the GLB ships rich, named, varied clips of its own (more than one
 * usable motion clip beyond a single idle), we mark `preferEmbedded` so the caller plays the
 * embedded clip whenever the intent matches one. Sparse rigs (one idle, or a skeleton too minimal
 * to retarget well) ALWAYS get retargeted library motion.
 */
export function createPerformanceRig(
  registry: ReturnType<typeof createStandardHumanoidClipRegistry>,
  options: PerformanceRigOptions
): PerformanceRig {
  const rig = inferHumanoidRig(options.nodeNames);
  const map = createHumanoidRetargetingMap(STANDARD_LIBRARY_RIG, rig);
  const targetNodeNames = Object.values(map.bindings)
    .map((b: { target: { name: string } }) => b.target.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  const graph = createPerformanceStateGraph();

  // Cache sampled clips by id (registry clips are immutable).
  const clipCache = new Map<StandardClipId, LibraryClip>();
  const getClip = (id: StandardClipId): LibraryClip | undefined => {
    const cached = clipCache.get(id);
    if (cached) return cached;
    const clip = (registry.get?.(id) ?? registry.require?.(id)) as unknown as LibraryClip | undefined;
    if (clip) clipCache.set(id, clip);
    return clip;
  };

  // Build an identity rest transform for every target node so each frame starts clean — this
  // prevents a bone touched by a previous intent (e.g. an arm raised in `talk`) from freezing when
  // the next intent (e.g. `idle`) doesn't move it.
  const identityBase = (): Record<string, PoseTransform> => {
    const bones: Record<string, PoseTransform> = {};
    for (const node of targetNodeNames) bones[node] = { rotation: { x: 0, y: 0, z: 0, w: 1 } };
    return bones;
  };

  // Body-bone amplitude is measured on the rig-neutral (canonical) source pose BEFORE retargeting,
  // so the numbers describe the LIBRARY motion (mouth-morph/caption/camera-free) regardless of how
  // sparsely the target GLB maps. A quaternion's rotation magnitude is 2*acos(|w|).
  const rotationAmplitude = (rot?: { x: number; y: number; z: number; w: number }): number => {
    if (!rot) return 0;
    const w = Math.min(1, Math.abs(rot.w));
    return 2 * Math.acos(w);
  };

  let lastTime = 0;
  let lastState = graph.currentState as string;

  const poseFor = (
    intent: StandardClipId,
    t: number,
    morph?: Record<string, number>
  ): { readonly pose: SamplablePose; readonly decision: ClipDecision } => {
    // Drive the state graph deterministically from the resolved intent. We set every parameter so
    // the graph crossfades into the requested state (one-shots are pulsed; loops are held).
    const P = PERFORMANCE_GRAPH_PARAMETERS as Record<string, string>;
    graph.setParameter(P.talk, intent === "talk");
    graph.setParameter(P.walk, intent === "walk" || intent === "run");
    graph.setParameter(P.run, intent === "run");
    for (const oneShot of ["gesture", "point", "nod", "react"] as const) {
      graph.setParameter(P[oneShot], intent === oneShot);
    }
    const delta = Math.max(0, t - lastTime);
    lastTime = t;
    graph.update(delta);
    lastState = graph.currentState as string;

    // The graph may have auto-returned a one-shot to idle; honor the requested intent for sampling
    // so a beat that asks for `gesture` actually plays gesture (the graph still governs transitions
    // for proof/state). For one-shots we sample the requested clip from its local start; for loops
    // we sample at the wrapped episode time so idle/talk/walk cycle continuously.
    const clipId: StandardClipId = INTENT_SET.has(graph.currentState) && !ONE_SHOT.has(intent)
      ? (graph.currentState as StandardClipId)
      : intent;

    // Sampling fallback order (logged via the decision.source): the requested clip, else idle.
    let sampledId: StandardClipId = clipId;
    let clip = getClip(clipId);
    if (!clip) {
      sampledId = "idle";
      clip = getClip("idle");
    }

    const bones = identityBase();
    const bodyBoneRotationRad: Partial<Record<BodyBoneName, number>> = {};
    let rootTranslation = 0;
    let maxTransAmplitude = 0;
    if (clip) {
      const duration = clip.duration > 0 ? clip.duration : 1;
      const local = clip.loop ? t % duration : Math.min(t, duration);
      // Sample the standard (rig-neutral) clip into an AnimationPose keyed by canonical bone names.
      const sourceBones: Record<string, PoseTransform> = {};
      for (const track of clip.tracks) {
        const dot = track.target.lastIndexOf(".");
        if (dot < 0) continue;
        const bone = track.target.slice(0, dot);
        const path = track.target.slice(dot + 1);
        const v = track.sample(local);
        const slot = (sourceBones[bone] ??= {});
        if (path === "rotation") slot.rotation = { x: v[0]!, y: v[1]!, z: v[2]!, w: v[3]! };
        else if (path === "translation") slot.position = { x: v[0]!, y: v[1]!, z: v[2]! };
      }
      // B1/B2: measure BODY-bone motion on the rig-neutral source pose (mouth/caption/camera-free).
      for (const bone of BODY_BONES) {
        const amp = rotationAmplitude(sourceBones[bone]?.rotation);
        if (amp > 0) bodyBoneRotationRad[bone] = amp;
        // B1 maxTransAmplitude: the largest per-body-bone translation magnitude (metres) this frame.
        const pos = sourceBones[bone]?.position;
        if (pos) maxTransAmplitude = Math.max(maxTransAmplitude, Math.hypot(pos.x, pos.y, pos.z));
      }
      const hipsPos = sourceBones.hips?.position;
      if (hipsPos) rootTranslation = Math.hypot(hipsPos.x, hipsPos.y, hipsPos.z);
      // Retarget rig-neutral → this GLB's node names, then overlay onto the clean identity base.
      const retargeted = retargetHumanoidPose({ bones: sourceBones }, map) as SamplablePose;
      for (const [node, transform] of Object.entries(retargeted.bones)) bones[node] = transform;
    }

    const amplitudes = Object.values(bodyBoneRotationRad);
    // ~0.5° threshold: a bone is "touched" only if it actually rotated this frame (not numeric dust).
    const EPS = 0.0087;
    const bonesTouched = amplitudes.filter((a) => a > EPS).length;
    const maxRotAmplitudeRad = amplitudes.length > 0 ? Math.max(...amplitudes) : 0;

    // B3 source: which library this sampled clip's motion came from. If we had to fall back to idle
    // (the requested intent had no clip at all) report `idle-fallback`; else the per-intent library
    // source resolved at load time (extracted catalog vs procedural baseline).
    const source: ClipSource =
      sampledId !== clipId ? "idle-fallback" : (options.sources?.[sampledId] ?? "procedural");

    const decision: ClipDecision = {
      intent,
      clipId: sampledId,
      source,
      bonesTouched,
      maxRotAmplitudeRad: +maxRotAmplitudeRad.toFixed(5),
      maxTransAmplitude: +maxTransAmplitude.toFixed(5),
      bodyBoneRotationRad,
      rootTranslation: +rootTranslation.toFixed(5),
      // The library pose has not been applied to a GLB skeleton yet; scene-player flips this true
      // once it applies the retargeted pose / embedded clip to ≥1 real skinned node.
      reachedGLBRuntime: false
    };

    return { pose: { bones, ...(morph ? { morphTargets: morph } : {}) }, decision };
  };

  // Fallback rule: a GLB with >1 distinct non-idle embedded clip is considered "rich".
  const nonIdle = options.embeddedClips.filter((c) => !/^idle$/i.test(c.trim()));
  const preferEmbedded = nonIdle.length >= 2;

  return {
    targetNodeNames,
    coverage: map.coverage as number,
    preferEmbedded,
    poseFor,
    get state() {
      return lastState;
    }
  };
}

/**
 * Does the GLB ship an embedded clip that satisfies this intent? Returns the matching embedded clip
 * name (so the caller can `playClip` it) or undefined to fall through to retargeting.
 */
export function embeddedClipForIntent(intent: StandardClipId, embeddedClips: readonly string[]): string | undefined {
  const patterns: Partial<Record<StandardClipId, RegExp>> = {
    idle: /idle|breath|stand/i,
    walk: /walk|move/i,
    run: /run|sprint/i,
    gesture: /wave|gesture|emote|hello/i,
    point: /point/i,
    talk: /talk|speak/i,
    nod: /nod/i,
    react: /react|surprise/i
  };
  const pat = patterns[intent];
  if (!pat) return undefined;
  return embeddedClips.find((c) => pat.test(c));
}
