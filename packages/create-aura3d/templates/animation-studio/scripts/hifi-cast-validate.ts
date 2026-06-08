/**
 * hifi-cast-validate.ts — RENDER-VALIDATION PRE-FILTER for candidate hi-fi character GLBs.
 *
 * WHY THIS EXISTS (the lesson that bit us before): a downloaded character can pass a shallow
 * "is it rigged / does it have a humanoid mapping" proxy check and STILL render broken — legs
 * collapsed, arms contorted, the mesh folded into a knot — because the rig's bone orientation or
 * proportions don't survive retargeting. The only true acceptance gate is a GPU render + a human
 * looking at the pixels. This script does NOT replace that. It is a FAST, BROWSER-FREE,
 * GPU-FREE PRE-FILTER that rejects obviously-broken rigs (the ones that would waste a render) by:
 *
 *   1. Loading + grading the GLB (inferHumanoidRig on its bone names → gradeRig). Reports the
 *      body-acting grade, capabilities (legs/knees/ankles/feet), and mappedBoneCount.
 *   2. Building the STANDARD_LIBRARY_RIG → inferred-rig retarget map and reporting mapping
 *      coverage (how many standard bones land on this rig). Low coverage (<60%) ⇒ flag
 *      "retargeting will be poor — body acting won't transfer".
 *   3. Sampling a procedural TALK + WALK pose from the shared standard clip library, retargeting
 *      it onto this rig, running forward kinematics on a canonical rest skeleton, and CHECKING the
 *      resulting per-bone world positions for the EXACT failure signatures we saw:
 *        • legs collapsed (a foot ends up ABOVE the hips),
 *        • arms sagging / hands near the floor (a hand far below where a hand should sit),
 *        • any bone NaN / exploded (non-finite or absurd magnitude).
 *      Reports PASS (upright, legs below hips, hands at the sides) or FAIL (which signature).
 *   4. Writing a per-GLB JSON verdict to tests/reports/animation-studio/hifi-cast-validation.json.
 *
 * ⚠️  HONESTY: the FK check is a PROXY, not a render. It drives a *canonical* rest skeleton with the
 *     retargeted local rotations — it does NOT skin the actual mesh, does NOT use the GLB's real
 *     bind pose / bone lengths, and cannot see texture/weight/mesh problems. A rig can pass this FK
 *     pre-filter and still render wrong. FINAL ACCEPTANCE ALWAYS REQUIRES A REAL GPU RENDER +
 *     VISUAL REVIEW. The script prints this warning loudly.
 *
 * Does NOT touch product runtime (scene-player / animation-performance / render-live) and does NOT
 * render (no Playwright, no port). Read-only over the GLBs.
 *
 * Usage:
 *   tsx scripts/hifi-cast-validate.ts                # validate every GLB under public/hifi-cast/
 *                                                    # + the known richer aura-assets rigs
 *   tsx scripts/hifi-cast-validate.ts <glb> [<glb>…] # validate explicit GLB paths
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at runtime to the freshly-built monorepo dist (has co-located .d.ts).
import {
  createHumanoidRetargetingMap,
  createStandardHumanoidClipDefinitions,
  gradeRig,
  HUMANOID_BONES,
  inferHumanoidRig,
  retargetHumanoidPose,
  STANDARD_LIBRARY_RIG,
  type AnimationPose,
  type AnimationPoseTransform,
  type HumanoidBoneName,
  type HumanoidRigDefinition,
  type RigGrade
} from "@aura3d/animation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(__dirname, "..");
const HIFI_DIR = resolve(TEMPLATE_DIR, "public", "hifi-cast");
const AURA_ASSETS_DIR = resolve(TEMPLATE_DIR, "public", "aura-assets");
const REPORT_DIR = resolve(TEMPLATE_DIR, "tests", "reports", "animation-studio");
const REPORT_FILE = resolve(REPORT_DIR, "hifi-cast-validation.json");

/** Known richer-rig comparison assets pulled in alongside whatever lands in hifi-cast/. */
const COMPARISON_GLBS = ["rusty.catalog.glb", "luma.catalog.glb"];

/** Coverage below this means the standard performance vocabulary won't land — body acting fails. */
const POOR_COVERAGE_THRESHOLD = 0.6;

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

// ------------------------------------------------------------------------------------------------
// GLB parsing — read the skeleton joint node NAMES (what inference needs).
// ------------------------------------------------------------------------------------------------

