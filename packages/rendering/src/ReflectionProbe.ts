import type { EnvironmentLightingOptions } from "./ForwardPass";
import type { RenderDevice, RenderTarget } from "./RenderDevice";
import { Sampler } from "./Sampler";
import { Texture, type TextureCubeFace } from "./Texture";
import { TextureBinding } from "./TextureBinding";

export interface ReflectionProbe {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly radius: number;
  readonly intensity: number;
}

export interface CubeCameraReflectionCaptureOptions {
  readonly resolution?: number;
  readonly near?: number;
  readonly far?: number;
  readonly sampleCount?: number;
  readonly clearColor?: readonly [number, number, number, number];
}

export interface CubeCameraReflectionFace {
  readonly index: number;
  readonly face: TextureCubeFace;
  readonly direction: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly viewMatrix: Float32Array;
  readonly projectionMatrix: Float32Array;
  readonly viewProjectionMatrix: Float32Array;
  readonly renderTarget: RenderTarget;
}

export interface CubeCameraReflectionCaptureResult {
  readonly probe: ReflectionProbe;
  readonly texture: Texture;
  readonly binding: TextureBinding;
  readonly environmentLighting: EnvironmentLightingOptions;
  readonly revision: number;
  readonly facePixelHashes: readonly string[];
  readonly changedFaceCount: number;
  readonly capturedPixelCount: number;
}

export type CubeCameraReflectionFaceRenderer = (face: CubeCameraReflectionFace) => void;

const CUBE_CAMERA_FACES: readonly {
  readonly face: TextureCubeFace;
  readonly direction: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}[] = [
  { face: "px", direction: [1, 0, 0], up: [0, -1, 0] },
  { face: "nx", direction: [-1, 0, 0], up: [0, -1, 0] },
  { face: "py", direction: [0, 1, 0], up: [0, 0, 1] },
  { face: "ny", direction: [0, -1, 0], up: [0, 0, -1] },
  { face: "pz", direction: [0, 0, 1], up: [0, -1, 0] },
  { face: "nz", direction: [0, 0, -1], up: [0, -1, 0] }
];

export function createReflectionProbe(probe: ReflectionProbe): ReflectionProbe {
  if (!probe.id.trim()) throw new Error("ReflectionProbe id is required.");
  if (probe.position.length !== 3 || !probe.position.every(Number.isFinite)) {
    throw new Error("ReflectionProbe position must contain three finite values.");
  }
  if (!Number.isFinite(probe.radius) || probe.radius <= 0) throw new Error("ReflectionProbe radius must be positive.");
  if (!Number.isFinite(probe.intensity) || probe.intensity < 0) throw new Error("ReflectionProbe intensity must be non-negative.");
  return probe;
}

/**
 * Owns the six render targets and cubemap texture for a live reflection probe.
 *
 * The callback renders the scene once for each canonical cubemap camera. The
 * reflective object itself should be excluded from those renders to avoid
 * recursive feedback. Captured pixels are copied into a real cube Texture and
 * exposed through the same environment-cubemap binding consumed by PBR.
 */
export class CubeCameraReflectionCapture {
  public readonly probe: ReflectionProbe;
  public readonly resolution: number;
  public readonly near: number;
  public readonly far: number;
  public readonly sampleCount: number;

  private readonly device: RenderDevice;
  private readonly targets: readonly RenderTarget[];
  private readonly clearColor: readonly [number, number, number, number];
  private texture: Texture | null = null;
  private previousFacePixelHashes: readonly string[] = [];
  private revision = 0;
  private disposed = false;

  constructor(device: RenderDevice, probe: ReflectionProbe, options: CubeCameraReflectionCaptureOptions = {}) {
    this.device = device;
    this.probe = createReflectionProbe(probe);
    this.resolution = positiveInteger(options.resolution ?? 128, "cube reflection resolution");
    this.near = positiveFinite(options.near ?? 0.05, "cube reflection near plane");
    this.far = positiveFinite(options.far ?? this.probe.radius, "cube reflection far plane");
    if (this.far <= this.near) throw new RangeError("cube reflection far plane must be greater than near plane.");
    this.sampleCount = positiveInteger(options.sampleCount ?? 1, "cube reflection sample count");
    this.clearColor = validateClearColor(options.clearColor ?? [0, 0, 0, 1]);
    this.targets = CUBE_CAMERA_FACES.map(({ face }) => device.createRenderTarget({
      width: this.resolution,
      height: this.resolution,
      label: `${this.probe.id}-cube-${face}`,
      format: "rgba8",
      depth: "renderbuffer",
      sampleCount: this.sampleCount
    }));
  }

