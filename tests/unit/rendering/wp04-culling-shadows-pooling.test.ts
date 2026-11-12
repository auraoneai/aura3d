import { describe, expect, it, vi } from "vitest";
import { Matrix4 } from "../../../packages/math/src/Matrix4";
import { Vector3 } from "../../../packages/math/src/Vector3";
import "../../../packages/rendering/src/lanes/prd06";
import "../../../packages/rendering/src/lanes/prd10";
import {
  Geometry,
  IndexBuffer,
  InstancedPBRMaterial,
  PBRMaterial,
  VertexBuffer,
  VertexFormat,
  createTrustedQrFlags,
  type RenderItem,
  type RenderSource
} from "../../../packages/rendering/src";
import { createLeanCoreShaderLibrary } from "../../../packages/rendering/src/ShaderLibraryCore";
import type { AuraQualityTierSettings, DepthVariantFeature } from "../../../packages/rendering/src/contracts";
import {
  cullExplicitRenderItems,
  explicitCullingFrustum
} from "../../../packages/rendering/src/renderer/CullingBatching";
import {
  MIN_CULLED_INSTANCES,
  cullInstancesToFrustum
} from "../../../packages/rendering/src/renderer/InstanceFrustumCull";
import {
  buildCascadeCasterCullEntries,
  cascadeSubTexelThreshold,
  filterCastersForCascade,
  type Prd02ShadowFrameUniforms
} from "../../../packages/rendering/src/shadows/ShadowSystem";
import { fitDirectionalCascades } from "../../../packages/rendering/src/shadows/DirectionalCascadeFitter";
import { bindShadowFrameUniforms } from "../../../packages/rendering/src/shadows/ShadowFrameBinding";
import {
  COMPILER_AUTO_INSTANCED_SYMBOL,
  PRD02_DEPTH_SHADER_NAME,
  composeDepthDeformVertex,
  ensurePrd02DepthFeatures,
  prd02DepthFeatures,
  prd02DepthVariantDefines,
  prd02DepthWgsl,
  prd02ShadowCasterEligible,
  registerPrd02DepthShader,
  resolvePrd02ShadowCasterVariant
} from "../../../packages/rendering/src/shadows/Prd02DepthShaderLibrary";
import { createPrd06DeformDepthFeature } from "../../../packages/rendering/src/shaders/deform/depthFeature";
import {
  CustomGeometryPool,
  ProductionMaterialPool,
  createProductionPrimitiveMaterial,
  createProductionRuntimePrimitiveEntries,
  disposeProductionPrimitiveMaterial
} from "../../../packages/engine/src/agent-api/compiler/primitives";
import { qrPrimitiveGeometryOptions } from "../../../packages/engine/src/agent-api/compiler/geometry";
import {
  resolveMountCompressedTextureCapabilities,
  reuseRenderItemsForTest
} from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { typedGLBActorDecoderOptions } from "../../../packages/engine/src/agent-api/AssetDecoders";
import { sceneShadowRadius } from "../../../packages/engine/src/agent-api/compiler/shadows";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { defineAuraCustomGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import type { AuraPrimitiveNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

function makeTranslationMatrix(x: number, y: number, z: number, scale = 1): Float32Array {
  return new Float32Array([
    scale, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, scale, 0,
    x, y, z, 1
  ]);
}

function makeUnitBoxGeometry(halfExtent = 0.5, topology: "triangles" | "points" | "lines" = "triangles"): Geometry {
  const vb = new VertexBuffer(VertexFormat.P3N3, 3);
  vb.setAttribute(0, "position", [-halfExtent, -halfExtent, 0]);
  vb.setAttribute(0, "normal", [0, 1, 0]);
  vb.setAttribute(1, "position", [halfExtent, -halfExtent, 0]);
  vb.setAttribute(1, "normal", [0, 1, 0]);
  vb.setAttribute(2, "position", [0, halfExtent, 0]);
  vb.setAttribute(2, "normal", [0, 1, 0]);
  const ib = topology === "triangles" ? new IndexBuffer([0, 1, 2], 3) : null;
  return new Geometry(vb, ib, topology, {
    min: [-halfExtent, -halfExtent, -halfExtent],
    max: [halfExtent, halfExtent, halfExtent]
  });
}

function makeHighTier(): AuraQualityTierSettings {
  return {
    tier: "high",
    dprCap: 2,
    msaa: 4,
    primitiveSegments: "full",
    shadow: { mapSize: 2048, cascades: 3, filter: "pcf5", maxDistance: 90 }
  } as unknown as AuraQualityTierSettings;
}

describe("WP-04: WebGPU [0, 1] Reversed-Z Frustum Culling & MIN_CULLED_INSTANCES = 32", () => {
  it("culls items beyond the far plane under WebGPU [0, 1] Reversed-Z and guards far === 2 * near", () => {
    const geo = makeUnitBoxGeometry(0.5);
    const mat = new PBRMaterial();
    try {
      const proj = Matrix4.perspective(Math.PI / 3, 16 / 9, 0.5, 40, {
        clipRange: "zero-to-one",
        mode: "reversed"
      });
      const view = Matrix4.lookAt(
        new Vector3(0, 0, 0),
        new Vector3(0, 0, -1),
        new Vector3(0, 1, 0)
      );
      const vp = new Float32Array(proj.multiply(view).elements);

      const nearInside: RenderItem = { geometry: geo, material: mat, modelMatrix: makeTranslationMatrix(0, 0, -10) };
      const pastFar: RenderItem = { geometry: geo, material: mat, modelMatrix: makeTranslationMatrix(0, 0, -65) };
      const behindCamera: RenderItem = { geometry: geo, material: mat, modelMatrix: makeTranslationMatrix(0, 0, 5) };
      const makeDiag = () => ({ submittedObjects: 0, visibleObjects: 0, frustumTestedObjects: 0, culledObjects: 0 } as never);
      const cullSource = { frustumCulling: true } as RenderSource;

      const frustum = explicitCullingFrustum(cullSource, vp as unknown as Parameters<typeof explicitCullingFrustum>[1], undefined);
      const visible = cullExplicitRenderItems([nearInside, pastFar, behindCamera], frustum, makeDiag());
      expect(visible).toEqual([nearInside]);

      // Regression guard: far === 2 * near makes m[10] === -1 === m[11], which collapsed r3 + r2 to zero normal.
      const projDegenerate = Matrix4.perspective(Math.PI / 3, 1, 1, 2, {
        clipRange: "zero-to-one",
        mode: "reversed"
      });
      const vpDegenerate = new Float32Array(projDegenerate.multiply(view).elements);
      const frustumDegenerate = explicitCullingFrustum(cullSource, vpDegenerate as unknown as Parameters<typeof explicitCullingFrustum>[1], undefined);
      expect(frustumDegenerate).toBeDefined();
      const insideMid: RenderItem = { geometry: geo, material: mat, modelMatrix: makeTranslationMatrix(0, 0, -1.5, 0.1) };
      const beyondTwo: RenderItem = { geometry: geo, material: mat, modelMatrix: makeTranslationMatrix(0, 0, -4.0, 0.1) };
      expect(cullExplicitRenderItems([insideMid, beyondTwo], frustumDegenerate, makeDiag())).toEqual([insideMid]);

      // Infinite far Reversed-Z keeps arbitrarily distant items in front of near while rejecting items behind camera.
      const projInf = Matrix4.perspective(Math.PI / 3, 1, 0.5, Infinity, {
        clipRange: "zero-to-one",
        mode: "reversed"
      });
      const vpInf = new Float32Array(projInf.multiply(view).elements);
      const frustumInf = explicitCullingFrustum(cullSource, vpInf as unknown as Parameters<typeof explicitCullingFrustum>[1], undefined);
      const veryFar: RenderItem = { geometry: geo, material: mat, modelMatrix: makeTranslationMatrix(0, 0, -500) };
      expect(cullExplicitRenderItems([veryFar, behindCamera], frustumInf, makeDiag())).toEqual([veryFar]);
    } finally {
      geo.dispose();
      mat.dispose();
    }
  });

  it("lowers MIN_CULLED_INSTANCES to 32 and culls 40-instance batches against WebGPU [0, 1] Reversed-Z far plane", () => {
    expect(MIN_CULLED_INSTANCES).toBe(32);
    const view = Matrix4.lookAt(
      new Vector3(0, 0, 0),
      new Vector3(0, 0, -1),
      new Vector3(0, 1, 0)
    );
    const vp = new Float32Array(
      Matrix4.perspective(Math.PI / 3, 1, 1, 30, {
        clipRange: "zero-to-one",
        mode: "reversed"
      }).multiply(view).elements
    );

    const instanceCount = 40;
    const transforms = new Float32Array(instanceCount * 16);
    for (let i = 0; i < instanceCount; i += 1) {
      // First 12 inside [1, 30] (z = -10), remaining 28 beyond far = 30 (z = -80).
      const z = i < 12 ? -10 : -80;
      transforms.set(makeTranslationMatrix(0, 0, z, 0.25), i * 16);
    }

    const result = cullInstancesToFrustum({
      transforms,
      bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      viewProjection: vp
    });
    expect(result).not.toBeNull();
    expect(result!.total).toBe(40);
    expect(result!.count).toBe(12);
    expect(result!.transforms.length).toBe(12 * 16);
  });
});

describe("WP-04: Shadow Culling, Tight Cascade Clamp, sceneShadowRadius & W5(i)-(ii)", () => {
  it("culls out-of-ortho and sub-texel shadow casters per cascade while exempting cascade-0 skinned heroes", () => {
    expect(cascadeSubTexelThreshold("low")).toBe(3.0);
    expect(cascadeSubTexelThreshold("pcf2")).toBe(3.0);
    expect(cascadeSubTexelThreshold("medium")).toBe(2.25);
    expect(cascadeSubTexelThreshold("pcf3")).toBe(2.25);
    expect(cascadeSubTexelThreshold("high")).toBe(1.5);
    expect(cascadeSubTexelThreshold("ultra")).toBe(1.5);

    const normalGeo = makeUnitBoxGeometry(0.5);
    const tinyRivetGeo = makeUnitBoxGeometry(0.005); // r_local ~ 0.00866m -> diameter ~ 0.0173m
    const mat = new PBRMaterial();
    try {
      const view = Matrix4.lookAt(new Vector3(0, 4, 10), new Vector3(0, 0, 0), new Vector3(0, 1, 0));
      const proj = Matrix4.perspective(Math.PI / 3, 16 / 9, 0.5, 60);
      const vp = new Float32Array(proj.multiply(view).elements);

      const visibleProp: RenderItem = {
        geometry: normalGeo,
        material: mat,
        modelMatrix: makeTranslationMatrix(0, 1, 2, 1),
        castShadow: true
      };
      const outOfCascadeProp: RenderItem = {
        geometry: normalGeo,
        material: mat,
        modelMatrix: makeTranslationMatrix(450, 1, -450, 1),
        castShadow: true
      };
      const tinyRivetProp: RenderItem = {
        geometry: tinyRivetGeo,
        material: mat,
        modelMatrix: makeTranslationMatrix(0, 1, 2, 0.5),
        castShadow: true
      };
      const tinySkinnedFinger: RenderItem = {
        geometry: tinyRivetGeo,
        material: mat,
        modelMatrix: makeTranslationMatrix(0, 1, 2, 0.5),
        skinning: { jointCount: 1, matrices: makeTranslationMatrix(0, 0, 0, 1) } as never,
        castShadow: true
      };

      const stageCaster: RenderItem = {
        geometry: makeUnitBoxGeometry(12),
        material: mat,
        modelMatrix: makeTranslationMatrix(0, 0, 0, 1),
        castShadow: true
      };
      try {
        const fits = fitDirectionalCascades({
          camera: { viewProjectionMatrix: vp, near: 0.5, far: 60 },
          lightDirection: [0, -0.97, -0.24],
          casters: [stageCaster],
          mapSize: 1024,
          cascadeCount: 2,
          splitLambda: 0.6,
          maxDistance: 45
        });
        expect(fits).toHaveLength(2);
        const fit0 = fits[0]!;

        const casters = [visibleProp, outOfCascadeProp, tinyRivetProp, tinySkinnedFinger];
        const entries = buildCascadeCasterCullEntries(casters);
        const c0 = filterCastersForCascade(entries, fit0, cascadeSubTexelThreshold("high"));
        expect(c0).toContain(visibleProp);
        expect(c0).toContain(tinySkinnedFinger);
        expect(c0).not.toContain(outOfCascadeProp);
        expect(c0).not.toContain(tinyRivetProp);

        // In cascade 1 (fit.index > 0), tiny sub-texel skinned detail is also eligible for sub-texel culling.
        const c1 = filterCastersForCascade(buildCascadeCasterCullEntries([tinySkinnedFinger]), fits[1]!, cascadeSubTexelThreshold("high"));
        expect(c1).toHaveLength(0);
      } finally {
        stageCaster.geometry.dispose();
      }
    } finally {
      normalGeo.dispose();
      tinyRivetGeo.dispose();
      mat.dispose();
    }
  });

  it("clamps bounded caster overhangs cleanly in multi-cascade DirectionalCascadeFitter without bloating Cascade 0", () => {
    const arenaGeo = makeUnitBoxGeometry(10);
    const mat = new PBRMaterial();
    try {
      const view = Matrix4.lookAt(new Vector3(0, 3, 8), new Vector3(0, 0, 0), new Vector3(0, 1, 0));
      const proj = Matrix4.perspective(Math.PI / 3, 1, 0.5, 100);
      const vp = new Float32Array(proj.multiply(view).elements);
      const arenaCaster: RenderItem = {
        geometry: arenaGeo,
        material: mat,
        modelMatrix: makeTranslationMatrix(0, 1, 0, 1),
        castShadow: true
      };

      const fitsArena = fitDirectionalCascades({
        camera: { viewProjectionMatrix: vp, near: 0.5, far: 100 },
        lightDirection: [0, -1, -0.05],
        casters: [arenaCaster],
        mapSize: 2048,
        cascadeCount: 3,
        splitLambda: 0.65,
        maxDistance: 90,
        legacy: false
      });
      // Cascade 0 clamps to the near slice rather than inflating to the full 20m+ caster union or 90m sphere.
      expect(fitsArena[0]!.texelWorld).toBeLessThan(fitsArena[2]!.texelWorld);
      expect(fitsArena[0]!.texelWorld * 2048).toBeLessThan(26);
    } finally {
      arenaGeo.dispose();
      mat.dispose();
    }
  });

  it("excludes lights and distant castShadow:false sky domes/planets from sceneShadowRadius", () => {
    const snapshot = {
      nodes: [
        { kind: "light", light: "directional", position: [570, 185, 0], intensity: 2 },
        {
          kind: "primitive",
          primitive: "sphere",
          name: "gas-giant-backdrop",
          position: [-880, 70, 120],
          scale: 520,
          castShadow: false,
          receiveShadow: false
        },
        {
          kind: "primitive",
          primitive: "sphere",
          name: "unlit-sky-shell",
          position: [0, 0, 0],
          scale: 400,
          castShadow: false,
          material: { unlit: true, color: "#112233" }
        },
        {
          kind: "primitive",
          primitive: "box",
          name: "arena-floor",
          position: [0, 0, 0],
          size: [12, 1, 12],
          castShadow: false,
          receiveShadow: true
        },
        {
          kind: "primitive",
          primitive: "box",
          name: "hero-crate",
          position: [3, 1, -2],
          size: [2, 2, 2],
          castShadow: true,
          receiveShadow: true
        }
      ]
    } as unknown as AuraSceneSnapshot;

    const radius = sceneShadowRadius(snapshot);
    expect(radius).toBeGreaterThan(4);
    expect(radius).toBeLessThan(20);
  });

  it("deduplicates bindShadowFrameUniforms writes to once per unique Material per frame", () => {
    const sharedMat = new PBRMaterial();
    const setParamSpy = vi.spyOn(sharedMat, "setParameter");
    try {
      const uniforms: Prd02ShadowFrameUniforms = {
        cascadeTexture: null,
        cascadeTextures: [null, null, null, null],
        cascadeMatrices: new Float32Array(64),
        cascadeSplits: new Float32Array(4),
        cascadeTexelWorld: new Float32Array(4),
        atlasTexture: null,
        localShadowData: new Float32Array(24),
        localShadowMatrices: new Float32Array(96),
        localShadowIndexData: new Float32Array(24),
        mapSize: 2048
      } as unknown as Prd02ShadowFrameUniforms;
      const config = { normalBias: 0.02, strength: 1.0 };

      for (let i = 0; i < 20; i += 1) {
        bindShadowFrameUniforms(sharedMat, uniforms, config);
      }
      // 15 shadow uniforms written once on sharedMat instead of 20 * 15 = 300 writes.
      expect(setParamSpy).toHaveBeenCalledTimes(15);

      // Explicit caller Set<Material> also short-circuits across repeated calls.
      const seen = new Set([sharedMat]);
      bindShadowFrameUniforms(sharedMat, uniforms, config, seen);
      expect(setParamSpy).toHaveBeenCalledTimes(15);
    } finally {
      setParamSpy.mockRestore();
      sharedMat.dispose();
    }
  });

  it("guards point-topology shadow casters (W5(i)) and composes prd06.deform + prd10.wind sequentially (W5(ii))", () => {
    ensurePrd02DepthFeatures();
    const pointGeo = makeUnitBoxGeometry(0.5, "points");
    const mat = new PBRMaterial();
    try {
      // Unauthored castShadow on points defaults to false; explicit castShadow: true is eligible with doubleSided: true.
      expect(prd02ShadowCasterEligible({ geometry: pointGeo, material: mat })).toBe(false);
      expect(prd02ShadowCasterEligible({ geometry: pointGeo, material: mat, castShadow: true })).toBe(true);

      const flags = createTrustedQrFlags({
        A3D_QR_LIGHTING: true,
        A3D_QR_ANIMATION_SKINNED_SHADOWS: true,
        A3D_QR_WORLD_WIND: true
      });
      const tier = makeHighTier();
      const pointVariant = resolvePrd02ShadowCasterVariant(
        { geometry: pointGeo, material: mat, castShadow: true },
        flags,
        tier,
        prd02DepthFeatures()
      );
      expect(pointVariant.doubleSided).toBe(true);

      // Sequential deform + wind composition in both GLSL and WGSL depth shaders:
      const skinnedFormat = new VertexFormat(
        [
          { semantic: "position", components: 3, offset: 0 },
          { semantic: "normal", components: 3, offset: 12 },
          { semantic: "joints", components: 4, offset: 24 },
          { semantic: "weights", components: 4, offset: 40 }
        ],
        56
      );
      const triVb = new VertexBuffer(skinnedFormat, 3);
      const triIb = new IndexBuffer([0, 1, 2], 3);
      const triGeo = new Geometry(triVb, triIb, "triangles", { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] });
      try {
        const prd06Feature = createPrd06DeformDepthFeature({} as never);
        const windDepthFeature: DepthVariantFeature = {
          id: "prd10.wind",
          owner: "prd10",
          flag: "A3D_QR_WORLD_WIND",
          passes: ["depth", "distance"],
          select: (input) => (input.item.label?.startsWith("prd10.wind:") ? 1 : undefined),
          defines: (v): Readonly<Record<string, string | number | true>> => (v ? { A3D_PRD10_WIND: 1 } : {}),
          chunks: ["a3d_prd10_wind_deform"],
          hooks: ["vertex:deform"],
          bindUniforms: () => {}
        };
        const features: readonly DepthVariantFeature[] = [...prd02DepthFeatures(), windDepthFeature, prd06Feature];
        const skinnedWindItem = {
          geometry: triGeo,
          material: mat,
          label: "prd10.wind:hero-cape",
          castShadow: true,
          skinning: { jointCount: 2, matrices: new Float32Array(32) } as never
        } as unknown as RenderItem;

        const key = resolvePrd02ShadowCasterVariant(skinnedWindItem, flags, tier, features);
        expect(key.features["prd06.deform"]).toBe("depth");
        expect(key.features["prd10.wind"]).toBe(1);

        const lib = createLeanCoreShaderLibrary();
        registerPrd02DepthShader(lib);
        const rawSource = lib.compileSource(PRD02_DEPTH_SHADER_NAME, {
          defines: prd02DepthVariantDefines(key, features)
        });
        const composedGlsl = composeDepthDeformVertex(rawSource.vertex, key, features);
        expect(composedGlsl).toContain("a3dDeformBeforeWind");
        expect(composedGlsl).toContain("a3dWindOffset");
        expect(composedGlsl.indexOf("a3dDeformBeforeWind")).toBeLessThan(composedGlsl.indexOf("void a3dDeform("));

        const nativeWgsl = prd02DepthWgsl(key, features);
        expect(nativeWgsl.webgpu.vertex).toContain("u_boneTexture");
        expect(nativeWgsl.webgpu.vertex).toContain("u_windDirStrength");
        expect(nativeWgsl.webgpu.vertex.indexOf("u_boneTexture")).toBeLessThan(
          nativeWgsl.webgpu.vertex.indexOf("u_windDirStrength")
        );
      } finally {
        triGeo.dispose();
      }
    } finally {
      pointGeo.dispose();
      mat.dispose();
    }
  });
});

describe("WP-04: Geometry/Material Pooling, InstancedPBRMaterial Lobes, MEM-1 Caps & Safe Static Auto-Instancing", () => {
  it("pools identical custom geometry buffers with ref-counted disposal and isolates runtime-handle nodes", () => {
    const specA = defineAuraCustomGeometry({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2])
    });
    const specB = defineAuraCustomGeometry({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint16Array([0, 1, 2])
    });
    const pool = new CustomGeometryPool();
    const g1 = pool.acquire(specA);
    const g2 = pool.acquire(specB);
    expect(pool.size).toBe(1);
    expect(pool.refCount(specA)).toBe(2);
    expect(g1.vertexBuffer).toBe(g2.vertexBuffer);
    expect(g1.indexBuffer).toBe(g2.indexBuffer);

    // Idempotent per-handle disposal keeps shared buffers alive until last reference releases.
    g1.dispose();
    g1.dispose();
    expect(pool.refCount(specA)).toBe(1);
    expect(() => g2.vertexBuffer.readBytes(0, 0)).not.toThrow();
    g2.dispose();
    expect(pool.size).toBe(0);
  });

  it("pools static non-addressable materials while giving runtime-handle nodes isolated Material instances", () => {
    const mountScope = {};
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true });
    const qr = qrPrimitiveGeometryOptions(flags, { primitiveSegments: "full" }, mountScope);

    const staticA: AuraPrimitiveNode = {
      kind: "primitive",
      primitive: "box",
      name: "wall-1",
      position: [-2, 0, 0],
      material: { color: "#7fbc6b", roughness: 0.72, metallic: 0.1 }
    };
    const staticB: AuraPrimitiveNode = {
      kind: "primitive",
      primitive: "box",
      name: "wall-2",
      position: [2, 0, 0],
      material: { color: "#7fbc6b", roughness: 0.72, metallic: 0.1 }
    };
    const mutableNode: AuraPrimitiveNode = {
      kind: "primitive",
      primitive: "box",
      name: "hero-wall",
      runtime: { id: "hero-wall" },
      position: [0, 2, 0],
      material: { color: "#7fbc6b", roughness: 0.72, metallic: 0.1 }
    };

    const entries = createProductionRuntimePrimitiveEntries([staticA, staticB, mutableNode], qr);
    try {
      const matA = entries[0]!.resources[0]!.material;
      const matB = entries[1]!.resources[0]!.material;
      const matMutable = entries[2]!.resources[0]!.material;

      expect(matA).toBe(matB);
      expect(matMutable).not.toBe(matA);

      // Mutating the runtime-addressable node's material parameter never touches pooled static siblings.
      matMutable.setParameter("u_roughness", 0.05);
      expect(matA.getParameter("u_roughness")).toBeCloseTo(0.72, 5);

      // Disposing entry 0 releases one lease without disposing the shared material used by entry 1.
      disposeProductionPrimitiveMaterial(entries[0]!.resources[0]!);
      expect(matB.disposed).toBe(false);
      disposeProductionPrimitiveMaterial(entries[1]!.resources[0]!);
      expect(matB.disposed).toBe(true);
    } finally {
      for (const entry of entries) {
        for (const res of entry.resources) {
          res.geometry.dispose();
          disposeProductionPrimitiveMaterial(res);
        }
      }
    }

    const standalonePool = new ProductionMaterialPool();
    const lease1 = standalonePool.acquireNode(staticA);
    const lease2 = standalonePool.acquireNode(staticB);
    expect(standalonePool.size).toBe(1);
    expect(lease1.material).toBe(lease2.material);
    lease1.release();
    expect(lease2.material.disposed).toBe(false);
    lease2.release();
    expect(lease2.material.disposed).toBe(true);
  });

  it("forwards physical PBR lobes onto InstancedPBRMaterial while expanding transmissive materials", () => {
    const instancedExtended: AuraPrimitiveNode = {
      kind: "primitive",
      primitive: "sphere",
      instances: [{ position: [0, 0, 0] }, { position: [2, 0, 0] }],
      material: {
        color: "#ccddee",
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        sheen: 0.6,
        sheenColor: "#ff88aa",
        sheenRoughness: 0.25,
        anisotropy: 0.7,
        anisotropyRotation: 0.4,
        iridescence: 0.9,
        iridescenceIOR: 1.45,
        iridescenceThicknessRange: [120, 380],
        ior: 1.6,
        specularIntensity: 0.75,
        dispersion: 0.15
      }
    };
    const mat = createProductionPrimitiveMaterial(instancedExtended);
    try {
      expect(mat).toBeInstanceOf(InstancedPBRMaterial);
      expect(mat.getParameter("u_clearcoatFactor")).toBeCloseTo(0.85, 5);
      expect(mat.getParameter("u_clearcoatRoughnessFactor")).toBeCloseTo(0.12, 5);
      expect(mat.getParameter("u_sheenRoughnessFactor")).toBeCloseTo(0.25, 5);
      expect(mat.getParameter("u_anisotropyStrength")).toBeCloseTo(0.7, 5);
      expect(mat.getParameter("u_anisotropyRotation")).toBeCloseTo(0.4, 5);
      expect(mat.getParameter("u_iridescenceFactor")).toBeCloseTo(0.9, 5);
      expect(mat.getParameter("u_iridescenceIor")).toBeCloseTo(1.45, 5);
      expect(mat.getParameter("u_iridescenceThicknessMinimum")).toBe(120);
      expect(mat.getParameter("u_iridescenceThicknessMaximum")).toBe(380);
      expect(mat.getParameter("u_ior")).toBeCloseTo(1.6, 5);
      expect(mat.getParameter("u_specularFactor")).toBeCloseTo(0.75, 5);
      expect(mat.getParameter("u_dispersion")).toBeCloseTo(0.15, 5);
    } finally {
      mat.dispose();
    }

    const instancedTransmissive: AuraPrimitiveNode = {
      ...instancedExtended,
      material: { ...instancedExtended.material, transmission: 0.8 }
    };
    const transMat = createProductionPrimitiveMaterial(instancedTransmissive);
    try {
      expect(transMat).toBeInstanceOf(PBRMaterial);
    } finally {
      transMat.dispose();
    }
  });

  it("resolves WebGPU and WebGL2 compressed-texture capabilities for typedGLBActorDecoderOptions (MEM-1)", () => {
    const webgpuCaps = resolveMountCompressedTextureCapabilities({
      renderer: {
        device: {
          kind: "webgpu",
          nativeGpuDevice: {
            features: new Set(["texture-compression-astc", "texture-compression-bc"])
          }
        }
      }
    });
    expect(webgpuCaps).toEqual({
      astc: true,
      bptc: true,
      etc2: false,
      s3tc: false,
      s3tcSrgb: false
    });

    const webgl2Caps = resolveMountCompressedTextureCapabilities({
      renderer: {
        device: {
          kind: "webgl2",
          gl: {
            getExtension: (name: string) =>
              name === "WEBGL_compressed_texture_s3tc" || name === "WEBGL_compressed_texture_s3tc_srgb" ? {} : null
          } as unknown as WebGL2RenderingContext
        }
      }
    });
    expect(webgl2Caps).toEqual({
      astc: false,
      bptc: false,
      etc2: true,
      s3tc: true,
      s3tcSrgb: true
    });

    const flags = createTrustedQrFlags({ A3D_QR_ASSETS: true });
    const opts = typedGLBActorDecoderOptions(flags, undefined, webgpuCaps);
    expect(opts.compressedTextureCapabilities).toEqual(webgpuCaps);
  });

  it("coalesces K >= 2 static non-addressable primitives into one instanced RenderItem while preserving runtime handles", () => {
    const mountScope = {};
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true });
    const qr = qrPrimitiveGeometryOptions(flags, { primitiveSegments: "full" }, mountScope);

    const staticNodes: AuraPrimitiveNode[] = [
      { kind: "primitive", primitive: "box", name: "post-0", position: [-4, 0, 0], material: { color: "#8899aa", clearcoat: 0.4 } },
      { kind: "primitive", primitive: "box", name: "post-1", position: [0, 0, 0], material: { color: "#8899aa", clearcoat: 0.4 } },
      { kind: "primitive", primitive: "box", name: "post-2", position: [4, 0, 0], material: { color: "#8899aa", clearcoat: 0.4 } },
      {
        kind: "primitive",
        primitive: "box",
        name: "interactive-post",
        runtime: { id: "interactive-post" },
        position: [8, 0, 0],
        material: { color: "#8899aa", clearcoat: 0.4 }
      }
    ];

    const entries = createProductionRuntimePrimitiveEntries(staticNodes, qr);
    const registry = createAuraRuntimeNodeRegistry({ nodes: staticNodes } as unknown as AuraSceneSnapshot);
    const impl = {
      primitiveEntries: entries,
      actorEntries: [],
      itemCache: new Map()
    };

    try {
      const makeItems = (): RenderItem[] =>
        entries.map((entry, idx) => ({
          geometry: entry.resources[0]!.geometry,
          material: entry.resources[0]!.material,
          modelMatrix: makeTranslationMatrix((entry.node.position?.[0] ?? 0), 0, 0, 1),
          label: `primitive-${idx}:${entry.resources[0]!.name}:${entry.node.name}`,
          castShadow: true,
          receiveShadow: true
        }));

      const frame1Source = reuseRenderItemsForTest(impl as never, { renderItems: makeItems() } as RenderSource, registry);
      const frame1Items = [...frame1Source.collectRenderItems!()];
      // 3 static boxes -> 1 auto-instanced RenderItem + 1 unbatched runtime-handle RenderItem = 2 items total!
      expect(frame1Items).toHaveLength(2);
      const batched = frame1Items[0]!;
      const unbatchedHandleItem = frame1Items[1]!;

      expect(batched.material).toBeInstanceOf(InstancedPBRMaterial);
      expect(batched.material?.getParameter("u_clearcoatFactor")).toBeCloseTo(0.4, 5);
      expect(batched.instanceTransforms).toBeInstanceOf(Float32Array);
      expect(batched.instanceTransforms?.length).toBe(3 * 16);
      expect((batched as unknown as Record<PropertyKey, unknown>)[COMPILER_AUTO_INSTANCED_SYMBOL]).toBe(true);

      expect(unbatchedHandleItem.label).toContain("primitive-3:");
      expect(unbatchedHandleItem.instanceTransforms).toBeUndefined();
      expect(unbatchedHandleItem.material).toBeInstanceOf(PBRMaterial);

      // Frame 2 with identical static matrices reuses the exact Float32Array & RenderItem (0 per-frame allocations).
      const frame2Source = reuseRenderItemsForTest(impl as never, { renderItems: makeItems() } as RenderSource, registry);
      const frame2Items = [...frame2Source.collectRenderItems!()];
      expect(frame2Items[0]).toBe(batched);
      expect(frame2Items[0]!.instanceTransforms).toBe(batched.instanceTransforms);
    } finally {
      for (const entry of entries) {
        for (const res of entry.resources) {
          res.geometry.dispose();
          disposeProductionPrimitiveMaterial(res);
        }
      }
    }
  });
});
