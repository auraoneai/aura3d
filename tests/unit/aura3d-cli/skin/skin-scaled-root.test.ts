import { describe, expect, it } from "vitest";
import { analyzeSkin } from "../../../../packages/aura3d-cli/src/skin/analysis";
import { parseGlb } from "../../../../packages/aura3d-cli/src/skin/gltf";
import { buildRiggedGlb } from "./rigged-fixture";

/** Re-wrap a GLB's scene roots under one uniformly scaled node (what tools/idol/normalize.mjs does to rigged files). */
function wrapScaled(glb: Buffer, scale: number): Buffer {
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString("utf8", 20, 20 + jsonLen));
  const bin = glb.subarray(20 + jsonLen);
  const roots: number[] = json.scenes[json.scene ?? 0].nodes;
  json.nodes.push({ name: "auraRoot", scale: [scale, scale, scale], children: roots });
  json.scenes[json.scene ?? 0].nodes = [json.nodes.length - 1];
  let text = Buffer.from(JSON.stringify(json));
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + bin.length, 8); header.writeUInt32LE(text.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, text, bin]);
}

describe("skin stretch under a scaled root wrapper", () => {
  it("reports the same stretch for a clean rig whether or not its root is scaled", () => {
    const plain = analyzeSkin(parseGlb(buildRiggedGlb()));
    const scaled = analyzeSkin(parseGlb(wrapScaled(buildRiggedGlb(), 2.4)));
    for (const [name, m] of Object.entries(plain.materials)) {
      expect(scaled.materials[name]!.trianglesOverLimit).toBe(m.trianglesOverLimit);
      expect(scaled.materials[name]!.maxStretch).toBeCloseTo(m.maxStretch, 2);
    }
    expect(scaled.failures).toEqual(plain.failures);
  });

  it("still catches a real tear under a scaled root", () => {
    const scaled = analyzeSkin(parseGlb(wrapScaled(buildRiggedGlb({ bridge: true }), 2.4)));
    expect(Object.values(scaled.materials).some((m) => m.trianglesOverLimit > 0)).toBe(true);
  });
});
