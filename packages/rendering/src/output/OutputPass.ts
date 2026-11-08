/**
 * `output/OutputPass.ts` (PRD-01 §8.6, C-05) — the single encode point under
 * `A3D_QR_CORE_OUTPUT`. Reads the linear-HDR scene target (`u_scene`), applies
 * `u_exposure`, the selected tone-map operator (`TONE_MAP` define), optional
 * BACKGROUND_COVERAGE mix (`u_coverage`, R8), triangular dither
 * (`u_dither > 0.5`, one LSB of 8-bit), and the C-05 juice overlay — then writes
 * display-encoded LDR to the canvas (or an LDR target). Programs are cached
 * per shader-affecting output option per device.
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
import { RenderDeviceError } from "../RenderDevice";
import type { DisposableResource, RenderDevice, RenderOutputColorSpace, RenderOutputColorSpaceNegotiation, RenderTarget, UniformValue } from "../RenderDevice";
import { RenderPipeline } from "../RenderPipeline";
import { ShaderModule } from "../ShaderModule";
import { TextureBinding } from "../TextureBinding";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import { OUTPUT_VERTEX_GLSL, outputFragmentGlsl, TONE_MAP_OPERATOR_FUNCTIONS } from "./ToneMappingOperators.glsl";
import { createOutputWgsl } from "./ToneMappingOperators.wgsl";
import { abortEncodedDisplaySurfaceWrite, assertEncodedDisplaySurface, beginEncodedDisplaySurfaceWrite,
  markEncodedDisplaySurfaceWritten, type EncodedDisplaySurfaceLease } from "./EncodedDisplaySurface";

/** Q-01-1 (PRD 09 §8): CPU gates the overlay when every amount is below ~0.002. */
const OVERLAY_AMOUNT_FLOOR = 1 / 512;
// This dispatcher is deliberately absent from the public OutputPass contract.
// Only the internal display-surface helper can supply a validated capability.
type EncodedSurfaceRunner = (input: RenderTarget, coverage: RenderTarget | null, options: OutputPassOptions,
  output: RenderTarget, surface: EncodedDisplaySurfaceLease) => void;
const encodedSurfaceRunners = new WeakMap<OutputPass, EncodedSurfaceRunner>();

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
  readonly vignette: boolean;
  readonly fullCoverage: boolean;
  readonly outputColorSpace: "srgb" | "display-p3";
  readonly alphaMode: "opaque" | "straight" | "premultiplied";
  readonly colorGrade: boolean;
}

function variantCacheKey(key: OutputVariantKey): string {
  const base = `${key.toneMapping}|${key.coverage ? 1 : 0}|${key.overlay ? 1 : 0}|${key.vignette ? 1 : 0}|${key.fullCoverage ? 1 : 0}|${key.outputColorSpace}|${key.alphaMode}`;
  return key.colorGrade ? `${base}|grade` : base;
}

/** Validated grade uniforms, or an error naming the out-of-range field (same ranges as the fused grade). */
function outputColorGrade(grade: OutputPassOptions["colorGrade"]): { readonly a: number[]; readonly b: number[] } | null {
  if (grade === undefined) return null;
  const ranges: ReadonlyArray<readonly [keyof NonNullable<OutputPassOptions["colorGrade"]>, number, number]> = [
    ["contrast", 0, 3], ["temperature", -1, 1], ["tint", -1, 1], ["saturation", 0, 3], ["vibrance", -1, 1], ["vignette", 0, 1]
  ];
  for (const [name, min, max] of ranges) {
    const value = grade?.[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`OUTPUT_COLOR_GRADE_UNSUPPORTED:${name}`);
    }
  }
  return { a: [grade.contrast, grade.temperature, grade.tint, grade.saturation], b: [grade.vibrance, grade.vignette, 0, 0] };
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

function validOutputNegotiation(negotiation: RenderOutputColorSpaceNegotiation | undefined): negotiation is RenderOutputColorSpaceNegotiation {
  return Boolean(negotiation
    && (negotiation.requested === "srgb" || negotiation.requested === "display-p3")
    && (negotiation.active === "srgb" || negotiation.active === "display-p3")
    && Array.isArray(negotiation.supported)
    && negotiation.supported.every((space) => space === "srgb" || space === "display-p3")
    && negotiation.supported.includes(negotiation.active)
    && (negotiation.fallbackReason === undefined
      || (typeof negotiation.fallbackReason === "string" && negotiation.fallbackReason.trim()))
    && (negotiation.active === negotiation.requested
      || (negotiation.requested === "display-p3" && negotiation.active === "srgb" && negotiation.fallbackReason)));
}

