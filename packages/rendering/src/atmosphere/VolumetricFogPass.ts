// PRD-07 P5-T6 — §6.7/§8.7 froxel volumetric fog pass. The volume lives in a
// 2D tiled rgba16f atlas (C-27 froxelGrid: High 160×90×64 in 8×8 tiles =
// 1280×720; Ultra 240×135×128 in 16×8 tiles = 3840×1080; reduced Ultra
// 240×135×96, reported VOLUMETRIC_GRID_REDUCED). WebGL2 has no compute, so:
//   inject   — one scissored fullscreen draw per slice → (L, σ) atlas
//   integrate— one whole-atlas draw; each fragment prefix-sums its slice
//   apply    — fullscreen premultiplied-alpha-over: (S, 1−T) ≡ color·T + S
// The pass only runs when `resolveSceneDepth(ctx).available`; without it the
// analytic fog path covers every tier (VOLUMETRIC_DEPTH_PENDING). Temporal
// reprojection (Ultra) waits on C-01 previousViewProjectionMatrix — null →
// VOLUMETRIC_TEMPORAL_PENDING and the injected atlas is used directly.

import { Geometry } from "../Geometry";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import type { RenderDevice, RenderShaderProgram, RenderTarget, UniformValue } from "../RenderDevice";
import type { FrameContributorContext } from "../contracts/frameGraph";
import type { Texture } from "../Texture";
import { TextureBinding } from "../TextureBinding";
import { volumetricInjectFragmentSource, volumetricInjectVertexSource, PRD07_VOLUMETRIC_MARKER } from "./shaders/volumetric-inject.glsl";
import { volumetricIntegrateFragmentSource, volumetricIntegrateVertexSource } from "./shaders/volumetric-integrate.glsl";
import { volumetricApplyFragmentSource, volumetricApplyVertexSource } from "./shaders/volumetric-apply.glsl";
import { packFogVolumes, type Prd07FogVolume } from "./FogVolumes";
import type { PackedFogUniforms } from "./HeightFog";

export interface FroxelGridSpec {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly slices: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly near: number;
  readonly far: number;
  readonly temporal: boolean;
  /** Diagnostics note when the Ultra grid was reduced under the memory check. */
  readonly note: "VOLUMETRIC_GRID_REDUCED" | null;
}

const froxel = (tileWidth: number, tileHeight: number, slices: number, tilesX: number, far: number, temporal: boolean, note: FroxelGridSpec["note"] = null): FroxelGridSpec => ({
  tileWidth, tileHeight, slices, tilesX,
  tilesY: Math.ceil(slices / tilesX),
  atlasWidth: tileWidth * tilesX,
  atlasHeight: tileHeight * Math.ceil(slices / tilesX),
  near: 0.5, far, temporal, note
});

/**
 * C-27 tier mapping (frozen table): `"analytic"` → null (analytic fog only);
 * `"froxel-medium"` → 160×90×64, far 64; `"froxel-high"` → 240×135×128, far
 * 96, temporal. `memoryOk: false` drops Ultra to 240×135×96 + reports
 * VOLUMETRIC_GRID_REDUCED (R10).
 */
export function froxelGridFor(
  mode: "analytic" | "froxel-medium" | "froxel-high" | null,
  memoryOk = true
): FroxelGridSpec | null {
  switch (mode) {
    case "froxel-medium": return froxel(160, 90, 64, 8, 64, false);
    case "froxel-high":
      return memoryOk ? froxel(240, 135, 128, 16, 96, true) : froxel(240, 135, 96, 16, 96, true, "VOLUMETRIC_GRID_REDUCED");
    default: return null;
  }
}

export interface VolumetricFogPassInput {
  /** Packed §8.4 fog uniforms (fogA = σd,σh,b,h0 reused as volume density;
      fogB.w = anisotropy). Null → uniform σ + ambient only. */
  readonly fog: PackedFogUniforms | null;
  readonly fogColor: readonly [number, number, number];
  readonly volumes: readonly Prd07FogVolume[];
  readonly sunDirection: readonly [number, number, number];
  readonly sunColor: readonly [number, number, number];
  readonly ambientColor: readonly [number, number, number];
  readonly noiseScale?: number;
  readonly noiseSpeed?: number;
  readonly noiseStrength?: number;
  /** Scene depth texture for the apply pass. */
  readonly sceneDepth: Texture | null;
  readonly depthLinearize: readonly [number, number, number, number];
}

