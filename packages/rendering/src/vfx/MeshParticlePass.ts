// PRD-07 P2-T9 — mesh-particle draw pass (§6.2.11): one instanced draw per
// MeshParticleBatch through the `prd07.mesh` contributor. Instance data
// (mat4 + color + emissive = 23 floats) comes from MeshParticleBatch's own
// `instanceData()` — never `createProductionInstanceTransforms` (E17).

import type { InstanceVertexAttribute, NativeShaderStages, PortableShaderBinding, RenderBuffer, RenderDevice, RenderShaderProgram } from "../RenderDevice";
import type { FrameContributorContext, TransparentQueueItem } from "../contracts/frameGraph";
import { VertexFormat } from "../VertexFormat";
import { ZERO_TO_ONE_PROJECTION_WGSL, rasterClipDepthWgsl } from "../webgpu/ProjectionClip";
import { MESH_INSTANCE_FLOATS, MeshParticleBatch } from "./MeshParticleBatch";
import { MESH_PARTICLE_SHADER_MARKER, meshParticleFragmentSource, meshParticleVertexSource } from "./shaders/mesh-particle.glsl";

export type AuraVec3 = readonly [number, number, number];

const INSTANCE_STRIDE = MESH_INSTANCE_FLOATS * 4;
const MESH_VERTEX_FLOATS = 6; // pos3 + normal3
const MESH_VERTEX_FORMAT = new VertexFormat(
  [
    { semantic: "position", components: 3, offset: 0, shaderName: "a_position" },
    { semantic: "normal", components: 3, offset: 12, shaderName: "a_normal" }
  ],
  MESH_VERTEX_FLOATS * 4
);

function meshInstanceAttributes(buffer: RenderBuffer): readonly InstanceVertexAttribute[] {
  return [
    { buffer, shaderName: "a_instance0", components: 4, offset: 0, stride: INSTANCE_STRIDE, divisor: 1 },
    { buffer, shaderName: "a_instance1", components: 4, offset: 16, stride: INSTANCE_STRIDE, divisor: 1 },
    { buffer, shaderName: "a_instance2", components: 4, offset: 32, stride: INSTANCE_STRIDE, divisor: 1 },
    { buffer, shaderName: "a_instance3", components: 4, offset: 48, stride: INSTANCE_STRIDE, divisor: 1 },
    { buffer, shaderName: "a_color", components: 4, offset: 64, stride: INSTANCE_STRIDE, divisor: 1 },
    { buffer, shaderName: "a_emissive", components: 3, offset: 80, stride: INSTANCE_STRIDE, divisor: 1 }
  ];
}

/** Regular tetrahedron (pos3+normal3 per vertex, indexed). */
function tetrahedronGeometry(): { vertices: Float32Array; indices: Uint32Array } {
  const s = 1 / Math.sqrt(3);
  const verts: [number, number, number][] = [
    [s, s, s],
    [s, -s, -s],
    [-s, s, -s],
    [-s, -s, s]
  ];
  const tris: [number, number, number][] = [
    [0, 2, 1],
    [0, 3, 2],
    [0, 1, 3],
    [1, 2, 3]
  ];
  const data: number[] = [];
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    data.push(v[0], v[1], v[2], v[0], v[1], v[2]); // flat shading: normal = vertex dir
  }
  const indices: number[] = [];
  for (const t of tris) indices.push(t[0], t[1], t[2]);
  return { vertices: new Float32Array(data), indices: new Uint32Array(indices) };
}

const MESH_RENDER_STATE = {
  depthTest: true,
  depthWrite: true,
  cullMode: "back" as const,
  blend: false,
  depthCompare: "less-equal" as const
};

const IDENTITY_MAT4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Per-node feed handed from the engine each frame. */
export interface MeshParticleFeed {
  readonly nodeId: string;
  readonly batch: MeshParticleBatch;
  readonly sunDirection?: AuraVec3;
  readonly sunColor?: AuraVec3;
}

