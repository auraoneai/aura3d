// PRD-07 P2-T4 — ribbon draw pass. Builds each orientation group's strip
// geometry on the CPU (RibbonBatch.buildAll) and submits one indexed draw per
// group in the transparent queue (the "prd07.ribbons" C-01 contributor).

import type { RenderBuffer, RenderDevice, RenderShaderProgram } from "../RenderDevice";
import type { FrameContributorContext, TransparentQueueItem } from "../contracts/frameGraph";
import { TextureBinding } from "../TextureBinding";
import { glslOnlyVfxProgram } from "./webgpuGlslOnly";
import { PRD07_DEPTH_SAMPLER } from "./depthSampler";
import { VertexFormat } from "../VertexFormat";
import { RibbonBatch, RIBBON_VERTEX_FLOATS, type RibbonGeometry } from "./RibbonBatch";
import { resolveOutputColorSpace, resolveSceneDepth } from "./SceneDepthAdapter";
import { RIBBON_SHADER_MARKER, ribbonFragmentSource, ribbonProgramKey, ribbonVertexSource } from "./shaders/ribbon.glsl";
import { sceneDepthLinearizeUniform } from "../DepthConvention";
import { RIBBON_PORTABLE_BINDINGS, RIBBON_WGSL } from "./shaders/ribbon.wgsl";

export const RIBBON_VERTEX_FORMAT = new VertexFormat(
  [
    { semantic: "position", components: 3, offset: 0, shaderName: "a_position" },
    { semantic: "normal", components: 3, offset: 12, shaderName: "a_normal" },
    { semantic: "uv", components: 2, offset: 24, shaderName: "a_uv" },
    { semantic: "color", components: 4, offset: 32, shaderName: "a_color" }
  ],
  RIBBON_VERTEX_FLOATS * 4
);

interface RibbonBufferSlot {
  vertexBuffer: RenderBuffer | null;
  indexBuffer: RenderBuffer | null;
  vertexCapacity: number;
  indexCapacity: number;
}

export class RibbonPass {
  private readonly programs = new Map<string, RenderShaderProgram>();
  private readonly bufferSlots: RibbonBufferSlot[] = [];
  private readonly retiredBuffers: RenderBuffer[] = [];
  private slotCursor = 0;
  private lastFrameIndex: number | undefined = undefined;
  private lastCameraRef: object | null = null;
  /** Set once a WebGPU device still rejects the ribbon program (WGSL twin: shaders/ribbon.wgsl.ts). */
  private wgslUnavailable = false;

  constructor(private readonly device: RenderDevice) {}

  private beginBatch(ctx: FrameContributorContext): void {
    const cameraRef = (ctx.camera as unknown as object | null | undefined) ?? null;
    const isNewFrame = ctx.frameIndex !== undefined
      ? ctx.frameIndex !== this.lastFrameIndex
      : cameraRef === this.lastCameraRef;
    if (isNewFrame) {
      this.slotCursor = 0;
      while (this.retiredBuffers.length > 0) {
        this.retiredBuffers.pop()?.dispose();
      }
    }
    this.lastFrameIndex = ctx.frameIndex;
    this.lastCameraRef = cameraRef;
  }

  /** C-01 contributor: one queue item per populated orientation group. */
  transparentItems(batch: RibbonBatch, ctx: FrameContributorContext): TransparentQueueItem[] {
    this.beginBatch(ctx);
    const cameraPosition = ctx.camera?.position ?? [0, 0, 0];
    const geometries = batch.buildAll(cameraPosition as readonly [number, number, number]);
    return geometries.map((g) => {
      const slotIndex = this.slotCursor++;
      return { sortDepth: 0, draw: () => this.drawGeometry(g, ctx, slotIndex) };
    });
  }

