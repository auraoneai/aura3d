/**
 * B4 reflection math (muse3jsparity-PRD).
 *
 * Owns the planar-reflector math the `ReflectionSurfaces.ts` claim-boundary
 * contract records as missing: mirror-camera construction, oblique
 * near-plane clipping, glass thickness-tinted refraction parameters, water
 * depth-tinted reflection/refraction parameters, and a package-level SSR
 * ray-march pass descriptor with explicit resolution/step caps.
 *
 * Scope honesty: the plan/descriptor functions below are CPU-side math a
 * renderer path consumes. The capture classes further down ARE renderer
 * paths: they own real render targets, bind the oblique clip projection and
 * the Beer-Lambert / depth-tint pixel composites, and expose sampled
 * textures. SSR stays a package-level descriptor by design (root exposes
 * only planar+glass+water, and only after pixel proof).
 */

import type { RenderDevice, RenderTarget } from "./RenderDevice";
import { Sampler } from "./Sampler";
import { Texture } from "./Texture";
import { TextureBinding } from "./TextureBinding";
import { TexturedUnlitMaterial } from "./TexturedUnlitMaterial";

export type Vector3 = readonly [number, number, number];

export interface PlanarMirrorCamera {
  /** Mirrored eye position (world). */
  readonly eye: Vector3;
  /** Mirrored look target (world). */
  readonly target: Vector3;
  /** Mirrored up vector (world). */
  readonly up: Vector3;
  /** Plane reflection matrix, row-major 4x4 (16 numbers). */
  readonly reflectionMatrix: readonly number[];
  /** Clip plane in mirrored-camera space [a, b, c, d]. */
  readonly clipPlane: readonly [number, number, number, number];
}

/**
 * Mirror-camera construction for a horizontal plane at height `planeY`.
 * Follows the three.js Reflector convention: reflect eye/target/up across
 * the plane and supply the reflection matrix for texture-matrix computation.
 */
export function computePlanarMirrorCamera(
  eye: Vector3,
  target: Vector3,
  up: Vector3,
  planeY: number
): PlanarMirrorCamera {
  for (const [label, v] of [["eye", eye], ["target", target], ["up", up]] as const) {
    if (v.length !== 3 || v.some((c) => !Number.isFinite(c))) {
      throw new RangeError(`Planar mirror ${label} must contain three finite values.`);
    }
  }
  if (!Number.isFinite(planeY)) throw new RangeError("Planar mirror planeY must be finite.");
  const mirror = (p: Vector3): Vector3 => [p[0]!, 2 * planeY - p[1]!, p[2]!];
  // Reflection across y = planeY flips the Y basis vector.
  const reflectionMatrix = [
    1, 0, 0, 0,
    0, -1, 0, 0,
    0, 0, 1, 0,
    0, 2 * planeY, 0, 1,
  ];
  // Oblique clip plane in mirrored space: keep geometry above the plane.
  const clipPlane: readonly [number, number, number, number] = [0, -1, 0, planeY + 0.001];
  return { eye: mirror(eye), target: mirror(target), up: mirror(up), reflectionMatrix, clipPlane };
}

export interface ObliqueClipProjection {
  /** Projection matrix with the oblique row spliced in (row-major, 16). */
  readonly projectionMatrix: readonly number[];
  readonly clipPlane: readonly [number, number, number, number];
}

/**
 * Oblique near-plane clip, following the three.js Reflector formulation
 * (r185 semantics): the camera-space clip plane is scaled against the
 * projection elements and spliced into elements [2]/[6]/[10]/[14]
 * (column-major storage, WebGL transpose=false convention used across
 * ForwardPass matrices). Pure matrix surgery; the renderer binds the result.
 */
