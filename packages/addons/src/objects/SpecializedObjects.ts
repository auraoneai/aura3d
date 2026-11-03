/** Optional scene objects built on Aura3D's existing sky, geometry and textures. */
import { geometry, material, sky, texture, type AuraAssetRef, type AuraCustomGeometrySpec, type AuraSceneNode, type AuraTextureRef, type TextureHandle } from "@aura3d/engine";
import { ShadowProjectionBuilder, createDayNightSky } from "@aura3d/rendering";

export type ObjectVec3 = readonly [number, number, number];
export type ObjectColor = readonly [number, number, number];

type GeometryBuilder = ReturnType<typeof geometry.custom>;

// The renderer supplies an OpenGL-style projection to custom materials, except
// in reversed-depth WebGPU frames, which hand programs a native zero-to-one
// projection and set the a3dZeroToOneProjection pipeline override. WebGPU uses
// a 0..1 depth clip range, so convert the homogeneous z coordinate otherwise.
const OBJECT_CLIP_WGSL = `
override a3dZeroToOneProjection: bool = false;
fn objectClip(position: vec3<f32>) -> vec4<f32> {
  let clip = aura.u_modelViewProjection * vec4<f32>(position, 1.0);
  return vec4<f32>(clip.xy, select(clip.z * 0.5 + clip.w * 0.5, clip.z, a3dZeroToOneProjection), clip.w);
}
`;

const OBJECT_POSITION_VERTEX_WGSL = `${OBJECT_CLIP_WGSL}
@vertex
fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return objectClip(position);
}
`;

const OBJECT_TEXTURE_VERTEX_WGSL = `${OBJECT_CLIP_WGSL}
struct TextureVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};
@vertex
fn vs_main(@location(0) position: vec3<f32>, @location(2) uv: vec2<f32>) -> TextureVertexOutput {
  var output: TextureVertexOutput;
  output.position = objectClip(position);
  output.uv = uv;
  return output;
}
`;