interface GltfJson {
  nodes?: { name?: string; mesh?: number; children?: number[] }[];
  skins?: { joints?: number[] }[];
  animations?: { name?: string }[];
  meshes?: unknown[];
}

/** Parse just the JSON chunk of a .glb. Returns null when it isn't a binary glTF. */
function parseGlbJson(buf: Buffer): GltfJson | null {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return null; // "glTF"
  const jsonLen = buf.readUInt32LE(12);
  try {
    return JSON.parse(buf.slice(20, 20 + jsonLen).toString("utf8")) as GltfJson;
  } catch {
    return null;
  }
}

/** Named skeleton joint nodes (falls back to all named nodes when there is no skin). */
function jointNodeNames(json: GltfJson): string[] {
  const nodes = json.nodes ?? [];
  const jointIdx = json.skins?.[0]?.joints ?? nodes.map((_, i) => i);
  return jointIdx
    .map((ni) => nodes[ni]?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
}

// ------------------------------------------------------------------------------------------------
// Canonical rest skeleton + FK (mirrors scripts/skeleton-overlay.ts — a neutral ~1.75m humanoid in
// metres, hips at ~0.95m). The FK proxy drives THIS canonical skeleton with the retargeted local
// rotations; it deliberately does not use the GLB's own bind pose (see the honesty note up top).
// ------------------------------------------------------------------------------------------------

interface RestBone {
  readonly parent: HumanoidBoneName | null;
  readonly offset: Vec3;
}

const REST_SKELETON: Readonly<Record<HumanoidBoneName, RestBone>> = {
  hips: { parent: null, offset: [0, 0.95, 0] },
  spine: { parent: "hips", offset: [0, 0.12, 0] },
  chest: { parent: "spine", offset: [0, 0.14, 0] },
  upperChest: { parent: "chest", offset: [0, 0.1, 0] },
  neck: { parent: "upperChest", offset: [0, 0.08, 0] },
  head: { parent: "neck", offset: [0, 0.12, 0] },
  leftShoulder: { parent: "upperChest", offset: [0.06, 0.05, 0] },
  leftUpperArm: { parent: "leftShoulder", offset: [0.14, 0, 0] },
  leftLowerArm: { parent: "leftUpperArm", offset: [0.26, 0, 0] },
  leftHand: { parent: "leftLowerArm", offset: [0.24, 0, 0] },
  rightShoulder: { parent: "upperChest", offset: [-0.06, 0.05, 0] },
  rightUpperArm: { parent: "rightShoulder", offset: [-0.14, 0, 0] },
  rightLowerArm: { parent: "rightUpperArm", offset: [-0.26, 0, 0] },
  rightHand: { parent: "rightLowerArm", offset: [-0.24, 0, 0] },
  leftUpperLeg: { parent: "hips", offset: [0.09, -0.04, 0] },
  leftLowerLeg: { parent: "leftUpperLeg", offset: [0, -0.42, 0] },
  leftFoot: { parent: "leftLowerLeg", offset: [0, -0.42, 0.04] },
  leftToes: { parent: "leftFoot", offset: [0, -0.06, 0.12] },
  rightUpperLeg: { parent: "hips", offset: [-0.09, -0.04, 0] },
  rightLowerLeg: { parent: "rightUpperLeg", offset: [0, -0.42, 0] },
  rightFoot: { parent: "rightLowerLeg", offset: [0, -0.42, 0.04] },
  rightToes: { parent: "rightFoot", offset: [0, -0.06, 0.12] }
};

const IDENTITY: Quat = [0, 0, 0, 1];

function qMulV(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx)
  ];
}

function qMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

/** Forward kinematics over the canonical rest skeleton given per-bone local rotations + hips offset. */
export function solveWorld(rotations: Partial<Record<HumanoidBoneName, Quat>>, hipsOffset: Vec3): Record<HumanoidBoneName, Vec3> {
  const worldPos = {} as Record<HumanoidBoneName, Vec3>;
  const worldRot = {} as Record<HumanoidBoneName, Quat>;
  // REST_SKELETON is declared parent-before-child, so a single pass resolves the chain.
  for (const bone of Object.keys(REST_SKELETON) as HumanoidBoneName[]) {
    const rest = REST_SKELETON[bone];
    const localRot = rotations[bone] ?? IDENTITY;
    if (rest.parent === null) {
      worldRot[bone] = localRot;
      worldPos[bone] = [rest.offset[0] + hipsOffset[0], rest.offset[1] + hipsOffset[1], rest.offset[2] + hipsOffset[2]];
    } else {
      const pRot = worldRot[rest.parent] ?? IDENTITY;
      const pPos = worldPos[rest.parent] ?? ([0, 0, 0] as Vec3);
      const rotated = qMulV(pRot, rest.offset);
      worldPos[bone] = [pPos[0] + rotated[0], pPos[1] + rotated[1], pPos[2] + rotated[2]];
      worldRot[bone] = qMul(pRot, localRot);
    }
  }
  return worldPos;
}

