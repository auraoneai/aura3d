// PRD-07 P3-T1/T2 — C-21 SkyBackgroundPassLike + the background-phase draw.
// The fragment program mirrors the CPU evaluators; horizonRadiance uses the
// CPU path so cube captures and fog inscatter share the same values.

import { RenderDeviceError, type RenderDevice, type RenderShaderProgram, type RenderTarget } from "../RenderDevice";
import type { AuraSkySpecLike } from "../contracts/atmosphere";
import type { FrameContributorContext } from "../contracts/frameGraph";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import { Geometry } from "../Geometry";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import { invertMat4 } from "@aura3d/scene";
import { evaluateSky, skyFrame, skyProgramDefines, skyProgramKey, type SkyFrame } from "./SkyEval";
import { SKY_SHADER_MARKER, skyClipZ, skyClipZLiteral, skyFragmentSource, skyVertexSource } from "./sky.glsl";
import {
  GRADIENT_SKY_FOG_PORTABLE_BINDINGS,
  GRADIENT_SKY_PORTABLE_BINDINGS,
  gradientSkyWgsl
} from "./sky.wgsl";
import type { PackedFogUniforms } from "./HeightFog";
import { A3D_MAX_FOG_VOLUMES } from "./FogVolumes";
import { starVisibilityAtSunElevation } from "./StarField";
import { SKY_BAND_CAPACITY } from "./GradientSky";

/** P4-T7 — packed §8.4 fog state the sky fragment consumes when SKY_FOG=1. */
export interface SkyFogState {
  readonly uniforms: PackedFogUniforms;
  readonly volumes: Float32Array;
  readonly sunColor: readonly [number, number, number];
  readonly cameraPosition: readonly [number, number, number];
  readonly backgroundDistance: number;
}

/**
 * GU47 phase 2: the sky vertex stage reads `in vec2 a_pos`. `VertexFormat.P3`
 * names its attribute `a_position` / `position`, which the device could not
 * match to `a_pos`, so the input stayed unbound, every vertex read (0, 0, 0, 1)
 * and the triangle was degenerate: no sky (stars, clouds, gradient) ever drew.
 */
const SKY_FORMAT = new VertexFormat([{ semantic: "position", components: 2, offset: 0, shaderName: "a_pos" }]);

function fullscreenTriangle(): Geometry {
  const vertices = new VertexBuffer(SKY_FORMAT, 3);
  vertices.setAttribute(0, "position", [-1, -1]);
  vertices.setAttribute(1, "position", [3, -1]);
  vertices.setAttribute(2, "position", [-1, 3]);
  return new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
}

/** C-21 real: holds the sky spec, draws to the color target / cube faces. */
export class SkyBackgroundPass {
  private frame: SkyFrame = skyFrame(null);
  private spec: AuraSkySpecLike | null = null;
  private time = 0;
  private fog: SkyFogState | null = null;
  private readonly programs = new Map<string, RenderShaderProgram>();
  private programGeneration: number | undefined;
  private fullscreen: Geometry | null = null;

  constructor(private readonly device: RenderDevice) {}

  setSpec(spec: AuraSkySpecLike, time: number): void {
    this.spec = spec;
    this.time = time;
    this.frame = skyFrame(spec);
  }

  /** P4-T7 — affectsBackground fog, null clears (plain sky program variant). */
  setFog(fog: SkyFogState | null): void {
    this.fog = fog;
  }

  get skyFrame(): SkyFrame {
    return this.frame;
  }

  /** 8-azimuth horizon radiance (linear HDR), elevation 0. */
  horizonRadiance(_azimuthSamples: 8): Float32Array {
    const out = new Float32Array(8 * 3);
    for (let i = 0; i < 8; i++) {
      const phi = (i / 8) * Math.PI * 2;
      const rgb = evaluateSky(this.frame, [Math.sin(phi), 0, Math.cos(phi)]);
      out[i * 3] = rgb[0];
      out[i * 3 + 1] = rgb[1];
      out[i * 3 + 2] = rgb[2];
    }
    return out;
  }