const GROUND_VERTEX_WGSL = `${OBJECT_CLIP_WGSL}
struct GroundVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) groundPosition: vec3<f32>,
};
@vertex
fn vs_main(@location(0) position: vec3<f32>) -> GroundVertexOutput {
  var output: GroundVertexOutput;
  output.position = objectClip(position);
  output.groundPosition = position;
  return output;
}
`;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) throw new RangeError(`${name} must be finite and fit in float32.`);
  return value;
}
function vec3(value: ObjectVec3, name: string): ObjectVec3 {
  if (!value || value.length !== 3) throw new RangeError(`${name} must be a vec3.`);
  return [finite(value[0], name), finite(value[1], name), finite(value[2], name)];
}
function color(value: ObjectColor, name: string): ObjectColor {
  const result = vec3(value, name);
  if (result.some((channel) => channel < 0 || channel > 1)) throw new RangeError(`${name} channels must be in [0, 1].`);
  return result;
}
function validBounds(bounds: ObjectBounds): ObjectBounds {
  const min = vec3(bounds.min, "bounds.min");
  const max = vec3(bounds.max, "bounds.max");
  if (min.some((value, axis) => Math.fround(value) >= Math.fround(max[axis]!))) throw new RangeError("Bounds must have positive float32 extent on every axis.");
  return { min, max };
}
function unitInterval(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${name} must be in [0, 1].`);
  return value;
}

export interface ObjectBounds { readonly min: ObjectVec3; readonly max: ObjectVec3; }

export interface GroundedSkyOptions {
  readonly name?: string;
  readonly hour?: number;
  readonly center?: ObjectVec3;
  readonly radius?: number;
  readonly segments?: number;
  /** Linear RGB; the outer edge fades towards the day/night horizon. */
  readonly groundColor?: ObjectColor;
  /** Optional equirectangular environment to project onto the dome and ground. */
  readonly panorama?: AuraTextureRef | AuraAssetRef<"texture">;
  /** Capture-camera height above the ground; required to project a panorama. */
  readonly cameraHeight?: number;
  readonly rings?: number;
}

export interface GroundedSky {
  readonly nodes: readonly AuraSceneNode[];
  readonly sky: ReturnType<typeof sky.gradient>;
  readonly ground: GeometryBuilder;
  readonly dayFactor: number;
}

/**
 * A gradient sky with a horizon-fading ground disc, or an equirectangular
 * panorama projected onto an inward dome, skirt and horizontal ground. The
 * panorama projection assumes a level capture camera at cameraHeight, is
 * bounded by radius and is not physical terrain. Textures remain caller-owned.
 * Ground materials supply both the GLSL and WGSL paths.
 */
export function createGroundedSky(options: GroundedSkyOptions = {}): GroundedSky {
  const hour = finite(options.hour ?? 12, "hour");
  const center = vec3(options.center ?? [0, 0, 0], "center");
  const radius = finite(options.radius ?? 500, "radius");
  if (radius <= 0 || radius > 100_000) throw new RangeError("radius must be greater than zero and no larger than 100000.");
  if ([0, 2].some((axis) => !Number.isFinite(Math.fround(center[axis]! + radius)) || Math.fround(center[axis]! + radius) === Math.fround(center[axis]!))) {
    throw new RangeError("radius must produce representable ground geometry around center.");
  }
  const segments = options.segments ?? 64;
  if (!Number.isInteger(segments) || segments < 3 || segments > 256) throw new RangeError("segments must be an integer from 3 to 256.");
  if (!options.panorama && (options.cameraHeight !== undefined || options.rings !== undefined)) throw new RangeError("cameraHeight and rings require a panorama.");
  if (options.panorama && options.groundColor !== undefined) throw new RangeError("groundColor cannot be combined with a panorama.");
  const ground = color(options.groundColor ?? [0.16, 0.17, 0.18], "groundColor");
  const state = createDayNightSky({ hour, starCount: 0, cloudCellCount: 0 });
  const skyNode = sky.gradient({ name: `${options.name ?? "grounded-sky"}-sky`, zenith: state.zenithColor, horizon: state.horizonColor, ground: linearToHex(ground) });
  if (options.panorama) {
    const ref = options.panorama;
    if (!(ref.kind === "aura-texture-ref" || (ref.kind === "aura-asset-ref" && ref.type === "texture"))) throw new TypeError("panorama must be an Aura texture handle or typed texture asset.");
    const cameraHeight = finite(options.cameraHeight ?? 1.6, "cameraHeight");
    if (cameraHeight <= 0 || cameraHeight >= radius) throw new RangeError("cameraHeight must be positive and less than radius.");
    const rings = options.rings ?? 16;
    if (!Number.isInteger(rings) || rings < 2 || rings > 128) throw new RangeError("rings must be an integer from 2 to 128.");
    const projected = projectedPanorama(center, radius, cameraHeight, segments, rings);
    const projectedMaterial = material.custom({
      glsl: {
        vertex: "out vec2 vPanoramaUV; void main() { vPanoramaUV = uv; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }",
        fragment: "in vec2 vPanoramaUV; out vec4 outColor; void main() { outColor = texture(panoramaMap, vPanoramaUV); }"
      },
      wgsl: {
        vertex: OBJECT_TEXTURE_VERTEX_WGSL,
        fragment: `
@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(u_panoramaMapTexture, u_panoramaMapSampler, uv);
}
`
      },
      uniforms: { panoramaMap: { type: "texture2d", value: ref } },
      side: "double", fog: false
    });
    const projectedNode = geometry.custom(projected, { name: `${options.name ?? "grounded-sky"}-ground`, material: projectedMaterial, castShadow: false, receiveShadow: false });
    return { sky: skyNode, ground: projectedNode, nodes: [skyNode.toJSON(), projectedNode.toJSON()], dayFactor: state.dayFactor };
  }
  const horizon = hexColor(state.horizonColor);
  const positions: number[] = [center[0], center[1], center[2]];
  const normals: number[] = [0, 1, 0];
  const indices: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = i * Math.PI * 2 / segments;
    positions.push(center[0] + Math.cos(angle) * radius, center[1], center[2] + Math.sin(angle) * radius);
    normals.push(0, 1, 0);
    indices.push(0, 1 + ((i + 1) % segments), 1 + i);
  }
  const groundGeometry: AuraCustomGeometrySpec = { kind: "aura-custom-geometry", positions, normals, indices };
  const groundMaterial = material.custom({
    glsl: {
      vertex: "out vec3 vGroundPosition; void main() { vGroundPosition = position; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }",
      fragment: "in vec3 vGroundPosition; out vec4 outColor; void main() { float t = smoothstep(0.0, 1.0, clamp(length(vGroundPosition.xz - groundCenter) / groundRadius, 0.0, 1.0)); outColor = vec4(mix(groundTint, horizonTint, t), 1.0); }"
    },
    wgsl: {
      vertex: GROUND_VERTEX_WGSL,
      fragment: `
