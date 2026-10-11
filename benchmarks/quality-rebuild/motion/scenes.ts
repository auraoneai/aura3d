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
 * S9: both adapters exist (`aura3d/scenes/prd08/motion-*.ts` drive the real
 * lane-08 rigs through `app.camera` under A3D_QR_CAMERA; `three/scenes/prd08/
 * motion-*.ts` are r0.185.1 reference cameras on the same scripted inputs from
 * `subject-scripts.ts` + `stage.ts`). Registrations are `admittedAsReference`
 * (C-30): the three side is a behavioural reference, not a parity claim.
 * `aura3d prd08 motion-report` renders the capture report.
 */
import type { BenchSceneRegistration } from "../shared/registry";
import type { ObjectSpec, SceneSpec } from "../shared/types";
import { colliderBoxes } from "./stage";

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

/** Collision scene wall columns — same boxes the probe and the three raycast use. */
const columns: readonly ObjectSpec[] = colliderBoxes().map((box) => ({
  kind: "primitive",
  name: box.id,
  shape: "box",
  size: [box.size[0], box.size[1], box.size[2]],
  position: [box.center[0], box.center[1], box.center[2]],
  material: { color: "#5d6f86", roughness: 0.7, metalness: 0 },
  castShadow: true,
  receiveShadow: true
}));

/**
 * Capture time per driver: the 12-frame strip (66 ms cadence, ~0.73 s) ends on
 * the capture frame, so the time is chosen to put the judged event inside the
 * strip — the 0.6 s hit (impact), a column crossing (collision, eye pull-in
 * around 2.4 s) and the first knot crossing (rail, knot at 2.0 s of a 12 s loop).
 */
const CAPTURE_TIME: Readonly<Record<MotionSceneSpec["motion"]["driver"], number>> = {
  chase: 1.25,
  impact: 1.25,
  flight: 1.25,
  collision: 2.6,
  rail: 2.4,
  pacing: 1.25
};

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
    objects: driver === "collision" ? [ground, hero, ...columns] : [ground, hero],
    time: CAPTURE_TIME[driver],
    settleFrames: 4,
    owner: "prd08",
    referenceProfile: "contract",
    masks: ["object-id", "silhouette-edge"],
    // Motion scenes are judged on temporal behaviour (strip + trajectory), not
    // on a single-frame look; no broken-control calibration variant applies.
    brokenControls: [],
    strip: { frames: 12, intervalMs: 66, orbitDegrees: 0 },
    primaryCriterion,
    primaryRegion: "subject",
    qrFlags: ["A3D_QR_CAMERA"],
    motion: { driver, notes }
  };
}

export const scenes: readonly BenchSceneRegistration[] = [
  { id: "prd08-motion-chase-speed", admittedAsReference: true, spec: motion("prd08-motion-chase-speed", 801, "Chase at speed", "chase", "chase rig follows a fast moving subject; speed FOV widens on straights", "camera motion reads smoothly, no lag oscillation") },
  { id: "prd08-motion-impact-shake", admittedAsReference: true, spec: motion("prd08-motion-impact-shake", 802, "Impact shake", "impact", "trauma + punch fire on a staged hit; decay reads organic not jittery", "shake decays smoothly; no frame-rate-frequency aliasing") },
  { id: "prd08-motion-flight-bank", admittedAsReference: true, spec: motion("prd08-motion-flight-bank", 803, "Flight bank", "flight", "flight rig banks into turns with horizon lock", "bank reads through horizon, not through target lag") },
  { id: "prd08-motion-collision", admittedAsReference: true, spec: motion("prd08-motion-collision", 804, "Camera collision", "collision", "sphere-cast probe pulls the eye in front of walls; occluders fade", "no inside-geometry frames; fade not pop") },
  { id: "prd08-motion-rail-shot", admittedAsReference: true, spec: motion("prd08-motion-rail-shot", 805, "Closed rail", "rail", "closed catmull-rom rail dolly; continuous through knots", "no velocity hitch at knot crossings") },
  { id: "prd08-motion-pacing-120", admittedAsReference: true, spec: motion("prd08-motion-pacing-120", 806, "120 Hz pacing", "pacing", "fast mover under render interpolation at high refresh", "120 Hz motion is visibly smoother than 60 Hz (S3)") }
];

export const reviewRubric = "benchmarks/quality-rebuild/motion/review-rubric.md";