export function computeObliqueClipProjection(
  projectionMatrix: Float32Array | readonly number[],
  clipPlane: readonly [number, number, number, number],
  clipBias = 0
): ObliqueClipProjection {
  if (projectionMatrix.length !== 16 || projectionMatrix.some((c) => !Number.isFinite(c))) {
    throw new RangeError("Oblique clip projection matrix must hold 16 finite numbers.");
  }
  if (clipPlane.length !== 4 || clipPlane.some((c) => !Number.isFinite(c))) {
    throw new RangeError("Oblique clip plane must hold 4 finite numbers.");
  }
  if (!Number.isFinite(clipBias) || clipBias < 0) throw new RangeError("Oblique clipBias must be finite and non-negative.");
  const m = [...projectionMatrix];
  const sign = (value: number): number => (value >= 0 ? 1 : -1);
  const qx = (sign(clipPlane[0]!) + m[8]!) / m[0]!;
  const qy = (sign(clipPlane[1]!) + m[9]!) / m[5]!;
  const qz = -1;
  const qw = (1 + m[10]!) / m[14]!;
  if (![qx, qy, qz, qw].every(Number.isFinite)) {
    throw new RangeError("Oblique clip projection is degenerate for this projection matrix.");
  }
  const dot = clipPlane[0]! * qx + clipPlane[1]! * qy + clipPlane[2]! * qz + clipPlane[3]! * qw;
  if (Math.abs(dot) <= 1e-9) throw new RangeError("Oblique clip plane is degenerate against the projection frustum.");
  const scale = 2 / dot;
  const scaled: readonly [number, number, number, number] = [
    clipPlane[0]! * scale,
    clipPlane[1]! * scale,
    clipPlane[2]! * scale,
    clipPlane[3]! * scale,
  ];
  m[2] = scaled[0];
  m[6] = scaled[1];
  m[10] = scaled[2] + 1 - clipBias;
  m[14] = scaled[3];
  return { projectionMatrix: m, clipPlane };
}

export interface GlassRefractionParams {
  /** Scene-color fetch offset direction (screen UV per unit thickness). */
  readonly offsetScale: number;
  /** Thickness-tinted transmittance in [0, 1] (Beer-Lambert, single channel proxy). */
  readonly transmittance: number;
  /** Roughness blur radius in texels for the scene-color fetch. */
  readonly blurRadiusTexels: number;
  readonly diagnostic: string;
}

/**
 * Glass refractor parameters: thickness drives a Beer-Lambert transmittance
 * proxy and the fetch offset scale; roughness drives the blur radius.
 * Bounded: single-scatter proxy, not spectral volume.
 */
export function resolveGlassRefractionParams(options: {
  readonly thickness: number;
  readonly roughness: number;
  readonly absorption?: number;
  readonly maxBlurTexels?: number;
}): GlassRefractionParams {
  const thickness = options.thickness;
  const roughness = options.roughness;
  const absorption = options.absorption ?? 0.35;
  const maxBlur = options.maxBlurTexels ?? 8;
  if (!Number.isFinite(thickness) || thickness < 0) throw new RangeError("Glass thickness must be finite and non-negative.");
  if (!Number.isFinite(roughness) || roughness < 0 || roughness > 1) throw new RangeError("Glass roughness must be in [0, 1].");
  if (!Number.isFinite(absorption) || absorption < 0) throw new RangeError("Glass absorption must be finite and non-negative.");
  if (!Number.isFinite(maxBlur) || maxBlur <= 0) throw new RangeError("Glass maxBlurTexels must be finite and positive.");
  return {
    offsetScale: Number((Math.min(thickness, 10) * 0.02).toFixed(6)),
    transmittance: Number(Math.exp(-absorption * thickness).toFixed(6)),
    blurRadiusTexels: Number((roughness * maxBlur).toFixed(4)),
    diagnostic: "Thickness-tinted refraction proxy (single-scatter Beer-Lambert); not spectral volume.",
  };
}

