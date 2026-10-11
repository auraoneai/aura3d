/**
 * 02-DEPTH — the prd02 shadow depth pass composes every active C-11
 * depth-variant feature (lane 01 `depthVariantFeaturesFor`, #751), splices
 * `vertex:deform` chunks through the C-18 `a3dDeform` call, lets a spliced
 * deform own skinning, binds feature uniforms, and reports deform features
 * that have no `a3dDeform` entry point instead of breaking the program.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { identityMat4, PerspectiveCamera } from "@aura3d/scene";
import { registerShaderChunk } from "../../../../packages/rendering/src/contracts/program";
import { registerDepthVariantFeature, type DepthVariantFeature } from "../../../../packages/rendering/src/contracts/shadows";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { createLeanCoreShaderLibrary } from "../../../../packages/rendering/src/ShaderLibraryCore";
import {
  activeDepthFeatures,
  composeDepthDeformVertex,
  depthDeformIncompatibility,
  prd02DepthProgram,
  registerPrd02DepthShader,
  resolvePrd02ShadowCasterVariant
} from "../../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
import { Prd02ShadowSystem } from "../../../../packages/rendering/src/shadows/ShadowSystem";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const TIER = QUALITY_TIERS.high;

registerShaderChunk({
  name: "test_prd02_depth_deform",
  owner: "prd02",
  stage: "vertex",
  glsl: "uniform float u_testDeformAmount;\nvoid a3dDeform(out vec4 p, out vec3 n, out vec4 t) { p = vec4(a_position + vec3(0.0, u_testDeformAmount, 0.0), 1.0); n = vec3(0.0, 1.0, 0.0); t = vec4(0.0); }"
});
registerShaderChunk({ name: "test_prd02_depth_offset_only", owner: "prd02", stage: "vertex", glsl: "vec3 testOffset(vec3 p) { return p; }" });

const deformFeature: DepthVariantFeature = {
  id: "test.deform",
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  order: 50,
  passes: ["depth"],
  select: (input) => (input.item.label?.startsWith("deform:") ? 1 : undefined),
  defines: () => ({ A3D_TEST_DEFORM: 1 }),
  chunks: ["test_prd02_depth_deform"],
  hooks: ["vertex:deform"],
  bindUniforms: (_value, _item, set) => set("u_testDeformAmount", 0.25)
};
const offsetOnlyFeature: DepthVariantFeature = {
  ...deformFeature,
  id: "test.offsetOnly",
  order: 60,
  select: (input) => (input.item.label?.startsWith("offset:") ? 1 : undefined),
  chunks: ["test_prd02_depth_offset_only"],
  bindUniforms: undefined
};
const unregister = [registerDepthVariantFeature(deformFeature), registerDepthVariantFeature(offsetOnlyFeature)];
afterAll(() => unregister.forEach((dispose) => dispose()));

const item = (label: string, skinned = false): RenderItem => ({
  geometry: Geometry.triangle(),
  modelMatrix: identityMat4(),
  label,
  ...(skinned ? { skinning: { jointCount: 2, matrices: new Float32Array(32) } } : {})
}) as RenderItem;

describe("02-DEPTH depth-feature composition", () => {
  it("enumerates every active depth feature, other lanes' included", () => {
    const ids = activeDepthFeatures(FLAGS_ON).map((feature) => feature.id);
    expect(ids).toEqual(expect.arrayContaining(["prd02.depthInstancing", "prd02.depthAlpha", "prd02.depthSkinning", "test.deform", "test.offsetOnly"]));
    expect(activeDepthFeatures(resolveQrFlags({})).map((feature) => feature.id)).not.toContain("test.deform");
  });

  it("splices the deform chunk and the C-18 call; a spliced deform owns skinning", () => {
    const features = activeDepthFeatures(FLAGS_ON);
    const key = resolvePrd02ShadowCasterVariant(item("deform:a", true), FLAGS_ON, TIER, features);
    expect(key.features["test.deform"]).toBe(1);
    expect(key.skinning).toBe(0);
    const library = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(library);
    const device = new MockRenderDevice();
    const created: string[] = [];
    const create = device.createShaderProgram.bind(device);
    vi.spyOn(device, "createShaderProgram").mockImplementation((descriptor) => {
      created.push(descriptor.vertex);
      return create(descriptor);
    });
    prd02DepthProgram(device, library, key, features);
    expect(created).toHaveLength(1);
    expect(created[0]).toContain("a3dDeform(local, a3dDeformNormal, a3dDeformTangent);");
    expect(created[0]).toContain("uniform float u_testDeformAmount;");
    const vertex = composeDepthDeformVertex("void main() {\n#if A3D_DEPTH_INSTANCED\n  int instanceIndex = 0;\n#endif\n}", key, features);
    expect(vertex).toContain("void a3dDeform(out vec4 p");
    expect(vertex.indexOf("a3dDeform(local")).toBeLessThan(vertex.indexOf("#if A3D_DEPTH_INSTANCED"));
    // Without a selected deform feature the source is untouched and prd02 skins.
    const plain = resolvePrd02ShadowCasterVariant(item("plain", true), FLAGS_ON, TIER, features);
    expect(plain.skinning).toBe(4);
    const src = "void main() {\n#if A3D_DEPTH_INSTANCED\n  int instanceIndex = 0;\n#endif\n}";
    expect(composeDepthDeformVertex(src, plain, features)).toBe(src);
  });

  it("does not splice a deform feature without a3dDeform and reports it", () => {
    expect(depthDeformIncompatibility(offsetOnlyFeature)).toContain("no a3dDeform() entry point");
    expect(depthDeformIncompatibility(deformFeature)).toBeNull();
    const features = activeDepthFeatures(FLAGS_ON);
    const key = resolvePrd02ShadowCasterVariant(item("offset:b"), FLAGS_ON, TIER, features);
    const src = "void main() {\n#if A3D_DEPTH_INSTANCED\n  int instanceIndex = 0;\n#endif\n}";
    expect(composeDepthDeformVertex(src, key, features)).toBe(src);

    const device = new MockRenderDevice();
    const draws: { label: string; uniforms: ReadonlyMap<string, unknown> }[] = [];
    const draw = device.draw.bind(device);
    vi.spyOn(device, "draw").mockImplementation((command) => {
      draws.push({ label: command.label ?? "", uniforms: command.uniforms as ReadonlyMap<string, unknown> });
      return draw(command);
    });
    device.beginFrame(64, 64);
    const system = new Prd02ShadowSystem(device, {
      enabled: true, mapSize: 256, cascades: 1, maxDistance: 50, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5
    });
    const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 50 });
    cam.transform.setPosition(0, 3, 8);
    cam.updateCameraMatrices();
    system.update({
      camera: { viewProjectionMatrix: cam.viewProjectionMatrix, near: 0.1, far: 50 },
      sun: { direction: [0, -1, 0] }, casters: [item("deform:c"), item("offset:d")], localLights: [], flags: FLAGS_ON, tier: TIER
    });
    device.endFrame();
    const diag = system.diagnostics();
    expect(diag.droppedFeatures).toContain("depth.deform:test.offsetOnly: no a3dDeform() entry point (C-18)");
    expect(diag.casterVariants.some((id) => id.includes("test.deform=1"))).toBe(true);
    const deformDraw = draws.find((d) => d.label.startsWith("deform:c"));
    expect(deformDraw?.uniforms.get("u_testDeformAmount")).toBe(0.25);
    expect(draws.find((d) => d.label.startsWith("offset:d"))?.uniforms.has("u_testDeformAmount")).toBe(false);
    system.dispose();
  });
});
