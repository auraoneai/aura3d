/**
 * `renderer/SceneDepthCopyPass.ts` (PRD-01 §9.1 "after-opaque", C-01 R-01-1) —
 * snapshots the resolved scene depth into `aura.scene.depth.copy` after the
 * opaque phase, so lane 02 contact shadows and lane 07's scene-color copy
 * consume a stable depth while transmission/transparent draws keep mutating
 * the live attachment. The copy is a fullscreen `gl_FragDepth` draw from the
 * HDR target's `depthTexture` into a `depthOnly` target (same size/format).
 * Under MSAA it inherits whatever resolve state the forward target exposes —
 * the early depth-only resolve is the intended semantic of the phase.
 */

import { Geometry } from "../Geometry";
import { DEFAULT_RENDER_STATE } from "../Material";
import type { RenderDevice, RenderTarget, UniformValue } from "../RenderDevice";
import { RenderPipeline } from "../RenderPipeline";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import { ShaderModule } from "../ShaderModule";
import { TextureBinding } from "../TextureBinding";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";

const DEPTH_COPY_VERTEX_GLSL = `#version 300 es
// a3d.scene-depth-copy
layout(location = 0) in vec3 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position.xy * 0.5 + 0.5;
  gl_Position = vec4(a_position, 1.0);
}
`;

const DEPTH_COPY_FRAGMENT_GLSL = `#version 300 es
// a3d.scene-depth-copy
precision highp float;
uniform sampler2D u_depth;
in vec2 v_uv;
void main() {
  gl_FragDepth = texture(u_depth, v_uv).r;
}
`;

const DEPTH_COPY_RENDER_STATE = {
  ...DEFAULT_RENDER_STATE,
  blend: false,
  // Fullscreen triangle at clip z=0 (0.5 depth) passes LESS vs cleared 1.0;
  // gl_FragDepth then overrides the written value with the sampled depth.
  depthTest: true,
  depthWrite: true,
  cullMode: "none" as const
};

function createFullscreenTriangleGeometry(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  return new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
}

export class SceneDepthCopyPass extends BaseRenderPass {
  private static module: ShaderModule | null = null;

  constructor(
    private readonly input: RenderTarget,
    private readonly copy: RenderTarget,
    reads: readonly string[] = ["aura.scene.color.opaque"]
  ) {
    super("prd01.scene-depth-copy", reads, ["aura.scene.depth.copy"]);
  }

  execute(context: RenderPassContext): void {
    const depthTexture = this.input.depthTexture;
    if (!depthTexture) return;
    SceneDepthCopyPass.module ??= new ShaderModule({
      label: "prd01-scene-depth-copy",
      marker: "a3d.scene-depth-copy",
      vertex: DEPTH_COPY_VERTEX_GLSL,
      fragment: DEPTH_COPY_FRAGMENT_GLSL
    });
    const shader = SceneDepthCopyPass.module.compile(context.device);
    const uniforms = new Map<string, UniformValue>();
    uniforms.set("u_depth", new TextureBinding({ name: "u_depth", texture: depthTexture, required: true }));
    const geometry = createFullscreenTriangleGeometry();
    try {
      const pipeline = new RenderPipeline({
        label: "prd01-scene-depth-copy",
        shader,
        vertexFormat: geometry.vertexBuffer.format,
        topology: geometry.topology,
        renderState: DEPTH_COPY_RENDER_STATE
      });
      const command = pipeline.createDrawCommand({
        label: "prd01-scene-depth-copy",
        vertexBuffer: geometry.vertexBuffer.upload(context.device),
        vertexCount: geometry.vertexBuffer.vertexCount,
        uniforms
      });
      context.device.setRenderTarget(this.copy);
      context.device.draw(command);
      context.device.setRenderTarget(this.input);
    } finally {
      geometry.dispose();
    }
  }
}

/** Lazily-sized scene-depth copy target (`depthOnly`, non-MSAA, depth texture). */
export function ensureSceneDepthCopyTarget(
  device: RenderDevice,
  current: RenderTarget | null,
  width: number,
  height: number
): RenderTarget {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (current && !current.disposed && current.width === w && current.height === h) return current;
  current?.dispose();
  return device.createRenderTarget({ label: "aura.scene.depth.copy", width: w, height: h, format: "rgba8", depthOnly: true });
}
