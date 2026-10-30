import { Material } from "./Material";
import { MaterialInstance } from "./MaterialInstance";
import { type DrawCommand, type InstanceVertexAttribute, type RenderBuffer, type RenderCommandState, type RenderDevice, RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { ShaderModule } from "./ShaderModule";
import { TextureBinding } from "./TextureBinding";
import { createLeanCoreShaderLibrary, DEFAULT_DEPTH_SHADER_NAME, type ShaderLibrary } from "./ShaderLibraryCore";
import { type RenderItem } from "./ForwardPass";
import type { DepthVariantFeature, ShadowCasterVariantKey } from "./contracts/shadows";
import { prd02DepthProgram, prd02DepthVariantDefines, PRD02_DEPTH_MAX_INSTANCES } from "./shadows/Prd02DepthShaderLibrary";
import { identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { InstanceBuffer } from "./resources/InstanceBuffer";

export interface DepthPassOptions {
  readonly casters: readonly RenderItem[];
  readonly shaderLibrary?: ShaderLibrary;
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
  /**
   * PRD-02 C-11 (flag A3D_QR_LIGHTING): resolves the depth-variant key per
   * caster; when set, programs compose from the key + `depthVariantFeatures`
   * instead of the fixed lean depth shader. Flag-off callers omit this and the
   * pass is byte-identical to before.
   */
  readonly variantResolver?: (item: RenderItem) => ShadowCasterVariantKey;
  readonly depthVariantFeatures?: readonly DepthVariantFeature[];
  /** Scissor rect (px) applied to every draw — atlas tile rendering. */
  readonly scissor?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /**
   * GU47 E-D: `u_time` for `castShadow` custom-material casters. Defaults to the clock the forward pass binds
   * (`performance.now() / 1000`), so a time-driven sway is in the same phase in the shadow and on screen.
   */
  readonly timeSeconds?: number;
}

/**
 * GU47 E-D: the depth program of a `material.custom({ castShadow: true })` caster (`customDepthShaderKey` on the engine's
 * custom material: its baked vertex stage with a depth-only fragment, published in the global shader-source registry).
 * Undefined for every other material, which keeps the position-only depth program.
 */
export function customDepthShaderKeyOf(material: RenderItem["material"] | undefined): string | undefined {
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  if (!base || base.disposed) return undefined;
  const key = (base as { readonly customDepthShaderKey?: unknown }).customDepthShaderKey;
  return typeof key === "string" && key.length > 0 ? key : undefined;
}

export class DepthMaterial extends Material {
  constructor() {
    super({
      name: "depth",
      shaderKey: DEFAULT_DEPTH_SHADER_NAME,
      parameters: {
        u_modelViewProjection: identityMatrix()
      },
      requiredAttributes: ["a_position"],
      uniformSchema: [{ name: "u_modelViewProjection", kind: "mat4" }]
    });
  }
}

const DEPTH_INSTANCE_ATTRIBUTE_NAMES = ["a_instanceMatrix0", "a_instanceMatrix1", "a_instanceMatrix2", "a_instanceMatrix3"] as const;

/** Most dense casters kept resident per device; the least recently drawn one is disposed past this. */
export const DEPTH_INSTANCE_BUFFER_CACHE_LIMIT = 64;

/**
 * SI-6: persistent per-caster instance buffers for dense (attribute-mode) depth draws, per device. The key is the caster's
 * `instanceTransforms` array, which the renderer passes through from the node unchanged frame to frame. Every cascade draws the same
 * casters, so after the first cascade of a frame `InstanceBuffer.setMatrices` finds identical contents and skips the upload, and the VAO
 * keyed by the buffer id stays cached. Before this each dense caster created and disposed a vertex buffer and a VAO per cascade per frame.
 * Map order is LRU order (a hit is re-inserted at the end).
 */
const depthInstanceBuffers = new WeakMap<RenderDevice, Map<object, { readonly buffer: InstanceBuffer; readonly capacity: number }>>();

export function depthInstanceBufferFor(device: RenderDevice, key: object, matrices: Float32Array): InstanceBuffer {
  let cache = depthInstanceBuffers.get(device);
  if (!cache) {
    cache = new Map();
    depthInstanceBuffers.set(device, cache);
  }
  const count = Math.floor(matrices.length / 16);
  let entry = cache.get(key);
  if (entry) cache.delete(key);
  if (!entry || entry.capacity < count || entry.buffer.bind().matrixBuffer.disposed) {
    entry?.buffer.dispose();
    const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
    entry = { buffer: new InstanceBuffer(device, capacity), capacity };
  }
  cache.set(key, entry);
  while (cache.size > DEPTH_INSTANCE_BUFFER_CACHE_LIMIT) {
    const [oldestKey, oldest] = cache.entries().next().value as [object, { readonly buffer: InstanceBuffer }];
    cache.delete(oldestKey);
    oldest.buffer.dispose();
  }
  entry.buffer.setMatrices(matrices, count);
  return entry.buffer;
}

/** Test and diagnostics hook: how many dense-caster instance buffers the device keeps resident. */
export function depthInstanceBufferCount(device: RenderDevice): number {
  return depthInstanceBuffers.get(device)?.size ?? 0;
}

export class DepthPass extends BaseRenderPass {
  /**
   * Depth shader modules, shared across `DepthPass` instances and keyed by shader library.
   *
   * `ShadowPass` constructs a **new `DepthPass` every time it renders**, so an instance-field cache
   * was discarded each frame and the depth shader was recompiled and relinked on every shadow pass.
   * WebGL shader compilation is a synchronous GPU stall: measured on the Aura Clash playable route,
   * that single per-frame recompile held the whole route at **2 FPS** with 97.8% of profiled time
   * outside JS, which in turn made every timing-based browser test miss its window.
   *
   * A `WeakMap` keyed by the library keeps the entry alive exactly as long as the library is, so a
   * long-lived renderer compiles the depth shader once while a disposed library is still collectable.
   * This mirrors the per-device/per-library cache `ForwardPass` already uses.
   */
  private static readonly shaderModules = new WeakMap<ShaderLibrary, ShaderModule>();

  /** GU47 E-D: compiled `castShadow` custom depth programs, per library and depth key (keys are content hashes). */
  private static readonly customShaderModules = new WeakMap<ShaderLibrary, Map<string, ShaderModule>>();

  private readonly shaderLibrary: ShaderLibrary;
  private readonly material = new DepthMaterial();
  private frameSize: readonly [number, number] = [1, 1];

  constructor(private readonly options: DepthPassOptions) {
    super("depth", [], ["depth"]);
    this.shaderLibrary = options.shaderLibrary ?? createLeanCoreShaderLibrary();
  }

  execute(context: RenderPassContext): void {
    this.frameSize = [Math.max(1, context.width), Math.max(1, context.height)];
    for (const caster of this.options.casters) {
      this.drawCaster(context.device, caster);
    }
  }

  private drawCaster(device: RenderDevice, source: RenderItem): void {
    // A `castShadow` custom caster keeps its real geometry: the author's vertex stage reads its attributes.
    const customKey = customDepthShaderKeyOf(source.material);
    const caster = !customKey && source.shadowGeometry !== undefined && source.drawRange === undefined ? { ...source, geometry: source.shadowGeometry } : source;
    const vertexBuffer = caster.geometry.vertexBuffer.upload(device);
    const indexBuffer = caster.geometry.indexBuffer?.upload(device);
    const drawRange = resolveDepthDrawRange(caster.geometry, caster.drawRange);
    const modelMatrix = toMat4(caster.modelMatrix ?? identityMat4(), caster.label);
    const viewProjection = toMat4(this.options.viewProjectionMatrix ?? identityMat4(), caster.label);
    if (customKey) {
      this.drawCustomCaster(device, caster, customKey, vertexBuffer, indexBuffer, drawRange, modelMatrix, viewProjection);
      return;
    }
    const mvp = multiplyMat4(viewProjection, modelMatrix);
    const variant = this.options.variantResolver?.(caster) ?? null;
    if (!variant) {
      this.material.setParameter("u_modelViewProjection", mvp);
      const command: DrawCommand = {
        label: caster.label ?? "shadow-caster",
        topology: caster.geometry.topology,
        vertexBuffer,
        vertexFormat: caster.geometry.vertexBuffer.format,
        vertexCount: indexBuffer ? caster.geometry.vertexBuffer.vertexCount : drawRange.count,
        ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
        shader: this.getShader(device),
        uniforms: this.material.getParameters(),
        ...(this.options.scissor ? { renderState: depthRenderState(this.options.scissor) } : {})
      };
      if (indexBuffer) {
        Object.assign(command, {
          indexBuffer,
          indexType: caster.geometry.indexBuffer?.type,
          indexCount: drawRange.count,
          ...(drawRange.start > 0 ? { firstIndex: drawRange.start } : {})
        });
      }
      device.draw(command);
      return;
    }
    this.drawCasterVariant(device, caster, variant, vertexBuffer, indexBuffer, drawRange, mvp);
  }

  /** C-11 variant path (A3D_QR_LIGHTING): composed program + variant uniforms. */
  private drawCasterVariant(
    device: RenderDevice,
    caster: RenderItem,
    variant: ShadowCasterVariantKey,
    vertexBuffer: DrawCommand["vertexBuffer"],
    indexBuffer: DrawCommand["indexBuffer"],
    drawRange: { readonly start: number; readonly count: number },
    mvp: Mat4
  ): void {
    const features = this.options.depthVariantFeatures ?? [];
    const shader = prd02DepthProgram(device, this.shaderLibrary, variant, features);
    const skinning = caster.skinning;
    const instanceTransforms = caster.instanceTransforms instanceof Float32Array ? caster.instanceTransforms : caster.instanceTransforms ? Float32Array.from(caster.instanceTransforms) : null;
    const instanceTotal = instanceTransforms ? instanceTransforms.length / 16 : 1;
    // More instances than the uniform array holds ride a per-instance vertex-attribute buffer: one draw for the whole set
    // instead of ceil(n / 64) draws per cascade (a forest of 2,000 trees was 32 draws in every cascade).
    const attributeMode = Boolean(variant.instanced && instanceTransforms && instanceTotal > PRD02_DEPTH_MAX_INSTANCES && variant.features["prd02.depthInstanceAttr"] !== undefined);
    const batchCount = variant.instanced && instanceTransforms && !attributeMode ? Math.ceil(instanceTotal / PRD02_DEPTH_MAX_INSTANCES) : 1;
    let instanceAttributes: readonly InstanceVertexAttribute[] | null = null;
    if (attributeMode && instanceTransforms) {
      const buffer: RenderBuffer = depthInstanceBufferFor(device, caster.instanceTransforms as object, instanceTransforms).bind().matrixBuffer;
      instanceAttributes = DEPTH_INSTANCE_ATTRIBUTE_NAMES.map((shaderName, column) => ({ buffer, shaderName, components: 4 as const, offset: column * 16, stride: 64, divisor: 1 }));
    }
    for (let batch = 0; batch < batchCount; batch += 1) {
      const uniforms = new Map<string, UniformValue>([["u_modelViewProjection", mvp]]);
      if (variant.instanced && instanceTransforms) {
        if (attributeMode) {
          uniforms.set("u_instanceAttributeMode", 1);
          uniforms.set("u_instanceCount", instanceTotal);
        } else {
          const offset = batch * PRD02_DEPTH_MAX_INSTANCES;
          const count = Math.min(PRD02_DEPTH_MAX_INSTANCES, instanceTotal - offset);
          uniforms.set("u_instanceMatrices", instanceTransforms.subarray(offset * 16, (offset + count) * 16));
          uniforms.set("u_instanceCount", count);
        }
      }
      if (variant.skinning > 0 && skinning) {
        const joints = Math.min(skinning.jointCount, skinning.matrices.length / 16);
        uniforms.set("u_jointMatrices", skinning.matrices);
        uniforms.set("u_jointCount", joints);
        uniforms.set("u_jointPaletteMode", 0);
      }
      if (variant.alphaTest || variant.alphaHash) {
        const cutoff = caster.material?.getParameter?.("u_alphaCutoff");
        const texture = caster.material?.getParameter?.("u_baseColorTexture");
        if (typeof cutoff === "number") uniforms.set("u_alphaCutoff", cutoff);
        // An unbound sampler reads whatever is left on its texture unit. A custom receiver program puts the cascade's depth
        // texture on unit 0, so an alpha caster with no map sampled the render target itself (feedback loop, GL 0x502).
        uniforms.set("u_baseColorTexture", texture !== undefined ? texture : new TextureBinding({ name: "u_baseColorTexture", required: false }));
      }
      // 02-DEPTH: selected C-11 features bind their own uniforms (e.g.
      // prd06.deform's bone texture, prd10.wind's A3DWind/noise).
      for (const feature of features) {
        const value = variant.features[feature.id];
        if (value !== undefined) feature.bindUniforms?.(value, caster, (name, v) => uniforms.set(name, v));
      }
      const command: DrawCommand = {
        label: `${caster.label ?? "shadow-caster"}:${batch}`,
        topology: caster.geometry.topology,
        vertexBuffer,
        vertexFormat: caster.geometry.vertexBuffer.format,
        vertexCount: indexBuffer ? caster.geometry.vertexBuffer.vertexCount : drawRange.count,
        ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
        ...(variant.instanced && instanceTransforms
          ? { instanceCount: attributeMode ? instanceTotal : Math.min(PRD02_DEPTH_MAX_INSTANCES, instanceTotal - batch * PRD02_DEPTH_MAX_INSTANCES) }
          : {}),
        ...(instanceAttributes ? { instanceAttributes } : {}),
        shader,
        uniforms,
        renderState: depthRenderState(this.options.scissor, variant.doubleSided)
      };
      if (indexBuffer) {
        Object.assign(command, {
          indexBuffer,
          indexType: caster.geometry.indexBuffer?.type,
          indexCount: drawRange.count,
          ...(drawRange.start > 0 ? { firstIndex: drawRange.start } : {})
        });
      }
      device.draw(command);
    }
  }

  private getShader(device: RenderDevice): RenderShaderProgram {
    let module = DepthPass.shaderModules.get(this.shaderLibrary);
    if (!module) {
      module = ShaderModule.fromLibrary(this.shaderLibrary, this.material.shaderKey);
      DepthPass.shaderModules.set(this.shaderLibrary, module);
    }
    return module.compile(device);
  }

  private customShader(device: RenderDevice, key: string): RenderShaderProgram {
    let modules = DepthPass.customShaderModules.get(this.shaderLibrary);
    if (!modules) {
      modules = new Map();
      DepthPass.customShaderModules.set(this.shaderLibrary, modules);
    }
    let module = modules.get(key);
    if (!module) {
      module = ShaderModule.fromLibrary(this.shaderLibrary, key);
      modules.set(key, module);
    }
    return module.compile(device);
  }

  /**
   * GU47 E-D: a `material.custom({ castShadow: true })` caster draws with its own vertex stage, so author displacement
   * (sway, wind, waves) moves the shadow. The matrix built-ins carry the light: `u_viewMatrix` is identity and
   * `u_projectionMatrix` the light's view-projection, so `projectionMatrix * viewMatrix * modelMatrix * p`,
   * `projectionMatrix * modelViewMatrix * p` and `modelViewProjectionMatrix * p` all land in light clip space. The
   * material's own uniforms (including runtime `setUniform` writes) and `u_time` (the forward pass clock) are bound too.
   * An instanced caster whose vertex stage reads `instanceMatrix` is one instanced draw; one that does not draws each
   * instance with the instance folded into `modelMatrix`. Culling follows the material's side.
   */
  private drawCustomCaster(
    device: RenderDevice,
    caster: RenderItem,
    key: string,
    vertexBuffer: DrawCommand["vertexBuffer"],
    indexBuffer: DrawCommand["indexBuffer"],
    drawRange: { readonly start: number; readonly count: number },
    modelMatrix: Mat4,
    viewProjection: Mat4
  ): void {
    const shader = this.customShader(device, key);
    const reflected = shader.reflection.uniforms;
    const base = caster.material instanceof MaterialInstance ? caster.material.baseMaterial : caster.material;
    const shared = new Map<string, UniformValue>();
    for (const [name, value] of base?.getParameters() ?? []) {
      if (reflected.has(name)) shared.set(name, value);
    }
    const set = (name: string, value: UniformValue): void => {
      if (reflected.has(name)) shared.set(name, value);
    };
    set("u_viewMatrix", identityMatrix());
    set("u_projectionMatrix", new Float32Array(viewProjection));
    set("u_cameraPosition", [0, 0, 0]);
    set("u_time", this.options.timeSeconds ?? (typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000));
    set("u_resolution", [this.frameSize[0], this.frameSize[1]]);
    set("u_a3dInstanceColors", 0);
    const cullMode = base?.renderState.cullMode;
    const renderState: RenderCommandState = { ...depthRenderState(this.options.scissor, cullMode === "none"), ...(cullMode === "front" ? { cullMode: "front" as const } : {}) };
    const transforms = caster.instanceTransforms instanceof Float32Array ? caster.instanceTransforms : caster.instanceTransforms ? Float32Array.from(caster.instanceTransforms) : null;
    const instanceTotal = transforms ? Math.floor(transforms.length / 16) : 0;
    const authorInstancing = transforms !== null && instanceTotal > 0 && reflected.has("u_a3dInstancing")
      && DEPTH_INSTANCE_ATTRIBUTE_NAMES.every((name) => shader.reflection.attributes.has(name));
    const instanceBuffer = authorInstancing && transforms ? depthInstanceBufferFor(device, caster.instanceTransforms as object, transforms).bind().matrixBuffer : null;
    const draw = (model: Mat4, label: string, instanced: boolean): void => {
      const uniforms = new Map(shared);
      if (reflected.has("u_modelViewProjection")) uniforms.set("u_modelViewProjection", multiplyMat4(viewProjection, model));
      if (reflected.has("u_modelMatrix")) uniforms.set("u_modelMatrix", model);
      if (reflected.has("u_normalMatrix")) uniforms.set("u_normalMatrix", normalMatrix4(model));
      if (reflected.has("u_a3dInstancing")) uniforms.set("u_a3dInstancing", instanced ? 1 : 0);
      const command: DrawCommand = {
        label,
        topology: caster.geometry.topology,
        vertexBuffer,
        vertexFormat: caster.geometry.vertexBuffer.format,
        vertexCount: indexBuffer ? caster.geometry.vertexBuffer.vertexCount : drawRange.count,
        ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
        ...(instanced && instanceBuffer
          ? {
            instanceCount: instanceTotal,
            instanceAttributes: DEPTH_INSTANCE_ATTRIBUTE_NAMES.map((shaderName, column) => ({
              buffer: instanceBuffer,
              shaderName,
              components: 4 as const,
              offset: column * 16,
              stride: 64,
              divisor: 1
            }))
          }
          : {}),
        shader,
        uniforms,
        renderState
      };
      if (indexBuffer) {
        Object.assign(command, {
          indexBuffer,
          indexType: caster.geometry.indexBuffer?.type,
          indexCount: drawRange.count,
          ...(drawRange.start > 0 ? { firstIndex: drawRange.start } : {})
        });
      }
      device.draw(command);
    };
    const label = `${caster.label ?? "shadow-caster"}:custom-depth`;
    if (authorInstancing || !transforms || instanceTotal === 0) {
      draw(modelMatrix, label, authorInstancing);
      return;
    }
    for (let index = 0; index < instanceTotal; index += 1) {
      const instance = Array.from(transforms.subarray(index * 16, index * 16 + 16)) as unknown as Mat4;
      draw(multiplyMat4(modelMatrix, instance), `${label}:${index}`, false);
    }
  }
}

/** Inverse-transpose of the upper 3x3 of a column-major model matrix, padded into a mat4 (the custom `u_normalMatrix`). */
function normalMatrix4(m: Mat4): Float32Array {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];
  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;
  const det = a00 * b01 + a01 * b11 + a02 * b21;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const inv = 1 / det;
  // inverse (column-major), then transpose
  const i00 = b01 * inv, i01 = (-a22 * a01 + a02 * a21) * inv, i02 = (a12 * a01 - a02 * a11) * inv;
  const i10 = b11 * inv, i11 = (a22 * a00 - a02 * a20) * inv, i12 = (-a12 * a00 + a02 * a10) * inv;
  const i20 = b21 * inv, i21 = (-a21 * a00 + a01 * a20) * inv, i22 = (a11 * a00 - a01 * a10) * inv;
  return new Float32Array([
    i00, i10, i20, 0,
    i01, i11, i21, 0,
    i02, i12, i22, 0,
    0, 0, 0, 1
  ]);
}

/**
 * Depth-pass render state: depthTest+depthWrite forced (a depth pass must not
 * inherit the lit material's state); double-sided casters disable culling.
 */
function depthRenderState(
  scissor: DepthPassOptions["scissor"],
  doubleSided = false
): RenderCommandState {
  return {
    depthTest: true,
    depthWrite: true,
    cullMode: doubleSided ? "none" : "back",
    blend: false,
    depthCompare: "less-equal",
    ...(scissor ? { scissor } : {})
  };
}

function resolveDepthDrawRange(geometry: RenderItem["geometry"], range: RenderItem["drawRange"]): { readonly start: number; readonly count: number } {
  const available = geometry.indexBuffer?.count ?? geometry.vertexBuffer.vertexCount;
  if (!range) return { start: 0, count: available };
  if (!Number.isInteger(range.start) || range.start < 0 || !Number.isInteger(range.count) || range.count <= 0 || range.start + range.count > available) {
    throw new RenderDeviceError("Depth caster drawRange must fit inside geometry draw count", "DEPTH_DRAW_RANGE_INVALID", {
      start: range.start,
      count: range.count,
      available
    });
  }
  return range;
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function toMat4(value: Float32Array | readonly number[], label?: string): Mat4 {
  const values = Array.from(value);
  if (values.length !== 16 || values.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`DepthPass ${label ?? "caster"} matrix must contain 16 finite numbers.`);
  }
  return values as unknown as Mat4;
}
