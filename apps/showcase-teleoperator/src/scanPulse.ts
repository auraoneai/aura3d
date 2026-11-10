/**
 * Grid Dispatch sensor pass (GU47 WP-14 / WP-08): depth-aware fullscreen post pass (`effects.shaderPass`, before tone
 * mapping, paired GLSL + WGSL for WebGL2 + WebGPU parity) that draws the game's signature:
 *
 * - GD-05 marine deck: fog by world height so bay-city tower tops above `base` dissolve into the marine bank while the
 *   damp avenue below stays crisp and readable.
 * - GD-09 LiDAR scan pulse: a calibrated teal (#3fd6c6) range-contour sweep leaving the active AV pod every 2.4 s out
 *   to 60 m (2x rate on the roof sensor camera), plus a brief dispatch/handoff confirmation pulse. Off when reduced
 *   motion is enabled; half strength on the Low post tier.
 */
import { effects, type AuraCustomPostPass } from "@aura3d/engine";
import { OBJECTIVE_TEAL, type SkyLook } from "./look";

export const SENSOR_PASS_NAME = "grid-sensor-feed";
/** Seconds between two pulses (chase cameras). */
export const SCAN_PERIOD_S = 2.4;
/** Metres the ring travels before it fades. */
export const SCAN_RANGE_M = 60;
/** Seconds the ring takes to reach `SCAN_RANGE_M` (the rest of the period is dark). */
export const SCAN_SWEEP_S = 1.6;
/** Ring half-width in metres (crisp LiDAR leading band). */
export const SCAN_RING_WIDTH_M = 0.72;
/** Peak HDR add of the ring (linear, before tone mapping). */
export const SCAN_PEAK = 1.65;
/** Extinction inside the marine deck, 1/m (a few tens of metres of visibility inside the bank). */
export const DECK_SIGMA = 1 / 18;
/** Fixed camera pitch, degrees down (SCENE_CAM_POS -> SCENE_CAM_TARGET in rules.ts). */
export const CAMERA_PITCH_DEG = (Math.atan2(3.4 - 1.0, 6.5 + 7.2) * 180) / Math.PI;

export interface ScanPulseInput {
  /** Presentation clock in seconds (not the sim clock). */
  readonly t: number;
  readonly motionOk: boolean;
  /** Camera mode 2 (roof sensor camera): pulses twice as often. */
  readonly roofCam: boolean;
  readonly lowTier: boolean;
  /** Per-sky multiplier (`SkyLook.scanStrength`). */
  readonly skyStrength: number;
}

export interface ScanPulseState {
  /** Ring radius in metres from the car. */
  readonly radius: number;
  /** HDR add at the ring centre (0 = no ring). */
  readonly strength: number;
  readonly width: number;
}

/** The ring at presentation time `t`. Reduced motion: no ring at all (the signature stays as the static deck). */
export function scanPulseAt(o: ScanPulseInput): ScanPulseState {
  if (!o.motionOk) return { radius: 0, strength: 0, width: SCAN_RING_WIDTH_M };
  const period = o.roofCam ? SCAN_PERIOD_S / 2 : SCAN_PERIOD_S;
  const sweep = Math.min(SCAN_SWEEP_S, period * 0.8);
  const local = ((o.t % period) + period) % period;
  if (local >= sweep) return { radius: SCAN_RANGE_M, strength: 0, width: SCAN_RING_WIDTH_M };
  const k = local / sweep;
  const radius = k * SCAN_RANGE_M;
  // quick attack over the first 4 m, quadratic fade towards the range
  const envelope = Math.min(1, radius / 4) * (1 - k * k);
  return { radius, strength: SCAN_PEAK * envelope * o.skyStrength * (o.lowTier ? 0.5 : 1), width: SCAN_RING_WIDTH_M };
}

/** Ring brightness at a surface `distance` metres (horizontal) from the car: a gaussian band around the radius. */
export function ringAt(state: ScanPulseState, distance: number): number {
  if (state.strength <= 0 || distance > SCAN_RANGE_M) return 0;
  const x = (distance - state.radius) / state.width;
  return state.strength * Math.exp(-x * x);
}

