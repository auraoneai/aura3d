/**
 * GU47 E-E (WP-5) item 1: `outline({ targets })`. The renderer's target outline draws a mask of ONLY the target items
 * and inks a ring around the mask's visible silhouette; an outline without `targets` is untouched.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Geometry, MockRenderDevice } from "../../../../packages/rendering/src";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";
import {
  OUTLINE_TARGET_MASK_LABEL,
  OUTLINE_TARGET_SHADER_MARKER,
  OUTLINE_TARGET_SHADER_SOURCES,
  OutlineTargetPass,
  lastOutlineTargetRecord,
  outlineTargetCoverage,
  outlineTargetInkMask,
  outlineTargetLabelMatches,
  outlineTargetsOf,
  resetOutlineTargetRecord,
  selectOutlineTargetItems
} from "../../../../packages/rendering/src/renderer/OutlineTargets";
import { postprocessRequiresDepthTexture } from "../../../../packages/rendering/src/renderer/PostprocessExecution";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function item(label: string): RenderItem {
  return { geometry: Geometry.triangle(), modelMatrix: IDENTITY, label };
}

/** The engine's labels for a scene: primitives `primitive-<i>:<resource>:<node>`, models `actor-<i>:mesh-<j>:<id>:...`. */
const SCENE: readonly RenderItem[] = [
  item("primitive-0:sphere-1:rider"),
  item("primitive-1:box-2:crate"),
  item("primitive-2:plane-3:ground"),
  item("primitive-3:box-4:big-rider"),
  item("actor-0:mesh-0:hero:Body:geometry-0"),
  item("actor-0:mesh-1:hero:Head:geometry-1"),
  item("actor-1:mesh-0:villain:Body:geometry-0"),
  item("sky")
];

afterEach(() => resetOutlineTargetRecord());

describe("GU47 E-E outline targets: options", () => {
  it("reads targets only when the outline has the field", () => {
    expect(outlineTargetsOf(undefined)).toBeNull();
    expect(outlineTargetsOf(true)).toBeNull();
    expect(outlineTargetsOf({ width: 2 })).toBeNull();
    expect(outlineTargetsOf({ targets: ["rider", "", 3, "hero"] })).toEqual(["rider", "hero"]);
    expect(outlineTargetsOf({ targets: [] })).toEqual([]);
  });

  it("asks for a sampleable scene depth only for a targeted outline", () => {
    expect(postprocessRequiresDepthTexture({ outline: { width: 2 } })).toBe(false);
    expect(postprocessRequiresDepthTexture({ outline: { targets: ["rider"] } as never })).toBe(true);
  });
});

describe("GU47 E-E outline targets: the mask holds only target items", () => {
  it("matches primitive node names, model ids and exact labels, never a name suffix", () => {
    const set = new Set(["rider", "hero", "sky"]);
    expect(outlineTargetLabelMatches("primitive-0:sphere-1:rider", set)).toBe(true);
    expect(outlineTargetLabelMatches("primitive-3:box-4:big-rider", set)).toBe(false);
    expect(outlineTargetLabelMatches("primitive-9:rider:crate", set)).toBe(false);
    expect(outlineTargetLabelMatches("actor-0:mesh-1:hero:Head:geometry-1", set)).toBe(true);
    expect(outlineTargetLabelMatches("actor-1:mesh-0:villain:hero:geometry-0", set)).toBe(false);
    expect(outlineTargetLabelMatches("sky", set)).toBe(true);
    expect(outlineTargetLabelMatches(undefined, set)).toBe(false);
    expect(outlineTargetLabelMatches("primitive-0:sphere-1:rider", new Set())).toBe(false);
  });

  it("selects exactly the target nodes' items", () => {
    expect(selectOutlineTargetItems(SCENE, ["rider", "hero"]).map((entry) => entry.label)).toEqual([
      "primitive-0:sphere-1:rider",
      "actor-0:mesh-0:hero:Body:geometry-0",
      "actor-0:mesh-1:hero:Head:geometry-1"
    ]);
    expect(selectOutlineTargetItems(SCENE, [])).toEqual([]);
    expect(selectOutlineTargetItems(SCENE, ["nobody"])).toEqual([]);
  });

  it("the mask pass draws only target items, then one blended ink draw", () => {
    const device = new MockRenderDevice();
    device.beginFrame(32, 16);
    const record = new OutlineTargetPass(device).execute({
      items: SCENE,
      targets: ["hero", "rider"],
      viewProjectionMatrix: IDENTITY,
      width: 32,
      height: 16,
      color: [27, 34, 54, 255],
      radius: 2,
      opacity: 1,
      output: null
    });
    device.endFrame();
    // The caster-variant depth program labels each draw `<item label>:<instance batch>`.
    const labels = device.drawCommands.map((command) => command.label);
    expect(labels).toEqual([
      "primitive-0:sphere-1:rider:0",
      "actor-0:mesh-0:hero:Body:geometry-0:0",
      "actor-0:mesh-1:hero:Head:geometry-1:0",
      "gu47-outline-targets-ink"
    ]);
    expect(record).toMatchObject({ inked: true, occlusion: "none", radius: 2, targets: ["hero", "rider"] });
    expect(record.maskItems).toEqual(labels.slice(0, 3).map((label) => label!.replace(/:0$/, "")));
    expect(lastOutlineTargetRecord()).toBe(record);
    const ink = device.drawCommands.at(-1)!;
    expect(ink.renderState).toMatchObject({ blend: true, depthTest: false, depthWrite: false });
    const color = ink.uniforms!.get("u_outlineColor") as readonly number[];
    expect(color.map((v) => Math.round(v * 255))).toEqual([27, 34, 54, 255]);
    expect(ink.uniforms!.get("u_outlineParams")).toEqual([2, 2e-4, 0, 0]);
    expect(ink.uniforms!.get("u_outlineTexel")).toEqual([1 / 32, 1 / 16]);
  });

  it("no matching item: no mask and no ink draw", () => {
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    const record = new OutlineTargetPass(device).execute({ items: SCENE, targets: ["nobody"], viewProjectionMatrix: IDENTITY, width: 8, height: 8, output: null });
    device.endFrame();
    expect(device.drawCommands).toHaveLength(0);
    expect(record).toMatchObject({ inked: false, maskItems: [] });
  });

  it("the ink program carries its marker, samples the mask and the scene depth, and loops at most 6 px", () => {
    expect(OUTLINE_TARGET_MASK_LABEL).toBe("a3d.gu47.outlineTargetMask");
    for (const source of [OUTLINE_TARGET_SHADER_SOURCES.vertex, OUTLINE_TARGET_SHADER_SOURCES.fragment]) {
      expect(source.startsWith("#version 300 es")).toBe(true);
      expect(source).toContain(OUTLINE_TARGET_SHADER_MARKER);
    }
    const fragment = OUTLINE_TARGET_SHADER_SOURCES.fragment;
    expect(fragment).toContain("uniform sampler2D u_outlineMask;");
    expect(fragment).toContain("uniform sampler2D u_outlineScene;");
    expect(fragment).toContain("step <= 6;");
    expect(fragment).toContain("const vec2 OUTLINE_DIRS[8] = vec2[8](vec2(1.0, 0.0), vec2(-1.0, 0.0)");
  });
});