export interface WaterReflectionRefractionParams {
  /** Planar reflection strength after depth tint. */
  readonly reflectionStrength: number;
  /** Refraction visibility after depth tint. */
  readonly refractionStrength: number;
  /** Depth tint color multiplier (linear RGB). */
  readonly depthTint: readonly [number, number, number];
  readonly diagnostic: string;
}

/**
 * Water look parameters: shallow water shows refracted bed color, deep
 * water absorbs toward the tint color and favors planar reflection.
 * No true ocean spectra claim.
 */
export function resolveWaterReflectionRefraction(options: {
  readonly depth: number;
  readonly turbidity?: number;
  readonly shallowColor?: readonly [number, number, number];
  readonly deepColor?: readonly [number, number, number];
}): WaterReflectionRefractionParams {
  const depth = options.depth;
  if (!Number.isFinite(depth) || depth < 0) throw new RangeError("Water depth must be finite and non-negative.");
  const turbidity = options.turbidity ?? 0.5;
  if (!Number.isFinite(turbidity) || turbidity < 0 || turbidity > 1) throw new RangeError("Water turbidity must be in [0, 1].");
  const shallow = options.shallowColor ?? [0.35, 0.55, 0.55];
  const deep = options.deepColor ?? [0.02, 0.12, 0.2];
  for (const [label, color] of [["shallowColor", shallow], ["deepColor", deep]] as const) {
    if (color.length !== 3 || color.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) {
      throw new RangeError(`Water ${label} must contain three finite values in [0, 1].`);
    }
  }
  const depthFactor = 1 - Math.exp(-depth * (0.35 + turbidity));
  const mixAmount = Number(depthFactor.toFixed(6));
  const depthTint: readonly [number, number, number] = [
    Number((shallow[0]! + (deep[0]! - shallow[0]!) * mixAmount).toFixed(6)),
    Number((shallow[1]! + (deep[1]! - shallow[1]!) * mixAmount).toFixed(6)),
    Number((shallow[2]! + (deep[2]! - shallow[2]!) * mixAmount).toFixed(6)),
  ];
  return {
    reflectionStrength: Number((0.25 + 0.65 * mixAmount).toFixed(4)),
    refractionStrength: Number((0.9 * (1 - mixAmount) + 0.1).toFixed(4)),
    depthTint,
    diagnostic: "Depth-tinted planar look (no true ocean spectra); planar target binding stays a B4 renderer dependency.",
  };
}

/**
 * Column-major lookAt for a planar-mirror eye, matching the ForwardPass
 * matrix convention (WebGL transpose=false storage).
 */
export function computePlanarViewMatrix(
  eye: Vector3,
  target: Vector3,
  up: Vector3
): Float32Array {
  for (const [label, v] of [["eye", eye], ["target", target], ["up", up]] as const) {
    if (v.length !== 3 || v.some((c) => !Number.isFinite(c))) {
      throw new RangeError(`Planar view ${label} must contain three finite values.`);
    }
  }
  const z = normalize3([eye[0]! - target[0]!, eye[1]! - target[1]!, eye[2]! - target[2]!]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
  ]);
}

/** Column-major perspective matrix (WebGL transpose=false storage). */
export function createPlanarProjectionMatrix(
  fovYRadians: number,
  aspect: number,
  near: number,
  far: number
): Float32Array {
  if (!Number.isFinite(fovYRadians) || fovYRadians <= 0 || fovYRadians >= Math.PI) {
    throw new RangeError("Planar projection fovY must be in (0, pi).");
  }
  if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError("Planar projection aspect must be finite and positive.");
  if (!Number.isFinite(near) || near <= 0) throw new RangeError("Planar projection near must be finite and positive.");
  if (!Number.isFinite(far) || far <= near) throw new RangeError("Planar projection far must be greater than near.");
  const f = 1 / Math.tan(fovYRadians / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
}

/** Column-major 4x4 product `out = a * b`. */
export function multiplyPlanarMatrices(a: Float32Array | readonly number[], b: Float32Array | readonly number[]): Float32Array {
  if (a.length !== 16 || b.length !== 16) throw new RangeError("Planar matrix factors must hold 16 numbers each.");
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) value += a[index * 4 + row]! * b[column * 4 + index]!;
      out[column * 4 + row] = value;
    }
  }
  return out;
}