/**
 * Marine-deck opacity at a point `height` metres above the street, seen along a ray that climbs at `sinElevation` from an
 * eye `eyeHeight` above the street.
 */
export function marineDeckAmount(deck: SkyLook["marine"], height: number, sinElevation: number, eyeHeight = 3.4): number {
  if (height <= deck.base || deck.opacity <= 0) return 0;
  const climb = Math.max(sinElevation, 0.02);
  const span = Math.max(deck.top - deck.base, 1e-3);
  const start = Math.max(eyeHeight, deck.base);
  const ramp = (y: number): number => (y <= deck.top ? ((y - deck.base) ** 2) / (2 * span) : span / 2 + (y - deck.top));
  const tau = (DECK_SIGMA / climb) * (ramp(height) - (start > deck.base ? ramp(start) : 0));
  return deck.opacity * (1 - Math.exp(-Math.max(0, tau)));
}

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** `#rrggbb` to linear RGB (the pass runs on the linear HDR target). */
export function hexToLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

export interface SensorFrame {
  readonly look: SkyLook;
  readonly pulse: ScanPulseState;
  /** Eye height above the street (the roof and bumper cameras lift the world towards the fixed camera). */
  readonly eyeHeight: number;
  readonly fovDeg: number;
  /** Car centre in the fixed camera's world frame (x across, z along; the camera sits at z 6.5). */
  readonly carX: number;
  readonly carZ: number;
  /** Optional 0..1 dispatch/handoff pulse confirmation boost (packed into `u_car.z`). */
  readonly dispatchBoost?: number;
}

/** Every uniform of the pass for one frame (each a number or a 1-4 array, as `setPassUniform` takes them). */
export function sensorUniforms(f: SensorFrame): Record<string, number | [number, number, number] | [number, number, number, number]> {
  const pitch = (CAMERA_PITCH_DEG * Math.PI) / 180;
  const deck = f.look.marine;
  return {
    u_cam: [f.eyeHeight, Math.tan((f.fovDeg * Math.PI) / 360), Math.sin(pitch), Math.cos(pitch)],
    u_car: [f.carX, f.carZ - 6.5, Math.max(0, Math.min(1, f.dispatchBoost ?? 0)), deck.reach],
    u_deck: [deck.base, deck.top, DECK_SIGMA, deck.opacity],
    u_deckColor: hexToLinear(deck.color),
    u_ring: [f.pulse.radius, f.pulse.width, f.pulse.strength, SCAN_RANGE_M],
    u_ringColor: hexToLinear(OBJECTIVE_TEAL)
  };
}

/**
 * WebGL2 GLSL shader twin of `marineDeckAmount` and `ringAt`. `u_depthLinear.r` is view-space depth in metres;
 * `u_cam` is `(eyeHeight, tan(fov/2), sin(pitch), cos(pitch))`, `u_car` is `(carX, carZ - 6.5, dispatchBoost, deckReach)`.
 */
