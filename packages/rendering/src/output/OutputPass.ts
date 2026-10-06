/**
 * `output/OutputPass.ts` (PRD-01 §8.6, C-05) — the single encode point under
 * `A3D_QR_CORE_OUTPUT`. Reads the linear-HDR scene target (`u_scene`), applies
 * `u_exposure`, the selected tone-map operator (`TONE_MAP` define), optional
 * BACKGROUND_COVERAGE mix (`u_coverage`, R8), triangular dither
 * (`u_dither == 1`, one LSB of 8-bit), and the C-05 juice overlay — then writes
 * sRGB-encoded LDR to the canvas (or an LDR target). Programs are cached per
 * variant key `{toneMapping, coverage, overlay}` per device.
 */

import type {
  AuraToneMappingOperatorLike,
  OutputOverlayUniforms,
  OutputPassLike,
  OutputPassOptions
} from "../contracts/output";
import { DEFAULT_TONE_MAPPING } from "../contracts/output";
import { Geometry } from "../Geometry";
import { DEFAULT_RENDER_STATE } from "../Material";
import type { DisposableResource, RenderDevice, RenderTarget, UniformValue } from "../RenderDevice";
import { RenderPipeline } from "../RenderPipeline";
import { ShaderModule } from "../ShaderModule";
import { TextureBinding } from "../TextureBinding";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import { OUTPUT_VERTEX_GLSL, outputFragmentGlsl, TONE_MAP_OPERATOR_FUNCTIONS } from "./ToneMappingOperators.glsl";

/** Q-01-1 (PRD 09 §8): CPU gates the overlay when every amount is below ~0.002. */
const OVERLAY_AMOUNT_FLOOR = 1 / 512;

const OUTPUT_RENDER_STATE = {
  ...DEFAULT_RENDER_STATE,
  blend: false,
  depthTest: false,
  depthWrite: false,
  cullMode: "none" as const
};

interface OutputVariantKey {
  readonly toneMapping: AuraToneMappingOperatorLike;
  readonly coverage: boolean;
  readonly overlay: boolean;
}

function variantCacheKey(key: OutputVariantKey): string {
  return `${key.toneMapping}|${key.coverage ? 1 : 0}|${key.overlay ? 1 : 0}`;
}

function createFullscreenTriangleGeometry(): Geometry {
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  return new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
}

/** The overlay runs when any amount clears the floor; else `shape.w` is 0 (idle branch → bit-identical). */
function overlayEnabledAmounts(overlay: OutputOverlayUniforms): boolean {
  return overlay.flash[3] >= OVERLAY_AMOUNT_FLOOR
    || overlay.vignette[3] >= OVERLAY_AMOUNT_FLOOR
    || overlay.fade[3] >= OVERLAY_AMOUNT_FLOOR;
}

function overlayUniforms(overlay: OutputOverlayUniforms, aspect: number, enabled: boolean, uniforms: Map<string, UniformValue>): void {
  uniforms.set("u_overlayFlash", [...overlay.flash]);
  uniforms.set("u_overlayVignette", [...overlay.vignette]);
  uniforms.set("u_overlayShape", [overlay.shape[0], overlay.shape[1], aspect, enabled ? 1 : 0]);
  uniforms.set("u_overlayFade", [...overlay.fade]);
}

export class OutputPass implements OutputPassLike, DisposableResource {
  private readonly modules = new Map<string, ShaderModule>();
  private readonly drawCache = new Map<string, { readonly geometry: Geometry; readonly pipeline: RenderPipeline }>();
  public disposed = false;

  constructor(private readonly device: RenderDevice) {}

  /**
   * @param input   linear-HDR scene target (attachment 0).
   * @param coverage BACKGROUND_COVERAGE source — either `input` itself (MRT
   *                 attachment 1 is sampled) or a single-attachment rgba8 target.
   * @param output  `"canvas"` presents to the default framebuffer.
   */
  execute(input: RenderTarget, coverage: RenderTarget | null, options: OutputPassOptions, output: RenderTarget | "canvas"): void {
    const toneMapping = options.toneMapping ?? DEFAULT_TONE_MAPPING;
    const useCoverage = options.backgroundCoverage && coverage !== null;
    const overlay = options.overlay ?? null;
    const overlayActive = overlay !== null && overlayEnabledAmounts(overlay);
    const key: OutputVariantKey = { toneMapping, coverage: useCoverage, overlay: overlay !== null };
    const cacheKey = variantCacheKey(key);
    const shader = this.moduleFor(key).compile(this.device);

    const uniforms = new Map<string, UniformValue>();
    uniforms.set("u_scene", new TextureBinding({ name: "u_scene", texture: input.colorTexture, required: true }));
    if (useCoverage && coverage) {
      const coverageTexture = coverage.colorTextures?.[1] ?? coverage.colorTexture;
      uniforms.set("u_coverage", new TextureBinding({ name: "u_coverage", texture: coverageTexture, required: true }));
    }
    uniforms.set("u_exposure", options.exposure);
    uniforms.set("u_dither", options.dithering ? 1 : 0);
    if (overlay) {
      overlayUniforms(overlay, input.width / Math.max(1, input.height), overlayActive, uniforms);
    }

    // Phase 6: persistent fullscreen geometry + pipeline per variant — zero
    // RenderPipeline constructions and zero buffer creates in steady state.
    let cached = this.drawCache.get(cacheKey);
    if (!cached || cached.pipeline.shader !== shader) {
      cached?.geometry.dispose();
      const geometry = createFullscreenTriangleGeometry();
      const pipeline = new RenderPipeline({
        label: "prd01-output",
        shader,
        vertexFormat: geometry.vertexBuffer.format,
        topology: geometry.topology,
        renderState: OUTPUT_RENDER_STATE
      });
      cached = { geometry, pipeline };
      this.drawCache.set(cacheKey, cached);
    }
    const command = cached.pipeline.createDrawCommand({
      label: "prd01-output",
      vertexBuffer: cached.geometry.vertexBuffer.upload(this.device),
      vertexCount: cached.geometry.vertexBuffer.vertexCount,
      uniforms
    });
    this.device.setRenderTarget(output === "canvas" ? null : output);
    this.device.draw(command);
    this.device.setRenderTarget(input);
  }

  private moduleFor(key: OutputVariantKey): ShaderModule {
    const cacheKey = variantCacheKey(key);
    let module = this.modules.get(cacheKey);
    if (!module) {
      module = new ShaderModule({
        label: `prd01-output-${cacheKey}`,
        marker: "a3d.output",
        vertex: OUTPUT_VERTEX_GLSL,
        fragment: outputFragmentGlsl({
          toneMapping: TONE_MAP_OPERATOR_FUNCTIONS[key.toneMapping] ? key.toneMapping : DEFAULT_TONE_MAPPING,
          backgroundCoverage: key.coverage,
          overlay: key.overlay
        })
      });
      this.modules.set(cacheKey, module);
    }
    return module;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const module of this.modules.values()) module.dispose();
    this.modules.clear();
    for (const cached of this.drawCache.values()) cached.geometry.dispose();
    this.drawCache.clear();
  }
}