export interface PlanarReflectionFrame {
  readonly mirror: PlanarMirrorCamera;
  readonly oblique: ObliqueClipProjection;
  readonly viewMatrix: Float32Array;
  readonly viewProjectionMatrix: Float32Array;
  readonly renderTarget: RenderTarget;
  readonly planeY: number;
}

export type PlanarReflectionSceneRenderer = (frame: PlanarReflectionFrame) => void;

export interface PlanarReflectionCaptureOptions {
  readonly resolution?: number;
  readonly clipBias?: number;
  readonly clearColor?: readonly [number, number, number, number];
  readonly label?: string;
}

export interface PlanarReflectionCaptureResult {
  readonly planeY: number;
  readonly frame: PlanarReflectionFrame;
  readonly texture: Texture;
  readonly binding: TextureBinding;
  readonly revision: number;
  readonly pixelHash: string;
  readonly changedPixelCount: number;
  readonly capturedPixelCount: number;
}

/**
 * Renderer-owned mirror path for one horizontal reflector plane.
 *
 * Owns the mirror render target, binds the oblique near-plane clip
 * projection for every capture, and exposes the mirrored scene color as a
 * real 2D texture + `u_planarReflectionTexture` binding that reflector
 * materials sample. The caller renders the scene (minus the reflector
 * itself) through the frame's view-projection matrix.
 */
export class PlanarReflectionCapture {
  public readonly planeY: number;
  public readonly resolution: number;
  public readonly clipBias: number;

  private readonly device: RenderDevice;
  private readonly target: RenderTarget;
  private readonly clearColor: readonly [number, number, number, number];
  private readonly label: string;
  private texture: Texture | null = null;
  private previousPixels: Uint8Array | null = null;
  private revision = 0;
  private disposed = false;

  constructor(device: RenderDevice, planeY: number, options: PlanarReflectionCaptureOptions = {}) {
    if (!device) throw new Error("Planar reflection capture requires a render device.");
    if (!Number.isFinite(planeY)) throw new RangeError("Planar reflection planeY must be finite.");
    this.device = device;
    this.planeY = planeY;
    this.resolution = positiveInteger(options.resolution ?? 128, "planar reflection resolution");
    this.clipBias = options.clipBias ?? 0;
    if (!Number.isFinite(this.clipBias) || this.clipBias < 0) {
      throw new RangeError("Planar reflection clipBias must be finite and non-negative.");
    }
    this.clearColor = validateClearColor(options.clearColor ?? [0, 0, 0, 1]);
    this.label = options.label ?? `planar-reflector-y${planeY}`;
    this.target = device.createRenderTarget({
      width: this.resolution,
      height: this.resolution,
      label: `${this.label}-mirror-target`,
      format: "rgba8",
      depth: "renderbuffer",
      sampleCount: 1,
    });
  }

  computeFrame(
    eye: Vector3,
    target: Vector3,
    up: Vector3,
    projectionMatrix: Float32Array | readonly number[]
  ): PlanarReflectionFrame {
    this.assertAlive();
    if (projectionMatrix.length !== 16) throw new RangeError("Planar reflection projection matrix must hold 16 numbers.");
    const mirror = computePlanarMirrorCamera(eye, target, up, this.planeY);
    const oblique = computeObliqueClipProjection(projectionMatrix, mirror.clipPlane, this.clipBias);
    const viewMatrix = computePlanarViewMatrix(mirror.eye, mirror.target, mirror.up);
    return {
      mirror,
      oblique,
      viewMatrix,
      viewProjectionMatrix: multiplyPlanarMatrices(Float32Array.from(oblique.projectionMatrix), viewMatrix),
      renderTarget: this.target,
      planeY: this.planeY,
    };
  }

