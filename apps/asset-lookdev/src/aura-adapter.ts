/**
 * Aura adapter (§6.7): the production GLB render pipeline staged identically
 * to the three adapter — same camera, same grey shadow-catcher floor, same
 * HDRI + ACES exposure.
 *
 * The subject loads through `loadProductionGLTFRenderPipeline` with the C-16
 * decoder registry (`decoders: { basePath: "/aura-decoders/" }`) so derived
 * meshopt/KTX2 outputs render — the `model()` scene path cannot pass decoders
 * until lane 15 lands Q-15-1 (compiler → TypedGLBActor wiring).
 *
 * Debug views: the C-02 feature registry's `select()`/`bindUniforms()` are
 * only invoked on the depth-variant path — forward programs take their
 * feature bits solely from `material.programFeatures(ctx).features`
 * (Q-05-6). So the adapter clones each subject material into
 * `LookdevDebugMaterial`, which injects `features["prd05.debugView"]` into
 * the program key, and stamps the feature uniforms the uninvoked
 * `bindUniforms` would have produced
 * (`a3d_prd05_debugSampler`, `u_prd05LodLevel`, `u_prd05TexelBand`).
 */
import type { RenderDevice, RenderShaderProgram, ShaderSources } from "@aura3d/rendering";
import { Renderer, resolveQrFlags } from "@aura3d/engine";
import { setRendererQrFlags } from "@aura3d/rendering/lanes";
import { Material, MaterialInstance, rendererProgramCache } from "@aura3d/rendering";
import type {
  CameraLike,
  CollectedLight,
  MaterialFeatureContext,
  ProductionRenderProof,
  ProgramFeatures,
  RenderItem,
  RenderMaterial,
  RenderSource,
  UniformValue
} from "@aura3d/rendering";
// Direct module import — the asset-corpus barrel also pulls ProductionAssetCorpus,
// which evaluates `node:crypto` at module scope and crashes the browser bundle.
import { loadProductionGLTFRenderPipeline } from "../../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.js";
import type { ProductionGLTFRenderPipeline } from "../../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.js";
import {
  A3DGltfScene,
  a3dRenderResult,
  createDirectionalLight,
  createGroundedStage,
  loadHdrEnvironment
} from "../../../packages/engine/src/production-runtime/index.js";
import { PRD05_DEBUG_VIEW_CHANNELS } from "../../../packages/engine/src/lanes/prd05.js";
import { setTypedGLBActorQrFlags } from "../../../packages/engine/src/lanes/prd04.js";
import type { LookdevStage } from "./stage";
import type { LookdevRequest } from "./shared";
import { PRD05_DEBUG_VIEWS, PRD05_DEBUG_VIEW_ALIASES } from "./shared";

// resolveQrFlags takes the SHORT names ("assets.lookdev" → A3D_QR_ASSETS_LOOKDEV).
const QR_FLAGS = ["assets", "assets.lookdev", "assets.lod", "materials"] as const;
// Debug channels render through the C-02 generated-program path (feature
// chunks only splice there); beauty frames stay on the legacy shaderKey path
// so `assets review` compares the production pipeline as shipped. The whole
// `core` lane is required — the program-cache contract slot only serves the
// real ProgramCache while `A3D_QR_CORE` is on (the generator sub-flag alone
// leaves the stub's library programs in place).
const QR_GENERATOR_FLAGS = ["core", "-core.output"] as const;

/**
 * Q-05-7 workaround (app-side only): lane 01's generator emits
 * `layout(std140, binding = N)` on uniform blocks, which GLSL ES 3.00
 * rejects — every generated program failed compile on real WebGL2 — and no
 * `uniformBlockBinding` call exists anywhere to bind them. This shim strips
 * the qualifier from generated sources and rebinds each named block to its
 * intended binding point after link. Remove when the emitter is fixed.
 */
function installGeneratedProgramUboShim(device: RenderDevice): void {
  type Shimmed = RenderDevice & {
    createShaderProgram(sources: ShaderSources): RenderShaderProgram;
  };
  const dev = device as Shimmed;
  const original = dev.createShaderProgram.bind(dev);
  dev.createShaderProgram = (sources: ShaderSources): RenderShaderProgram => {
    const bindings = new Map<string, number>();
    const strip = (src: string): string =>
      src.replace(
        /layout\s*\(\s*std140\s*,\s*binding\s*=\s*(\d+)\s*\)\s*uniform\s+(\w+)/g,
        (_all, n: string, name: string) => {
          bindings.set(name, Number(n));
          return `layout(std140) uniform ${name}`;
        }
      );
    const next = { ...sources, vertex: strip(sources.vertex), fragment: strip(sources.fragment) };
    const program = original(next);
    const gl = (program as unknown as { gl?: WebGL2RenderingContext }).gl;
    const handle = (program as unknown as { handle?: WebGLProgram }).handle;
    if (gl && handle) {
      for (const [name, binding] of bindings) {
        const index = gl.getUniformBlockIndex(handle, name);
        if (index !== gl.INVALID_INDEX) gl.uniformBlockBinding(handle, index, binding);
      }
    }
    return program;
  };
}

