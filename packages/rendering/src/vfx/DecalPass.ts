// PRD-07 P6-T1 — §6.9 decal draw pass. Runs in the `after-opaque` phase
// (before transparents): one indexed draw per atlas page × blend group from
// DecalBatch.buildAll. Lit per §8.8; blend is `alpha` for marks and
// `multiply` for grime — under the C-04 stub multiply is emulated as
// alpha-over with black at 1 − luminance and reported once per page key as
// VFX_BLEND_FALLBACK.

import type { RenderBuffer, RenderDevice, RenderShaderProgram, UniformValue } from "../RenderDevice";
import type { FrameContributorContext } from "../contracts/frameGraph";
import { TextureBinding } from "../TextureBinding";
import { VertexFormat } from "../VertexFormat";
import { DECAL_VERTEX_FLOATS, type DecalBatch, type DecalGeometry } from "./DecalBatch";
import { DECAL_SHADER_MARKER, decalFragmentSource, decalProgramKey, decalVertexSource, type DecalProgramDefines } from "./shaders/decal.glsl";
import type { Texture } from "../Texture";

export const DECAL_VERTEX_FORMAT = new VertexFormat(
  [
    { semantic: "position", components: 3, offset: 0, shaderName: "a_position" },
    { semantic: "normal", components: 3, offset: 12, shaderName: "a_normal" },
    { semantic: "uv", components: 2, offset: 24, shaderName: "a_uv" },
    { semantic: "color", components: 4, offset: 32, shaderName: "a_color" },
    // `uv1` = extra per-vertex channel; bound to a_fade by name (angleStart, angleEnd, nearFade, farFade).
    { semantic: "uv1", components: 4, offset: 48, shaderName: "a_fade" }
  ],
  DECAL_VERTEX_FLOATS * 4
);

/** Optional texture lookup for page keys — the engine resolves URLs/pages. */
export type DecalTextureResolver = (pageKey: string) => Texture | null;

export interface DecalPassOptions {
  readonly resolveTexture?: DecalTextureResolver;
  /** Sun light for the §8.8 lobe — defaults are sane for tests. */
  readonly sunDirection?: readonly [number, number, number];
  readonly sunColor?: readonly [number, number, number];
  readonly roughness?: number;
  readonly fog?: boolean;
  /** §8.4 packed uniforms when `fog` is set (from the prd07.fog blackboard). */
  readonly fogUniforms?: (ctx: FrameContributorContext) => Map<string, UniformValue> | null;
  /** Reported once per page key when multiply emulates alpha-over. */
  readonly onNote?: (code: string, message: string) => void;
}

export class DecalPass {
  private readonly programs = new Map<string, RenderShaderProgram>();
  private vertexBuffer: RenderBuffer | null = null;
  private indexBuffer: RenderBuffer | null = null;
  private vertexCapacity = 0;
  private indexCapacity = 0;
  private readonly blendFallbackNoted = new Set<string>();

  constructor(
    private readonly device: RenderDevice,
    private readonly options: DecalPassOptions = {}
  ) {}

  /** Draws every populated (page, blend) group — one draw each. Returns draw count for tests/diagnostics. */
  draw(batch: DecalBatch, ctx: FrameContributorContext, now: number): number {
    const geometries = batch.buildAll(now);
    for (const geometry of geometries) this.drawGeometry(geometry, ctx);
    return geometries.length;
  }

  private drawGeometry(geometry: DecalGeometry, ctx: FrameContributorContext): void {
    const vb = this.ensureBuffer("vertex", geometry.vertices.byteLength, "vb");
    this.device.updateBuffer(vb, 0, geometry.vertices);
    const ib = this.ensureBuffer("index", geometry.indices.byteLength, "ib");
    this.device.updateBuffer(ib, 0, geometry.indices);

    const texture = this.options.resolveTexture?.(geometry.pageKey) ?? null;
    const defines: DecalProgramDefines = {
      albedoTexture: texture !== null,
      normalTexture: false,
      multiply: geometry.blend === "multiply",
      fog: this.options.fog === true
    };
    if (defines.multiply && !this.blendFallbackNoted.has(geometry.pageKey)) {
      this.blendFallbackNoted.add(geometry.pageKey);
      this.options.onNote?.(
        "VFX_BLEND_FALLBACK",
        `prd07.decals: multiply blend emulated as alpha-over (black at 1−luminance) for page "${geometry.pageKey}" under the C-04 stub`
      );
    }
    const sh9 = new Float32Array(36);
    sh9[0] = 0.5; sh9[1] = 0.5; sh9[2] = 0.55; sh9[3] = 1;
    const uniforms = new Map<string, UniformValue>([
      ["u_viewProjection", ctx.camera?.viewProjectionMatrix ?? IDENTITY_MAT4],
      ["u_sunDirection", [...(this.options.sunDirection ?? [0.5, 0.8, 0.3])]],
      ["u_sunColor", [...(this.options.sunColor ?? [1, 1, 1])]],
      ["u_roughness", this.options.roughness ?? 0.5],
      ["u_sh9", sh9],
      ["u_cameraPosition", [...(ctx.camera?.position ?? [0, 0, 0])]]
    ]);
    if (texture) uniforms.set("u_albedo", new TextureBinding({ name: "u_albedo", texture }));
    if (defines.fog) {
      const extra = this.options.fogUniforms?.(ctx);
      if (extra) for (const [k, v] of extra) uniforms.set(k, v);
    }
    this.device.draw({
      label: `prd07.decals.${geometry.pageKey}.${geometry.blend}`,
      topology: "triangles",
      vertexBuffer: vb,
      vertexFormat: DECAL_VERTEX_FORMAT,
      vertexCount: geometry.vertexCount,
      indexBuffer: ib,
      indexType: "uint32",
      indexCount: geometry.indices.length,
      shader: this.program(defines),
      uniforms,
      renderState: {
        depthTest: true,
        depthWrite: false,
        cullMode: "none",
        blend: true,
        blendMode: "alpha",
        depthCompare: "less-equal",
        ...(geometry.polygonOffset ? { polygonOffset: geometry.polygonOffset } : {})
      }
    });
  }

  private ensureBuffer(usage: "vertex" | "index", bytes: number, which: "vb" | "ib"): RenderBuffer {
    const capacity = which === "vb" ? this.vertexCapacity : this.indexCapacity;
    const existing = which === "vb" ? this.vertexBuffer : this.indexBuffer;
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

  private program(defines: DecalProgramDefines): RenderShaderProgram {
    const key = decalProgramKey(defines);
    let shader = this.programs.get(key);
    if (!shader) {
      shader = this.device.createShaderProgram({
        label: key,
        vertex: decalVertexSource(),
        fragment: decalFragmentSource(defines),
        marker: DECAL_SHADER_MARKER
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