export const SENSOR_PASS_GLSL = /* glsl */ `
uniform vec4 u_cam;
uniform vec4 u_car;
uniform vec4 u_deck;
uniform vec3 u_deckColor;
uniform vec4 u_ring;
uniform vec3 u_ringColor;

float deckRamp(float y) {
  float span = max(u_deck.y - u_deck.x, 0.001);
  return y <= u_deck.y ? (y - u_deck.x) * (y - u_deck.x) / (2.0 * span) : span * 0.5 + (y - u_deck.y);
}

void main() {
  vec4 c = texture(u_color, v_uv);
  float z = max(texture(u_depthLinear, v_uv).r, 0.001);
  float aspect = u_texelSize.y / max(u_texelSize.x, 1e-6);
  vec2 ndc = v_uv * 2.0 - 1.0;
  float vy = ndc.y * u_cam.y;
  float dx = ndc.x * u_cam.y * aspect * z;
  float dy = (vy * u_cam.w - u_cam.z) * z;
  float dz = -(vy * u_cam.z + u_cam.w) * z;
  float height = u_cam.x + dy;
  float dist = length(vec3(dx, dy, dz));
  float amount = 0.0;
  if (height > u_deck.x && u_deck.w > 0.0) {
    float climb = max(dy / max(dist, 0.001), 0.02);
    float startY = max(u_cam.x, u_deck.x);
    float tau = (u_deck.z / climb) * (deckRamp(height) - (startY > u_deck.x ? deckRamp(startY) : 0.0));
    amount = u_deck.w * (1.0 - exp(-max(tau, 0.0)));
  }
  vec3 rgb = mix(c.rgb, u_deckColor, amount);
  vec2 rel = vec2(dx - u_car.x, dz - u_car.y);
  float horiz = length(rel);
  float ringStrength = u_ring.z + u_car.z * 0.85;
  if (ringStrength > 0.0 && horiz < u_ring.w && height < u_deck.x) {
    float w = max(u_ring.y, 0.01);
    float x = (horiz - u_ring.x) / w;
    float lead = exp(-x * x * 1.45);
    float wake = smoothstep(-5.5, 0.0, horiz - u_ring.x) * step(horiz, u_ring.x);
    float contour = (0.5 + 0.5 * cos(horiz * 1.256637)) * wake * 0.22;
    float azTick = 0.84 + 0.16 * cos(atan(rel.x, rel.y) * 24.0);
    rgb += u_ringColor * (ringStrength * (lead + contour) * azTick);
  }
  outColor = vec4(rgb, c.a);
}
`;

/**
 * Native WebGPU WGSL fullscreen twin (`?backend=webgpu` / `backend: "auto"`).
 * Custom-pass bind layout (`WebGPUDevice.executeWebGPUCustomPass`):
 * - `@binding(0)`: `values[0]` = `(texelSizeX, texelSizeY, timeSeconds, 0)`, followed by declared uniforms in order:
 *   `values[1]` = `u_cam`, `values[2]` = `u_car`, `values[3]` = `u_deck`, `values[4]` = `u_deckColor`,
 *   `values[5]` = `u_ring`, `values[6]` = `u_ringColor`.
 * - `@binding(1)`: linear clamp sampler
 * - `@binding(2)`: `u_color` HDR target
 */
export const SENSOR_PASS_WGSL = /* wgsl */ `struct SensorUniforms { values: array<vec4<f32>, 7> };
@group(0) @binding(0) var<uniform> sensor: SensorUniforms;
@group(0) @binding(1) var sensorSampler: sampler;
@group(0) @binding(2) var u_color: texture_2d<f32>;

fn deckRampWgsl(y: f32, baseY: f32, topY: f32) -> f32 {
  let span = max(topY - baseY, 0.001);
  if (y <= topY) {
    let d = y - baseY;
    return (d * d) / (2.0 * span);
  }
  return span * 0.5 + (y - topY);
}

@fragment fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSample(u_color, sensorSampler, uv);
  let texel = sensor.values[0];
  let uCam = sensor.values[1];
  let uCar = sensor.values[2];
  let uDeck = sensor.values[3];
  let uDeckColor = sensor.values[4].xyz;
  let uRing = sensor.values[5];
  let uRingColor = sensor.values[6].xyz;

  let aspect = texel.y / max(texel.x, 1e-6);
  let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let vy = ndc.y * uCam.y;
  let rayX = ndc.x * uCam.y * aspect;
  let rayY = vy * uCam.w - uCam.z;
  let rayZ = -(vy * uCam.z + uCam.w);
  let rayLen = max(length(vec3<f32>(rayX, rayY, rayZ)), 1e-4);

  var rgb = c.rgb;
  // Aloft marine fog deck on upward rays above the horizon
  if (rayY > 0.004 && uDeck.w > 0.0) {
    let reach = max(uCar.w, 140.0);
    let estHeight = uCam.x + (rayY / rayLen) * reach;
    if (estHeight > uDeck.x) {
      let climb = max(rayY / rayLen, 0.02);
      let startY = max(uCam.x, uDeck.x);
      let startRamp = select(0.0, deckRampWgsl(startY, uDeck.x, uDeck.y), startY > uDeck.x);
      let tau = (uDeck.z / climb) * (deckRampWgsl(estHeight, uDeck.x, uDeck.y) - startRamp);
      let amount = uDeck.w * (1.0 - exp(-max(tau, 0.0)));
      rgb = mix(rgb, uDeckColor, amount);
    }
  }

  // Analytical ground-plane LiDAR scan wave on street rays below the horizon
  let ringStrength = uRing.z + uCar.z * 0.85;
  if (rayY < -0.012 && ringStrength > 0.0) {
    let tGround = max(uCam.x, 0.35) / (-rayY);
    let gx = rayX * tGround;
    let gz = rayZ * tGround;
    let rel = vec2<f32>(gx - uCar.x, gz - uCar.y);
    let horiz = length(rel);
    if (horiz < uRing.w) {
      let w = max(uRing.y, 0.01);
      let x = (horiz - uRing.x) / w;
      let lead = exp(-x * x * 1.45);
      let wake = smoothstep(-5.5, 0.0, horiz - uRing.x) * select(0.0, 1.0, horiz <= uRing.x);
      let contour = (0.5 + 0.5 * cos(horiz * 1.256637)) * wake * 0.22;
      let azTick = 0.84 + 0.16 * cos(atan2(rel.x, rel.y) * 24.0);
      rgb = rgb + uRingColor * (ringStrength * (lead + contour) * azTick);
    }
  }
  return vec4<f32>(rgb, c.a);
}
`;