interface MeshInstanceSlot {
  buffer: RenderBuffer | null;
  capacity: number;
}

const MESH_PARTICLE_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_viewProjection", kind: "mat4" },
  { name: "u_sunDirection", kind: "vec3" },
  { name: "u_sunColor", kind: "vec3" },
  { name: "u_sh9", kind: "vec4", arrayLength: 9 }
];

const MESH_PARTICLE_VARYINGS = /* wgsl */ `
struct MeshParticleVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) color: vec4<f32>,
  @location(2) emissive: vec3<f32>,
};`;

const MESH_PARTICLE_WGSL: NativeShaderStages = {
  vertex: /* wgsl */ `
// ${MESH_PARTICLE_SHADER_MARKER} vertex
/* @aura3d-bindings */
${ZERO_TO_ONE_PROJECTION_WGSL}
${MESH_PARTICLE_VARYINGS}
@vertex fn vs_main(
  @location(0) a_position: vec3<f32>,
  @location(1) a_normal: vec3<f32>,
  @location(2) a_instance0: vec4<f32>,
  @location(3) a_instance1: vec4<f32>,
  @location(4) a_instance2: vec4<f32>,
  @location(5) a_instance3: vec4<f32>,
  @location(6) a_color: vec4<f32>,
  @location(7) a_emissive: vec3<f32>
) -> MeshParticleVarying {
  var out: MeshParticleVarying;
  let inst = mat4x4<f32>(a_instance0, a_instance1, a_instance2, a_instance3);
  let rot = mat3x3<f32>(a_instance0.xyz, a_instance1.xyz, a_instance2.xyz);
  out.normal = rot * a_normal;
  out.color = a_color;
  out.emissive = a_emissive;
  let clip = aura.u_viewProjection * (inst * vec4<f32>(a_position, 1.0));
  out.position = vec4<f32>(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);
  return out;
}`,
  fragment: /* wgsl */ `
// ${MESH_PARTICLE_SHADER_MARKER} fragment
/* @aura3d-bindings */
${MESH_PARTICLE_VARYINGS}
@fragment fn fs_main(v: MeshParticleVarying) -> @location(0) vec4<f32> {
  let N = normalize(v.normal);
  let ndl = max(dot(N, normalize(aura.u_sunDirection)), 0.0);
  let ambient = aura.u_sh9[0].rgb * 0.282095;
  let lit = v.color.rgb * (ambient + aura.u_sunColor * ndl) + v.emissive;
  return vec4<f32>(lit, v.color.a);
}`
};

export class MeshParticlePass {
  private program: RenderShaderProgram | null = null;
  private meshVertex: RenderBuffer | null = null;
  private meshIndex: RenderBuffer | null = null;
  private meshIndexCount = 0;
  private readonly instanceSlots: MeshInstanceSlot[] = [];
  private readonly retiredBuffers: RenderBuffer[] = [];
  private slotCursor = 0;
  private lastFrameIndex: number | undefined = undefined;
  private lastCameraRef: object | null = null;

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

  /** One instanced draw per live batch (opaque-style draw in the transparent queue — alpha comes from instance color). */
  transparentItems(feeds: readonly MeshParticleFeed[], ctx: FrameContributorContext): TransparentQueueItem[] {
    this.beginBatch(ctx);
    this.ensureMesh();
    const items: TransparentQueueItem[] = [];
    for (const feed of feeds) {
      const count = feed.batch.liveCount;
      if (count === 0) continue;
      const data = new Float32Array(count * MESH_INSTANCE_FLOATS);
      const written = feed.batch.instanceData(data);
      if (written === 0) continue;
      const view = data.subarray(0, written * MESH_INSTANCE_FLOATS);
      const slotIndex = this.slotCursor++;
      items.push({ sortDepth: 0, draw: () => this.drawInstances(feed, view, ctx, slotIndex) });
    }
    return items;
  }