let tri: Geometry | null = null;
function fullscreenTriangle(): Geometry {
  if (tri) return tri;
  const v = new VertexBuffer(VertexFormat.P3, 3);
  v.setAttribute(0, "position", [-1, -1, 0]);
  v.setAttribute(1, "position", [3, -1, 0]);
  v.setAttribute(2, "position", [-1, 3, 0]);
  tri = new Geometry(v, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
  return tri;
}

const FULL_SCREEN = { depthTest: false, depthWrite: false, cullMode: "none" as const, blend: false, depthCompare: "always" as const };

export class VolumetricFogPass {
  private injectProgram: RenderShaderProgram | null = null;
  private integrateProgram: RenderShaderProgram | null = null;
  private applyProgram: RenderShaderProgram | null = null;
  private injectAtlas: RenderTarget | null = null;
  private integrateAtlas: RenderTarget | null = null;
  private temporalPrev: RenderTarget | null = null;

  constructor(private readonly device: RenderDevice, readonly grid: FroxelGridSpec) {}

  /** Readback handles for browser specs (froxel-transmittance.spec.ts). */
  get debugTargets(): { inject: RenderTarget | null; integrate: RenderTarget | null } {
    return { inject: this.injectAtlas, integrate: this.integrateAtlas };
  }

  private ensureTargets(): void {
    const desc = { width: this.grid.atlasWidth, height: this.grid.atlasHeight, format: "rgba16f" as const };
    this.injectAtlas ??= this.device.createRenderTarget({ ...desc, label: "prd07.froxel.inject" });
    this.integrateAtlas ??= this.device.createRenderTarget({ ...desc, label: "prd07.froxel.integrate" });
    if (this.grid.temporal) {
      this.temporalPrev ??= this.device.createRenderTarget({ ...desc, label: "prd07.froxel.temporal" });
    }
  }

  private program(kind: "inject" | "integrate" | "apply"): RenderShaderProgram {
    const cached = kind === "inject" ? this.injectProgram : kind === "integrate" ? this.integrateProgram : this.applyProgram;
    if (cached) return cached;
    const program = this.device.createShaderProgram({
      label: `prd07.volumetric.${kind}`,
      vertex: kind === "inject" ? volumetricInjectVertexSource()
        : kind === "integrate" ? volumetricIntegrateVertexSource()
        : volumetricApplyVertexSource(),
      fragment: kind === "inject" ? volumetricInjectFragmentSource()
        : kind === "integrate" ? volumetricIntegrateFragmentSource()
        : volumetricApplyFragmentSource(),
      marker: PRD07_VOLUMETRIC_MARKER
    });
    if (kind === "inject") this.injectProgram = program;
    else if (kind === "integrate") this.integrateProgram = program;
    else this.applyProgram = program;
    return program;
  }

  /** Per-frame froxel update: inject → integrate. Returns the apply draw. */
  update(input: VolumetricFogPassInput, ctx: FrameContributorContext): { readonly apply: (target: RenderTarget | null) => void; readonly notes: readonly string[] } {
    // T0-34: remember the caller's bound target — this pass must leave it
    // bound on exit, never null (canvas), or later draws hit the framebuffer
    // and OutputPass overwrites them.
    const callerRt = this.device.getRenderTarget?.() ?? null;
    this.ensureTargets();
    const notes: string[] = [];
    if (this.grid.note) notes.push(this.grid.note);
    const camera = ctx.camera;
    const invView = camera ? invertRigid(camera.viewMatrix) : IDENTITY_MAT4;
    const tanY = camera ? 1 / Math.max(camera.projectionMatrix[5] ?? 1, 1e-6) : 1;
    const tanX = camera ? 1 / Math.max(camera.projectionMatrix[0] ?? 1, 1e-6) : 1;
    const packed = input.fog;
    const noiseScale = input.noiseScale ?? 0;
    const noiseSpeed = input.noiseSpeed ?? 0;
    const noiseStrength = input.noiseStrength ?? 0;
    // §8.7 Ultra jitter: (frameIndex mod 8 + 0.5)/8 of a slice.
    const jitter = this.grid.temporal ? ((ctx.frameIndex % 8) + 0.5) / 8 : 0;
    if (this.grid.temporal && camera?.previousViewProjectionMatrix == null) {
      notes.push("VOLUMETRIC_TEMPORAL_PENDING");
    }
    const geometry = fullscreenTriangle();
    const vertexBuffer = geometry.vertexBuffer.upload(this.device);

    // 1) inject — one scissored draw per slice into its tile.
    const volumes = packFogVolumes(input.volumes);
    const inject = this.program("inject");
    for (let slice = 0; slice < this.grid.slices; slice += 1) {
      const tx = slice % this.grid.tilesX;
      const ty = Math.floor(slice / this.grid.tilesX);
      const u = new Map<string, UniformValue>();
      u.set("u_tileSize", [this.grid.tileWidth, this.grid.tileHeight]);
      u.set("u_projTan", [tanX, tanY]);
      u.set("u_invView", invView);
      u.set("u_cameraPosition", [...(camera?.position ?? [0, 0, 0])]);
      u.set("u_near", this.grid.near);
      u.set("u_far", this.grid.far);
      u.set("u_slice", slice);
      u.set("u_slices", this.grid.slices);
      u.set("u_jitter", jitter);
      u.set("u_fogDensity", packed ? packed.fogA : [0, 0, 0, 0]);
      u.set("u_fogVolumes", volumes);
      u.set("u_noiseScale", noiseScale);
      u.set("u_noiseSpeed", noiseSpeed);
      u.set("u_noiseStrength", noiseStrength);
      u.set("u_time", ctx.timeSeconds);
      u.set("u_sunDirection", [...input.sunDirection]);
      u.set("u_sunColor", [...input.sunColor]);
      u.set("u_anisotropy", packed ? packed.fogB[3] : 0.6);
      u.set("u_ambientColor", [...input.ambientColor]);
      u.set("u_localLights", new Float32Array(32));
      this.device.setRenderTarget(this.injectAtlas);
      this.device.draw({
        label: `prd07.volumetric.inject.${slice}`,
        topology: "triangles",
        vertexBuffer,
        vertexFormat: geometry.vertexBuffer.format,
        vertexCount: 3,
        shader: inject,
        uniforms: u,
        renderState: {
          ...FULL_SCREEN,
          scissor: { x: tx * this.grid.tileWidth, y: ty * this.grid.tileHeight, width: this.grid.tileWidth, height: this.grid.tileHeight }
        }
      });
    }

    // 2) integrate — one whole-atlas draw, per-fragment prefix sum.
    const integrate = this.program("integrate");
    const iu = new Map<string, UniformValue>();
    iu.set("u_injectAtlas", new TextureBinding({ name: "u_injectAtlas", texture: this.injectAtlas!.colorTexture }));
    iu.set("u_atlasSize", [this.grid.atlasWidth, this.grid.atlasHeight]);
    iu.set("u_tileSize", [this.grid.tileWidth, this.grid.tileHeight]);
    iu.set("u_tilesX", this.grid.tilesX);
    iu.set("u_near", this.grid.near);
    iu.set("u_far", this.grid.far);
    iu.set("u_slices", this.grid.slices);
    this.device.setRenderTarget(this.integrateAtlas);
    this.device.draw({
      label: "prd07.volumetric.integrate",
      topology: "triangles",
      vertexBuffer,
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: 3,
      shader: integrate,
      uniforms: iu,
      renderState: FULL_SCREEN
    });
    this.device.setRenderTarget(callerRt);

    // 3) apply draw closure (premultiplied-over into the caller's target).
    const integrateAtlas = this.integrateAtlas!;
    const sceneDepth = input.sceneDepth;
    const depthLinearize = input.depthLinearize;
    const apply = (target: RenderTarget | null): void => {
      const au = new Map<string, UniformValue>();
      au.set("u_integrateAtlas", new TextureBinding({ name: "u_integrateAtlas", texture: integrateAtlas.colorTexture }));
      au.set("u_sceneDepth", new TextureBinding({ name: "u_sceneDepth", texture: sceneDepth, required: true }));
      au.set("u_depthLinearize", [...depthLinearize]);
      au.set("u_atlasSize", [this.grid.atlasWidth, this.grid.atlasHeight]);
      au.set("u_tileSize", [this.grid.tileWidth, this.grid.tileHeight]);
      au.set("u_tilesX", this.grid.tilesX);
      au.set("u_near", this.grid.near);
      au.set("u_far", this.grid.far);
      au.set("u_slices", this.grid.slices);
      const prev = this.device.getRenderTarget?.() ?? null;
      this.device.setRenderTarget(target);
      this.device.draw({
        label: "prd07.volumetric.apply",
        topology: "triangles",
        vertexBuffer,
        vertexFormat: geometry.vertexBuffer.format,
        vertexCount: 3,
        shader: this.program("apply"),
        uniforms: au,
        renderState: { ...FULL_SCREEN, blendMode: "premultiplied", blend: true }
      });
      this.device.setRenderTarget(prev);
    };
    return { apply, notes };
  }

  dispose(): void {
    for (const t of [this.injectAtlas, this.integrateAtlas, this.temporalPrev]) t?.dispose();
    this.injectAtlas = null;
    this.integrateAtlas = null;
    this.temporalPrev = null;
  }
}

const IDENTITY_MAT4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** Invert a rigid-body (rotation+translation) view matrix column-major. */
export function invertRigid(m: Float32Array): Float32Array {
  // Rigid inverse: Rᵀ + -Rᵀt (column-major mat4).
  const r00 = m[0]!, r10 = m[1]!, r20 = m[2]!;
  const r01 = m[4]!, r11 = m[5]!, r21 = m[6]!;
  const r02 = m[8]!, r12 = m[9]!, r22 = m[10]!;
  const tx = m[12]!, ty = m[13]!, tz = m[14]!;
  const out = new Float32Array(16);
  out[0] = r00; out[4] = r10; out[8] = r20;
  out[1] = r01; out[5] = r11; out[9] = r21;
  out[2] = r02; out[6] = r12; out[10] = r22;
  out[12] = -(r00 * tx + r10 * ty + r20 * tz); // -Rᵀt component 0 (R column 0 · t)
  out[13] = -(r01 * tx + r11 * ty + r21 * tz);
  out[14] = -(r02 * tx + r12 * ty + r22 * tz);
  out[15] = 1;
  return out;
}
