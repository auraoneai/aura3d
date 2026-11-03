import type { NativeShaderStages, PortableShaderBinding } from "../RenderDevice";
import { A3D_MAX_FOG_VOLUMES } from "./FogVolumes";

/**
 * The native sky variants cover a gradient without bands, stars, clouds or
 * moon. The fogged variant uses the same packed atmosphere inputs as the
 * WebGL sky. The host checks the supported combinations before every draw.
 */
export const GRADIENT_SKY_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  { name: "u_invViewProj", kind: "mat4" },
  { name: "u_sunDirection", kind: "vec3" },
  { name: "u_zenith", kind: "vec3" },
  { name: "u_horizon", kind: "vec3" },
  { name: "u_ground", kind: "vec3" },
  { name: "u_exponent", kind: "float" },
  { name: "u_horizonGlow", kind: "float" },
  { name: "u_intensity", kind: "float" }
];

export const GRADIENT_SKY_FOG_PORTABLE_BINDINGS: readonly PortableShaderBinding[] = [
  ...GRADIENT_SKY_PORTABLE_BINDINGS,
  { name: "u_fogA", kind: "vec4" },
  { name: "u_fogB", kind: "vec4" },
  { name: "u_fogColor", kind: "vec3" },
  { name: "u_fogAbsorption", kind: "vec3" },
  { name: "u_fogMode", kind: "float" },
  { name: "u_fogNear", kind: "float" },
  { name: "u_fogFar", kind: "float" },
  { name: "u_fogVolumes", kind: "vec4", arrayLength: 2 * A3D_MAX_FOG_VOLUMES },
  { name: "u_cameraPosition", kind: "vec3" },
  { name: "u_sunColor", kind: "vec3" },
  { name: "u_fogBackgroundDistance", kind: "float" }
];

const SKY_VERTEX = /* wgsl */ `
// aura3d.prd07.sky vertex
/* @aura3d-bindings */
struct SkyVertex {
  @builtin(position) position: vec4<f32>,
  @location(0) clip: vec2<f32>,
};
@vertex fn vs_main(@location(0) position: vec2<f32>) -> SkyVertex {
  var out: SkyVertex;
  out.position = vec4<f32>(position, 0.999999, 1.0);
  out.clip = position;
  return out;
}`;

