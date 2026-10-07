/**
 * T2.9 — `prd06-morph-face` lane scene: the fixed-frame weights must name real
 * morph targets on the RobotExpressive GLB (the PRD's stand-in head pending a
 * Q-05-2 ARKit-52 admission), stay under the 32-non-zero High-tier budget, and
 * register with both engine adapters.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { prd06MorphFace, PRD06_MORPH_FACE_WEIGHTS } from "../../../benchmarks/quality-rebuild/scenes/prd06/morph-face";
import { scenes as laneScenes } from "../../../benchmarks/quality-rebuild/scenes/prd06/index";
import { modelAssets } from "../../../benchmarks/quality-rebuild/shared/assets";

function glbJson(path: string): { readonly meshes: readonly { name?: string; extras?: { targetNames?: readonly string[] }; primitives?: readonly { targets?: readonly unknown[]; extras?: { targetNames?: readonly string[] } }[] }[] } {
  const buffer = readFileSync(path);
  // GLB header: magic(4) version(4) length(4) then chunk length(4)+type(4).
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
}

describe("T2.9 — prd06-morph-face lane scene", () => {
  const glb = glbJson(resolve(__dirname, "../../../fixtures/threejs-parity/assets/character/robot-expressive.glb"));
  const targetNames = new Set(
    glb.meshes.flatMap((mesh) => [
      ...(mesh.extras?.targetNames ?? []),
      ...(mesh.primitives ?? []).flatMap((primitive) => primitive.extras?.targetNames ?? [])
    ])
  );

  it("spec weights name real morph targets on the GLB (≤ 32 non-zero for High tier)", () => {
    const names = Object.keys(PRD06_MORPH_FACE_WEIGHTS);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(targetNames.has(name), `spec weight "${name}" is not a morph target on robot-expressive.glb`).toBe(true);
    }
    const nonZero = Object.values(PRD06_MORPH_FACE_WEIGHTS).filter((weight) => weight !== 0);
    expect(nonZero.length).toBeLessThanOrEqual(32);
    expect(nonZero.every((weight) => weight >= 0 && weight <= 1)).toBe(true);
    expect(prd06MorphFace.morphFace.weights).toEqual(PRD06_MORPH_FACE_WEIGHTS);
  });

  it("registers owner prd06 with qrFlags + admittedAsReference:false stand-in flag", () => {
    expect(prd06MorphFace.owner).toBe("prd06");
    expect(prd06MorphFace.qrFlags).toContain("animation");
    expect(prd06MorphFace.admittedAsReference).toBe(false);
    expect(laneScenes.some((entry) => entry.id === "prd06-morph-face" && entry.spec === prd06MorphFace)).toBe(true);
  });

  it("robotExpressive is an admitted model asset pointing at the in-repo GLB", () => {
    const entry = modelAssets.robotExpressive;
    expect(entry.repoPath).toBe("fixtures/threejs-parity/assets/character/robot-expressive.glb");
    expect(entry.sha256).toMatch(/^sha256-[0-9a-f]{64}$/);
    expect(entry.provenance).toMatch(/RobotExpressive/);
  });
});