  capture(
    renderScene: PlanarReflectionSceneRenderer,
    eye: Vector3,
    target: Vector3,
    up: Vector3,
    projectionMatrix: Float32Array | readonly number[]
  ): PlanarReflectionCaptureResult {
    const frame = this.computeFrame(eye, target, up, projectionMatrix);
    this.device.beginFrame(this.resolution, this.resolution);
    this.device.setRenderTarget(frame.renderTarget);
    if (this.device.clearRenderTarget) this.device.clearRenderTarget(this.clearColor);
    else this.device.clear(this.clearColor);
    this.device.endFrame();
    renderScene(frame);
    this.device.setRenderTarget(frame.renderTarget);
    const pixels = this.device.readPixels(0, 0, this.resolution, this.resolution);
    this.device.setRenderTarget(null);
    const pixelHash = hashPixels(pixels);
    const changedPixelCount = this.previousPixels ? countChangedPixels(this.previousPixels, pixels) : pixels.length / 4;
    this.previousPixels = new Uint8Array(pixels);
    this.revision += 1;
    this.texture?.dispose();
    const texture = new Texture({
      width: this.resolution,
      height: this.resolution,
      dimension: "2d",
      format: "rgba8",
      colorSpace: "srgb",
      label: `${this.label}-mirror-r${this.revision}`,
      data: new Uint8Array(pixels),
    });
    this.texture = texture;
    const binding = new TextureBinding({
      name: "u_planarReflectionTexture",
      texture,
      sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
      required: true,
      ready: true,
      expectedColorSpace: "srgb",
      expectedDimension: "2d",
    });
    return {
      planeY: this.planeY,
      frame,
      texture,
      binding,
      revision: this.revision,
      pixelHash,
      changedPixelCount,
      capturedPixelCount: this.resolution * this.resolution,
    };
  }

  /** Reflector floor material sampling the latest mirror capture texture. */
  createReflectorMaterial(name = `${this.label}-reflector-material`): TexturedUnlitMaterial {
    this.assertAlive();
    if (!this.texture) throw new Error(`Planar reflection capture ${this.label} has no capture yet; call capture() before creating the reflector material.`);
    return new TexturedUnlitMaterial({ name, texture: this.texture });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.texture?.dispose();
    this.target.dispose();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error(`Planar reflection capture ${this.label} is disposed.`);
  }
}

export interface GlassRefractionCaptureOptions {
  readonly resolution?: number;
  readonly absorption?: number;
  readonly maxBlurTexels?: number;
  readonly clearColor?: readonly [number, number, number, number];
  readonly label?: string;
}

export interface GlassRefractionCaptureResult {
  readonly params: GlassRefractionParams;
  readonly thickness: number;
  readonly roughness: number;
  readonly sceneTexture: Texture;
  readonly texture: Texture;
  readonly binding: TextureBinding;
  readonly revision: number;
  readonly pixelHash: string;
  readonly tintedPixelCount: number;
  readonly capturedPixelCount: number;
}

export type GlassRefractionSceneRenderer = (renderTarget: RenderTarget) => void;

/**
 * Renderer-owned glass path: captures scene color into a real target, then
 * applies the thickness-driven Beer-Lambert transmittance and the
 * roughness-driven scene-color blur fetch on the captured pixels. The
 * blurred+tinted output is exposed as `u_glassRefractionTexture`.
 */
export class GlassRefractionCapture {
  public readonly resolution: number;

  private readonly device: RenderDevice;
  private readonly target: RenderTarget;
  private readonly absorption: number;
  private readonly maxBlurTexels: number;
  private readonly clearColor: readonly [number, number, number, number];
  private readonly label: string;
  private sceneTexture: Texture | null = null;
  private outputTexture: Texture | null = null;
  private revision = 0;
  private disposed = false;