/** A `w` x `h` coverage frame with the rectangle [x0, x1) x [y0, y1) set. */
function rect(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) out[y * w + x] = 1;
  return out;
}

/** Fraction of the rectangle's outer perimeter pixels that carry ink. */
function perimeterInked(ink: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  let total = 0;
  let inked = 0;
  for (let x = x0; x < x1; x += 1) for (const y of [y0 - 1, y1]) { total += 1; inked += ink[y * w + x]!; }
  for (let y = y0; y < y1; y += 1) for (const x of [x0 - 1, x1]) { total += 1; inked += ink[y * w + x]!; }
  return inked / total;
}

describe("GU47 E-E outline targets: ink ring (CPU mirror of the shader)", () => {
  it("inks the whole silhouette perimeter, never inside the target or far from it", () => {
    const w = 40, h = 30;
    const covered = rect(w, h, 10, 8, 22, 20);
    const ink = outlineTargetInkMask(covered, w, h, 1);
    expect(perimeterInked(ink, w, 10, 8, 22, 20)).toBe(1);
    for (let i = 0; i < covered.length; i += 1) if (covered[i]) expect(ink[i]).toBe(0);
    // The top rows (sky) are 5+ px away from the target: no ink there at radius 1.
    expect(ink.slice(0, 3 * w).every((v) => v === 0)).toBe(true);
    const ring3 = outlineTargetInkMask(covered, w, h, 3);
    expect(ring3[(8 - 3) * w + 15]).toBe(1);
    expect(ring3[(8 - 4) * w + 15]).toBe(0);
  });

  it("an empty mask inks nothing and the radius clamps to 1..6", () => {
    expect(outlineTargetInkMask(new Uint8Array(64), 8, 8, 3).every((v) => v === 0)).toBe(true);
    const covered = rect(30, 30, 14, 14, 15, 15);
    const wide = outlineTargetInkMask(covered, 30, 30, 40);
    expect(wide[14 * 30 + 14 + 6]).toBe(1);
    expect(wide[14 * 30 + 14 + 7]).toBe(0);
  });

  it("with scene depth, target pixels behind other geometry are not covered", () => {
    const w = 20, h = 1;
    const mask = new Float32Array(w).fill(1);
    for (let x = 5; x < 15; x += 1) mask[x] = 0.5;
    const scene = new Float32Array(w).fill(0.5);
    for (let x = 10; x < 20; x += 1) scene[x] = 0.3; // an occluder in front of the right half
    expect(Array.from(outlineTargetCoverage(mask))).toEqual(Array.from({ length: w }, (_, x) => (x >= 5 && x < 15 ? 1 : 0)));
    expect(Array.from(outlineTargetCoverage(mask, scene))).toEqual(Array.from({ length: w }, (_, x) => (x >= 5 && x < 10 ? 1 : 0)));
  });
});