  /** Draw the sky into `target` using `viewProjection` (forward VP). */
  renderToCubeFace(_face: 0 | 1 | 2 | 3 | 4 | 5, target: RenderTarget, viewProjection: Float32Array): void {
    // Switching WebGPU targets can flush a pending clear. Reject unsupported
    // skies before switching, then check again in drawSky for reentrant changes.
    this.assertNativeSky(this.frame, this.fog);
    // T0-34: restore the caller's target, never clobber to null.
    const prev = this.device.getRenderTarget?.() ?? null;
    this.device.setRenderTarget(target);
    try {
      this.drawSky(viewProjection);
    } finally {
      this.device.setRenderTarget(prev);
    }
  }

  /**
   * Fullscreen draw into the current target with the given VP matrix.
   * `depthTested` (after-opaque sky): the far-plane triangle (standard
   * z = 0.999999; reversed depth puts it at the reversed far plane, see
   * `skyClipZ`) depth-tests less-equal (greater-equal once the device remaps
   * it for reversed depth) against the bound forward depth, so it fills only
   * pixels no opaque geometry covered.
   */
  drawSky(viewProjection: Float32Array, depthTested = false): void {
    // Capture one frame before consulting the cache: a later spec update must
    // not turn an admitted draw into an unsupported native variant.
    const frame = this.frame;
    const fog = this.fog;
    const defines = skyProgramDefines(frame, { fog: fog !== null });
    this.assertNativeSky(frame, fog);
    const program = this.program(defines, skyClipZ(this.device.getDepthConvention?.()));
    const geometry = this.fullscreen ?? (this.fullscreen = fullscreenTriangle());
    const invVp = invert(viewProjection);
    const uniforms = skyUniforms(frame, invVp, this.time);
    if (fog) {
      const f = fog.uniforms;
      uniforms.set("u_fogA", f.fogA);
      uniforms.set("u_fogB", f.fogB);
      uniforms.set("u_fogColor", f.fogColor);
      uniforms.set("u_fogAbsorption", f.fogAbsorption);
      uniforms.set("u_fogMode", f.fogMode);
      uniforms.set("u_fogNear", f.fogNear);
      uniforms.set("u_fogFar", f.fogFar);
      uniforms.set("u_fogVolumes", fog.volumes);
      uniforms.set("u_cameraPosition", fog.cameraPosition);
      uniforms.set("u_sunColor", fog.sunColor);
      uniforms.set("u_fogBackgroundDistance", fog.backgroundDistance);
    }
    this.device.draw({
      label: "prd07.sky",
      topology: "triangles",
      vertexBuffer: geometry.vertexBuffer.upload(this.device),
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: 3,
      shader: program,
      uniforms,
      renderState: depthTested
        ? { depthTest: true, depthWrite: false, cullMode: "none", blend: false, depthCompare: "less-equal" }
        : { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" }
    });
  }

  private program(defines: ReturnType<typeof skyProgramDefines>, clipZ: number): RenderShaderProgram {
    if (this.programGeneration !== this.device.generation) {
      this.disposePrograms();
      this.programGeneration = this.device.generation;
    }
    const clipZLiteral = skyClipZLiteral(clipZ);
    // Standard keeps the historical program key; other far planes get their own program.
    const key = clipZLiteral === "0.999999" ? skyProgramKey(defines) : `${skyProgramKey(defines)}|z=${clipZLiteral}`;
    let p = this.programs.get(key);
    if (p?.disposed) {
      this.programs.delete(key);
      p = undefined;
    }
    if (!p) {
      p = this.device.createShaderProgram({
        label: key,
        vertex: skyVertexSource(clipZ),
        fragment: skyFragmentSource(defines),
        marker: SKY_SHADER_MARKER,
        ...(this.device.kind === "webgpu" ? {
          webgpu: gradientSkyWgsl(defines.fog, clipZLiteral),
          portableBindings: defines.fog ? GRADIENT_SKY_FOG_PORTABLE_BINDINGS : GRADIENT_SKY_PORTABLE_BINDINGS
        } : {})
      });
      this.programs.set(key, p);
    }
    return p;
  }

  private assertNativeSky(frame: SkyFrame, fog: SkyFogState | null): void {
    if (this.device.kind !== "webgpu") return;
    if (this.device.disposed) throw new RenderDeviceError("Render device is disposed", "DISPOSED_RESOURCE");
    if (this.device.contextLost) throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    assertNativeGradientSky(frame, skyProgramDefines(frame, { fog: fog !== null }), fog);
  }

  dispose(): void {
    try {
      this.disposePrograms();
    } finally {
      const geometry = this.fullscreen;
      this.fullscreen = null;
      geometry?.dispose();
    }
  }

  private disposePrograms(): void {
    const programs = [...this.programs.values()];
    this.programs.clear();
    const errors: unknown[] = [];
    for (const program of programs) {
      if (program.disposed) continue;
      try { program.dispose?.(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Sky shader disposal failed");
  }
}

/** Only enabled effects matter; zero-density stars and zero-coverage clouds
 * are the same plain variant as an omitted effect in the existing GLSL. */
function assertNativeGradientSky(frame: SkyFrame, defines: ReturnType<typeof skyProgramDefines>, fog: SkyFogState | null): void {
  const unsupported: string[] = [];
  if (frame.model !== "gradient" || !frame.gradient) unsupported.push(`model:${frame.model}`);
  if ((frame.gradient?.bands.length ?? 0) > 0) unsupported.push("bands");
  if (defines.stars) unsupported.push("stars");
  if (defines.clouds) unsupported.push("clouds");
  if (defines.moon) unsupported.push("moon");
  if (defines.fog) unsupported.push(...unsupportedNativeFog(fog));
  if (unsupported.length) {
    throw new RenderDeviceError(
      `WebGPU sky does not support ${unsupported.join(", ")}`,
      "WEBGPU_SKY_UNSUPPORTED",
      { unsupported }
    );
  }
}

function finiteGpuNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value));
}

function finiteVector(value: unknown, size: number): value is readonly number[] | Float32Array {
  if (!(Array.isArray(value) || value instanceof Float32Array) || value.length !== size) return false;
  for (const component of value) if (!finiteGpuNumber(component)) return false;
  return true;
}

/** Admit only inputs implemented by the native fog shader, before target switches or allocation. */
function unsupportedNativeFog(fog: SkyFogState | null): string[] {
  const f = fog?.uniforms;
  if (!fog || !f ||
    !finiteVector(f.fogA, 4) || !finiteVector(f.fogB, 4) ||
    !finiteVector(f.fogColor, 3) || !finiteVector(f.fogAbsorption, 3) ||
    !finiteVector(fog.cameraPosition, 3) || !finiteVector(fog.sunColor, 3) ||
    !finiteVector(fog.volumes, A3D_MAX_FOG_VOLUMES * 8) ||
    !finiteGpuNumber(f.fogMode) || !finiteGpuNumber(f.fogNear) || !finiteGpuNumber(f.fogFar) ||
    !finiteGpuNumber(fog.backgroundDistance)) {
    return ["background fog (invalid state)"];
  }
  const mode = f.fogMode;
  if (!Number.isInteger(mode) || mode < 0 || mode > 6) return [`background fog mode:${mode}`];
  if ((mode === 1 && (f.fogA[0] < 0 || f.fogA[1] < 0)) ||
    ((mode === 2 || mode === 3) && f.fogA[0] < 0) ||
    (mode === 5 && f.fogAbsorption.some((value) => value < 0))) {
    return ["background fog (negative density or absorption)"];
  }
  if (mode === 4) {
    const near = Math.fround(f.fogNear);
    const far = Math.fround(f.fogFar);
    if (far <= near || !Number.isFinite(Math.fround(far - near))) {
      return ["background fog (invalid linear range)"];
    }
  }
  if (mode >= 1 && mode <= 4 && Math.fround(f.fogB[2]) !== 0 && Math.abs(Math.fround(f.fogB[3])) >= 1) {
    return ["background fog (invalid sun anisotropy)"];
  }
  let hasVolume = false;
  for (let i = 0; i < A3D_MAX_FOG_VOLUMES; i++) {
    const offset = i * 8;
    const density = fog.volumes[offset + 7]!;
    if (density === 0) continue;
    const shape = fog.volumes[offset + 3]!;
    if (density < 0 || (shape !== 0 && shape !== 1) ||
      fog.volumes[offset + 4]! <= 0 || fog.volumes[offset + 5]! <= 0 || fog.volumes[offset + 6]! <= 0) {
      return ["background fog (invalid volume)"];
    }
    hasVolume = true;
  }
  // The existing atmosphere model only adds volume optical depth in modes
  // 1–3. Do not silently discard authored volumes in the other modes.
  if (hasVolume && (mode === 0 || mode >= 4)) return [`background fog volumes with mode:${mode}`];
  return [];
}

/** Background-phase pass handed to the frame graph each frame. */
export class SkyDrawPass extends BaseRenderPass {
  private spec: AuraSkySpecLike | null = null;
  private time = 0;
  private viewProjection: Float32Array = IDENTITY;