@fragment
fn fs_main(@location(0) groundPosition: vec3<f32>) -> @location(0) vec4<f32> {
  let radial = clamp(length(groundPosition.xz - aura.u_groundCenter) / aura.u_groundRadius, 0.0, 1.0);
  let fade = smoothstep(0.0, 1.0, radial);
  return vec4<f32>(mix(aura.u_groundTint, aura.u_horizonTint, fade), 1.0);
}
`
    },
    uniforms: {
      groundCenter: { type: "vec2", value: [center[0], center[2]] },
      groundRadius: { type: "f32", value: radius },
      groundTint: { type: "vec3", value: ground },
      horizonTint: { type: "vec3", value: horizon }
    },
    side: "double",
    fog: false
  });
  const groundNode = geometry.custom(groundGeometry, { name: `${options.name ?? "grounded-sky"}-ground`, material: groundMaterial, castShadow: false, receiveShadow: false });
  return { sky: skyNode, ground: groundNode, nodes: [skyNode.toJSON(), groundNode.toJSON()], dayFactor: state.dayFactor };
}

/** Panorama rows run from zenith to horizon, down the skirt, then inward on the ground. */
function projectedPanorama(center: ObjectVec3, radius: number, height: number, segments: number, rings: number): AuraCustomGeometrySpec {
  const positions: number[] = []; const normals: number[] = []; const uvs: number[] = []; const indices: number[] = [];
  const rows = rings * 2 + 2;
  for (let row = 0; row < rows; row += 1) {
    let radial: number; let y: number; let elevation: number; let normalY: number; let normalRadial: number;
    if (row <= rings) {
      const polar = row * Math.PI / (2 * rings);
      radial = radius * Math.sin(polar); y = center[1] + height + radius * Math.cos(polar);
      elevation = Math.PI / 2 - polar; normalY = -Math.cos(polar); normalRadial = -Math.sin(polar);
    } else if (row === rings + 1) {
      radial = radius; y = center[1]; elevation = Math.atan2(-height, radius); normalY = 0; normalRadial = -1;
    } else {
      radial = radius * (1 - (row - rings - 1) / rings); y = center[1];
      elevation = Math.atan2(-height, radial); normalY = 1; normalRadial = 0;
    }
    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments; const angle = u * Math.PI * 2;
      const x = Math.cos(angle); const z = Math.sin(angle);
      positions.push(center[0] + x * radial, y, center[2] + z * radial);
      normals.push(x * normalRadial, normalY, z * normalRadial);
      uvs.push(u, 0.5 + elevation / Math.PI);
    }
  }
  for (let row = 0; row < rows - 1; row += 1) for (let column = 0; column < segments; column += 1) {
    const a = row * (segments + 1) + column; const b = a + segments + 1;
    // One triangle collapses at each pole; omit it.
    if (row !== 0) indices.push(a, b, a + 1);
    if (row !== rows - 2) indices.push(a + 1, b, b + 1);
  }
  return { kind: "aura-custom-geometry", positions, normals, uvs, indices };
}

function hexColor(hex: string): ObjectColor {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Day/night sky returned an invalid horizon color.");
  const linear = (channel: number): number => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return [linear(parseInt(hex.slice(1, 3), 16) / 255), linear(parseInt(hex.slice(3, 5), 16) / 255), linear(parseInt(hex.slice(5, 7), 16) / 255)];
}

function linearToHex(value: ObjectColor): string {
  const srgb = (channel: number): number => channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return `#${value.map((channel) => Math.round(srgb(channel) * 255).toString(16).padStart(2, "0")).join("")}`;
}

