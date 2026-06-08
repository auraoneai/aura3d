import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkFrame,
  runFkProxy,
  solveWorld,
  validateGlb,
  type FkFailureSignature,
  type Verdict
} from "../../../packages/create-aura3d/templates/animation-studio/scripts/hifi-cast-validate";

/**
 * UNIT-GRADED PROBE for the hi-fi cast RENDER-VALIDATION harness (scripts/hifi-cast-validate.ts).
 *
 * The harness is a FAST, GPU-FREE PRE-FILTER that rejects obviously-broken downloaded character GLBs
 * before they cost a render. These tests GRADE the probe itself — they pin that it:
 *
 *   1. PASSES a clean, full humanoid rig (Mixamo naming) through the TALK + WALK FK proxy, and
 *   2. FIRES the right failure SIGNATURE for each deliberately-broken FK frame (collapsed legs,
 *      sagging arms, exploded bone, NaN bone) — so a real broken rig can't slip through, and
 *   3. flags POOR retargeting coverage on a sparse rig (body acting won't transfer), and
 *   4. produces a sane, self-consistent Verdict for a real GLB on disk when one is present.
 *
 * NOTE (kept honest, mirrors the harness banner): the FK proxy is NOT a render. A PASS here only
 * means the rig survived a canonical forward-kinematics sanity pass; final acceptance of a
 * character STILL requires a real GPU render + visual review.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(__dirname, "../../../packages/create-aura3d/templates/animation-studio");

/** A clean, full humanoid skeleton in Mixamo naming — the gold-standard "should pass" input. */
const MIXAMO_HUMANOID = [
  "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2",
  "mixamorig:Neck", "mixamorig:Head",
  "mixamorig:LeftShoulder", "mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand",
  "mixamorig:RightShoulder", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand",
  "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot", "mixamorig:LeftToeBase",
  "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot", "mixamorig:RightToeBase"
];

/** A sparse mascot (torso + head only) — body acting can't transfer; coverage should read poor. */
const SPARSE_MASCOT = ["root", "Hips", "Spine", "Head"];

/** The limb bones whose presence makes the failure checks meaningful (cast to the arg type). */
const ALL_LIMB_BONES = new Set(
  ["hips", "leftFoot", "rightFoot", "leftHand", "rightHand"]
) as Parameters<typeof checkFrame>[1];

describe("hifi-cast-validate — FK proxy grades clean vs broken rigs", () => {
  it("PASSES a clean full humanoid rig through the talk + walk FK proxy", () => {
    const result = runFkProxy(MIXAMO_HUMANOID);
    expect(result.fkPass).toBe(true);
    expect(result.signatures).toHaveLength(0);
    // The rig should map a full body (arms + legs + feet) so the failure checks are meaningful.
    expect(result.mapped.has("leftFoot")).toBe(true);
    expect(result.mapped.has("rightFoot")).toBe(true);
    expect(result.mapped.has("leftHand")).toBe(true);
    expect(result.mapped.has("rightHand")).toBe(true);
    expect(result.mapped.size).toBeGreaterThanOrEqual(18);
    // Both clips are evaluated and clean.
    expect(result.fkClips.map((c) => c.clip).sort()).toEqual(["talk", "walk"]);
    expect(result.fkClips.every((c) => c.pass)).toBe(true);
  });

  it("FIRES 'legs-collapsed' when a foot ends up above the hips", () => {
    const world = solveWorld({}, [0, 0, 0]);
    (world as Record<string, readonly [number, number, number]>).leftFoot = [0, 1.5, 0]; // above hips(~0.95)
    const sigs = checkFrame(world, ALL_LIMB_BONES).map((f) => f.signature);
    expect(sigs).toContain<FkFailureSignature>("legs-collapsed");
  });

  it("FIRES 'arms-sagging' when a hand drops to the floor", () => {
    const world = solveWorld({}, [0, 0, 0]);
    (world as Record<string, readonly [number, number, number]>).leftHand = [0.4, 0.05, 0];
    const sigs = checkFrame(world, ALL_LIMB_BONES).map((f) => f.signature);
    expect(sigs).toContain<FkFailureSignature>("arms-sagging");
  });

  it("FIRES 'bone-exploded' when a bone flies far from the body", () => {
    const world = solveWorld({}, [0, 0, 0]);
    (world as Record<string, readonly [number, number, number]>).rightHand = [99, 0, 0];
    const sigs = checkFrame(world, ALL_LIMB_BONES).map((f) => f.signature);
    expect(sigs).toContain<FkFailureSignature>("bone-exploded");
  });

  it("FIRES 'bone-nan' on a non-finite bone position", () => {
    const world = solveWorld({}, [0, 0, 0]);
    (world as Record<string, readonly [number, number, number]>).head = [NaN, 0, 0];
    const sigs = checkFrame(world, ALL_LIMB_BONES).map((f) => f.signature);
    expect(sigs).toContain<FkFailureSignature>("bone-nan");
  });

  it("a clean canonical rest frame has no failures", () => {
    const world = solveWorld({}, [0, 0, 0]);
    expect(checkFrame(world, ALL_LIMB_BONES)).toHaveLength(0);
  });
});

describe("hifi-cast-validate — coverage flagging", () => {
  it("a sparse mascot maps few bones (poor retargeting — body acting won't transfer)", () => {
    const result = runFkProxy(SPARSE_MASCOT);
    // No usable arms/legs mapped → the body-acting failure checks have nothing to assert, and the
    // verdict path (see GLB test) flags this as poor coverage.
    expect(result.mapped.has("leftHand")).toBe(false);
    expect(result.mapped.has("leftFoot")).toBe(false);
  });
});

describe("hifi-cast-validate — Verdict on a real GLB (when present)", () => {
  // Prefer a known richer rig; fall back to anything under hifi-cast/.
  const candidates = [
    resolve(TEMPLATE_DIR, "public/aura-assets/luma.catalog.glb"),
    resolve(TEMPLATE_DIR, "public/aura-assets/rusty.catalog.glb")
  ];
  const present = candidates.find((p) => existsSync(p));

  it.runIf(present)("produces a self-consistent verdict for a real character GLB", () => {
    const verdict: Verdict = validateGlb(present!);
    expect(verdict.parsed).toBe(true);
    expect(verdict.jointCount).toBeGreaterThan(0);
    expect(["A", "B", "C", "D"]).toContain(verdict.rigGrade);
    expect(verdict.retargetCoverage).toBeGreaterThan(0);
    expect(verdict.retargetCoverage).toBeLessThanOrEqual(1);
    // A richer rig (luma/rusty) should not collapse under the FK proxy.
    expect(verdict.fkPass).toBe(true);
    // The verdict letter is one of the three allowed states.
    expect(["PASS", "FAIL", "UNPARSEABLE"]).toContain(verdict.verdict);
    // A real rigged GLB is parseable, so never UNPARSEABLE here.
    expect(verdict.verdict).not.toBe("UNPARSEABLE");
  });

  it("returns UNPARSEABLE for a non-glTF buffer written to a temp .glb", () => {
    // Validate the parse-failure path without needing a fixture: point at this very test file,
    // which is not a binary glTF. validateGlb reads bytes + parses the header.
    const notAGlb = resolve(__dirname, "hifi-cast-validate.test.ts");
    // Guard: ensure the file exists and is not accidentally a glb.
    expect(readFileSync(notAGlb).readUInt32LE(0)).not.toBe(0x46546c67);
    const verdict = validateGlb(notAGlb);
    expect(verdict.verdict).toBe("UNPARSEABLE");
    expect(verdict.parsed).toBe(false);
  });
});
