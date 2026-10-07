// PRD-07 P2-T9 — beam draw pass (§6.2.10). Camera-facing quad strip for
// `light-beam`, open cone fan for `lightCone`, animated curtain for
// `auroraRibbon`. One indexed draw per node through the `prd07.beams`
// transparent-phase contributor. Vertex layout is the ribbon format
// (pos3 normal3 uv2 color4); taper/falloff is baked into vertex alpha.

import type { RenderBuffer, RenderDevice, RenderShaderProgram } from "../RenderDevice";
import type { FrameContributorContext, TransparentQueueItem } from "../contracts/frameGraph";
import { TextureBinding } from "../TextureBinding";
import { RIBBON_VERTEX_FORMAT } from "./RibbonPass";
import { resolveSceneDepth } from "./SceneDepthAdapter";
import { BEAM_SHADER_MARKER, beamFragmentSource, beamProgramKey, beamVertexSource } from "./shaders/beam.glsl";

export type AuraVec3 = readonly [number, number, number];
export type AuraVec4 = readonly [number, number, number, number];

/** A lowered beam-family node handed to the pass each frame. */
export interface BeamDrawSpec {
  readonly nodeId: string;
  /** "light-beam" | "lightCone" | "auroraRibbon" */
  readonly kind: string;
  readonly color: AuraVec4;
  readonly intensity: number;
  readonly position?: AuraVec3;
  readonly from?: AuraVec3;
  readonly to?: AuraVec3;
  readonly widthWorld?: number;
  readonly segmentCount?: number;
  readonly direction?: AuraVec3;
  readonly length?: number;
  readonly coneAngle?: number;
  readonly softness?: number;
  readonly width?: number;
  readonly height?: number;
  readonly segments?: number;
  readonly sway?: number;
  readonly shimmer?: number;
  readonly colorTop?: AuraVec4;
}

const BEAM_RENDER_STATE = {
  depthTest: true,
  depthWrite: false,
  cullMode: "none" as const,
  blend: true,
  // §6.2.10 beams/cones/aurora are additive; C-04 stubs lower this to
  // alpha-over where named blends are unsupported.
  blendMode: "additive" as const,
  depthCompare: "less-equal" as const
};

const IDENTITY_MAT4: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function sub(a: AuraVec3, b: AuraVec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: AuraVec3, b: readonly [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(v: readonly [number, number, number], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}
function normalize(v: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

interface BuiltGeometry {
  vertices: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
}

class VertexWriter {
  readonly verts: number[] = [];
  readonly indices: number[] = [];
  private cursor = 0;

  push(p: readonly [number, number, number], n: readonly [number, number, number], uv: [number, number], c: AuraVec4): number {
    this.verts.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], c[0], c[1], c[2], c[3]);
    return this.cursor++;
  }
  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }
  build(): BuiltGeometry {
    return { vertices: new Float32Array(this.verts), indices: new Uint32Array(this.indices), vertexCount: this.cursor };
  }
}

/** Camera-facing strip from→to; alpha fades linearly toward `to`. */
function buildBeam(spec: BeamDrawSpec, cameraPos: AuraVec3): BuiltGeometry {
  const from = spec.from ?? spec.position ?? [0, 0, 0];
  const to = spec.to ?? [0, 1, 0];
  const half = (spec.widthWorld ?? 0.15) * 0.5;
  const segs = Math.max(1, Math.min(64, spec.segmentCount ?? 8));
  const w = new VertexWriter();
  const axis = sub(to, from);
  const dir = normalize(axis);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p: [number, number, number] = [from[0] + axis[0] * t, from[1] + axis[1] * t, from[2] + axis[2] * t];
    const toCam = normalize(sub(cameraPos, p));
    // expand axis: perpendicular to both beam dir and view dir
    let side = cross(dir, toCam);
    if (Math.hypot(side[0], side[1], side[2]) < 1e-4) side = cross(dir, [0, 1, 0]);
    side = normalize(side);
    const alpha = 1 - t;
    const c: AuraVec4 = [spec.color[0] * spec.intensity, spec.color[1] * spec.intensity, spec.color[2] * spec.intensity, alpha];
    const pa = add(p, scale(side, half));
    const pb = add(p, scale(side, -half));
    const a = w.push(pa, side, [t, 0], c);
    const b = w.push(pb, side, [t, 1], c);
    if (i > 0) w.quad(a - 2, b - 2, b, a);
  }
  return w.build();
}

/** Open cone fan: apex at `position`, opens along `direction` with axial + radial fade. */
function buildCone(spec: BeamDrawSpec): BuiltGeometry {
  const apex = spec.position ?? [0, 0, 0];
  const axis = normalize(spec.direction ?? [0, -1, 0]);
  const length = spec.length ?? 6;
  const radius = Math.tan(spec.coneAngle ?? 0.35) * length;
  const softness = spec.softness ?? 0.4;
  const radial = 16;
  const axial = 6;
  const w = new VertexWriter();
  const u = Math.abs(axis[1]) > 0.9 ? normalize(cross(axis, [1, 0, 0])) : normalize(cross(axis, [0, 1, 0]));
  const v = normalize(cross(axis, u));
  // rows: t along the axis (apex → base), ring of `radial` points
  const rows: number[][] = [];
  for (let i = 0; i <= axial; i++) {
    const t = i / axial;
    const center = add(apex, scale(axis, length * t));
    const r = radius * t;
    // alpha: bright at apex, fades to base; softened radial edge is implicit
    // (only the surface exists — softness widens the alpha tail along the axis)
    const alpha = Math.pow(1 - t, 1 - Math.min(softness, 0.95));
    const c: AuraVec4 = [spec.color[0] * spec.intensity, spec.color[1] * spec.intensity, spec.color[2] * spec.intensity, alpha];
    const row: number[] = [];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const off = add(scale(u, Math.cos(a) * r), scale(v, Math.sin(a) * r));
      const p = add(center, off);
      const n = normalize(add(scale(u, Math.cos(a)), scale(v, Math.sin(a))));
      row.push(w.push(p, n, [j / radial, t], c));
    }
    rows.push(row);
  }
  for (let i = 1; i < rows.length; i++) {
    for (let j = 1; j < rows[i].length; j++) {
      w.quad(rows[i - 1][j - 1], rows[i - 1][j], rows[i][j], rows[i][j - 1]);
    }
  }
  return w.build();
}