function matchesCanvasNegotiation(
  device: RenderDevice,
  current: RenderOutputColorSpaceNegotiation | undefined,
  requested: RenderOutputColorSpace,
  active: RenderOutputColorSpace
): boolean {
  if (!validOutputNegotiation(current) || current.active !== active) return false;
  if (current.requested === requested) return true;
  if (requested !== "srgb" || active !== "srgb" || current.requested !== "display-p3") return false;
  const scopedDevice = device as RenderDevice & { assertDisplayOutputScope?: (expected: RenderOutputColorSpace) => void };
  if (typeof scopedDevice.assertDisplayOutputScope !== "function") return false;
  try {
    scopedDevice.assertDisplayOutputScope("srgb");
    return true;
  } catch {
    return false;
  }
}

function canvasOutputColorSpace(device: RenderDevice, requested: RenderOutputColorSpace): RenderOutputColorSpace {
  const canNegotiate = typeof device.negotiateOutputColorSpace === "function";
  const negotiation = canNegotiate
    ? device.negotiateOutputColorSpace!(requested)
    : device.getOutputColorSpaceNegotiation?.();
  if (!negotiation) {
    if (requested === "srgb" && !canNegotiate) return "srgb";
    throw new RenderDeviceError("Canvas color-space negotiation is unavailable", "OUTPUT_COLOR_SPACE_UNAVAILABLE", { requested });
  }
  if (!canNegotiate && negotiation.requested !== requested) {
    throw new RenderDeviceError("Canvas color-space renegotiation is unavailable", "OUTPUT_COLOR_SPACE_UNAVAILABLE", { requested, active: negotiation.active });
  }
  if (!validOutputNegotiation(negotiation) || negotiation.requested !== requested) {
    throw new RenderDeviceError("Canvas color-space negotiation could not be verified", "OUTPUT_COLOR_SPACE_UNVERIFIED", { requested });
  }
  if (canNegotiate && typeof device.getOutputColorSpaceNegotiation === "function") {
    const current = device.getOutputColorSpaceNegotiation();
    if (!matchesCanvasNegotiation(device, current, requested, negotiation.active)) {
      throw new RenderDeviceError("Canvas color-space negotiation could not be verified", "OUTPUT_COLOR_SPACE_UNVERIFIED", { requested });
    }
  }
  return negotiation.active;
}

function assertCanvasOutputColorSpace(device: RenderDevice, requested: RenderOutputColorSpace, active: RenderOutputColorSpace): void {
  if (typeof device.getOutputColorSpaceNegotiation !== "function") return;
  const current = device.getOutputColorSpaceNegotiation();
  if (current === undefined && active === "srgb" && typeof device.negotiateOutputColorSpace !== "function") return;
  if (!matchesCanvasNegotiation(device, current, requested, active)) {
    throw new RenderDeviceError("Canvas color space changed before output", "OUTPUT_COLOR_SPACE_UNVERIFIED", { active });
  }
}

export class OutputPass implements OutputPassLike, DisposableResource {
  private readonly modules = new Map<string, ShaderModule>();
  private readonly drawCache = new Map<string, { readonly geometry: Geometry; readonly pipeline: RenderPipeline }>();
  public disposed = false;

  constructor(private readonly device: RenderDevice) {
    encodedSurfaceRunners.set(this, (input, coverage, options, output, surface) => {
      this.executeImpl(input, coverage, options, output, surface);
    });
  }

  /**
   * @param input   linear-HDR scene target (attachment 0).
   * @param coverage BACKGROUND_COVERAGE source — either `input` itself (MRT
   *                 attachment 1 is sampled) or a single-attachment rgba8 target.
   * @param output  `"canvas"` presents to the default framebuffer.
   */
  execute(input: RenderTarget, coverage: RenderTarget | null, options: OutputPassOptions, output: RenderTarget | "canvas"): void {
    this.executeImpl(input, coverage, options, output);
  }

