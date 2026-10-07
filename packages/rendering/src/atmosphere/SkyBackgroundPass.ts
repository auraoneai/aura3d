// PRD-07 P3-T1/T2 — C-21 SkyBackgroundPassLike + the background-phase draw.
// The fragment program mirrors the CPU evaluators; horizonRadiance uses the
// CPU path so cube captures and fog inscatter share the same values.

import type { RenderDevice, RenderShaderProgram, RenderTarget } from "../RenderDevice";
import type { AuraSkySpecLike } from "../contracts/atmosphere";
import type { FrameContributorContext } from "../contracts/frameGraph";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import { Geometry } from "../Geometry";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import { invertMat4, identityMat4 } from "@aura3d/scene";
import { evaluateSky, skyFrame, skyProgramDefines, skyProgramKey, type SkyFrame } from "./SkyEval";
import { SKY_SHADER_MARKER, skyFragmentSource, skyVertexSource } from "./sky.glsl";
import type { PackedFogUniforms } from "./HeightFog";

/** P4-T7 — packed §8.4 fog state the sky fragment consumes when SKY_FOG=1. */
export interface SkyFogState {
  readonly uniforms: PackedFogUniforms;
  readonly volumes: Float32Array;
  readonly sunColor: readonly [number, number, number];
  readonly cameraPosition: readonly [number, number, number];
  readonly backgroundDistance: number;
}

let fullscreen: Geometry | null = null;

function fullscreenTriangle(): Geometry {
  if (fullscreen) return fullscreen;
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  fullscreen = new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
  return fullscreen;
}

/** C-21 real: holds the sky spec, draws to the color target / cube faces. */
export class SkyBackgroundPass {
  private frame: SkyFrame = skyFrame(null);
  private spec: AuraSkySpecLike | null = null;
  private time = 0;
  private fog: SkyFogState | null = null;
  private readonly programs = new Map<string, RenderShaderProgram>();

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
    this.device.setRenderTarget(target);
    try {
      this.drawSky(viewProjection);
    } finally {
      this.device.setRenderTarget(null);
    }
  }

  /** Fullscreen draw into the current target with the given VP matrix. */
  drawSky(viewProjection: Float32Array): void {
    const defines = skyProgramDefines(this.frame, { fog: this.fog !== null });
    const program = this.program(defines);
    const geometry = fullscreenTriangle();
    const invVp = invert(viewProjection);
    const uniforms = skyUniforms(this.frame, invVp, this.time);
    if (this.fog) {
      const f = this.fog.uniforms;
      uniforms.set("u_fogA", f.fogA);
      uniforms.set("u_fogB", f.fogB);
      uniforms.set("u_fogColor", f.fogColor);
      uniforms.set("u_fogAbsorption", f.fogAbsorption);
      uniforms.set("u_fogMode", f.fogMode);
      uniforms.set("u_fogNear", f.fogNear);
      uniforms.set("u_fogFar", f.fogFar);
      uniforms.set("u_fogVolumes", this.fog.volumes);
      uniforms.set("u_cameraPosition", this.fog.cameraPosition);
      uniforms.set("u_sunColor", this.fog.sunColor);
      uniforms.set("u_fogBackgroundDistance", this.fog.backgroundDistance);
    }
    this.device.draw({
      label: "prd07.sky",
      topology: "triangles",
      vertexBuffer: geometry.vertexBuffer.upload(this.device),
      vertexFormat: geometry.vertexBuffer.format,
      vertexCount: 3,
      shader: program,
      uniforms,
      renderState: { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" }
    });
  }

  private program(defines: ReturnType<typeof skyProgramDefines>): RenderShaderProgram {
    const key = skyProgramKey(defines);
    let p = this.programs.get(key);
    if (!p) {
      p = this.device.createShaderProgram({
        label: key,
        vertex: skyVertexSource(),
        fragment: skyFragmentSource(defines),
        marker: SKY_SHADER_MARKER
      });
      this.programs.set(key, p);
    }
    return p;
  }

  dispose(): void {
    for (const p of this.programs.values()) p.dispose?.();
    this.programs.clear();
  }
}

/** Background-phase pass handed to the frame graph each frame. */
export class SkyDrawPass extends BaseRenderPass {
  private spec: AuraSkySpecLike | null = null;
  private time = 0;
  private viewProjection: Float32Array = IDENTITY;

  constructor(private readonly device: RenderDevice) {
    super("prd07.sky.background", [], ["aura.scene.color"]);
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
  uniforms.set("u_sunfade", pre?.sunfade ?? 1);
  uniforms.set("u_betaR", pre?.betaR ?? [0, 0, 0]);
  uniforms.set("u_betaM", pre?.betaM ?? [0, 0, 0]);
  uniforms.set("u_mieDirectionalG", pre?.mieDirectionalG ?? 0.8);
  uniforms.set("u_zenith", grad?.zenith ?? frame.color);
  uniforms.set("u_horizon", grad?.horizon ?? frame.color);
  uniforms.set("u_ground", grad?.ground ?? [0.12, 0.12, 0.13]);
  uniforms.set("u_exponent", grad?.exponent ?? 1.6);
  uniforms.set("u_horizonGlow", grad?.horizonGlow ?? 0.35);
  uniforms.set("u_intensity", frame.intensity);
  uniforms.set("u_showSunDisc", pre?.showSunDisc ?? 1);
  uniforms.set("u_time", time);
  uniforms.set("u_starDensity", frame.stars.density);
  uniforms.set("u_starIntensity", frame.stars.intensity);
  uniforms.set("u_cloudCoverage", frame.clouds.coverage);
  uniforms.set("u_cloudDensity", frame.clouds.density);
  uniforms.set("u_cloudElevation", frame.clouds.elevation);
  uniforms.set("u_cloudScaleSpeed", [frame.clouds.scale, frame.clouds.speed]);
  const moon = frame.moon;
  uniforms.set("u_moonDirection", moon?.direction ?? [0, -1, 0]);
  uniforms.set("u_moonColor", moon?.color ?? [0, 0, 0]);
  uniforms.set("u_moonPhase", moon?.phase ?? 0);
  uniforms.set("u_moonIntensity", moon?.intensity ?? 0);
  uniforms.set("u_moonAngularCos", moon ? Math.cos(moon.size) : 1);
  return uniforms;
}

/** View-projection for the current context's camera (identity when absent). */
export function contextViewProjection(ctx: FrameContributorContext): Float32Array {
  return ctx.camera?.viewProjectionMatrix ?? IDENTITY;
}
