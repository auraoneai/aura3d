import { Material } from "./Material";
import { type DrawCommand, type RenderCommandState, type RenderDevice, RenderDeviceError, type RenderShaderProgram, type UniformValue } from "./RenderDevice";
import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { ShaderModule } from "./ShaderModule";
import { createLeanCoreShaderLibrary, DEFAULT_DEPTH_SHADER_NAME, type ShaderLibrary } from "./ShaderLibraryCore";
import { type RenderItem } from "./ForwardPass";
import type { DepthVariantFeature, ShadowCasterVariantKey } from "./contracts/shadows";
import { prd02DepthProgram, prd02DepthVariantDefines, PRD02_DEPTH_MAX_INSTANCES } from "./shadows/Prd02DepthShaderLibrary";
import { identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";

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

  private readonly shaderLibrary: ShaderLibrary;
  private readonly material = new DepthMaterial();

  constructor(private readonly options: DepthPassOptions) {
    super("depth", [], ["depth"]);
    this.shaderLibrary = options.shaderLibrary ?? createLeanCoreShaderLibrary();
  }

  execute(context: RenderPassContext): void {
    for (const caster of this.options.casters) {
      this.drawCaster(context.device, caster);
    }
  }

  private drawCaster(device: RenderDevice, caster: RenderItem): void {
    const vertexBuffer = caster.geometry.vertexBuffer.upload(device);
    const indexBuffer = caster.geometry.indexBuffer?.upload(device);
    const drawRange = resolveDepthDrawRange(caster.geometry, caster.drawRange);
    const modelMatrix = toMat4(caster.modelMatrix ?? identityMat4(), caster.label);
    const viewProjection = toMat4(this.options.viewProjectionMatrix ?? identityMat4(), caster.label);
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
    const instanceTransforms = caster.instanceTransforms ? Float32Array.from(caster.instanceTransforms) : null;
    const instanceTotal = instanceTransforms ? instanceTransforms.length / 16 : 1;
    const batchCount = variant.instanced && instanceTransforms ? Math.ceil(instanceTotal / PRD02_DEPTH_MAX_INSTANCES) : 1;
    for (let batch = 0; batch < batchCount; batch += 1) {
      const uniforms = new Map<string, UniformValue>([["u_modelViewProjection", mvp]]);
      if (variant.instanced && instanceTransforms) {
        const offset = batch * PRD02_DEPTH_MAX_INSTANCES;
        const count = Math.min(PRD02_DEPTH_MAX_INSTANCES, instanceTotal - offset);
        uniforms.set("u_instanceMatrices", instanceTransforms.subarray(offset * 16, (offset + count) * 16));
        uniforms.set("u_instanceCount", count);
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
        if (texture !== undefined) uniforms.set("u_baseColorTexture", texture);
      }
      const command: DrawCommand = {
        label: `${caster.label ?? "shadow-caster"}:${batch}`,
        topology: caster.geometry.topology,
        vertexBuffer,
        vertexFormat: caster.geometry.vertexBuffer.format,
        vertexCount: indexBuffer ? caster.geometry.vertexBuffer.vertexCount : drawRange.count,
        ...(indexBuffer === undefined && drawRange.start > 0 ? { firstVertex: drawRange.start } : {}),
        ...(variant.instanced && instanceTransforms
          ? { instanceCount: Math.min(PRD02_DEPTH_MAX_INSTANCES, instanceTotal - batch * PRD02_DEPTH_MAX_INSTANCES) }
          : {}),
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