interface ShadowProjectionCommonOptions {
  readonly name?: string;
  /** Direction of light travel, toward the horizontal receiver. */
  readonly lightDirection: ObjectVec3;
  readonly receiverY?: number;
  readonly offset?: number;
  readonly color?: ObjectColor;
  readonly opacity?: number;
  /** Limits extremely shallow light projections (default 10000 world units). */
  readonly maxProjectionDistance?: number;
}

/** Legacy projected-bounds path. */
export interface ShadowProjectionObjectOptions extends ShadowProjectionCommonOptions {
  readonly casterBounds: ObjectBounds;
  readonly casterGeometry?: never;
}

/** Static triangle geometry is projected without filling its concavities or holes. */
export interface ShadowGeometryProjectionObjectOptions extends ShadowProjectionCommonOptions {
  readonly casterGeometry: AuraCustomGeometrySpec;
  readonly casterBounds?: never;
  /** Optional column-major affine transform from caster-local to world coordinates. */
  readonly casterMatrix?: readonly number[] | Float32Array;
  /** Optional bounded work limits, passed to the projection builder. */
  readonly maxTriangles?: number;
  readonly maxOverlapChecks?: number;
}

export interface ShadowProjectionObject {
  readonly node: GeometryBuilder;
  readonly geometry: AuraCustomGeometrySpec;
  /** Projected hull points for bounds input, or projected triangle vertices for geometry input. */
  readonly points: readonly ObjectVec3[];
  readonly bounds: ObjectBounds;
}

/**
 * Project either caster bounds or static triangle geometry onto a horizontal
 * receiver. Bounds input remains a planar hull approximation. Geometry input
 * preserves triangle coverage, including concavities and holes, and rejects
 * overlapping projected triangles instead of double-blending their alpha.
 * Geometry is a snapshot: update it explicitly after changing the caster or
 * its transform. Morphing, partial draw ranges and grouped materials are not
 * supported by the geometry path. Neither path replaces shadow maps.
 */