  capture(renderFace: CubeCameraReflectionFaceRenderer): CubeCameraReflectionCaptureResult {
    this.assertAlive();
    const projectionMatrix = perspectiveMatrix(Math.PI / 2, 1, this.near, this.far);
    const facePixels: Uint8Array[] = [];

    for (const [index, descriptor] of CUBE_CAMERA_FACES.entries()) {
      const target = this.targets[index]!;
      const targetPosition = add3(this.probe.position, descriptor.direction);
      const viewMatrix = lookAtMatrix(this.probe.position, targetPosition, descriptor.up);
      this.device.beginFrame(this.resolution, this.resolution);
      this.device.setRenderTarget(target);
      if (this.device.clearRenderTarget) this.device.clearRenderTarget(this.clearColor);
      else this.device.clear(this.clearColor);
      this.device.endFrame();
      renderFace({
        index,
        ...descriptor,
        position: this.probe.position,
        viewMatrix,
        projectionMatrix,
        viewProjectionMatrix: multiplyMatrix(projectionMatrix, viewMatrix),
        renderTarget: target
      });
      this.device.setRenderTarget(target);
      facePixels.push(this.device.readPixels(0, 0, this.resolution, this.resolution));
    }
    this.device.setRenderTarget(null);

    const hashes = facePixels.map(hashPixels);
    const changedFaceCount = this.previousFacePixelHashes.length === 0
      ? hashes.length
      : hashes.reduce((count, hash, index) => count + (hash === this.previousFacePixelHashes[index] ? 0 : 1), 0);
    this.previousFacePixelHashes = hashes;
    this.revision += 1;
    this.texture?.dispose();
    this.texture = new Texture({
      width: this.resolution,
      height: this.resolution,
      dimension: "cube",
      format: "rgba8",
      colorSpace: "linear",
      label: `${this.probe.id}-cube-capture-r${this.revision}`,
      cubeFaces: CUBE_CAMERA_FACES.map(({ face }, index) => ({
        face,
        mipLevels: [{ width: this.resolution, height: this.resolution, data: facePixels[index]! }]
      }))
    });
    const binding = new TextureBinding({
      name: "u_environmentCubeMapTexture",
      texture: this.texture,
      sampler: new Sampler({
        minFilter: "linear",
        magFilter: "linear",
        addressU: "clamp-to-edge",
        addressV: "clamp-to-edge"
      }),
      required: true,
      ready: true,
      expectedColorSpace: "linear",
      expectedDimension: "cube"
    });
    const environmentLighting: EnvironmentLightingOptions = {
      color: [0, 0, 0],
      intensity: 0,
      environmentCubeMapTexture: binding,
      environmentMapIntensity: this.probe.intensity,
      environmentMapSpecularIntensity: this.probe.intensity,
      environmentMapMipCount: 1,
      environmentMapEncoding: "linear"
    };
    return {
      probe: this.probe,
      texture: this.texture,
      binding,
      environmentLighting,
      revision: this.revision,
      facePixelHashes: hashes,
      changedFaceCount,
      capturedPixelCount: this.resolution * this.resolution * CUBE_CAMERA_FACES.length
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.texture?.dispose();
    for (const target of this.targets) target.dispose();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error(`Cube camera reflection capture ${this.probe.id} is disposed.`);
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer.`);
  return value;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive.`);
  return value;
}

function validateClearColor(value: readonly [number, number, number, number]): readonly [number, number, number, number] {
  if (value.length !== 4 || !value.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1)) {
    throw new RangeError("cube reflection clear color must contain four finite values in [0, 1].");
  }
  return value;
}

function add3(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function perspectiveMatrix(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0
  ]);
}

function lookAtMatrix(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
  up: readonly [number, number, number]
): Float32Array {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1
  ]);
}

function multiplyMatrix(a: Float32Array, b: Float32Array): Float32Array {
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

function normalize3(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) throw new Error("Cube camera direction vectors must not be parallel.");
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross3(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
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