/** The pass descriptor (validated by the engine factory). */
export function createSensorPass(look: SkyLook, opts: { readonly colorOnly?: boolean } = {}): AuraCustomPostPass {
  const initial = sensorUniforms({ look, pulse: { radius: 0, strength: 0, width: SCAN_RING_WIDTH_M }, eyeHeight: 3.4, fovDeg: 56, carX: 0.95, carZ: -0.8 });
  return effects.shaderPass({
    name: SENSOR_PASS_NAME,
    glsl: SENSOR_PASS_GLSL,
    wgsl: SENSOR_PASS_WGSL,
    insertAt: "before-tonemap",
    inputs: opts.colorOnly ? ["color"] : ["color", "depth"],
    uniforms: initial
  });
}

type SetPassUniform = (passName: string, key: string, value: number | readonly number[]) => void;
interface SensorHost {
  addPostPass?(p: AuraCustomPostPass): () => void;
  setPassUniform?: SetPassUniform;
  readonly post?: { addPostPass?(p: AuraCustomPostPass): () => void; setPassUniform?: SetPassUniform } | undefined;
}

/**
 * Registers the pass once (the C-13 registry keeps it across `setScene`) and returns the per-frame uniform writer.
 * When `syncBackend("webgpu")` is called after readiness, switches `inputs` to `["color"]` so the native WebGPU
 * post chain executes `SENSOR_PASS_WGSL` instead of skipping on depth-attachment binding limits.
 */
export function installSensorPass(app: SensorHost, look: SkyLook): {
  readonly active: boolean;
  syncBackend(backend: string | undefined, activeLook: SkyLook): void;
  update(frame: SensorFrame): void;
  dispose(): void;
} {
  const addPass = app.addPostPass ? app.addPostPass.bind(app) : app.post?.addPostPass ? app.post.addPostPass.bind(app.post) : undefined;
  let remove = addPass?.(createSensorPass(look));
  let webgpuMode = false;
  const active = typeof remove === "function";
  const post = app.post;
  const setUniform: SetPassUniform | undefined = app.setPassUniform?.bind(app) ?? (post?.setPassUniform ? post.setPassUniform.bind(post) : undefined);
  return {
    active,
    syncBackend(backend, activeLook) {
      if (!active || !addPass || backend !== "webgpu" || webgpuMode) return;
      webgpuMode = true;
      remove?.();
      remove = addPass(createSensorPass(activeLook, { colorOnly: true }));
    },
    update(frame) {
      if (!active || !setUniform) return;
      for (const [key, value] of Object.entries(sensorUniforms(frame))) setUniform(SENSOR_PASS_NAME, key, value);
    },
    dispose() {
      remove?.();
    }
  };
}