// ------------------------------------------------------------------------------------------------
// Pose sampling + retargeting.
// ------------------------------------------------------------------------------------------------

const STANDARD_CLIPS = createStandardHumanoidClipDefinitions();

interface ClipLike {
  readonly duration: number;
  readonly loop: boolean;
  readonly tracks: readonly { readonly target: string; readonly valueType: string; sample(t: number): unknown }[];
}

/**
 * Sample a standard library clip at `t` into an {@link AnimationPose} keyed by the canonical
 * HUMANOID_BONES (the standard clips' tracks target `<bone>.rotation` / `hips.translation`). This
 * is the SOURCE pose handed to {@link retargetHumanoidPose}.
 */
function sampleStandardPose(clipId: string, t: number): AnimationPose {
  const clip = STANDARD_CLIPS.find((c) => c.id === clipId) as ClipLike | undefined;
  if (!clip) throw new Error(`standard clip not found: ${clipId}`);
  const duration = clip.duration > 0 ? clip.duration : 1;
  const local = clip.loop ? t % duration : Math.min(t, duration);
  const bones: Record<string, { position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number } }> = {};
  for (const track of clip.tracks) {
    const dot = track.target.lastIndexOf(".");
    if (dot < 0) continue;
    const bone = track.target.slice(0, dot);
    const path = track.target.slice(dot + 1);
    const v = track.sample(local) as number[];
    bones[bone] ??= {};
    if (path === "rotation" && Array.isArray(v) && v.length >= 4) {
      bones[bone].rotation = { x: v[0]!, y: v[1]!, z: v[2]!, w: v[3]! };
    } else if (path === "translation" && Array.isArray(v) && v.length >= 3) {
      bones[bone].position = { x: v[0]!, y: v[1]!, z: v[2]! };
    }
  }
  return { bones } as AnimationPose;
}

/** Quat object → tuple. */
function quatTuple(q: { x: number; y: number; z: number; w: number } | undefined): Quat {
  return q ? [q.x, q.y, q.z, q.w] : IDENTITY;
}

/**
 * Retarget a standard-library source pose onto the inferred rig, then collapse the result back to
 * the CANONICAL bone names so the FK rest skeleton can be driven. `retargetHumanoidPose` keys the
 * output by the TARGET rig's node names; we ask for `includeSemanticBoneNames` so the canonical
 * bone keys are also present, and read those directly.
 */
function retargetToCanonical(
  sourcePose: AnimationPose,
  map: ReturnType<typeof createHumanoidRetargetingMap>
): { rotations: Partial<Record<HumanoidBoneName, Quat>>; hipsOffset: Vec3 } {
  const retargeted = retargetHumanoidPose(sourcePose, map, { includeSemanticBoneNames: true });
  const rotations: Partial<Record<HumanoidBoneName, Quat>> = {};
  let hipsOffset: Vec3 = [0, 0, 0];
  for (const bone of HUMANOID_BONES) {
    const t: AnimationPoseTransform | undefined = retargeted.bones[bone];
    if (!t) continue; // bone didn't map onto this rig — leave it at rest (a sparse rig stays sparse)
    if (t.rotation) rotations[bone] = quatTuple(t.rotation);
    if (bone === "hips" && t.position) hipsOffset = [t.position.x, t.position.y, t.position.z];
  }
  return { rotations, hipsOffset };
}

// ------------------------------------------------------------------------------------------------
// Failure-signature checks on FK world positions.
// ------------------------------------------------------------------------------------------------