export interface LookdevRunResult {
  readonly engine: "aura";
  readonly glb: string;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly debugApplied: string | null;
  readonly materialsWithDebugView: number;
  readonly textureCount?: number;
  readonly materialCount?: number;
  readonly textureSlots?: readonly string[];
  readonly materialFeatures?: readonly string[];
}

type FeatureBit = readonly [featureId: string, value: number];

/**
 * Clone of a loaded material that contributes one extra feature bit to its
 * program key. The clone re-delegates `programFeatures` to the source so the
 * PBR/physical feature record is preserved verbatim (maps, lobes, alpha).
 */
class LookdevDebugMaterial extends Material {
  constructor(
    private readonly source: Material,
    private readonly bit: FeatureBit | undefined,
    mergedParameters?: ReadonlyMap<string, UniformValue>
  ) {
    super({
      name: `${source.name}#debug`,
      shaderKey: source.shaderKey,
      ...(source.shaderVariant !== undefined ? { shaderVariant: source.shaderVariant } : {}),
      renderState: source.renderState,
      parameters: Object.fromEntries(mergedParameters ?? source.getParameters()),
      requiredAttributes: generatedProgramAttributes(source),
      requiredUniforms: source.requiredUniforms,
      uniformSchema: source.uniformSchema
    });
  }

  override programFeatures(ctx: MaterialFeatureContext): Omit<ProgramFeatures, "lights" | "shadows" | "environment" | "fog" | "pass" | "target" | "backgroundCoverage"> {
    const features = this.source.programFeatures(ctx);
    if (this.bit === undefined) return features;
    return { ...features, features: { ...features.features, [this.bit[0]]: this.bit[1] } };
  }
}

// The generated program's vertex interface is feature-driven: `a_uv`/`a_uv1`
// emit only while a map uses that uv set, `a_color` only while vertexColors,
// and `a_tangent` never (TBN comes from derivatives via a3dTangentNormal).
// Legacy materials authored for the shaderKey path over-declare these and
// fail bindGenerated validation, so drop exactly the unsatisfiable ones and
// keep everything else (joints/morphs/instance attributes stay intact).
function generatedProgramAttributes(material: Material): readonly string[] {
  const features = material.programFeatures({ flags: { on: () => true } as never, tier: {} as never });
  const maps = Object.values(features.maps ?? {});
  const needsUv0 = maps.some((m) => m && (m.uvSet ?? 0) === 0);
  const needsUv1 = maps.some((m) => m && m.uvSet === 1);
  const drop = new Set(["a_tangent"]);
  if (!needsUv0) drop.add("a_uv");
  if (!needsUv1) drop.add("a_uv1");
  if (!features.vertexColors) drop.add("a_color");
  return material.requiredAttributes.filter((a) => !drop.has(a));
}

// ---------------------------------------------------------------- mat4 (column-major)
function perspective(fovDeg: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const m = new Array(16).fill(0);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function lookAt(eye: readonly number[], target: readonly number[], up: readonly number[]): number[] {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1
  ];
}
function matMul4(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1)
    for (let r = 0; r < 4; r += 1)
      for (let k = 0; k < 4; k += 1) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