// The analytic optical-depth and segment equations are the Aura3D atmosphere
// contract (HeightFog/FogVolumes), evaluated at the sky background distance.
const SKY_FOG = /* wgsl */ `
fn skyHeightTau(originY: f32, rayY: f32, rayLength: f32) -> f32 {
  let path = max(rayLength - aura.u_fogB.x, 0.0);
  let base = aura.u_fogA.x * path;
  let heightDensity = aura.u_fogA.y;
  if (path == 0.0 || heightDensity == 0.0) { return base; }

  let k = aura.u_fogA.z * rayY * path;
  var logLine = 0.0;
  if (k < -20.0) {
    // log((1-exp(-k))/k), without overflowing on long downward rays.
    logLine = -k + log(1.0 - exp(k)) - log(-k);
  } else if (abs(k) >= 0.0001) {
    logLine = log((1.0 - exp(-k)) / k);
  }
  let logHeight = log(heightDensity) + log(path)
    - aura.u_fogA.z * (originY - aura.u_fogA.w) + logLine;
  // A larger optical depth is already opaque to f32 precision.
  return base + exp(min(logHeight, 80.0));
}

fn skyVolumeTau(origin: vec3<f32>, ray: vec3<f32>, rayLength: f32) -> f32 {
  var tau = 0.0;
  for (var i = 0u; i < ${A3D_MAX_FOG_VOLUMES}u; i += 1u) {
    let center = aura.u_fogVolumes[i * 2u];
    let bounds = aura.u_fogVolumes[i * 2u + 1u];
    if (bounds.w <= 0.0) { continue; }
    let relative = origin - center.xyz;
    var entry = 0.0;
    var exit = rayLength;
    var hit = true;
    for (var axis = 0u; axis < 3u; axis += 1u) {
      let component = ray[axis];
      if (abs(component) < 0.000000001) {
        if (abs(relative[axis]) > bounds[axis]) { hit = false; }
      } else {
        let first = (-bounds[axis] - relative[axis]) / component;
        let second = (bounds[axis] - relative[axis]) / component;
        entry = max(entry, min(first, second));
        exit = min(exit, max(first, second));
      }
    }
    if (center.w > 0.5) {
      let extent = max(bounds.xyz, vec3<f32>(0.000000001));
      let originScaled = relative / extent;
      let rayScaled = ray / extent;
      let quadratic = dot(rayScaled, rayScaled);
      let projection = dot(originScaled, rayScaled);
      let discriminant = projection * projection - quadratic * (dot(originScaled, originScaled) - 1.0);
      if (quadratic < 0.000000000001 || discriminant < 0.0 || !hit) {
        hit = false;
      } else {
        let root = sqrt(discriminant);
        entry = max((-projection - root) / quadratic, 0.0);
        exit = min((-projection + root) / quadratic, rayLength);
      }
    }
    if (hit && exit > entry) { tau += (exit - entry) * bounds.w; }
  }
  return tau;
}

fn skyApplyFog(color: vec3<f32>, direction: vec3<f32>) -> vec3<f32> {
  let mode = aura.u_fogMode;
  if (mode == 0.0) { return color; }
  let world = aura.u_cameraPosition + direction * aura.u_fogBackgroundDistance;
  let offset = world - aura.u_cameraPosition;
  let rayLength = length(offset);
  let ray = offset / max(rayLength, 0.00001);

  if (mode == 5.0) {
    let transmission = exp(-aura.u_fogAbsorption * rayLength);
    return color * transmission + aura.u_fogColor * (vec3<f32>(1.0) - transmission);
  }

  if (mode == 6.0) {
    var amount = 0.0;
    if (aura.u_fogA.w < 1.5) {
      amount = (rayLength - aura.u_fogB.x) / max(aura.u_fogB.y - aura.u_fogB.x, 0.000001);
    } else if (aura.u_fogA.w < 2.5) {
      amount = 1.0 - exp(-max(aura.u_fogA.x, 0.0) * rayLength);
    } else {
      let scaled = max(aura.u_fogA.x, 0.0) * rayLength;
      amount = 1.0 - exp(-scaled * scaled);
    }
    if (aura.u_fogA.y > 0.0) {
      amount *= exp(-max(0.0, world.y - aura.u_fogA.z) * aura.u_fogA.y);
    }
    amount = clamp(amount, 0.0, 1.0) * clamp(aura.u_fogB.z, 0.0, 1.0);
    return mix(color, aura.u_fogColor, amount);
  }

  var tau = 0.0;
  if (mode == 1.0) {
    tau = skyHeightTau(aura.u_cameraPosition.y, ray.y, rayLength);
  } else if (mode == 2.0) {
    tau = aura.u_fogA.x * rayLength;
  } else if (mode == 3.0) {
    let scaled = aura.u_fogA.x * rayLength;
    tau = scaled * scaled;
  }
  tau += skyVolumeTau(aura.u_cameraPosition, ray, rayLength);
  var amount = 1.0 - exp(-tau);
  if (mode == 4.0) {
    amount = clamp((rayLength - aura.u_fogNear) / (aura.u_fogFar - aura.u_fogNear), 0.0, 1.0);
  }
  amount = min(amount, aura.u_fogB.y);
  var inscatter = aura.u_fogColor;
  if (aura.u_fogB.z != 0.0) {
    var view = vec3<f32>(0.0);
    if (rayLength > 0.0) { view = offset / rayLength; }
    let g = aura.u_fogB.w;
    let mu = clamp(dot(view, aura.u_sunDirection), -1.0, 1.0);
    // Equivalent to 1+g²-2gμ, arranged to avoid cancellation near |g|=1.
    let ag = abs(g);
    let signedMu = select(-mu, mu, g >= 0.0);
    let phaseBase = (1.0 - ag) * (1.0 - ag) + 2.0 * ag * (1.0 - signedMu);
    let phase = (1.0 - g * g) / (12.5663706 * pow(phaseBase, 1.5));
    inscatter += aura.u_sunColor * phase * aura.u_fogB.z;
  }
  return mix(color, inscatter, amount);
}`;

function gradientFragment(fog: boolean): string {
  return /* wgsl */ `
// aura3d.prd07.sky fragment
/* @aura3d-bindings */
${fog ? SKY_FOG : ""}
@fragment fn fs_main(@location(0) clip: vec2<f32>) -> @location(0) vec4<f32> {
  let world = aura.u_invViewProj * vec4<f32>(clip, 1.0, 1.0);
  let direction = normalize(world.xyz / world.w);
  let y = direction.y;
  var color: vec3<f32>;
  if (y >= 0.0) {
    let t = pow(clamp(y, 0.0, 1.0), 1.0 / aura.u_exponent);
    // Ordered edges avoid WGSL's undefined reversed-edge smoothstep.
    let glow = aura.u_horizonGlow * (1.0 - smoothstep(0.0, 0.25, abs(y)));
    let cosine = dot(direction, aura.u_sunDirection);
    let disc = smoothstep(0.9995, 0.9999, cosine);
    let halo = pow(max(0.0, cosine), 350.0) * 0.6;
    let sun = vec3<f32>(disc * 40.0 + halo, disc * 36.0 + halo * 0.9, disc * 30.0 + halo * 0.7);
    color = mix(aura.u_horizon, aura.u_zenith, t) + glow * aura.u_horizon + sun;
  } else {
    let t = clamp(-y * 3.0, 0.0, 1.0);
    color = mix(aura.u_horizon, aura.u_ground, t);
  }
  ${fog
    ? "return vec4<f32>(skyApplyFog(color * aura.u_intensity, direction), 1.0);"
    : "return vec4<f32>(color * aura.u_intensity, 1.0);"}
}`;
}

export const GRADIENT_SKY_WGSL: NativeShaderStages = {
  vertex: SKY_VERTEX,
  fragment: gradientFragment(false)
};

export const GRADIENT_SKY_FOG_WGSL: NativeShaderStages = {
  vertex: SKY_VERTEX,
  fragment: gradientFragment(true)
};
