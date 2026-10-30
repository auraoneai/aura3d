/**
 * Grid Dispatch sensor pass (GU47 WP-14): one depth-reading fullscreen post pass (`effects.shaderPass`, inputs color +
 * depth, before tone mapping) that draws the game's signature:
 *
 * - GD-05 marine deck: fog by world height. The scene camera never moves (the world scrolls past it, rules.ts), so the
 *   pass rebuilds each pixel's height above the street and its distance from the view depth and the fixed camera, and
 *   fogs whatever sits inside the deck: tower tops above `base` dissolve, the ceiling above the horizon becomes the fog
 *   bank, the street below stays clear. (The engine's forward fog can only thin fog above its reference; see look.ts.)
 * - GD-09 LiDAR scan pulse: a teal ring (#3fd6c6, the objective/sensor colour) that leaves the robotaxi every 2.4 s and
 *   sweeps out to 60 m over the ground and the facades (2x as often on the roof sensor camera). Off when reduced motion
 *   is on (the pass then shows a still frame: a 0.6 s pair does not change); Low tier: half strength.
 *
 * The maths lives in plain functions so tests/unit/teleoperator/scanPulse.test.ts can check it without a GPU; the GLSL
 * below is the shader twin. +1 fullscreen draw.
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
/** Ring half-width in metres. */
export const SCAN_RING_WIDTH_M = 0.9;
/** Peak HDR add of the ring (linear, before tone mapping). */
export const SCAN_PEAK = 1.6;
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
 * eye `eyeHeight` above the street. The deck's density ramps from 0 at `base` to `DECK_SIGMA` at `top` and stays full
 * above it (the bank is thick), so the optical depth is the ramp integral over the ray's climb.
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
}

/** Every uniform of the pass for one frame (each a number or a 1-4 array, as `setPassUniform` takes them). */
export function sensorUniforms(f: SensorFrame): Record<string, number | [number, number, number] | [number, number, number, number]> {
  const pitch = (CAMERA_PITCH_DEG * Math.PI) / 180;
  const deck = f.look.marine;
  return {
    u_cam: [f.eyeHeight, Math.tan((f.fovDeg * Math.PI) / 360), Math.sin(pitch), Math.cos(pitch)],
    u_car: [f.carX, f.carZ - 6.5, 0, 0],
    u_deck: [deck.base, deck.top, DECK_SIGMA, deck.opacity],
    u_deckColor: hexToLinear(deck.color),
    u_ring: [f.pulse.radius, f.pulse.width, f.pulse.strength, SCAN_RANGE_M],
    u_ringColor: hexToLinear(OBJECTIVE_TEAL)
  };
}

/**
 * Shader twin of `marineDeckAmount` and `ringAt`. `u_depthLinear.r` is view-space depth in metres; `u_cam` is (eye
 * height, tan(fov/2), sin(pitch), cos(pitch)) of the fixed camera, `u_car.xy` the car's (x, z - camera z).
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
  // world offsets from the eye along the fixed, pitched camera (x right, y up, z towards the camera)
  float dx = ndc.x * u_cam.y * aspect * z;
  float dy = (vy * u_cam.w - u_cam.z) * z;
  float dz = -(vy * u_cam.z + u_cam.w) * z;
  float height = u_cam.x + dy;
  float dist = length(vec3(dx, dy, dz));
  // GD-05 marine deck
  float amount = 0.0;
  if (height > u_deck.x && u_deck.w > 0.0) {
    float climb = max(dy / max(dist, 0.001), 0.02);
    float startY = max(u_cam.x, u_deck.x);
    float tau = (u_deck.z / climb) * (deckRamp(height) - (startY > u_deck.x ? deckRamp(startY) : 0.0));
    amount = u_deck.w * (1.0 - exp(-max(tau, 0.0)));
  }
  vec3 rgb = mix(c.rgb, u_deckColor, amount);
  // GD-09 LiDAR ring, horizontal distance from the car, solid surfaces within range only
  float horiz = length(vec2(dx - u_car.x, dz - u_car.y));
  if (u_ring.z > 0.0 && horiz < u_ring.w && height < u_deck.x) {
    float x = (horiz - u_ring.x) / max(u_ring.y, 0.01);
    rgb += u_ringColor * (u_ring.z * exp(-x * x));
  }
  outColor = vec4(rgb, c.a);
}
`;

/** The pass descriptor (validated by the engine factory). */
export function createSensorPass(look: SkyLook): AuraCustomPostPass {
  const initial = sensorUniforms({ look, pulse: { radius: 0, strength: 0, width: SCAN_RING_WIDTH_M }, eyeHeight: 3.4, fovDeg: 56, carX: 0.95, carZ: -0.8 });
  return effects.shaderPass({ name: SENSOR_PASS_NAME, glsl: SENSOR_PASS_GLSL, insertAt: "before-tonemap", inputs: ["color", "depth"], uniforms: initial });
}

type SetPassUniform = (passName: string, key: string, value: number | readonly number[]) => void;
interface SensorHost {
  addPostPass?(p: AuraCustomPostPass): () => void;
  setPassUniform?: SetPassUniform;
  readonly post?: { setPassUniform?: SetPassUniform } | undefined;
}

/** Registers the pass once (the C-13 registry keeps it across `setScene`) and returns the per-frame uniform writer. */
export function installSensorPass(app: SensorHost, look: SkyLook): { readonly active: boolean; update(frame: SensorFrame): void; dispose(): void } {
  const remove = app.addPostPass?.(createSensorPass(look));
  const active = typeof remove === "function";
  // SH-03 lives on `app.post`; the flattened `app.setPassUniform` is optional.
  const post = app.post;
  const setUniform: SetPassUniform | undefined = app.setPassUniform?.bind(app) ?? (post?.setPassUniform ? post.setPassUniform.bind(post) : undefined);
  return {
    active,
    update(frame) {
      if (!active || !setUniform) return;
      for (const [key, value] of Object.entries(sensorUniforms(frame))) setUniform(SENSOR_PASS_NAME, key, value);
    },
    dispose() {
      remove?.();
    }
  };
}