/** Animated curtain strip — shimmer bands run in the fragment shader. */
function buildAurora(spec: BeamDrawSpec): BuiltGeometry {
  const origin = spec.position ?? [0, 0, 0];
  const width = spec.width ?? 12;
  const height = spec.height ?? 8;
  const segs = Math.max(2, Math.min(256, spec.segments ?? 96));
  const w = new VertexWriter();
  const base = spec.color;
  const top = spec.colorTop ?? base;
  let prevA = -1;
  let prevB = -1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = origin[0] + (t - 0.5) * width;
    // gentle static curtain fold so the sheet reads non-planar even at t=0
    const z = origin[2] + Math.sin(t * Math.PI * 3) * width * 0.02;
    const yBot = origin[1];
    const yTop = origin[1] + height;
    const cBot: AuraVec4 = [base[0] * spec.intensity, base[1] * spec.intensity, base[2] * spec.intensity, base[3]];
    const cTop: AuraVec4 = [top[0] * spec.intensity, top[1] * spec.intensity, top[2] * spec.intensity, 0];
    const a = w.push([x, yBot, z], [0, 0, 1], [t, 0], cBot);
    const b = w.push([x, yTop, z], [0, 0, 1], [t, 1], cTop);
    if (prevA >= 0) w.quad(prevA, prevB, b, a);
    prevA = a;
    prevB = b;
  }
  return w.build();
}

export class BeamPass {
  private readonly programs = new Map<string, RenderShaderProgram>();
  private vertexBuffer: RenderBuffer | null = null;
  private indexBuffer: RenderBuffer | null = null;
  private vertexCapacity = 0;
  private indexCapacity = 0;

  constructor(private readonly device: RenderDevice) {}

  /** C-01 transparent-phase items: one draw per beam-family node. */
  transparentItems(specs: readonly BeamDrawSpec[], ctx: FrameContributorContext): TransparentQueueItem[] {
    const cameraPosition = (ctx.camera?.position ?? [0, 0, 0]) as AuraVec3;
    const items: TransparentQueueItem[] = [];
    for (const spec of specs) {
      const geometry =
        spec.kind === "lightCone" ? buildCone(spec) : spec.kind === "auroraRibbon" ? buildAurora(spec) : buildBeam(spec, cameraPosition);
      if (geometry.vertexCount === 0) continue;
      items.push({ sortDepth: 0, draw: () => this.drawGeometry(spec, geometry, ctx) });
    }
    return items;
  }

  private drawGeometry(spec: BeamDrawSpec, geometry: BuiltGeometry, ctx: FrameContributorContext): void {
    const vb = this.ensureBuffer("vertex", geometry.vertices.byteLength, this.vertexBuffer, "vb");
    this.device.updateBuffer(vb, 0, geometry.vertices);
    const ib = this.ensureBuffer("index", geometry.indices.byteLength, this.indexBuffer, "ib");
    this.device.updateBuffer(ib, 0, geometry.indices);

    const depth = resolveSceneDepth(ctx);
    const softParticles = depth?.available === true && depth.source.texture !== null;
    const aurora = spec.kind === "auroraRibbon";
    const shader = this.program({ softParticles, aurora });
    const uniforms = new Map<string, import("../RenderDevice").UniformValue>([
      ["u_viewProjection", ctx.camera?.viewProjectionMatrix ?? IDENTITY_MAT4],
      ["u_outputColorSpace", 1],
      ["u_time", ctx.timeSeconds ?? 0],
      ["u_sway", spec.sway ?? 0],
      ["u_aurora", aurora ? 1 : 0],
      ["u_shimmer", spec.shimmer ?? 0]
    ]);
    if (softParticles && depth) {
      uniforms.set("u_sceneDepth", new TextureBinding({ name: "u_sceneDepth", texture: depth.source.texture! }));
      uniforms.set("u_depthLinearize", [depth.source.linearize.near, depth.source.linearize.far, depth.source.linearize.orthographic ? 1 : 0, 0]);
    }
    this.device.draw({
      label: `prd07.beam.${spec.nodeId}`,
      topology: "triangles",
      vertexBuffer: vb,
      vertexFormat: RIBBON_VERTEX_FORMAT,
      vertexCount: geometry.vertexCount,
      indexBuffer: ib,
      indexType: "uint32",
      indexCount: geometry.indices.length,
      shader,
      uniforms,
      renderState: BEAM_RENDER_STATE
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

  private program(defines: { readonly softParticles: boolean; readonly aurora: boolean }): RenderShaderProgram {
    const key = beamProgramKey(defines);
    let shader = this.programs.get(key);
    if (!shader) {
      shader = this.device.createShaderProgram({
        label: key,
        vertex: beamVertexSource(),
        fragment: beamFragmentSource(defines),
        marker: BEAM_SHADER_MARKER
      });
      this.programs.set(key, shader);
    }
    return shader;
  }
}