  private drawInstances(feed: MeshParticleFeed, data: Float32Array, ctx: FrameContributorContext, slotIndex: number): void {
    const ib = this.ensureInstanceBuffer(slotIndex, data.byteLength);
    this.device.updateBuffer(ib, 0, data);
    const shader = this.getProgram();
    const sunDir = feed.sunDirection ?? [0.5, 0.8, 0.3];
    const sunColor = feed.sunColor ?? [1, 1, 1];
    const sh9 = new Float32Array(36);
    // C-02 stub ambient: constant-term only (u_sh9[0] drives a3dSampleIrradianceSH).
    sh9[0] = 0.5; sh9[1] = 0.5; sh9[2] = 0.55; sh9[3] = 1;
    const uniforms = new Map<string, import("../RenderDevice").UniformValue>([
      ["u_viewProjection", ctx.camera?.viewProjectionMatrix ?? IDENTITY_MAT4],
      ["u_sunDirection", sunDir],
      ["u_sunColor", sunColor],
      ["u_sh9", sh9]
    ]);
    this.device.draw({
      label: `prd07.mesh.${feed.nodeId}`,
      topology: "triangles",
      vertexBuffer: this.meshVertex!,
      vertexFormat: MESH_VERTEX_FORMAT,
      vertexCount: 4,
      indexBuffer: this.meshIndex!,
      indexType: "uint32",
      indexCount: this.meshIndexCount,
      instanceCount: data.length / MESH_INSTANCE_FLOATS,
      instanceAttributes: meshInstanceAttributes(ib),
      shader,
      uniforms,
      renderState: MESH_RENDER_STATE
    });
  }

  private ensureMesh(): void {
    if (this.meshVertex) return;
    const g = tetrahedronGeometry();
    this.meshVertex = this.device.createBuffer("vertex", g.vertices.byteLength);
    this.device.updateBuffer(this.meshVertex, 0, g.vertices);
    this.meshIndex = this.device.createBuffer("index", g.indices.byteLength);
    this.device.updateBuffer(this.meshIndex, 0, g.indices);
    this.meshIndexCount = g.indices.length;
  }

  private ensureInstanceBuffer(slotIndex: number, bytes: number): RenderBuffer {
    while (this.instanceSlots.length <= slotIndex) {
      this.instanceSlots.push({ buffer: null, capacity: 0 });
    }
    const slot = this.instanceSlots[slotIndex]!;
    if (slot.buffer && slot.capacity >= bytes) return slot.buffer;
    const next = Math.max(bytes, slot.capacity * 2 || 0, 4096);
    if (slot.buffer) this.retiredBuffers.push(slot.buffer);
    slot.buffer = this.device.createBuffer("vertex", next);
    slot.capacity = next;
    return slot.buffer;
  }

  private getProgram(): RenderShaderProgram {
    if (!this.program) {
      this.program = this.device.createShaderProgram({
        label: MESH_PARTICLE_SHADER_MARKER,
        vertex: meshParticleVertexSource(),
        fragment: meshParticleFragmentSource(),
        marker: MESH_PARTICLE_SHADER_MARKER,
        ...(this.device.kind === "webgpu"
          ? { webgpu: MESH_PARTICLE_WGSL, portableBindings: MESH_PARTICLE_PORTABLE_BINDINGS }
          : {})
      });
    }
    return this.program;
  }

  dispose(): void {
    this.meshVertex?.dispose();
    this.meshIndex?.dispose();
    this.meshVertex = null;
    this.meshIndex = null;
    for (const slot of this.instanceSlots) {
      slot.buffer?.dispose();
    }
    this.instanceSlots.length = 0;
    while (this.retiredBuffers.length > 0) {
      this.retiredBuffers.pop()?.dispose();
    }
    this.program?.dispose();
    this.program = null;
  }
}