function isFinite3(v: Vec3): boolean {
  return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function magnitude(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export type FkFailureSignature = "legs-collapsed" | "arms-sagging" | "bone-exploded" | "bone-nan";

export interface FkFailure {
  readonly signature: FkFailureSignature;
  readonly detail: string;
}

/**
 * Inspect a single FK frame for the failure signatures we saw on broken downloads. Returns every
 * failure found (empty ⇒ this frame is clean). Thresholds are deliberately generous — this is a
 * pre-filter that should only reject the OBVIOUSLY broken, never a borderline-but-renderable rig.
 */
export function checkFrame(
  world: Record<HumanoidBoneName, Vec3>,
  mapped: Set<HumanoidBoneName>
): FkFailure[] {
  const failures: FkFailure[] = [];

  // NaN / explosion: any non-finite or absurdly-far bone (a healthy ~1.8m human stays well under 5m).
  for (const bone of Object.keys(world) as HumanoidBoneName[]) {
    const p = world[bone];
    if (!isFinite3(p)) {
      failures.push({ signature: "bone-nan", detail: `${bone} is non-finite (${p.join(", ")})` });
      continue;
    }
    if (magnitude(p) > 5) {
      failures.push({ signature: "bone-exploded", detail: `${bone} flew to |p|=${magnitude(p).toFixed(2)}m (>5m)` });
    }
  }
  if (failures.length > 0) return failures; // explosion dominates — don't bother with the geometry checks

  const hipY = world.hips[1];

  // Legs collapsed: a foot ends up at or ABOVE the hips (a standing human's feet are ~0.9m below).
  // Only meaningful when the foot bone actually mapped (an unmapped foot stays at rest = below hips).
  for (const foot of ["leftFoot", "rightFoot"] as const) {
    if (!mapped.has(foot)) continue;
    const footY = world[foot][1];
    if (footY > hipY - 0.1) {
      failures.push({
        signature: "legs-collapsed",
        detail: `${foot} Y=${footY.toFixed(2)} is not below hips Y=${hipY.toFixed(2)} (leg folded up)`
      });
    }
  }

  // Arms sagging / hands at the floor: a hand should sit roughly between knee and shoulder height.
  // Flag a hand that drops to near the floor (Y < 0.2m) — the "arms dragging on the ground" look.
  for (const hand of ["leftHand", "rightHand"] as const) {
    if (!mapped.has(hand)) continue;
    const handY = world[hand][1];
    if (handY < 0.2) {
      failures.push({
        signature: "arms-sagging",
        detail: `${hand} Y=${handY.toFixed(2)} near the floor (<0.2m — arm sagging/dragging)`
      });
    }
  }

  return failures;
}

// ------------------------------------------------------------------------------------------------
// Per-GLB validation.
// ------------------------------------------------------------------------------------------------

/** Sample times (seconds) across each clip — start, two beats in, near the end. */
const SAMPLE_TIMES = [0, 0.3, 0.6, 0.9, 1.2, 1.6];
const FK_CLIPS = ["talk", "walk"] as const;

export interface FkClipResult {
  readonly clip: string;
  readonly pass: boolean;
  readonly failures: readonly FkFailure[];
}

export interface Verdict {
  readonly file: string;
  readonly bytes: number;
  readonly parsed: boolean;
  readonly jointCount: number;
  readonly clips: readonly string[];
  // --- rig grade ---
  readonly rigGrade: RigGrade | null;
  readonly mappedBoneCount: number;
  readonly capabilities: { hasLegs: boolean; hasKnees: boolean; hasAnkles: boolean; hasFeet: boolean } | null;
  readonly gradeReasons: readonly string[];
  // --- retarget coverage ---
  readonly retargetCoverage: number;
  readonly retargetRequiredCoverage: number;
  readonly retargetingPoor: boolean;
  // --- FK proxy ---
  readonly fkPass: boolean;
  readonly fkClips: readonly FkClipResult[];
  readonly fkSignatures: readonly string[];
  // --- overall ---
  readonly verdict: "PASS" | "FAIL" | "UNPARSEABLE";
  readonly notes: readonly string[];
}

export interface FkProxyResult {
  readonly fkPass: boolean;
  readonly fkClips: readonly FkClipResult[];
  readonly signatures: readonly string[];
  /** Canonical bones that mapped onto the rig (drives which failure checks are meaningful). */
  readonly mapped: ReadonlySet<HumanoidBoneName>;
}

/**
 * Run the TALK + WALK FK proxy for an inferred rig built from `nodeNames`. Sampled across several
 * beats; every frame is checked for the failure signatures (collapsed legs / sagging arms / NaN /
 * exploded bones). Exposed (with {@link validateGlb}) so the unit-graded probe can drive it on both
 * a clean canonical skeleton and deliberately-broken inputs without touching the filesystem.
 */
export function runFkProxy(nodeNames: readonly string[]): FkProxyResult {
  const inferred = inferHumanoidRig(nodeNames, { id: "hifi-fk-proxy" });
  const mapped = new Set<HumanoidBoneName>(
    HUMANOID_BONES.filter((bone) => {
      const b = inferred.bones[bone];
      return Boolean(b && typeof b.name === "string" && b.name.length > 0);
    })
  );
  const map = createHumanoidRetargetingMap(STANDARD_LIBRARY_RIG, inferred, { minRequiredCoverage: 0 });
  const fkClips: FkClipResult[] = [];
  const signatures = new Set<string>();
  for (const clipId of FK_CLIPS) {
    const clipFailures: FkFailure[] = [];
    for (const t of SAMPLE_TIMES) {
      const source = sampleStandardPose(clipId, t);
      const { rotations, hipsOffset } = retargetToCanonical(source, map);
      const world = solveWorld(rotations, hipsOffset);
      for (const f of checkFrame(world, mapped)) {
        clipFailures.push(f);
        signatures.add(f.signature);
      }
    }
    const unique = new Map<string, FkFailure>();
    for (const f of clipFailures) if (!unique.has(f.signature)) unique.set(f.signature, f);
    fkClips.push({ clip: clipId, pass: clipFailures.length === 0, failures: [...unique.values()] });
  }
  return { fkPass: fkClips.every((c) => c.pass), fkClips, signatures: [...signatures], mapped };
}

export function validateGlb(absPath: string): Verdict {
  const file = relative(TEMPLATE_DIR, absPath);
  const buf = readFileSync(absPath);
  const bytes = buf.length;
  const json = parseGlbJson(buf);

  if (!json) {
    return {
      file, bytes, parsed: false, jointCount: 0, clips: [],
      rigGrade: null, mappedBoneCount: 0, capabilities: null, gradeReasons: [],
      retargetCoverage: 0, retargetRequiredCoverage: 0, retargetingPoor: true,
      fkPass: false, fkClips: [], fkSignatures: [],
      verdict: "UNPARSEABLE", notes: ["not a binary glTF (.glb)"]
    };
  }

  const names = jointNodeNames(json);
  const clips = (json.animations ?? []).map((a) => a.name).filter((n): n is string => typeof n === "string");
  const inferred: HumanoidRigDefinition = inferHumanoidRig(names, { id: `hifi:${file}`, name: file });
  const rigReport = gradeRig(inferred);

  // Retarget map: STANDARD library rig → this character's inferred rig. minRequiredCoverage at 0 so
  // we always get a map back (we report coverage ourselves rather than letting it gate to !ok).
  const map = createHumanoidRetargetingMap(STANDARD_LIBRARY_RIG, inferred, { minRequiredCoverage: 0 });
  const retargetingPoor = map.coverage < POOR_COVERAGE_THRESHOLD;

  // FK proxy across talk + walk (shared with the unit-graded probe via runFkProxy).
  const { fkPass, fkClips, signatures, mapped } = runFkProxy(names);

  const notes: string[] = [];
  if (rigReport.grade === "D") notes.push("rig graded D — not suitable for body acting (refuse).");
  if (retargetingPoor) {
    notes.push(`retargeting will be poor — body acting won't transfer (coverage ${(map.coverage * 100).toFixed(0)}% < ${POOR_COVERAGE_THRESHOLD * 100}%).`);
  }
  if (!rigReport.hasFeet && !mapped.has("leftFoot") && !mapped.has("rightFoot")) {
    notes.push("no feet mapped — locomotion / standing pose can't be validated by FK.");
  }
  if (!fkPass) notes.push(`FK proxy detected: ${[...signatures].join(", ")}.`);

  // Overall verdict. UNPARSEABLE handled above. A clean rig is one that grades C-or-better AND
  // passes the FK proxy. (FK pass is necessary, NOT sufficient — see the render warning.)
  const verdict: Verdict["verdict"] =
    rigReport.grade === "D" ? "FAIL" : fkPass && !retargetingPoor ? "PASS" : "FAIL";

  return {
    file, bytes, parsed: true, jointCount: names.length, clips,
    rigGrade: rigReport.grade,
    mappedBoneCount: rigReport.mappedBoneCount,
    capabilities: {
      hasLegs: rigReport.hasLegs, hasKnees: rigReport.hasKnees,
      hasAnkles: rigReport.hasAnkles, hasFeet: rigReport.hasFeet
    },
    gradeReasons: rigReport.reasons,
    retargetCoverage: +map.coverage.toFixed(3),
    retargetRequiredCoverage: +map.requiredCoverage.toFixed(3),
    retargetingPoor,
    fkPass, fkClips, fkSignatures: [...signatures],
    verdict, notes
  };
}

// ------------------------------------------------------------------------------------------------
// Discovery + CLI.
// ------------------------------------------------------------------------------------------------

/** Recursively collect every .glb under `dir` (hifi-cast/ has nested rpm/ + quaternius/ subdirs). */
function collectGlbs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = resolve(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collectGlbs(p));
    else if (entry.toLowerCase().endsWith(".glb")) out.push(p);
  }
  return out.sort();
}

