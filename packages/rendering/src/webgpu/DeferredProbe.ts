import { RenderDeviceError, type UniformValue } from "../RenderDevice";

/**
 * A borrowed, filterable, linear-light cube and its sampler. The provider owns
 * the native texture, view and sampler; this module never destroys them.
 *
 * WebGPU does not expose a view's device, texture, format or lifetime. The
 * provider must validate those facts, keep the texture and sampler alive until
 * submitted work completes, and register `resource` with the same device's
 * resource interop. The submitter must include `resource` in the submission's
 * read set. `assertUsable` checks the provider's current lease before encoding;
 * the interop read set must check it again at submission.
 */
export interface DeferredProbeLease {
  readonly device: object;
  readonly resource: object;
  readonly view: unknown;
  readonly sampler: unknown;
  assertUsable(): void;
}

/** Global PRD-02 IBL inputs; local probes and irradiance volumes are separate features. */
export interface DeferredProbeInput {
  readonly lease: DeferredProbeLease;
  /** Seven vec4s: convolved SH9 in interleaved RGB order, then one padding float. */
  readonly sh: ArrayLike<number>;
  readonly mipCount: number;
  /** Rotation about world Y in radians, as packed by the forward environment path. */
  readonly rotation: number;
  readonly diffuseIntensity: number;
  readonly specularIntensity: number;
  /** Ambient exit radiance (the 1/pi conversion has already happened). */
  readonly ambient: readonly [number, number, number];
  /** Hemisphere irradiance, premultiplied by its intensity. */
  readonly hemiSky: readonly [number, number, number];
  readonly hemiGround: readonly [number, number, number];
  /** Forward uses this direction as given; it does not normalize or clamp the dot product. */
  readonly hemiDirection: readonly [number, number, number];
}

export interface PackedDeferredProbe {
  /** 48 float32 values / 192 bytes in the layout declared by deferredProbeWgsl. */
  readonly uniforms: Float32Array;
  /** Identity is preserved so the caller can submit the provider's read lease. */
  readonly lease: DeferredProbeLease;
}

function invalid(field: string, message: string): never {
  throw new RenderDeviceError(`Deferred probe ${field} ${message}`, "NATIVE_DRAW_INVALID_INPUT", { field });
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function checkedFloat(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    return invalid(field, "must be finite in float32");
  }
  return value;
}

function checkedVector(value: unknown, length: number, field: string): number[] {
  if (!value || typeof value !== "object" || value instanceof DataView ||
      (value as ArrayLike<unknown>).length !== length) {
    return invalid(field, `must contain ${length} values`);
  }
  const input = value as ArrayLike<unknown>;
  return Array.from({ length }, (_, index) => checkedFloat(input[index], `${field}[${index}]`));
}

/**
 * Convert the result of packA3DEnvironmentUniforms into a deferred input. The
 * caller supplies the native cube lease for the same `u_envSpecular` binding.
 * Do not pass raw radiance SH9 here: EnvUniforms.packEnvSH performs the cosine
 * convolution once and packs the 27 coefficients contiguously across vec4s.
 */
export function deferredProbeFromUniforms(
  uniforms: ReadonlyMap<string, UniformValue>, lease: DeferredProbeLease
): DeferredProbeInput {
  const scalar = (name: string) => checkedFloat(uniforms.get(name), name);
  const vector = (name: string): [number, number, number] => {
    const values = checkedVector(uniforms.get(name), 3, name);
    return [values[0]!, values[1]!, values[2]!];
  };
  return {
    lease,
    sh: checkedVector(uniforms.get("u_envSH"), 28, "u_envSH"),
    mipCount: scalar("u_envMipCount"),
    rotation: scalar("u_envRotation"),
    diffuseIntensity: scalar("u_envDiffuseIntensity"),
    specularIntensity: scalar("u_envSpecularIntensity"),
    ambient: vector("u_ambientIrradiance"),
    hemiSky: vector("u_hemiSky"),
    hemiGround: vector("u_hemiGround"),
    hemiDirection: vector("u_hemiDirection")
  };
}

/**
 * Validate and snapshot one probe's uniform data without allocating GPU
 * resources. A real cube view and filtering sampler remain required when an
 * intensity is zero: WebGPU still requires every declared binding to exist.
 */
export function packDeferredProbe(input: DeferredProbeInput, expectedDevice: unknown): PackedDeferredProbe {
  if (!input || typeof input !== "object") invalid("input", "is required");
  const { lease } = input;
  if (!lease || typeof lease !== "object" || !isObject(expectedDevice) || lease.device !== expectedDevice) {
    invalid("lease.device", "must be the receiving native WebGPU device");
  }
  if (!isObject(lease.resource) || !isObject(lease.view) || !isObject(lease.sampler) || typeof lease.assertUsable !== "function") {
    invalid("lease", "must provide a native texture, cube view, sampler and liveness check");
  }
  const sh = checkedVector(input.sh, 28, "sh");
  const mipCount = checkedFloat(input.mipCount, "mipCount");
  if (!Number.isSafeInteger(mipCount) || mipCount < 1) invalid("mipCount", "must be a positive integer");
  const rotation = checkedFloat(input.rotation, "rotation");
  const diffuse = checkedFloat(input.diffuseIntensity, "diffuseIntensity");
  const specular = checkedFloat(input.specularIntensity, "specularIntensity");
  if (diffuse < 0 || specular < 0) invalid("intensity", "must be non-negative");
  const ambient = checkedVector(input.ambient, 3, "ambient");
  const sky = checkedVector(input.hemiSky, 3, "hemiSky");
  const ground = checkedVector(input.hemiGround, 3, "hemiGround");
  const direction = checkedVector(input.hemiDirection, 3, "hemiDirection");
  lease.assertUsable();
  const packed = new Float32Array(48);
  packed.set(sh, 0);
  // Padding never participates in the forward or deferred evaluation.
  packed[27] = 0;
  packed.set([mipCount, rotation, diffuse, specular], 28);
  packed.set(ambient, 32);
  packed.set(sky, 36);
  packed.set(ground, 40);
  packed.set(direction, 44);
  return { uniforms: packed, lease };
}