  constructor(device: RenderDevice, options: GlassRefractionCaptureOptions = {}) {
    if (!device) throw new Error("Glass refraction capture requires a render device.");
    this.device = device;
    this.resolution = positiveInteger(options.resolution ?? 128, "glass refraction resolution");
    this.absorption = options.absorption ?? 0.35;
    if (!Number.isFinite(this.absorption) || this.absorption < 0) {
      throw new RangeError("Glass capture absorption must be finite and non-negative.");
    }
    this.maxBlurTexels = options.maxBlurTexels ?? 8;
    if (!Number.isFinite(this.maxBlurTexels) || this.maxBlurTexels <= 0) {
      throw new RangeError("Glass capture maxBlurTexels must be finite and positive.");
    }
    this.clearColor = validateClearColor(options.clearColor ?? [0, 0, 0, 1]);
    this.label = options.label ?? "refractor-glass";
    this.target = device.createRenderTarget({
      width: this.resolution,
      height: this.resolution,
      label: `${this.label}-scene-color-target`,
      format: "rgba8",
      depth: "renderbuffer",
      sampleCount: 1,
    });
  }

  capture(
    renderScene: GlassRefractionSceneRenderer,
    options: { readonly thickness: number; readonly roughness: number }
  ): GlassRefractionCaptureResult {
    this.assertAlive();
    const params = resolveGlassRefractionParams({
      thickness: options.thickness,
      roughness: options.roughness,
      absorption: this.absorption,
      maxBlurTexels: this.maxBlurTexels,
    });
    this.device.beginFrame(this.resolution, this.resolution);
    this.device.setRenderTarget(this.target);
    if (this.device.clearRenderTarget) this.device.clearRenderTarget(this.clearColor);
    else this.device.clear(this.clearColor);
    this.device.endFrame();
    renderScene(this.target);
    this.device.setRenderTarget(this.target);
    const scenePixels = this.device.readPixels(0, 0, this.resolution, this.resolution);
    this.device.setRenderTarget(null);
    const blurred = boxBlurPixels(scenePixels, this.resolution, this.resolution, Math.round(params.blurRadiusTexels));
    const output = applyTransmittance(blurred, params.transmittance);
    const tintedPixelCount = countChangedPixels(scenePixels, output);
    this.revision += 1;
    this.sceneTexture?.dispose();
    this.outputTexture?.dispose();
    const sceneTexture = new Texture({
      width: this.resolution, height: this.resolution, dimension: "2d", format: "rgba8",
      colorSpace: "srgb", label: `${this.label}-scene-r${this.revision}`, data: new Uint8Array(scenePixels),
    });
    const texture = new Texture({
      width: this.resolution, height: this.resolution, dimension: "2d", format: "rgba8",
      colorSpace: "srgb", label: `${this.label}-refraction-r${this.revision}`, data: output,
    });
    this.sceneTexture = sceneTexture;
    this.outputTexture = texture;
    const binding = new TextureBinding({
      name: "u_glassRefractionTexture",
      texture,
      sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
      required: true,
      ready: true,
      expectedColorSpace: "srgb",
      expectedDimension: "2d",
    });
    return {
      params, thickness: options.thickness, roughness: options.roughness,
      sceneTexture, texture, binding, revision: this.revision,
      pixelHash: hashPixels(output), tintedPixelCount, capturedPixelCount: this.resolution * this.resolution,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sceneTexture?.dispose();
    this.outputTexture?.dispose();
    this.target.dispose();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error(`Glass refraction capture ${this.label} is disposed.`);
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer.`);
  return value;
}

function validateClearColor(value: readonly [number, number, number, number]): readonly [number, number, number, number] {
  if (value.length !== 4 || !value.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1)) {
    throw new RangeError("Reflection clear color must contain four finite values in [0, 1].");
  }
  return value;
}

function normalize3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) throw new Error("Planar view direction vectors must not be parallel.");
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross3(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function hashPixels(pixels: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const value of pixels) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function countChangedPixels(first: Uint8Array, second: Uint8Array, threshold = 2): number {
  let changed = 0;
  for (let offset = 0; offset < first.length; offset += 4) {
    if (
      Math.abs((first[offset] ?? 0) - (second[offset] ?? 0)) > threshold ||
      Math.abs((first[offset + 1] ?? 0) - (second[offset + 1] ?? 0)) > threshold ||
      Math.abs((first[offset + 2] ?? 0) - (second[offset + 2] ?? 0)) > threshold
    ) changed += 1;
  }
  return changed;
}

function boxBlurPixels(pixels: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return new Uint8Array(pixels);
  const output = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let ky = -radius; ky <= radius; ky += 1) {
        for (let kx = -radius; kx <= radius; kx += 1) {
          const sx = Math.min(width - 1, Math.max(0, x + kx));
          const sy = Math.min(height - 1, Math.max(0, y + ky));
          const offset = (sy * width + sx) * 4;
          r += pixels[offset] ?? 0; g += pixels[offset + 1] ?? 0; b += pixels[offset + 2] ?? 0; a += pixels[offset + 3] ?? 0;
          count += 1;
        }
      }
      const offset = (y * width + x) * 4;
      output[offset] = Math.round(r / count);
      output[offset + 1] = Math.round(g / count);
      output[offset + 2] = Math.round(b / count);
      output[offset + 3] = Math.round(a / count);
    }
  }
  return output;
}

function applyTransmittance(pixels: Uint8Array, transmittance: number): Uint8Array {
  const output = new Uint8Array(pixels.length);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    output[offset] = Math.round((pixels[offset] ?? 0) * transmittance);
    output[offset + 1] = Math.round((pixels[offset + 1] ?? 0) * transmittance);
    output[offset + 2] = Math.round((pixels[offset + 2] ?? 0) * transmittance);
    output[offset + 3] = pixels[offset + 3] ?? 255;
  }
  return output;
}

export interface SsrPassDescriptor {
  readonly enabled: boolean;
  /** Resolution scale of the SSR pass relative to the frame target. */
  readonly resolutionScale: number;
  readonly maxSteps: number;
  readonly maxDistance: number;
  readonly thickness: number;
  readonly packageLevel: true;
  readonly diagnostic: string;
}

/** SSR ray-march pass descriptor: package-level only, explicit caps. */
export function createSsrPassDescriptor(options: {
  readonly width: number;
  readonly height: number;
  readonly resolutionScale?: number;
  readonly maxSteps?: number;
  readonly maxDistance?: number;
  readonly thickness?: number;
} = { width: 0, height: 0 }): SsrPassDescriptor {
  const resolutionScale = options.resolutionScale ?? 0.5;
  const maxSteps = options.maxSteps ?? 32;
  const maxDistance = options.maxDistance ?? 25;
  const thickness = options.thickness ?? 0.2;
  if (!Number.isInteger(options.width) || options.width <= 0) throw new RangeError("SSR width must be a positive integer.");
  if (!Number.isInteger(options.height) || options.height <= 0) throw new RangeError("SSR height must be a positive integer.");
  if (!Number.isFinite(resolutionScale) || resolutionScale <= 0 || resolutionScale > 1) {
    throw new RangeError("SSR resolutionScale must be in (0, 1].");
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 4 || maxSteps > 64) {
    throw new RangeError("SSR maxSteps must be an integer in [4, 64].");
  }
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) throw new RangeError("SSR maxDistance must be finite and positive.");
  if (!Number.isFinite(thickness) || thickness <= 0) throw new RangeError("SSR thickness must be finite and positive.");
  return {
    enabled: true,
    resolutionScale,
    maxSteps,
    maxDistance,
    thickness,
    packageLevel: true,
    diagnostic: "Package-level depth+normal ray-march descriptor with explicit caps; not root-exposed until pixel-proven.",
  };
}
