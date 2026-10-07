/**
 * Lane prd08 scene index (CONTRACTS.md §3.8, C-30). Scene ids are
 * `prd08-motion-*` — six temporal scenes the vision judge sees in motion:
 *
 * | id                          | proves (PRD-08 §16)                          |
 * |-----------------------------|---------------------------------------------|
 * | prd08-motion-chase-speed    | chase rig + speed FOV at speed (S6, G-PANEL) |
 * | prd08-motion-impact-shake   | trauma/punch on a hit (S5, S7)               |
 * | prd08-motion-flight-bank    | flight rig bank/horizon-lock (S9)            |
 * | prd08-motion-collision      | probe pull-in near walls (S8)                |
 * | prd08-motion-rail-shot      | spline rail, closed, no knot hitch (S11)     |
 * | prd08-motion-pacing-120     | interpolated 120 Hz pacing smoothness (S3)   |
 *
 * Skeletons for PR B: registrations + SceneSpec carriers exist; the scripted
 * subjects (chase target path, impact emitter, bank flight path, colliders,
 * rail spline, 120 Hz mover) and both-engine captures land in phase 5 with
 * `prd08 motion-report` (C-39). Aura specs carry `qrFlags: ["A3D_QR_CAMERA"]`
 * so captures record the flag; three adapters are phase-5 `admittedAsReference`
 * work (C-30 semantics: no parity claim until then).
 */
import type { BenchSceneRegistration } from "../shared/registry";
import type { SceneSpec } from "../shared/types";

/** Lane-local carrier for the phase-5 subject scripts (additive to SceneSpec). */
interface MotionSceneSpec extends SceneSpec {
  readonly owner: "prd08";
  readonly qrFlags: readonly ["A3D_QR_CAMERA"];
  readonly motion: {
    readonly driver: "chase" | "impact" | "flight" | "collision" | "rail" | "pacing";
    readonly notes: string;
  };
}

const RES = { width: 1280, height: 720, devicePixelRatio: 1 } as const;
const sun = { kind: "directional", name: "sun", color: "#fff4e5", intensity: 2.4, position: [4, 8, 5], target: [0, 0, 0], castShadow: true } as const;
const ground = {
  kind: "primitive",
  name: "ground",
  shape: "box",
  size: [40, 0.1, 40],
  position: [0, -0.05, 0],
  material: { color: "#7a7d80", roughness: 0.9, metalness: 0 },
  castShadow: false,
  receiveShadow: true
} as const;
const hero = {
  kind: "primitive",
  name: "hero",
  shape: "box",
  size: [1, 1, 1],
  position: [0, 0.5, 0],
  material: { color: "#b03a2e", roughness: 0.4, metalness: 0 },
  castShadow: true,
  receiveShadow: false
} as const;

function motion(id: string, index: number, title: string, driver: MotionSceneSpec["motion"]["driver"], notes: string, primaryCriterion: string): MotionSceneSpec {
  return {
    id,
    index,
    title,
    purpose: `Lane-08 motion evidence: ${notes}`,
    resolution: RES,
    camera: { position: [0, 2, 8], target: [0, 0.7, 0], fov: 50, near: 0.05, far: 100 },
    background: { kind: "color", color: "#0e1013" },
    toneMapping: "aces-filmic",
    exposure: 1,
    lights: [sun],
    objects: [ground, hero],
    time: 1.25,
    settleFrames: 4,
    owner: "prd08",
    referenceProfile: "contract",
    masks: ["object-id", "silhouette-edge"],
    strip: { frames: 12, intervalMs: 66, orbitDegrees: 0 },
    primaryCriterion,
    primaryRegion: "subject",
    qrFlags: ["A3D_QR_CAMERA"],
    motion: { driver, notes }
  };
}

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd08-motion-chase-speed", spec: motion("prd08-motion-chase-speed", 801, "Chase at speed", "chase", "chase rig follows a fast moving subject; speed FOV widens on straights", "camera motion reads smoothly, no lag oscillation") },
  { id: "prd08-motion-impact-shake", spec: motion("prd08-motion-impact-shake", 802, "Impact shake", "impact", "trauma + punch fire on a staged hit; decay reads organic not jittery", "shake decays smoothly; no frame-rate-frequency aliasing") },
  { id: "prd08-motion-flight-bank", spec: motion("prd08-motion-flight-bank", 803, "Flight bank", "flight", "flight rig banks into turns with horizon lock", "bank reads through horizon, not through target lag") },
  { id: "prd08-motion-collision", spec: motion("prd08-motion-collision", 804, "Camera collision", "collision", "sphere-cast probe pulls the eye in front of walls; occluders fade", "no inside-geometry frames; fade not pop") },
  { id: "prd08-motion-rail-shot", spec: motion("prd08-motion-rail-shot", 805, "Closed rail", "rail", "closed catmull-rom rail dolly; continuous through knots", "no velocity hitch at knot crossings") },
  { id: "prd08-motion-pacing-120", spec: motion("prd08-motion-pacing-120", 806, "120 Hz pacing", "pacing", "fast mover under render interpolation at high refresh", "120 Hz motion is visibly smoother than 60 Hz (S3)") }
];

export const reviewRubric = "benchmarks/quality-rebuild/motion/review-rubric.md";