export function createShadowProjection(options: ShadowProjectionObjectOptions | ShadowGeometryProjectionObjectOptions): ShadowProjectionObject {
  const isGeometry = options.casterGeometry !== undefined;
  if (isGeometry && options.casterBounds !== undefined) throw new RangeError("Specify casterBounds or casterGeometry, not both.");
  const bounds = isGeometry ? undefined : validBounds(options.casterBounds!);
  const direction = vec3(options.lightDirection, "lightDirection");
  const length = Math.hypot(...direction);
  const receiverY = finite(options.receiverY ?? 0, "receiverY");
  const offset = finite(options.offset ?? 0.002, "offset");
  const maxDistance = finite(options.maxProjectionDistance ?? 10_000, "maxProjectionDistance");
  if (length <= 1e-12 || direction[1] >= 0 || Math.abs(direction[1] / length) < 1e-6) throw new RangeError("lightDirection must point down and intersect the receiver plane.");
  if (bounds && bounds.min[1] < receiverY) throw new RangeError("casterBounds must lie on or above the receiver plane.");
  if (offset < 0 || maxDistance <= 0) throw new RangeError("offset must be non-negative and maxProjectionDistance positive.");
  if (bounds && (bounds.max[1] - receiverY) * length / -direction[1] > maxDistance) throw new RangeError("Shadow projection exceeds maxProjectionDistance.");
  const tint = color(options.color ?? [0, 0, 0], "color");
  const opacity = unitInterval(options.opacity ?? 0.3, "opacity");
  let projection: { readonly points: readonly ObjectVec3[]; readonly bounds: ObjectBounds; readonly indices?: readonly number[] };
  if (isGeometry) {
    const input = options as ShadowGeometryProjectionObjectOptions;
    const caster = input.casterGeometry;
    if (!caster || caster.kind !== "aura-custom-geometry") throw new TypeError("casterGeometry must be an Aura custom geometry.");
    if (caster.topology !== undefined && caster.topology !== "triangles") throw new RangeError("casterGeometry requires triangle topology.");
    if (caster.drawRange || caster.groups?.length || caster.morphTargets?.length) {
      throw new RangeError("casterGeometry does not support draw ranges, groups or morph targets.");
    }
    const positionData = caster.positions;
    let positions: ArrayLike<number>;
    if (Array.isArray(positionData) && positionData.length > 0 && Array.isArray(positionData[0])) {
      if (positionData.length > 65_536) throw new RangeError("casterGeometry exceeds the vertex limit.");
      const flat: number[] = [];
      for (const point of positionData as readonly (readonly number[])[]) {
        if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) throw new RangeError("casterGeometry positions require finite vec3 tuples.");
        flat.push(point[0]!, point[1]!, point[2]!);
      }
      positions = flat;
    } else {
      positions = positionData as Float32Array | readonly number[];
    }
    // The triangle builder first quantizes the receiver plane. Validate the
    // offset against that actual plane, not against the unrounded input.
    const projectedY = Math.fround(receiverY);
    const placedY = Math.fround(projectedY + offset);
    if (!Number.isFinite(placedY) || (offset > 0 && placedY === projectedY)) {
      throw new RangeError("Shadow receiver offset must remain representable in float32.");
    }
    projection = new ShadowProjectionBuilder().projectTriangles({ positions, indices: caster.indices, matrix: input.casterMatrix,
      lightDirection: direction, receiverPlaneY: receiverY, maxProjectionDistance: maxDistance,
      maxTriangles: input.maxTriangles, maxOverlapChecks: input.maxOverlapChecks });
  } else {
    projection = new ShadowProjectionBuilder().projectBounds({ casterBounds: bounds!, lightDirection: direction, receiverPlaneY: receiverY });
  }
  if (projection.points.length < 3) throw new RangeError("Shadow projection is degenerate and has no area.");
  const positions: number[] = []; const normals: number[] = []; const indices: number[] = [];
  for (const point of projection.points) { positions.push(point[0], point[1] + offset, point[2]); normals.push(0, 1, 0); }
  if (projection.indices) indices.push(...projection.indices);
  else {
    // Builder's x/z hull is counterclockwise from below; reverse for +Y.
    for (let i = 1; i + 1 < projection.points.length; i += 1) indices.push(0, i + 1, i);
  }
  const shadowGeometry: AuraCustomGeometrySpec = { kind: "aura-custom-geometry", positions, normals, indices, dynamic: true };
  const shadowMaterial = material.custom({
    glsl: { fragment: "out vec4 outColor; void main() { outColor = vec4(shadowTint, shadowOpacity); }" },
    wgsl: {
      vertex: OBJECT_POSITION_VERTEX_WGSL,
      fragment: `
@fragment
fn fs_main() -> @location(0) vec4<f32> {
  return vec4<f32>(aura.u_shadowTint, aura.u_shadowOpacity);
}
`
    },
    uniforms: { shadowTint: { type: "vec3", value: tint }, shadowOpacity: { type: "f32", value: opacity } },
    transparent: true, depthWrite: false, side: "double", fog: false
  });
  return {
    node: geometry.custom(shadowGeometry, { name: options.name ?? (isGeometry ? "projected-geometry-shadow" : "projected-bounds-shadow"), material: shadowMaterial, castShadow: false, receiveShadow: false }),
    geometry: shadowGeometry,
    points: projection.points,
    bounds: projection.bounds
  };
}

export type SliceAxis = "x" | "y" | "z";
export interface VolumeSliceOptions {
  readonly name?: string;
  /** X-fastest scalar values, copied at construction. */
  readonly dimensions: readonly [number, number, number];
  readonly values: ArrayLike<number>;
  readonly axis?: SliceAxis;
  readonly index?: number;
  readonly bounds?: ObjectBounds;
  /** Scalar window mapped linearly to grayscale. */
  readonly window?: readonly [number, number];
  readonly opacity?: number;
}

/** Compatible with a mounted Aura runtime handle's setGeometry method. */
export interface VolumeSliceGeometry {
  readonly kind: "aura-custom-geometry";
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly dynamic: true;
}
export interface VolumeSliceHandle { setGeometry?(spec: VolumeSliceGeometry): unknown; }

/**
 * An editable 2D slice of a bounded scalar volume. A live data texture is owned
 * by the object, while the scene and any runtime handle remain caller-owned.
 * `setSlice` updates bound runtime geometry and uploads new pixels on the next
 * render; without a bound handle, use its returned geometry with setGeometry.
 */