  constructor(private readonly device: RenderDevice) {
    // T0-34 / #1111: the background phase runs only after
    // EnvironmentBackgroundPass, which writes "environment-background-color"
    // (ENVIRONMENT_BACKGROUND_COLOR_RESOURCE, literal to keep that module out
    // of the vfx chunk). Writing `aura.scene.color` collided with the final
    // transparent pass on the v2 output path ("written by both" throw).
    super("prd07.sky.background", ["environment-background-color"], ["prd07.sky.background.color"]);
  }

  setSpec(spec: AuraSkySpecLike, time: number): void {
    this.spec = spec;
    this.time = time;
    skyPassFor(this.device).setSpec(spec, time);
  }

  /** P4-T7 — fog applied at backgroundDistance when the spec affects the background. */
  setFog(fog: SkyFogState | null): void {
    skyPassFor(this.device).setFog(fog);
  }

  setViewProjection(vp: Float32Array): void {
    this.viewProjection = vp;
  }

  execute(_context: RenderPassContext): void {
    if (!this.spec) return;
    skyPassFor(this.device).drawSky(this.viewProjection);
  }

  /** After-opaque fallback draw (no environment background this frame). */
  executeDepthTested(): void {
    if (!this.spec) return;
    skyPassFor(this.device).drawSky(this.viewProjection, true);
  }
}

const passes = new WeakMap<RenderDevice, SkyBackgroundPass>();

export function skyPassFor(device: RenderDevice): SkyBackgroundPass {
  let pass = passes.get(device);
  if (!pass) {
    pass = new SkyBackgroundPass(device);
    passes.set(device, pass);
  }
  return pass;
}

const drawPasses = new WeakMap<RenderDevice, SkyDrawPass>();

export function skyDrawPassFor(device: RenderDevice): SkyDrawPass {
  let pass = drawPasses.get(device);
  if (!pass) {
    pass = new SkyDrawPass(device);
    drawPasses.set(device, pass);
  }
  return pass;
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function invert(m: Float32Array): Float32Array {
  if (!m || m.length < 16) return IDENTITY;
  return new Float32Array(invertMat4(m as unknown as import("@aura3d/scene").Mat4) as unknown as Float32Array);
}

/** Pack the SkyFrame into the sky program's uniforms. */
export function skyUniforms(
  frame: SkyFrame,
  invViewProj: Float32Array,
  time: number
): Map<string, import("../RenderDevice").UniformValue> {
  const pre = frame.preetham;
  const grad = frame.gradient;
  const uniforms = new Map<string, import("../RenderDevice").UniformValue>();
  uniforms.set("u_invViewProj", invViewProj);
  uniforms.set("u_sunDirection", pre?.sunDirection ?? grad?.sunDirection ?? [0, 1, 0]);
  uniforms.set("u_sunE", pre?.sunE ?? 0);
  uniforms.set("u_sunfade", pre?.sunfade ?? (grad ? gradientSunfade(grad) : 1));
  uniforms.set("u_betaR", pre?.betaR ?? [0, 0, 0]);
  uniforms.set("u_betaM", pre?.betaM ?? [0, 0, 0]);
  uniforms.set("u_mieDirectionalG", pre?.mieDirectionalG ?? 0.8);
  uniforms.set("u_zenith", grad?.zenith ?? frame.color);
  uniforms.set("u_horizon", grad?.horizon ?? frame.color);
  uniforms.set("u_ground", grad?.ground ?? [0.12, 0.12, 0.13]);
  uniforms.set("u_exponent", grad?.exponent ?? 1.6);
  uniforms.set("u_horizonGlow", grad?.horizonGlow ?? 0.35);
  const bands = grad?.bands ?? [];
  uniforms.set("u_bandCount", bands.length);
  // GU47 phase 2: always upload the full declared arrays (vec4[4], vec3[4]).
  // A sky with no bands (sky-night-stars) used to send zero-length arrays,
  // which the device rejects; unused slots are zero and u_bandCount gates them.
  const bandParams = new Float32Array(SKY_BAND_CAPACITY * 4);
  const bandColors = new Float32Array(SKY_BAND_CAPACITY * 3);
  bands.slice(0, SKY_BAND_CAPACITY).forEach((b, i) => {
    bandParams.set([b.elevationDeg, b.widthDeg, b.intensity, 0], i * 4);
    bandColors.set([b.color[0], b.color[1], b.color[2]], i * 3);
  });
  uniforms.set("u_bandParams", bandParams);
  uniforms.set("u_bandColors", bandColors);
  uniforms.set("u_intensity", frame.intensity);
  uniforms.set("u_showSunDisc", pre?.showSunDisc ?? 1);
  uniforms.set("u_time", time);
  uniforms.set("u_starDensity", frame.stars.density);
  uniforms.set("u_starIntensity", frame.stars.intensity);
  uniforms.set("u_cloudCoverage", frame.clouds.coverage);
  uniforms.set("u_cloudDensity", frame.clouds.density);
  uniforms.set("u_cloudElevation", frame.clouds.elevation);
  uniforms.set("u_cloudScaleSpeed", [frame.clouds.scale, frame.clouds.speed]);
  uniforms.set("u_cloudTint", [frame.clouds.color[0], frame.clouds.color[1], frame.clouds.color[2]]);
  const moon = frame.moon;
  uniforms.set("u_moonDirection", moon?.direction ?? [0, -1, 0]);
  uniforms.set("u_moonColor", moon?.color ?? [0, 0, 0]);
  uniforms.set("u_moonPhase", moon?.phase ?? 0);
  uniforms.set("u_moonIntensity", moon?.intensity ?? 0);
  uniforms.set("u_moonAngularCos", moon ? Math.cos(moon.size) : 1);
  return uniforms;
}

/**
 * GU47 E-G (WP-7): the night term for gradient skies. The program shows stars
 * and the moon by `(1 - u_sunfade)`, and a gradient frame has no Preetham
 * `sunfade`, so the old constant 1 hid both on every gradient sky. Day (sun
 * above 6°) stays 1; night (no sun, or sun below the horizon) is 0.5, which
 * makes the star term `starfield * intensity * 1` — the intensity already
 * carries the StarField twilight fade (SkyEval).
 */
export function gradientSunfade(grad: { readonly sunDirection: readonly [number, number, number] | null }): number {
  const elevationDeg = grad.sunDirection
    ? (Math.asin(Math.max(-1, Math.min(1, grad.sunDirection[1]))) * 180) / Math.PI
    : -90;
  return 1 - 0.5 * starVisibilityAtSunElevation(elevationDeg);
}

/** View-projection for the current context's camera (identity when absent). */
export function contextViewProjection(ctx: FrameContributorContext): Float32Array {
  return ctx.camera?.viewProjectionMatrix ?? IDENTITY;
}