  private executeImpl(input: RenderTarget, coverage: RenderTarget | null, options: OutputPassOptions,
    output: RenderTarget | "canvas", surface?: EncodedDisplaySurfaceLease): void {
    if (this.disposed) throw new Error("OUTPUT_PASS_DISPOSED");
    // Claim the write before consulting caller-controlled options. A failed
    // rewrite must not leave a prior successful image readable as the new one.
    if (surface) {
      if (output === "canvas") throw new RenderDeviceError("An encoded display surface requires a render target", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
      beginEncodedDisplaySurfaceWrite(surface, this.device, output);
    }
    let surfaceWritten = false;
    try {
      const toneMapping = options.toneMapping === undefined ? DEFAULT_TONE_MAPPING : options.toneMapping;
      if (!Object.prototype.hasOwnProperty.call(TONE_MAP_OPERATOR_FUNCTIONS, toneMapping)) {
        throw new Error(`OUTPUT_TONE_MAPPING_UNSUPPORTED:${String(toneMapping)}`);
      }
      const requestedColorSpace = options.outputColorSpace === undefined
        ? (output === "canvas" ? this.device.getOutputColorSpaceNegotiation?.()?.requested : undefined) ?? "srgb"
        : options.outputColorSpace;
      const alphaMode = options.alphaMode === undefined ? "opaque" : options.alphaMode;
      if (requestedColorSpace !== "srgb" && requestedColorSpace !== "display-p3") {
        throw new Error(`OUTPUT_COLOR_SPACE_UNSUPPORTED:${String(requestedColorSpace)}`);
      }
      if (alphaMode !== "opaque" && alphaMode !== "straight" && alphaMode !== "premultiplied") {
        throw new Error(`OUTPUT_ALPHA_MODE_UNSUPPORTED:${String(alphaMode)}`);
      }
      const inputAlphaMode = options.inputAlphaMode;
      if (inputAlphaMode !== undefined && inputAlphaMode !== "premultiplied") {
        throw new RenderDeviceError("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED: expected premultiplied scene-linear opacity", "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED");
      }
      if (!Number.isFinite(options.exposure) || options.exposure < 0) {
        throw new Error(`OUTPUT_EXPOSURE_UNSUPPORTED:${String(options.exposure)}`);
      }
      if (typeof options.backgroundCoverage !== "boolean" || typeof options.dithering !== "boolean"
          || (options.fullCoverage !== undefined && typeof options.fullCoverage !== "boolean")) {
        throw new Error("OUTPUT_VARIANT_UNSUPPORTED");
      }
      const useCoverage = options.backgroundCoverage;
      const sceneTexture = input.colorTexture;
      const coverageTexture = useCoverage && coverage
        ? (coverage === input ? coverage.colorTextures?.[1] : coverage.colorTexture)
        : null;
      if (useCoverage && (!coverage || coverage.disposed || coverage.depthOnly || !coverageTexture
          || coverageTexture.disposed || coverageTexture === sceneTexture)) {
        throw new RenderDeviceError("Requested background coverage is unavailable", "OUTPUT_COVERAGE_UNAVAILABLE");
      }
      if (output === "canvas" && alphaMode !== "opaque") {
        const presentationAlpha = this.device.getPresentationAlphaMode?.();
        if (presentationAlpha !== alphaMode) {
          throw new Error(`OUTPUT_ALPHA_MODE_UNAVAILABLE:requested=${alphaMode},active=${presentationAlpha ?? "unverified"}`);
        }
      }
      // The same HDR alpha channel is also used as an opaque-background tone
      // coverage tag. Neither the texture format nor the requested canvas mode
      // establishes that RGB is associated with opacity: in particular, an
      // un-tone-mapped clear can have nonzero RGB with alpha zero, and post
      // effects can change that association. Do not guess.
      if (alphaMode !== "opaque" && inputAlphaMode !== "premultiplied") {
        throw new RenderDeviceError("OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE: alpha-preserving output requires a premultiplied scene-linear source", "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE");
      }
      if (alphaMode !== "opaque" && sceneTexture.colorSpace !== "linear") {
        throw new RenderDeviceError("OUTPUT_INPUT_COLOR_SPACE_UNAVAILABLE: alpha-preserving output requires a linear scene texture", "OUTPUT_INPUT_COLOR_SPACE_UNAVAILABLE");
      }
      if (alphaMode === "opaque" && inputAlphaMode !== undefined) {
        throw new RenderDeviceError("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED: opaque output uses the legacy coverage contract", "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED");
      }
      // Render-target textures currently describe only linear/sRGB color spaces.
      // Emitting P3 values into one would lose their primaries when sampled later.
      // A canvas has a separate, explicitly negotiated presentation color space.
      let assertSurface: (() => void) | undefined;
      if (surface) {
        if (output === "canvas" || requestedColorSpace !== "display-p3" || alphaMode === "premultiplied") {
          throw new RenderDeviceError("Encoded display surfaces require a P3 target with opaque or straight alpha", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
        }
        const target = output;
        const surfaceAlpha = alphaMode;
        assertSurface = () => assertEncodedDisplaySurface(surface, this.device, target, surfaceAlpha);
        assertSurface();
      } else if (output !== "canvas" && requestedColorSpace === "display-p3") {
        throw new RenderDeviceError(
          "Display-P3 output cannot be represented by a render-target texture",
          "OUTPUT_COLOR_SPACE_UNAVAILABLE",
          { requested: requestedColorSpace, destination: "render-target" }
        );
      }
      // Existing device implementations without the optional canvas negotiation
      // contract conservatively use sRGB.
      const outputColorSpace = output === "canvas"
        ? canvasOutputColorSpace(this.device, requestedColorSpace)
        : requestedColorSpace;
      if (output === "canvas" && alphaMode !== "opaque") {
        const presentationAlpha = this.device.getPresentationAlphaMode?.();
        if (presentationAlpha !== alphaMode) {
          throw new Error(`OUTPUT_ALPHA_MODE_UNAVAILABLE:requested=${alphaMode},active=${presentationAlpha ?? "unverified"}`);
        }
      }
      // Use the exact sampled texture for feedback checks and binding even if
      // a caller supplies an object with a stateful colorTexture accessor.
      if (output !== "canvas") {
        const attachedTextures = [output.colorTexture, ...(output.colorTextures ?? []), output.depthTexture];
        if (attachedTextures.includes(sceneTexture) || (coverageTexture !== null && attachedTextures.includes(coverageTexture))) {
          throw new RenderDeviceError("A draw cannot sample a texture attached for writing in the same pass",
            this.device.kind === "webgpu" ? "WEBGPU_ATTACHMENT_FEEDBACK" : "OUTPUT_ATTACHMENT_FEEDBACK", { label: "prd01-output" });
        }
      }
      const overlay = options.overlay ?? null;
      const overlayActive = overlay !== null && overlayEnabledAmounts(overlay);
      const vignette = options.vignette !== undefined && options.vignette.intensity > 0 ? options.vignette : null;
      const grade = outputColorGrade(options.colorGrade);
      const key: OutputVariantKey = {
        toneMapping,
        coverage: useCoverage,
        overlay: overlay !== null,
        vignette: vignette !== null,
        fullCoverage: options.fullCoverage === true && !useCoverage,
        outputColorSpace,
        alphaMode,
        colorGrade: grade !== null
      };
      const cacheKey = variantCacheKey(key);
      const shader = this.moduleFor(key).compile(this.device);

      const uniforms = new Map<string, UniformValue>();
      uniforms.set("u_scene", new TextureBinding({ name: "u_scene", texture: sceneTexture, required: true }));
      if (coverageTexture) {
        uniforms.set("u_coverage", new TextureBinding({ name: "u_coverage", texture: coverageTexture, required: true }));
      }
      uniforms.set("u_exposure", options.exposure);
      uniforms.set("u_dither", options.dithering ? 1 : 0);
      if (this.device.kind === "webgpu") {
        const outputHeight = output === "canvas" ? this.device.captureState().get("viewportHeight") : output.height;
        if ((typeof outputHeight !== "number" || !Number.isFinite(outputHeight) || outputHeight <= 0) && options.dithering) {
          throw new Error("OUTPUT_HEIGHT_UNAVAILABLE");
        }
        // WebGPU fragment coordinates start at the top; GLSL's dither is keyed
        // from the bottom of the actual output, which may differ from input size.
        uniforms.set("u_outputHeight", typeof outputHeight === "number" && Number.isFinite(outputHeight) && outputHeight > 0 ? outputHeight : 1);
      }
      if (vignette) {
        uniforms.set("u_vignette", [vignette.intensity, vignette.smoothness, vignette.roundness, input.width / Math.max(1, input.height)]);
        uniforms.set("u_vignetteColor", [vignette.color[0], vignette.color[1], vignette.color[2]]);
      }
      if (grade) {
        uniforms.set("u_gradeA", grade.a);
        uniforms.set("u_gradeB", grade.b);
      }
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
      // T0-04: restore the previously bound target — rebinding `input` leaves
      // the HDR source bound and misroutes every subsequent draw/capture.
      const previousTarget = this.device.getRenderTarget?.() ?? null;
      assertSurface?.();
      let drawFailed = false;
      let drawError: unknown;
      try {
        this.device.setRenderTarget(output === "canvas" ? null : output);
        assertSurface?.();
        if (output === "canvas") {
          assertCanvasOutputColorSpace(this.device, requestedColorSpace, outputColorSpace);
          if (alphaMode !== "opaque") {
            const presentationAlpha = this.device.getPresentationAlphaMode?.();
            if (presentationAlpha !== alphaMode) {
              throw new Error(`OUTPUT_ALPHA_MODE_UNAVAILABLE:requested=${alphaMode},active=${presentationAlpha ?? "unverified"}`);
            }
          }
        }
        this.device.draw(command);
      } catch (error) {
        drawFailed = true;
        drawError = error;
        throw error;
      } finally {
        try { this.device.setRenderTarget(previousTarget); }
        catch (error) {
          if (drawFailed) throw new AggregateError([drawError, error], "Output pass draw and target restoration failed");
          throw error;
        }
      }
      if (surface && output !== "canvas") {
        if (this.disposed) throw new Error("OUTPUT_PASS_DISPOSED");
        markEncodedDisplaySurfaceWritten(surface, this.device, output);
        surfaceWritten = true;
      }
    } finally {
      if (surface && !surfaceWritten) abortEncodedDisplaySurfaceWrite(surface);
    }
  }

  private moduleFor(key: OutputVariantKey): ShaderModule {
    const cacheKey = variantCacheKey(key);
    let module = this.modules.get(cacheKey);
    if (!module) {
      const options = {
        toneMapping: key.toneMapping,
        backgroundCoverage: key.coverage,
        overlay: key.overlay,
        vignette: key.vignette,
        fullCoverage: key.fullCoverage,
        outputColorSpace: key.outputColorSpace,
        alphaMode: key.alphaMode,
        ...(key.colorGrade ? { colorGrade: true } : {})
      };
      module = new ShaderModule({
        label: `prd01-output-${cacheKey}`,
        marker: "a3d.output",
        vertex: OUTPUT_VERTEX_GLSL,
        fragment: outputFragmentGlsl(options),
        ...createOutputWgsl(options)
      });
      this.modules.set(cacheKey, module);
    }
    return module;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    encodedSurfaceRunners.delete(this);
    for (const module of this.modules.values()) module.dispose();
    this.modules.clear();
    for (const cached of this.drawCache.values()) cached.geometry.dispose();
    this.drawCache.clear();
  }
}

/** Internal postprocess entry. Never re-export this from a public package barrel. */
export function executeOutputPassToEncodedDisplaySurface(pass: OutputPass, input: RenderTarget, coverage: RenderTarget | null,
  options: OutputPassOptions, output: RenderTarget, surface: EncodedDisplaySurfaceLease): void {
  const execute = encodedSurfaceRunners.get(pass);
  if (!execute) throw new Error("OUTPUT_PASS_DISPOSED");
  execute(input, coverage, options, output, surface);
}

const outputPassesByDevice = new WeakMap<RenderDevice, OutputPass>();

/** The device's one OutputPass (one shader-variant cache), shared by the no-chain route and the PostGraph v2 OUT stage. */
export function outputPassForDevice(device: RenderDevice): OutputPass {
  let pass = outputPassesByDevice.get(device);
  if (!pass || pass.disposed) {
    pass = new OutputPass(device);
    outputPassesByDevice.set(device, pass);
  }
  return pass;
}