export class VolumeSlice {
  readonly dimensions: readonly [number, number, number];
  readonly axis: SliceAxis;
  readonly bounds: ObjectBounds;
  private ownedTexture: TextureHandle | undefined;
  private ownedNode: GeometryBuilder | undefined;
  readonly width: number;
  readonly height: number;
  private values: Float32Array;
  private pixels: Uint8Array;
  private sliceIndex: number;
  private window: readonly [number, number];
  private opacity: number;
  private handle: VolumeSliceHandle | undefined;
  private disposed = false;

  constructor(options: VolumeSliceOptions) {
    const dimensions = options.dimensions;
    if (!dimensions || dimensions.length !== 3 || dimensions.some((n) => !Number.isInteger(n) || n < 1 || n > 1024)) throw new RangeError("dimensions must contain three integers from 1 to 1024.");
    const count = dimensions[0] * dimensions[1] * dimensions[2];
    if (!Number.isSafeInteger(count) || count > 1_000_000) throw new RangeError("VolumeSlice supports at most 1000000 samples.");
    if (options.values.length !== count) throw new RangeError(`values must contain exactly ${count} samples.`);
    this.dimensions = [dimensions[0], dimensions[1], dimensions[2]];
    this.axis = options.axis ?? "z";
    if (this.axis !== "x" && this.axis !== "y" && this.axis !== "z") throw new RangeError("axis must be x, y or z.");
    this.bounds = validBounds(options.bounds ?? { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] });
    this.sliceIndex = this.checkedIndex(options.index ?? 0);
    this.window = this.checkedWindow(options.window ?? [0, 1]);
    this.opacity = unitInterval(options.opacity ?? 1, "opacity");
    this.values = this.checkedValues(options.values);
    this.width = this.axis === "x" ? dimensions[2] : dimensions[0];
    this.height = this.axis === "y" ? dimensions[2] : dimensions[1];
    this.pixels = new Uint8Array(this.width * this.height * 4);
    this.fillPixels();
    this.ownedTexture = texture.data({ width: this.width, height: this.height, data: this.pixels, format: "rgba8", colorSpace: "linear" });
    try {
      const sliceMaterial = material.custom({
        glsl: {
          vertex: "out vec2 vSliceUV; void main() { vSliceUV = uv; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }",
          fragment: "in vec2 vSliceUV; out vec4 outColor; void main() { outColor = texture(sliceMap, vSliceUV); }"
        },
        wgsl: {
          vertex: OBJECT_TEXTURE_VERTEX_WGSL,
          fragment: `
@fragment
fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(u_sliceMapTexture, u_sliceMapSampler, uv);
}
`
        },
        uniforms: { sliceMap: { type: "texture2d", value: this.texture } },
        side: "double", transparent: true, depthWrite: false, fog: false
      });
      this.ownedNode = geometry.custom(this.geometry(), { name: options.name ?? "volume-slice", material: sliceMaterial, castShadow: false, receiveShadow: false });
    } catch (error) {
      this.texture.dispose();
      throw error;
    }
  }

  /** Owned references become unavailable after disposal. */
  get texture(): TextureHandle { this.assertLive(); return this.ownedTexture!; }
  get node(): GeometryBuilder { this.assertLive(); return this.ownedNode!; }
  get index(): number { this.assertLive(); return this.sliceIndex; }
  /** A copy, suitable for diagnostics without mutating the uploaded texture. */
  getPixels(): Uint8Array { this.assertLive(); return new Uint8Array(this.pixels); }
  bind(handle: VolumeSliceHandle): void {
    this.assertLive();
    if (!handle || typeof handle.setGeometry !== "function") throw new TypeError("VolumeSlice binding requires a setGeometry handle.");
    handle.setGeometry(this.geometry());
    this.handle = handle;
  }
  unbind(): void { this.handle = undefined; }
  setSlice(index: number): VolumeSliceGeometry {
    this.assertLive();
    const nextIndex = this.checkedIndex(index);
    const previous = this.sliceIndex;
    this.sliceIndex = nextIndex;
    const nextGeometry = this.geometry();
    try { this.handle?.setGeometry?.(nextGeometry); } catch (error) { this.sliceIndex = previous; throw error; }
    this.fillPixels(); this.texture.texture.update(this.pixels);
    return nextGeometry;
  }
  setWindow(window: readonly [number, number]): void {
    this.assertLive(); this.window = this.checkedWindow(window); this.fillPixels(); this.texture.texture.update(this.pixels);
  }
  setOpacity(opacity: number): void {
    this.assertLive(); this.opacity = unitInterval(opacity, "opacity"); this.fillPixels(); this.texture.texture.update(this.pixels);
  }
  setValues(values: ArrayLike<number>): void {
    this.assertLive(); this.values = this.checkedValues(values); this.fillPixels(); this.texture.texture.update(this.pixels);
  }
  dispose(): void {
    if (this.disposed) return;
    this.handle = undefined;
    this.ownedTexture?.dispose();
    this.ownedTexture = undefined;
    this.ownedNode = undefined;
    this.values = new Float32Array(0);
    this.pixels = new Uint8Array(0);
    this.disposed = true;
  }

  private assertLive(): void { if (this.disposed || this.ownedTexture?.texture.disposed) throw new Error("VolumeSlice has been disposed."); }
  private checkedIndex(index: number): number {
    const dimension = this.dimensions[this.axis === "x" ? 0 : this.axis === "y" ? 1 : 2];
    if (!Number.isInteger(index) || index < 0 || index >= dimension) throw new RangeError(`Slice index must be an integer in [0, ${dimension - 1}].`);
    return index;
  }
  private checkedWindow(window: readonly [number, number]): readonly [number, number] {
    if (!window || window.length !== 2) throw new RangeError("window must contain [min, max].");
    finite(window[0], "window minimum"); finite(window[1], "window maximum");
    if (window[0] >= window[1]) throw new RangeError("window maximum must exceed its minimum.");
    return [window[0], window[1]];
  }
  private checkedValues(values: ArrayLike<number>): Float32Array {
    const count = this.dimensions[0] * this.dimensions[1] * this.dimensions[2];
    if (values.length !== count) throw new RangeError(`values must contain exactly ${count} samples.`);
    const result = new Float32Array(count);
    for (let i = 0; i < count; i += 1) result[i] = finite(values[i]!, `Value ${i}`);
    return result;
  }
  private fillPixels(): void {
    const [nx, ny] = this.dimensions;
    const [low, high] = this.window;
    for (let v = 0; v < this.height; v += 1) for (let u = 0; u < this.width; u += 1) {
      const x = this.axis === "x" ? this.sliceIndex : u;
      const y = this.axis === "y" ? this.sliceIndex : v;
      const z = this.axis === "z" ? this.sliceIndex : this.axis === "x" ? u : v;
      const value = this.values[x + nx * (y + ny * z)]!;
      const gray = Math.round(Math.max(0, Math.min(1, (value - low) / (high - low))) * 255);
      const at = (u + v * this.width) * 4;
      this.pixels[at] = gray; this.pixels[at + 1] = gray; this.pixels[at + 2] = gray; this.pixels[at + 3] = Math.round(this.opacity * 255);
    }
  }
  private geometry(): VolumeSliceGeometry {
    const [x0, y0, z0] = this.bounds.min; const [x1, y1, z1] = this.bounds.max;
    const count = this.dimensions[this.axis === "x" ? 0 : this.axis === "y" ? 1 : 2];
    const fraction = count === 1 ? 0.5 : this.sliceIndex / (count - 1);
    let positions: readonly number[]; let normal: ObjectVec3;
    if (this.axis === "x") {
      const x = x0 + (x1 - x0) * fraction;
      positions = [x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0]; normal = [-1, 0, 0];
    } else if (this.axis === "y") {
      const y = y0 + (y1 - y0) * fraction;
      positions = [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]; normal = [0, -1, 0];
    } else {
      const z = z0 + (z1 - z0) * fraction;
      positions = [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]; normal = [0, 0, 1];
    }
    return { kind: "aura-custom-geometry", positions: Float32Array.from(positions), normals: Float32Array.from([...normal, ...normal, ...normal, ...normal]), uvs: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]), dynamic: true };
  }
}

export function createVolumeSlice(options: VolumeSliceOptions): VolumeSlice { return new VolumeSlice(options); }