function discoverTargets(): string[] {
  const targets = collectGlbs(HIFI_DIR);
  for (const name of COMPARISON_GLBS) {
    const p = resolve(AURA_ASSETS_DIR, name);
    if (existsSync(p)) targets.push(p);
  }
  return targets;
}

function printWarning(): void {
  console.error("");
  console.error("  ┌──────────────────────────────────────────────────────────────────────────┐");
  console.error("  │  ⚠  FK PRE-FILTER ONLY — NOT A RENDER.                                      │");
  console.error("  │  A PASS here means the rig survived a fast forward-kinematics sanity pass   │");
  console.error("  │  (no collapsed legs / sagging arms / exploded or NaN bones) on a canonical  │");
  console.error("  │  rest skeleton. It does NOT skin the real mesh and cannot see texture,      │");
  console.error("  │  weighting, or bind-pose problems. FINAL ACCEPTANCE STILL REQUIRES A REAL   │");
  console.error("  │  GPU RENDER + VISUAL REVIEW. Use this only to reject obviously-broken rigs  │");
  console.error("  │  before spending a render.                                                 │");
  console.error("  └──────────────────────────────────────────────────────────────────────────┘");
  console.error("");
}

function main(): void {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const targets = argv.length > 0 ? argv.map((a) => resolve(process.cwd(), a)) : discoverTargets();

  printWarning();

  if (targets.length === 0) {
    console.error(`  no GLBs found under ${relative(process.cwd(), HIFI_DIR)} (and no comparison assets present).`);
  }

  const verdicts: Verdict[] = [];
  for (const t of targets) {
    if (!existsSync(t)) {
      console.error(`  SKIP (missing): ${t}`);
      continue;
    }
    let v: Verdict;
    try {
      v = validateGlb(t);
    } catch (err) {
      console.error(`  ERROR validating ${t}: ${(err as Error).message}`);
      continue;
    }
    verdicts.push(v);
    const cov = `${(v.retargetCoverage * 100).toFixed(0)}%`;
    const cap = v.capabilities
      ? `legs=${v.capabilities.hasLegs ? "Y" : "n"} knees=${v.capabilities.hasKnees ? "Y" : "n"} feet=${v.capabilities.hasFeet ? "Y" : "n"}`
      : "—";
    console.error(
      `  ${v.verdict.padEnd(11)} ${v.file}\n` +
      `      grade=${v.rigGrade ?? "—"} mappedBones=${v.mappedBoneCount}/${HUMANOID_BONES.length} ${cap} ` +
      `retargetCoverage=${cov}${v.retargetingPoor ? " (POOR)" : ""} joints=${v.jointCount} clips=${v.clips.length}\n` +
      `      FK ${v.fkPass ? "PASS" : "FAIL"}${v.fkSignatures.length ? ` [${v.fkSignatures.join(", ")}]` : ""}` +
      (v.notes.length ? `\n      notes: ${v.notes.join(" ")}` : "")
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    note:
      "FK PRE-FILTER ONLY — NOT A RENDER. A PASS means the rig survived a canonical forward-" +
      "kinematics sanity pass (no collapsed legs / sagging arms / exploded or NaN bones). It does " +
      "NOT skin the real mesh and cannot see texture/weight/bind-pose problems. Final acceptance " +
      "requires a real GPU render + visual review.",
    poorCoverageThreshold: POOR_COVERAGE_THRESHOLD,
    fkClips: FK_CLIPS,
    sampleTimes: SAMPLE_TIMES,
    count: verdicts.length,
    passCount: verdicts.filter((v) => v.verdict === "PASS").length,
    failCount: verdicts.filter((v) => v.verdict !== "PASS").length,
    verdicts
  };
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`\n  wrote ${relative(process.cwd(), REPORT_FILE)} (${verdicts.length} verdict(s), ${report.passCount} PASS / ${report.failCount} FAIL)`);
  printWarning();
}

// Run only when invoked directly (not when imported by the unit-graded probe / other tooling).
if (process.argv[1] && /hifi-cast-validate\.(ts|js)$/.test(process.argv[1])) {
  main();
}