function normalize3(v: readonly number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross3(a: readonly number[], b: readonly number[]): number[] {
  return [a[1] * b[2] - a[2] * b[0], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot3(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function srgbChannel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function hexToLinearRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [srgbChannel((n >> 16) & 255), srgbChannel((n >> 8) & 255), srgbChannel(n & 255), 1];
}

/** Subject RenderItems rebuilt from the pipeline's scene/libs (harness pattern). */
function collectSubjectItems(pipeline: ProductionGLTFRenderPipeline, wrap?: (material: RenderMaterial, lodLevel: number) => RenderMaterial): { items: RenderItem[]; swapped: number } {
  const resources = pipeline.resources;
  resources.scene.updateWorldTransforms();
  const cloneCache = new Map<string, RenderMaterial>();
  const items: RenderItem[] = [];
  let swapped = 0;
  for (const { node, renderable } of resources.scene.collectRenderables()) {
    const geometry = resources.geometryLibrary.get(renderable.geometry);
    const material = resources.materialLibrary.get(renderable.material);
    if (!geometry || !material) continue;
    let drawMaterial: RenderMaterial = material;
    if (wrap) {
      const lodLevel = (renderable as { lodLevel?: number }).lodLevel ?? 0;
      const key = `${renderable.material}:${lodLevel}`;
      drawMaterial = cloneCache.get(key) ?? wrap(material, lodLevel);
      cloneCache.set(key, drawMaterial);
      swapped += 1;
    }
    const morphTargets = resources.morphTargetLibrary.get(renderable.geometry);
    items.push({
      label: node.name,
      geometry,
      material: drawMaterial,
      modelMatrix: node.transform.worldMatrix,
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(renderable.instanceColors ? { instanceColors: renderable.instanceColors } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return { items, swapped };
}

export async function runAuraAdapter(
  request: LookdevRequest,
  stage: LookdevStage,
  host: HTMLElement
): Promise<LookdevRunResult> {
  const debugChannel = request.debug ?? undefined;
  const generatorOn = debugChannel !== undefined && PRD05_DEBUG_VIEWS.has(debugChannel);
  const resolved = resolveQrFlags({
    options: generatorOn ? [...QR_FLAGS, ...QR_GENERATOR_FLAGS] : [...QR_FLAGS]
  });
  setTypedGLBActorQrFlags(resolved);
  setRendererQrFlags(resolved);
  // Module-level imports registered the lane-04/05 chunks + features; the
  // debug bit reaches the program through LookdevDebugMaterial below.

  const hdri = stage.hdris.find((entry) => entry.id === request.hdri) ?? stage.hdris[0];
  const width = Math.max(8, Math.round(host.clientWidth || host.offsetWidth || 1920));
  const height = Math.max(8, Math.round(host.clientHeight || host.offsetHeight || 1080));
  const pixelRatio = Math.max(0.5, request.pixelRatio || 1);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  host.replaceChildren(canvas);

  // Capability probe on a scratch context — same driver/GPU as the renderer's.
  const probeGl = document.createElement("canvas").getContext("webgl2");
  const compressedCaps = probeGl
    ? {
        astc: probeGl.getExtension("WEBGL_compressed_texture_astc") !== null,
        bptc: probeGl.getExtension("EXT_texture_compression_bptc") !== null,
        etc2: true,
        s3tc: probeGl.getExtension("WEBGL_compressed_texture_s3tc") !== null,
        s3tcSrgb: probeGl.getExtension("WEBGL_compressed_texture_s3tc_srgb") !== null
      }
    : { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false };

  const pipeline = await loadProductionGLTFRenderPipeline({
    url: request.glb,
    assetId: "lookdev-subject",
    assetName: "lookdev-subject",
    width: canvas.width,
    height: canvas.height,
    decoders: { basePath: "/aura-decoders/" },
    compressedTextureCapabilities: compressedCaps,
    materialsR185: resolved.on("A3D_QR_MATERIALS")
  });
  const gltfScene = new A3DGltfScene(pipeline);

  const renderer = await Renderer.create({
    canvas,
    width: canvas.width,
    height: canvas.height,
    backend: "webgl2",
    antialias: true,
    requiredFeatures: ["basic-rendering", "pixel-readback", "render-targets", "hdr-image-based-lighting"]
  });
  if (generatorOn) {
    installGeneratedProgramUboShim(renderer.device);
    // Q-05-10: programCacheSlot's factory is invoked without options, so
    // ProgramCache.options.flags stays undefined → generateProgramImpl gets
    // flags:undefined → contributingFeatures early-returns and every
    // registered feature bit is silently dropped. Hand the same singleton
    // the resolved flags so feature contributions actually apply.
    const cache = rendererProgramCache(renderer.device, resolved) as {
      options?: { flags?: unknown };
    };
    if (cache.options) cache.options.flags = resolved;
  }

  const environment = request.hdri === "none" ? undefined : await loadHdrEnvironment({
    url: hdri.path,
    id: hdri.id,
    intensity: hdri.intensity,
    toneMapping: { operator: "aces", exposure: stage.exposure }
  });
  const environmentLighting = environment?.lighting.lighting;

  const viewport = { width: canvas.width, height: canvas.height };
  const bounds = gltfScene.createRendererInput({ viewport }).bounds;
  const grounded = createGroundedStage(bounds, {
    floorColor: hexToLinearRgba(stage.ground.color),
    floorRoughness: 0.95
  });
  const stageItems = grounded.renderItems();
  const lights: CollectedLight[] = [
    createDirectionalLight({
      name: "lookdev key",
      direction: normalize3([-4, -8, -6]) as [number, number, number],
      color: [1, 1, 1],
      intensity: 1.1,
      castsShadow: true
    })
  ];
  const postprocess = { toneMapping: { operator: "aces" as const, exposure: stage.exposure }, fxaa: true };

  // ---- debug material wrap ----------------------------------------------
  // Every channel rides `prd05.debugView` — lane 04's prd04.debugView chunk
  // only defines `a3dPrd04DebugView` without ever invoking it at
  // `fragment:end` (Q-05-9), so the material channels live in lane 05's own
  // chunk. Stamps cover the uniforms the (uninvoked, Q-05-6) bindUniforms
  // hook would have mirrored.
  let materialsWithDebugView = 0;
  let wrap: ((material: RenderMaterial, lodLevel: number) => RenderMaterial) | undefined;
  if (generatorOn && debugChannel) {
    const channel = (PRD05_DEBUG_VIEW_ALIASES[debugChannel] ?? debugChannel) as keyof typeof PRD05_DEBUG_VIEW_CHANNELS;
    const bit: FeatureBit = ["prd05.debugView", PRD05_DEBUG_VIEW_CHANNELS[channel]];
    if (bit[1] !== undefined && bit[1] !== 0) {
      wrap = (material, lodLevel) => {
        const base = material instanceof MaterialInstance ? material.baseMaterial : material;
        if (!(base instanceof Material)) return material;
        const merged = material instanceof MaterialInstance ? material.getParameters() : base.getParameters();
        const clone = new LookdevDebugMaterial(base, bit, merged);
        clone.setParameter("u_prd05DebugView", bit[1]);
        clone.setParameter("u_prd05LodLevel", lodLevel);
        clone.setParameter("u_prd05TexelBand", [0.5, 4]);
        const baseColor = merged.get("u_baseColorTexture");
        if (baseColor !== undefined) clone.setParameter("a3d_prd05_debugSampler", baseColor);
        return clone;
      };
    }
  }

  const { items: subjectItems, swapped } = collectSubjectItems(pipeline, wrap);
  materialsWithDebugView = swapped;

  // Stage materials take the same generated path — re-wrap them without the
  // debug bit so their requiredAttributes match what the program emits.
  const stageRenderItems = generatorOn
    ? stageItems.map((item) => {
        const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
        if (!(base instanceof Material)) return item;
        const merged = item.material instanceof MaterialInstance ? item.material.getParameters() : base.getParameters();
        return { ...item, material: new LookdevDebugMaterial(base, undefined, merged) };
      })
    : stageItems;

  const renderItems = [...subjectItems, ...stageRenderItems];
  const source: RenderSource = {
    renderItems,
    ...(environmentLighting ? { environmentLighting } : {}),
    collectedLights: lights,
    shadow: true,
    postprocess,
    cameraPolicy: "require",
    cameraFrameBounds: bounds
  };

  const [px, py, pz, tx, ty, tz] = request.cam;
  const view = lookAt([px, py, pz], [tx, ty, tz], [0, 1, 0]);
  const proj = perspective(request.fov, canvas.width / canvas.height, 0.01, Math.max(500, request.radius * 40));
  const cameraLike: CameraLike = { viewMatrix: view, projectionMatrix: proj, viewProjectionMatrix: matMul4(proj, view) };

  const scene = {
    metadata: gltfScene.metadata,
    createRendererInput: () => ({ source, camera: cameraLike, bounds })
  } as unknown as A3DGltfScene;

  // Texture bindings decode lazily and generated programs compile
  // asynchronously (draws async-skip until the program is ready) — keep
  // drawing frames until real work lands, retrying binding errors raised
  // while textures are still in flight.
  const renderArgs = {
    scene,
    camera: cameraLike,
    ...(environment ? { environment } : {}),
    renderItems,
    collectedLights: lights,
    shadow: true,
    postprocess
  };
  // Generated programs compile lazily — early frames async-skip most items,
  // so settle only once real pixels land (program-ready stage+subject draws
  // produce non-black output).
  const minPixels = canvas.width * canvas.height * 0.01;
  const renderSettled = (p: ProductionRenderProof) =>
    p.diagnostics.drawCalls > 0 &&
    (p.pixels?.nonBlackPixels ?? 0) > minPixels &&
    (pipeline.metadata.textureCount === 0 ||
      (p.diagnostics.compressedTextureBytes ?? 0) + (p.diagnostics.textureBytes ?? 0) > 0);
  let proof: ProductionRenderProof | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      proof = a3dRenderResult(renderer, renderArgs, viewport).proof;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    if (renderSettled(proof)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (proof === undefined) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "render produced no frames"));
  }

  const diagnostics = proof.diagnostics;
  return {
    engine: "aura",
    glb: request.glb,
    drawCalls: diagnostics.drawCalls ?? 0,
    triangles: pipeline.metadata.vertexCount,
    textureCount: pipeline.metadata.textureCount,
    materialCount: pipeline.metadata.materialCount,
    textureSlots: pipeline.metadata.textureSlots,
    materialFeatures: pipeline.metadata.materialFeatures,
    warnings: pipeline.metadata.unsupportedExtensions.map((e) => `unsupported extension: ${e}`),
    errors: [],
    debugApplied: materialsWithDebugView > 0 ? debugChannel ?? null : null,
    materialsWithDebugView
  };
}
