import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../../../packages/rendering/src/lanes/prd01";
import { DepthPass } from "../../../packages/rendering/src/DepthPass";
import { ForwardPass, registerForwardDrawHook, resolveForwardClipping } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { TexturedPBRMaterial } from "../../../packages/rendering/src/TexturedPBRMaterial";
import { Texture } from "../../../packages/rendering/src/Texture";
import { ScreenSpaceLineMaterial } from "../../../packages/rendering/src/ScreenSpaceLineMaterial";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { MockRenderDevice, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME, DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT, ShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import { certifiedDefaultScreenLineSource, isUnmodifiedDefaultShaderLibrary, recordDefaultShaderLibrary } from "../../../packages/rendering/src/renderer/TrustedShaderLibrary";
import { trustedShaderVariantOptions } from "../../../packages/rendering/src/renderer/TrustedShaderVariants";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import type { ClippingGroupInput } from "../../../packages/rendering/src/ClippingPlanes";

class CaptureDevice extends MockRenderDevice {
  readonly sources: ShaderSources[] = [];
  override createShaderProgram(source: ShaderSources): RenderShaderProgram {
    this.sources.push(source);
    return super.createShaderProgram(source);
  }
}

describe("generated forward clipping", () => {
  it("selects generated alpha masks from live per-instance cutoff values", () => {
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial();
    const solid = new MaterialInstance(material), masked = new MaterialInstance(material);
    masked.setOverride("u_alphaCutoff", 0.25);
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    try {
      device.beginFrame(4, 4);
      new ForwardPass({ items: [{ geometry, material: solid }, { geometry, material: masked }] })
        .execute({ device, width: 4, height: 4 });
      expect(device.sources.map((source) => source.generatedProgram?.features.alphaMode)).toEqual(["opaque", "mask"]);
      expect(device.drawCommands.map((draw) => draw.uniforms?.get("u_alphaCutoff"))).toEqual([0, 0.25]);
      const maskShader = device.drawCommands[1]!.shader;
      masked.setOverride("u_alphaCutoff", 0.75);
      new ForwardPass({ items: [{ geometry, material: masked }] }).execute({ device, width: 4, height: 4 });
      expect(device.drawCommands[2]!.shader).toBe(maskShader);
      expect(device.drawCommands[2]!.uniforms?.get("u_alphaCutoff")).toBe(0.75);
      masked.setOverride("u_alphaCutoff", 0);
      new ForwardPass({ items: [{ geometry, material: masked }] }).execute({ device, width: 4, height: 4 });
      expect(device.drawCommands[3]!.shader).toBe(device.drawCommands[0]!.shader);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("binds per-draw global and material groups while reusing the same shader for plane edits", () => {
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const globalPlanes: [number, number, number, number][] = [[2, 0, 0, -4]];
    const global: ClippingGroupInput = { planes: globalPlanes, space: "world" };
    const local: ClippingGroupInput = { planes: [[0, 2, 0, -6], [0, 0, 1, 1]], space: "local", combine: "union" };
    const fallback: ClippingGroupInput = { planes: [[1, 0, 0, -9]] };
    let resolutions = 0;
    const item = { geometry, material, globalClipping: global, materialClipping: fallback };
    const options = { items: [item], globalClipping: fallback, clippingPlaneLimit: 3,
      materialClippingFor: () => { resolutions += 1; return local; } };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material }] }).execute({ device, width: 8, height: 8 });
      expect(device.sources[0]?.generatedProgram?.features.features["a3d.clipping"]).toBeUndefined();
      new ForwardPass(options).execute({ device, width: 8, height: 8 });
      expect(resolutions).toBe(1);
      const source = device.sources[1]!;
      expect(source.generatedProgram?.features.features["a3d.clipping"]).toBe(true);
      expect(source.generatedProgram?.defines.A3D_CLIPPING).toBe(true);
      expect(source.vertex).toContain("v_a3dClipLocal = a3dLocal.xyz");
      expect(source.vertex).toContain("v_a3dClipWorld = a3dWorld.xyz");
      expect(source.fragment).toContain("a3dClipRetains(v_a3dClipWorld, v_a3dClipLocal)");
      expect(source.fragment.lastIndexOf("if (a3dClipped) discard;"))
        .toBeGreaterThan(source.fragment.lastIndexOf("a3dDirectLight(L, radiance"));
      if (spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0) {
        const dir = mkdtempSync(join(tmpdir(), "aura3d-forward-clipping-"));
        try {
          const vertex = join(dir, "source.vert"), fragment = join(dir, "source.frag");
          writeFileSync(vertex, source.vertex); writeFileSync(fragment, source.fragment);
          const linked = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
          expect(linked).toContain("u_a3dClipPlanes");
          expect(linked).toContain("u_a3dClipGroups");
          expect(linked).toContain("u_a3dClipGroupCount");
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
      const clipped = device.drawCommands[1]!;
      expect(clipped.uniforms?.get("u_a3dClipGroupCount")).toBe(2);
      expect(Array.from(clipped.uniforms!.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 1, 2, 1, 1]);
      expect(Array.from((clipped.uniforms!.get("u_a3dClipPlanes") as Float32Array).slice(0, 12)))
        .toEqual([1, 0, 0, -2, 0, 1, 0, -3, 0, 0, 1, 1]);
      const firstPlanes = clipped.uniforms!.get("u_a3dClipPlanes") as Float32Array;

      globalPlanes[0] = [2, 0, 0, -8];
      new ForwardPass(options).execute({ device, width: 8, height: 8 });
      expect(resolutions).toBe(2);
      expect(device.sources).toHaveLength(2);
      expect(device.drawCommands[2]!.shader).toBe(clipped.shader);
      expect((device.drawCommands[2]!.uniforms!.get("u_a3dClipPlanes") as Float32Array)[3]).toBe(-4);
      expect(firstPlanes[3]).toBe(-2);

      new ForwardPass({ items: [{ geometry, material, globalClipping: { ...global, enabled: false } }] })
        .execute({ device, width: 8, height: 8 });
      expect(device.sources).toHaveLength(2);
      expect(device.drawCommands[3]!.shader).toBe(device.drawCommands[0]!.shader);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uses item and material precedence, validates the fixed plane budget, and supports generated unlit", () => {
    const device = new MockRenderDevice(), geometry = Geometry.box(), material = new UnlitMaterial();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const attached: ClippingGroupInput = { planes: [[0, 0, 1, -2]], space: "local" };
    Object.assign(material, { clipping: attached });
    const item = { geometry, material, globalClipping: { planes: [[1, 0, 0, -1] as const] } };
    try {
      const binding = resolveForwardClipping(item, { globalClipping: { planes: [[1, 0, 0, -9]] } }, device);
      expect(binding.groups).toHaveLength(2);
      expect(Array.from(binding.planes)).toEqual([1, 0, 0, -1, 0, 0, 1, -2]);
      device.beginFrame(4, 4);
      new ForwardPass({ items: [item] }).execute({ device, width: 4, height: 4 });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]!.uniforms!.get("u_a3dClipGroupCount")).toBe(2);
      const overflow: ClippingGroupInput = { planes: Array.from({ length: 9 }, () => [1, 0, 0, 0] as const) };
      expect(() => new ForwardPass({ items: [{ geometry, material, globalClipping: overflow }] })
        .execute({ device, width: 4, height: 4 })).toThrow(/plane count exceeds/);
      expect(device.drawCommands).toHaveLength(1);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("keeps a resolved clip packet authoritative after draw hooks and rejects unsupported paths", () => {
    const device = new MockRenderDevice(), geometry = Geometry.box(), material = new PBRMaterial();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const group: ClippingGroupInput = { planes: [[1, 0, 0, -1]] };
    const removeHook = registerForwardDrawHook({ id: "clipping-packet-override", bind: (_item, _shader, set) => set("u_a3dClipGroupCount", 0) });
    try {
      device.beginFrame(4, 4);
      new ForwardPass({ items: [{ geometry, material, globalClipping: group }] }).execute({ device, width: 4, height: 4 });
      expect(device.drawCommands[0]!.uniforms!.get("u_a3dClipGroupCount")).toBe(1);
      setRendererQrFlags(createTrustedQrFlags({}), device);
      expect(() => new ForwardPass({ items: [{ geometry, material, globalClipping: group }] })
        .execute({ device, width: 4, height: 4 })).toThrow(/requires a generated forward shader/);
      expect(device.drawCommands).toHaveLength(1);
    } finally { removeHook(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("shares geometry-space clipping and its transform with the standard shadow depth pass", () => {
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const geometryMatrix = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 1, 2, 3, 1];
    const local: ClippingGroupInput = { planes: [[1, 0, 0, -3]], space: "local", clipShadows: true };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material, geometryMatrix, materialClipping: local }] })
        .execute({ device, width: 8, height: 8 });
      const forward = device.drawCommands[0]!.uniforms!;
      const forwardGroups = Array.from(forward.get("u_a3dClipGroups") as Float32Array);
      const forwardPlanes = Array.from(forward.get("u_a3dClipPlanes") as Float32Array);
      expect(Array.from(forward.get("u_geometryMatrix") as Float32Array)).toEqual(geometryMatrix);
      expect(device.sources[0]!.vertex).toContain("v_a3dClipLocal = a3dLocal.xyz");
      expect(device.sources[0]!.vertex).toContain("u_geometryMatrix * vec4(transformed, 1.0)");

      new DepthPass({ clippingPass: "shadow", casters: [{ geometry, geometryMatrix, materialClipping: local }] })
        .execute({ device, width: 8, height: 8 });
      const shadow = device.drawCommands[1]!.uniforms!;
      expect(Array.from(shadow.get("u_geometryMatrix") as readonly number[])).toEqual(geometryMatrix);
      expect(Array.from(shadow.get("u_a3dClipGroups") as Float32Array)).toEqual(forwardGroups);
      expect(Array.from(shadow.get("u_a3dClipPlanes") as Float32Array)).toEqual(forwardPlanes);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("uses model, instance and geometry handedness for clipped draw culling", () => {
    const device = new MockRenderDevice(), geometry = Geometry.box(), material = new PBRMaterial();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const mirror = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const local: ClippingGroupInput = { planes: [[1, 0, 0, -1]], space: "local" };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material, geometryMatrix: mirror,
        instanceTransforms: new Float32Array([...identity, ...mirror]), materialClipping: local }] })
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.map((draw) => draw.renderState?.cullMode)).toEqual(["front", "back"]);
      new ForwardPass({ items: [{ geometry, material, modelMatrix: mirror,
        instanceTransforms: new Float32Array(mirror), materialClipping: local }] })
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands[2]?.renderState?.cullMode).toBe("back");
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects global clipping on billboards, screen-space lines and packed draw rows", () => {
    const device = new MockRenderDevice(), geometry = Geometry.box();
    const spriteBase = new UnlitMaterial(), sprite = new MaterialInstance(spriteBase);
    const line = new ScreenSpaceLineMaterial(), physical = new PBRMaterial();
    sprite.setOverride("u_spriteMode", 1);
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const global: ClippingGroupInput = { planes: [[1, 0, 0, -1]] };
    try {
      device.beginFrame(4, 4);
      for (const material of [sprite, line]) {
        expect(() => new ForwardPass({ items: [{ geometry, material }], globalClipping: global })
          .execute({ device, width: 4, height: 4 })).toThrow(/screen-space lines|Clipped sprites require/);
      }
      const packed = { geometry, material: physical, multiDraw: { mode: "loop", drawIndex: 0 } };
      expect(() => new ForwardPass({ items: [packed], globalClipping: global })
        .execute({ device, width: 4, height: 4 })).toThrow(/packed multi-draw geometry/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); spriteBase.dispose(); line.dispose(); physical.dispose(); device.dispose(); }
  });

  it("rejects native WebGPU point clipping before shader acquisition", () => {
    const device = new CaptureDevice(), geometry = new Geometry(new VertexBuffer(VertexFormat.P3, 1), null, "points"), material = new UnlitMaterial();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    try {
      device.beginFrame(4, 4);
      expect(() => new ForwardPass({ items: [{ geometry, material: new MaterialInstance(material) }], globalClipping: { planes: [[1, 0, 0, -1]] } })
        .execute({ device, width: 4, height: 4 })).toThrow(/points require the point-quad path/);
      expect(device.sources).toHaveLength(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("selects native unlit triangles with the clipping feature", () => {
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new UnlitMaterial();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    try {
      device.beginFrame(4, 4);
      new ForwardPass({ items: [{ geometry, material }], globalClipping: { planes: [[1, 0, 0, -1]] } })
        .execute({ device, width: 4, height: 4 });
      expect(device.sources[0]?.generatedProgram?.features.features).toMatchObject({ "a3d.nativePrimitive": "triangles", "a3d.clipping": true });
      expect(device.drawCommands[0]?.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it.each([false, true])("rejects native WebGPU sprite instances independently of parity flag %s", (parity) => {
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new UnlitMaterial();
    const instance = new MaterialInstance(material);
    instance.setOverride("u_spriteMode", 1);
    Object.defineProperty(device, "kind", { value: "webgpu" });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_PARITY_LINES: parity }), device);
    try {
      device.beginFrame(4, 4);
      expect(() => new ForwardPass({ items: [{ geometry, material: instance }] }).execute({ device, width: 4, height: 4 }))
        .toThrow(/Native WebGPU billboard sprites require a dedicated shader/);
      // Under A3D_PARITY_LINES the generated unlit program is resolved first (7b47e4d87: the prd15.paritySprite variant is
      // the native billboard), then rejected because an instance-only u_spriteMode override does not select that variant.
      // Without the flag nothing is compiled. Either way nothing is drawn.
      if (parity) {
        expect(device.sources).toHaveLength(1);
        expect(device.sources[0]?.generatedProgram?.features.features).toMatchObject({ "a3d.nativePrimitive": "triangles" });
        expect(device.sources[0]?.generatedProgram?.features.features["prd15.paritySprite"]).not.toBe(true);
      } else expect(device.sources).toHaveLength(0);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it.each([false, true])("binds a clipped screen-space line from its final %s world-width transform", (worldUnits) => {
    const device = new CaptureDevice(), shaderLibrary = createDefaultShaderLibrary();
    const geometry = Geometry.screenSpaceLineSegments([{ start: [0, 0, 0], end: [1, 0, 0] }]);
    const material = new ScreenSpaceLineMaterial({ width: 2, worldUnits });
    const model = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 1];
    const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -3, 0, 1];
    const projection = [0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const hookMvp = worldUnits
      ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, -3, 0, 1]
      : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 0, 0, 1];
    const remove = registerForwardDrawHook({ id: `line-clip-final-${worldUnits}`, bind: (_item, _shader, set) => {
      set("u_modelViewProjection", hookMvp);
      set("u_a3dClipInverseLineTransform", new Float32Array(16));
      set("u_a3dClipGroupCount", 0);
    } });
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ shaderLibrary, items: [{ geometry, material, modelMatrix: model,
        materialClipping: { planes: [[1, 0, 0, -1]], space: "local" } }],
        cameraViewMatrix: view, auraFrameCamera: { projectionMatrix: projection } })
        .execute({ device, width: 8, height: 8 });
      const draw = device.drawCommands[0]!;
      expect(draw.shader?.label).toContain(":clipped");
      expect(draw.uniforms?.get("u_a3dClipGroupCount")).toBe(1);
      const inverse = draw.uniforms!.get("u_a3dClipInverseLineTransform") as Float32Array;
      expect(inverse[12]).toBe(worldUnits ? -2 : -7);
      expect(inverse[13]).toBe(worldUnits ? 3 : 0);
      expect(device.sources[0]!.fragment).toContain("a3dLineIsClipped");
    } finally { remove(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects world-width clipped lines when the final MVP and raster camera disagree", () => {
    const device = new MockRenderDevice(), shaderLibrary = createDefaultShaderLibrary();
    const geometry = Geometry.screenSpaceLineSegments([{ start: [0, 0, 0], end: [1, 0, 0] }]);
    const material = new ScreenSpaceLineMaterial({ width: 2, worldUnits: true });
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const jittered = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.25, 0, 0, 1];
    const item = { geometry, material, modelViewProjectionMatrix: jittered,
      globalClipping: { planes: [[1, 0, 0, 0] as const] } };
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ shaderLibrary, items: [item], cameraViewMatrix: identity,
        auraFrameCamera: { projectionMatrix: jittered }, customFrameCamera: { projectionMatrix: identity } })
        .execute({ device, width: 8, height: 8 })).toThrow(/matching raster transforms/);
      expect(device.drawCommands).toHaveLength(0);

      const rasterOptions = { shaderLibrary, items: [item], cameraViewMatrix: identity, cameraViewProjectionMatrix: jittered,
        auraFrameCamera: { projectionMatrix: jittered }, customFrameCamera: { projectionMatrix: identity } };
      new ForwardPass(rasterOptions)
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      expect(Array.from(device.drawCommands[0]!.uniforms!.get("u_projectionMatrix") as Float32Array)).toEqual(jittered);
      expect((device.drawCommands[0]!.uniforms!.get("u_a3dClipInverseLineTransform") as Float32Array)[12]).toBe(-0.25);
      const remove = registerForwardDrawHook({ id: "line-raster-camera-override", bind: (_item, _shader, set) => set("u_projectionMatrix", identity) });
      try {
        expect(() => new ForwardPass(rasterOptions).execute({ device, width: 8, height: 8 })).toThrow(/matching raster transforms/);
        expect(device.drawCommands).toHaveLength(1);
      } finally { remove(); }
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("certifies the exact built-in line source without invoking replaced methods or proxy traps", () => {
    const library = createDefaultShaderLibrary();
    const source = certifiedDefaultScreenLineSource(library)!;
    expect(source.label).toBe(DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME);
    let calls = 0;
    const proxy = new Proxy(library, { get() { calls += 1; throw new Error("unexpected proxy getter"); },
      getPrototypeOf() { calls += 1; throw new Error("unexpected proxy prototype"); } });
    expect(certifiedDefaultScreenLineSource(proxy)).toBeUndefined();
    Object.defineProperty(library, "compileSource", { configurable: true, get() { calls += 1; throw new Error("unexpected getter"); } });
    try { expect(certifiedDefaultScreenLineSource(library)).toBeUndefined(); }
    finally { Reflect.deleteProperty(library, "compileSource"); }
    Object.defineProperty(library, "getRevision", { configurable: true, get() { calls += 1; throw new Error("unexpected getter"); } });
    try { expect(certifiedDefaultScreenLineSource(library)).toBeUndefined(); }
    finally { Reflect.deleteProperty(library, "getRevision"); }
    const original = Object.getOwnPropertyDescriptor(ShaderLibrary.prototype, "compileSource")!;
    Object.defineProperty(ShaderLibrary.prototype, "compileSource", { ...original, value: () => { calls += 1; throw new Error("unexpected method"); } });
    try { expect(certifiedDefaultScreenLineSource(library)).toBeUndefined(); }
    finally { Object.defineProperty(ShaderLibrary.prototype, "compileSource", original); }
    expect(calls).toBe(0);
    expect(certifiedDefaultScreenLineSource(library)?.vertex).toBe(source.vertex);
  });

  it("invalidates clipped line proof on source, chunk and preprocessor mutation", () => {
    const library = createDefaultShaderLibrary();
    const pair = library.get(DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME);
    const originalVertex = pair.vertex;
    const internals = library as unknown as { chunks: Map<string, string>; preprocessor: object; variantCache: Map<string, unknown> };
    const [chunkName, originalChunk] = internals.chunks.entries().next().value!;
    let calls = 0;
    try {
      Object.assign(pair, { vertex: `${originalVertex}\n// changed` });
      expect(certifiedDefaultScreenLineSource(library)).toBeUndefined();
      recordDefaultShaderLibrary(library);
      expect(certifiedDefaultScreenLineSource(library)).toBeUndefined();
      Object.assign(pair, { vertex: originalVertex });
      internals.chunks.set(chunkName, `${originalChunk}\n// changed`);
      expect(certifiedDefaultScreenLineSource(library)).toBeUndefined();
      internals.chunks.set(chunkName, originalChunk);
      Object.defineProperty(internals.preprocessor, "preprocess", { configurable: true, value: () => { calls += 1; } });
      expect(certifiedDefaultScreenLineSource(library)).toBeUndefined();
      Reflect.deleteProperty(internals.preprocessor, "preprocess");
      const poison = new Proxy({}, { get() { calls += 1; throw new Error("unexpected cache access"); } });
      internals.variantCache.set("untrusted", poison);
      expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(false);
      expect(certifiedDefaultScreenLineSource(library)).toBeDefined();
      internals.variantCache.clear();
      expect(certifiedDefaultScreenLineSource(library)).toBeDefined();
      expect(calls).toBe(0);
    } finally { Object.assign(pair, { vertex: originalVertex }); internals.chunks.set(chunkName, originalChunk); Reflect.deleteProperty(internals.preprocessor, "preprocess"); internals.variantCache.clear(); }
  });

  it("retains replay proof across genuine compiled variants while detecting replaced and edited entries", () => {
    const library = createDefaultShaderLibrary();
    const options = trustedShaderVariantOptions({});
    const first = library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT, options);
    const second = library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
      trustedShaderVariantOptions({ A3D_EXTRA_TEST: true }));
    expect(first).not.toBe(second);
    expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(true);
    expect(library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT, options)).toBe(first);
    expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(true);
    const cache = (library as unknown as { variantCache: Map<string, unknown> }).variantCache;
    const key = [...cache.entries()].find(([, value]) => value === first)![0];
    let traps = 0;
    const replacement = new Proxy({}, { get() { traps += 1; throw new Error("unexpected cache getter"); },
      getPrototypeOf() { traps += 1; throw new Error("unexpected cache prototype"); } });
    cache.set(key, replacement);
    expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(false);
    expect(traps).toBe(0);
    cache.set(key, first);
    const original = first.vertex;
    Object.assign(first, { vertex: `${original}\n// modified` });
    expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(false);
    Object.assign(first, { vertex: original });
    expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(true);
  });

  it("never certifies custom variant requests, cache hits, or failed compilations", () => {
    const defaultOptions = createDefaultShaderLibrary();
    const defaultVariant = defaultOptions.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT);
    expect(defaultOptions.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT)).toBe(defaultVariant);
    expect(isUnmodifiedDefaultShaderLibrary(defaultOptions)).toBe(true);

    const library = createDefaultShaderLibrary();
    const options = trustedShaderVariantOptions({});
    const variant = library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT, options);
    expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(true);
    // An ordinary cache hit retains its normal result, but cannot gain a replay proof.
    expect(library.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT, {})).toBe(variant);
    expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(false);

    const custom = createDefaultShaderLibrary();
    let getterCalls = 0;
    const customOptions = { get defines() { getterCalls += 1; return {}; } };
    const compiled = custom.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT, customOptions);
    expect(compiled.label).toContain(DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT);
    const callsAfterCompile = getterCalls;
    expect(isUnmodifiedDefaultShaderLibrary(custom)).toBe(false);
    expect(getterCalls).toBe(callsAfterCompile);

    const failed = createDefaultShaderLibrary();
    expect(() => failed.compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, "missing", trustedShaderVariantOptions({}))).toThrow(/not registered/);
    expect(isUnmodifiedDefaultShaderLibrary(failed)).toBe(false);
  });

  it("keeps the real legacy ForwardPass variant cache eligible for replay", () => {
    const device = new MockRenderDevice(), library = createDefaultShaderLibrary(), geometry = Geometry.texturedCube(1);
    const texture = new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([255, 255, 255, 255]) });
    const material = new TexturedPBRMaterial({ clearcoatFactor: 0.5, clearcoatTexture: texture });
    setRendererQrFlags(createTrustedQrFlags({}), device);
    try {
      expect(material.shaderVariant).toBe(DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT);
      device.beginFrame(4, 4);
      new ForwardPass({ shaderLibrary: library, items: [{ geometry, material }] }).execute({ device, width: 4, height: 4 });
      expect(device.drawCommands).toHaveLength(1);
      expect((library as unknown as { variantCache: Map<string, unknown> }).variantCache.size).toBe(1);
      expect(isUnmodifiedDefaultShaderLibrary(library)).toBe(true);
    } finally { geometry.dispose(); material.dispose(); texture.dispose(); device.dispose(); }
  });

  it("revalidates the line source after hooks and before submission", () => {
    const device = new MockRenderDevice(), shaderLibrary = createDefaultShaderLibrary();
    const geometry = Geometry.screenSpaceLineSegments([{ start: [0, 0, 0], end: [1, 0, 0] }]);
    const material = new ScreenSpaceLineMaterial(), source = shaderLibrary.get(DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME);
    const original = source.fragment;
    const remove = registerForwardDrawHook({ id: "line-source-mutation", bind: () => { Object.assign(source, { fragment: `${original}\n// changed` }); } });
    try {
      device.beginFrame(4, 4);
      expect(() => new ForwardPass({ shaderLibrary, items: [{ geometry, material, globalClipping: { planes: [[1, 0, 0, 0]] } }] })
        .execute({ device, width: 4, height: 4 })).toThrow(/authenticated non-instanced shader source/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { remove(); Object.assign(source, { fragment: original }); geometry.dispose(); material.dispose(); device.dispose(); }
  });
});