  private drawGeometry(geometry: RibbonGeometry, ctx: FrameContributorContext, slotIndex: number): void {
    const vb = this.ensureSlotBuffer(slotIndex, "vertex", geometry.vertices.byteLength, "vb");
    this.device.updateBuffer(vb, 0, geometry.vertices);
    const ib = this.ensureSlotBuffer(slotIndex, "index", geometry.indices.byteLength, "ib");
    this.device.updateBuffer(ib, 0, geometry.indices);

    const depth = resolveSceneDepth(ctx);
    const softParticles = depth?.available === true && depth.source.texture !== null;
    if (this.wgslUnavailable) return;
    const shader = glslOnlyVfxProgram(this.device, "VFX_RIBBONS_WGSL_MISSING", "ribbon trails", () => this.program({ softParticles }));
    if (!shader) { this.wgslUnavailable = true; return; }
    const uniforms = new Map<string, import("../RenderDevice").UniformValue>([
      ["u_viewProjection", ctx.camera?.viewProjectionMatrix ?? IDENTITY_MAT4],
      // §6.2.7 output contract (same as particles/beams): linear into HDR.
      ["u_outputColorSpace", resolveOutputColorSpace(ctx) === "srgb" ? 1 : 0]
    ]);
    if (softParticles && depth) {
      uniforms.set("u_sceneDepth", new TextureBinding({ name: "u_sceneDepth", texture: depth.source.texture!, sampler: PRD07_DEPTH_SAMPLER }));
      uniforms.set("u_depthLinearize", sceneDepthLinearizeUniform(depth.source.linearize));
    }
    this.device.draw({
      label: `prd07.ribbons.${geometry.orientation}`,
      topology: "triangles",
      vertexBuffer: vb,
      vertexFormat: RIBBON_VERTEX_FORMAT,
      vertexCount: geometry.vertexCount,
      indexBuffer: ib,
      indexType: "uint32",
      indexCount: geometry.indices.length,
      shader,
      uniforms,
      renderState: RIBBON_RENDER_STATE
    });
  }

  private ensureSlotBuffer(slotIndex: number, usage: "vertex" | "index", bytes: number, which: "vb" | "ib"): RenderBuffer {
    while (this.bufferSlots.length <= slotIndex) {
      this.bufferSlots.push({ vertexBuffer: null, indexBuffer: null, vertexCapacity: 0, indexCapacity: 0 });
    }
    const slot = this.bufferSlots[slotIndex]!;
    const capacity = which === "vb" ? slot.vertexCapacity : slot.indexCapacity;
    const existing = which === "vb" ? slot.vertexBuffer : slot.indexBuffer;
    if (existing && capacity >= bytes) return existing;
    const next = Math.max(bytes, capacity * 2 || 0, 4096);
    if (existing) this.retiredBuffers.push(existing);
    const buffer = this.device.createBuffer(usage, next);
    if (which === "vb") {
      slot.vertexBuffer = buffer;
      slot.vertexCapacity = next;
    } else {
      slot.indexBuffer = buffer;
      slot.indexCapacity = next;
    }
    return buffer;
  }

  private program(defines: { readonly softParticles: boolean }): RenderShaderProgram {
    const key = ribbonProgramKey(defines);
    let shader = this.programs.get(key);
    if (!shader) {
      shader = this.device.createShaderProgram({
        label: key,
        vertex: ribbonVertexSource(),
        fragment: ribbonFragmentSource(defines),
        marker: RIBBON_SHADER_MARKER,
        ...(this.device.kind === "webgpu" ? { webgpu: RIBBON_WGSL, portableBindings: RIBBON_PORTABLE_BINDINGS } : {})
      });
      this.programs.set(key, shader);
    }
    return shader;
  }

  dispose(): void {
    for (const slot of this.bufferSlots) {
      slot.vertexBuffer?.dispose();
      slot.indexBuffer?.dispose();
    }
    this.bufferSlots.length = 0;
    while (this.retiredBuffers.length > 0) {
      this.retiredBuffers.pop()?.dispose();
    }
    this.programs.clear();
  }
}

const IDENTITY_MAT4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const RIBBON_RENDER_STATE = {
  depthTest: true,
  depthWrite: false,
  cullMode: "none" as const,
  blend: true,
  depthCompare: "less-equal" as const
};