export interface DeferredProbeBindings {
  readonly group: number;
  readonly uniformBinding: number;
  readonly samplerBinding: number;
  readonly textureBinding: number;
}

/**
 * Compose a global-probe shader with PHYSICAL_LIGHTING_WGSL. The caller supplies
 * normalized world-space normal/view directions and its own sampled DFG value;
 * it must replace, rather than add to, the legacy ambient term when using this
 * result. The return separates diffuse and specular for subsequent occlusion.
 */
export function deferredProbeWgsl(bindings: DeferredProbeBindings): string {
  const values = [bindings.group, bindings.uniformBinding, bindings.samplerBinding, bindings.textureBinding];
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff) ||
      new Set(values.slice(1)).size !== 3) {
    invalid("bindings", "must use distinct non-negative u32 binding numbers in one group");
  }
  return /* wgsl */ `
struct AuraDeferredProbe {
  sh: array<vec4f, 7>,
  controls: vec4f,
  ambient: vec4f,
  hemiSky: vec4f,
  hemiGround: vec4f,
  hemiDirection: vec4f,
};
@group(${bindings.group}) @binding(${bindings.uniformBinding}) var<uniform> deferredProbe: AuraDeferredProbe;
@group(${bindings.group}) @binding(${bindings.samplerBinding}) var deferredProbeSampler: sampler;
@group(${bindings.group}) @binding(${bindings.textureBinding}) var deferredProbeTexture: texture_cube<f32>;

fn a3dDeferredProbeRotateY(d: vec3f, angle: f32) -> vec3f {
  let c = cos(angle); let s = sin(angle);
  return vec3f(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
}
fn a3dDeferredProbeIrradiance(direction: vec3f) -> vec3f {
  let n = normalize(a3dDeferredProbeRotateY(direction, deferredProbe.controls.y));
  let x = n.x; let y = n.y; let z = n.z;
  let c0 = deferredProbe.sh[0].xyz; let c1 = vec3f(deferredProbe.sh[0].w, deferredProbe.sh[1].xy);
  let c2 = vec3f(deferredProbe.sh[1].zw, deferredProbe.sh[2].x); let c3 = deferredProbe.sh[2].yzw;
  let c4 = deferredProbe.sh[3].xyz; let c5 = vec3f(deferredProbe.sh[3].w, deferredProbe.sh[4].xy);
  let c6 = vec3f(deferredProbe.sh[4].zw, deferredProbe.sh[5].x); let c7 = deferredProbe.sh[5].yzw;
  let c8 = deferredProbe.sh[6].xyz;
  let irradiance = c0 * 0.282095 + c1 * (-0.488603 * y) + c2 * (0.488603 * z) + c3 * (-0.488603 * x)
    + c4 * (1.092548 * x * y) + c5 * (1.092548 * y * z) + c6 * (0.315392 * (3.0 * z * z - 1.0))
    + c7 * (1.092548 * x * z) + c8 * (0.546274 * (x * x - y * y));
  return max(irradiance, vec3f(0.0)) * deferredProbe.controls.z;
}
fn a3dDeferredProbeIndirect(n: vec3f, view: vec3f, material: AuraPhysicalMaterial, dfg: vec2f) -> AuraPhysicalLightResult {
  let roughness = clamp(material.roughness, 0.0525, 1.0);
  let reflected = reflect(-view, n);
  let bent = normalize(mix(reflected, n, roughness * roughness * roughness * roughness));
  let lod = (max(deferredProbe.controls.x, 1.0) - 1.0) * roughness * (2.0 - roughness);
  let radiance = textureSampleLevel(deferredProbeTexture, deferredProbeSampler,
    a3dDeferredProbeRotateY(bent, deferredProbe.controls.y), lod).rgb * deferredProbe.controls.w;
  var result = a3dPhysicalIndirect(dot(n, view), radiance, a3dDeferredProbeIrradiance(n), material, dfg);
  let hemi = mix(deferredProbe.hemiGround.rgb, deferredProbe.hemiSky.rgb,
    dot(n, deferredProbe.hemiDirection.xyz) * 0.5 + 0.5);
  let diffuseColor = clamp(material.baseColor, vec3f(0.0), vec3f(1.0)) * (1.0 - clamp(material.metalness, 0.0, 1.0));
  result.diffuse += (deferredProbe.ambient.rgb + hemi / A3D_PHYSICAL_PI) * diffuseColor;
  return result;
}
`;
}
