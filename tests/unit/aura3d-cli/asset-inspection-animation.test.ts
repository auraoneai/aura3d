import { describe, expect, it } from "vitest";
import { inspectAnimationClips, readGlbDocument } from "../../../packages/aura3d-cli/src/commands/prd06/inspectAnimationClips";

/**
 * Independently authored glTF 2.0 animation fixture: two clips animate a
 * pelvis and an arm. The binary values and expected durations are explicit;
 * no external asset or reference engine is loaded by the test.
 */
function animatedGlb(): Uint8Array {
  const bin = new Uint8Array(132);
  const view = new DataView(bin.buffer);
  const setFloats = (offset: number, values: readonly number[]) => {
    values.forEach((value, index) => view.setFloat32(offset + index * 4, value, true));
  };
  setFloats(0, [0, 0.5, 1]);
  setFloats(12, [0, 0, 0, 0.04, 0, 0, 0.1, 0, 0]);
  // The second input accessor begins four bytes into its buffer view.
  setFloats(52, [0, 0.25, 0.5, 0.75, 1.25]);
  setFloats(72, [0, 0, 0, 0, 0.1, 0, 0, 0.2, 0, 0, 0.3, 0, 0, 0.4, 0]);
  const json = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 12 },
      { buffer: 0, byteOffset: 12, byteLength: 36 },
      { buffer: 0, byteOffset: 48, byteLength: 24 },
      { buffer: 0, byteOffset: 72, byteLength: 60 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, byteOffset: 4, componentType: 5126, count: 5, type: "SCALAR", min: [0], max: [1.25] },
      { bufferView: 3, componentType: 5126, count: 5, type: "VEC3" }
    ],
    nodes: [{ name: "Pelvis" }, { name: "LeftArm" }, { name: "RightArm" }],
    animations: [
      {
        name: "Walk",
        samplers: [{ input: 0, output: 1 }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      },
      {
        samplers: [{ input: 2, output: 3 }, { input: 2, output: 3 }],
        channels: [
          { sampler: 0, target: { node: 1, path: "translation" } },
          { sampler: 1, target: { node: 2, path: "translation" } }
        ]
      }
    ]
  };
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = (bytes.length + 3) & ~3;
  const glb = new Uint8Array(12 + 8 + jsonLength + 8 + bin.length);
  const header = new DataView(glb.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, glb.length, true);
  header.setUint32(12, jsonLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + jsonLength);
  glb.set(bytes, 20);
  header.setUint32(20 + jsonLength, bin.length, true);
  header.setUint32(24 + jsonLength, 0x004e4942, true);
  glb.set(bin, 28 + jsonLength);
  return glb;
}

describe("inspectAnimationClips", () => {
  it("reads multiple clips, sampler maxima, accessor offsets, channels and root motion from GLB bytes", () => {
    const { json, bin } = readGlbDocument(animatedGlb());
    const clips = inspectAnimationClips(json, bin);
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({ index: 0, name: "Walk", duration: 1, channelCount: 1, hasRootMotionCandidate: true, frameRate: 2 });
    expect(clips[1]).toMatchObject({ index: 1, name: "clip-1", duration: 1.25, channelCount: 2, hasRootMotionCandidate: false, frameRate: 4 });
  });

  it("falls back to binary input times when a malformed exporter omits accessor max", () => {
    const { json, bin } = readGlbDocument(animatedGlb());
    const withoutMax = {
      ...json,
      accessors: json.accessors?.map((accessor, index) => index === 2 ? { ...accessor, max: undefined } : accessor)
    };
    expect(inspectAnimationClips(withoutMax, bin)[1]?.duration).toBe(1.25);
    expect(inspectAnimationClips(withoutMax)[1]?.duration).toBe(0);
  });

  it("omits sample-derived information when the binary buffer is unavailable", () => {
    const { json } = readGlbDocument(animatedGlb());
    const clips = inspectAnimationClips(json);
    expect(clips[0]).toMatchObject({ duration: 1, hasRootMotionCandidate: false });
    expect(clips[0]).not.toHaveProperty("frameRate");
    expect(clips[1]?.duration).toBe(1.25);
  });

  it("rejects invalid or truncated GLB headers", () => {
    expect(() => readGlbDocument(new Uint8Array(12))).toThrow(/Invalid GLB header/);
    const glb = animatedGlb();
    new DataView(glb.buffer).setUint32(8, glb.length + 4, true);
    expect(() => readGlbDocument(glb)).toThrow(/Invalid GLB length/);
  });
});
