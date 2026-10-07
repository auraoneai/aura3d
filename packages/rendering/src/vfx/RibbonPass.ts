// PRD-07 P2-T4 — ribbon draw pass. Builds each orientation group's strip
// geometry on the CPU (RibbonBatch.buildAll) and submits one indexed draw per
// group in the transparent queue (the "prd07.ribbons" C-01 contributor).

import type { RenderBuffer, RenderDevice, RenderShaderProgram } from "../RenderDevice";
import type { FrameContributorContext, TransparentQueueItem } from "../contracts/frameGraph";
import { TextureBinding } from "../TextureBinding";
import { VertexFormat } from "../VertexFormat";
import { RibbonBatch, RIBBON_VERTEX_FLOATS, type RibbonGeometry } from "./RibbonBatch";
import { resolveSceneDepth } from "./SceneDepthAdapter";
import { RIBBON_SHADER_MARKER, ribbonFragmentSource, ribbonProgramKey, ribbonVertexSource } from "./shaders/ribbon.glsl";

export const RIBBON_VERTEX_FORMAT = new VertexFormat(
  [
    { semantic: "position", components: 3, offset: 0, shaderName: "a_position" },
    { semantic: "normal", components: 3, offset: 12, shaderName: "a_normal" },
    { semantic: "uv", components: 2, offset: 24, shaderName: "a_uv" },
    { semantic: "color", components: 4, offset: 32, shaderName: "a_color" }
  ],
  RIBBON_VERTEX_FLOATS * 4
);

export class RibbonPass {
  private readonly programs = new Map<string, RenderShaderProgram>();
  private vertexBuffer: RenderBuffer | null = null;
  private indexBuffer: RenderBuffer | null = null;
  private vertexCapacity = 0;
  private indexCapacity = 0;

  constructor(private readonly device: RenderDevice) {}

  /** C-01 contributor: one queue item per populated orientation group. */
  transparentItems(batch: RibbonBatch, ctx: FrameContributorContext): TransparentQueueItem[] {
    const cameraPosition = ctx.camera?.position ?? [0, 0, 0];
    const geometries = batch.buildAll(cameraPosition as readonly [number, number, number]);
    return geometries.map((g) => ({ sortDepth: 0, draw: () => this.drawGeometry(g, ctx) }));
  }

  private drawGeometry(geometry: RibbonGeometry, ctx: FrameContributorContext): void {
    const vb = this.ensureBuffer("vertex", geometry.vertices.byteLength, this.vertexBuffer, "vb");
    this.device.updateBuffer(vb, 0, geometry.vertices);
    const ib = this.ensureBuffer("index", geometry.indices.byteLength, this.indexBuffer, "ib");
    this.device.updateBuffer(ib, 0, geometry.indices);

    const depth = resolveSceneDepth(ctx);
    const softParticles = depth?.available === true && depth.source.texture !== null;
    const shader = this.program({ softParticles });
    const uniforms = new Map<string, import("../RenderDevice").UniformValue>([
      ["u_viewProjection", ctx.camera?.viewProjectionMatrix ?? IDENTITY_MAT4],
      ["u_outputColorSpace", 1]
    ]);
    if (softParticles && depth) {
      uniforms.set("u_sceneDepth", new TextureBinding({ name: "u_sceneDepth", texture: depth.source.texture! }));
      uniforms.set("u_depthLinearize", [depth.source.linearize.near, depth.source.linearize.far, depth.source.linearize.orthographic ? 1 : 0, 0]);
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

  private ensureBuffer(usage: "vertex" | "index", bytes: number, existing: RenderBuffer | null, which: "vb" | "ib"): RenderBuffer {
    const capacity = which === "vb" ? this.vertexCapacity : this.indexCapacity;
    if (existing && capacity >= bytes) return existing;
    const next = Math.max(bytes, capacity * 2 || 0, 4096);
    existing?.dispose();
    const buffer = this.device.createBuffer(usage, next);
    if (which === "vb") {
      this.vertexBuffer = buffer;
      this.vertexCapacity = next;
    } else {
      this.indexBuffer = buffer;
      this.indexCapacity = next;
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
        marker: RIBBON_SHADER_MARKER
      });
      this.programs.set(key, shader);
    }
    return shader;
  }

  dispose(): void {
    this.vertexBuffer?.dispose();
    this.indexBuffer?.dispose();
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
