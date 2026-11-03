/**
 * Analytic daylight from Preetham, Shirley and Smits, “A Practical Analytic
 * Model for Daylight” (SIGGRAPH 1999, DOI 10.1145/311535.311545). The paper
 * fits Perez distributions independently for CIE x, y and luminance; we
 * evaluate those fits and convert xyY to linear sRGB. The fit is a daylight
 * model, so solar zenith is clamped to the horizon and twilight fades out.
 *
 * The empirical model was fitted primarily for turbidities 2–6; the legacy
 * API accepts 2–10, with 6–10 treated as extrapolation rather than measured
 * accuracy. Values outside that range are bounded to keep output finite.
 * Rayleigh and Mie controls are small optional artistic scattering adjustments
 * on top of the published sky rather than additional fit coefficients.
 */
export type Vec3 = readonly [number, number, number];

export interface AuraSkySunSpecLike {
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly intensity?: number;
  /** Angular diameter in radians. Zero disables the sun disc. */
  readonly discSize?: number;
}

export interface PreethamSpec {
  readonly model: "preetham";
  readonly sun: AuraSkySunSpecLike;
  readonly turbidity?: number;
  readonly rayleigh?: number;
  readonly mieCoefficient?: number;
  readonly mieDirectionalG?: number;
  readonly exposure?: number;
  readonly groundColor?: Vec3 | readonly number[] | string;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const numberOr = (x: number | undefined, fallback: number): number =>
  x !== undefined && Number.isFinite(x) ? x : fallback;

/** Sun direction from elevation and azimuth in degrees; +Y is up. */
export function sunDirection(sun: AuraSkySunSpecLike): Vec3 {
  const azimuth = numberOr(sun.azimuthDeg, 0) * Math.PI / 180;
  const elevation = numberOr(sun.elevationDeg, 0) * Math.PI / 180;
  const horizontal = Math.cos(elevation);
  return [horizontal * Math.sin(azimuth), Math.sin(elevation), horizontal * Math.cos(azimuth)];
}

export interface PreethamFrame {
  readonly sunDirection: Vec3;
  /** Solar brightness retained for cloud shading; 1000 is the default day value. */
  readonly sunE: number;
  readonly sunfade: number;
  /** Approximate wavelength-dependent coefficients retained for consumers of the older frame. */
  readonly betaR: Vec3;
  readonly betaM: Vec3;
  readonly mieDirectionalG: number;
  readonly exposure: number;
  readonly showSunDisc: number;
  readonly groundColor: Vec3;
  /** Perez coefficients and zenith values in x, y, Y order. */
  readonly perezA: Vec3;
  readonly perezB: Vec3;
  readonly perezC: Vec3;
  readonly perezD: Vec3;
  readonly perezE: Vec3;
  readonly zenithXyY: Vec3;
  readonly perezZenith: Vec3;
  readonly rayleigh: number;
  readonly mieCoefficient: number;
  readonly discCosOuter: number;
  readonly discCosInner: number;
  readonly skyScale: number;
}

function linearColor(color: PreethamSpec["groundColor"]): Vec3 {
  if (typeof color === "string") {
    const match = /^#([\da-f]{6})$/i.exec(color);
    if (match) {
      const channel = (offset: number): number => {
        const value = Number.parseInt(match[1]!.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return [channel(0), channel(2), channel(4)];
    }
  } else if (color && color.length >= 3 && color.slice(0, 3).every(Number.isFinite)) {
    return [Math.max(0, color[0]!), Math.max(0, color[1]!), Math.max(0, color[2]!)];
  }
  return [0.11, 0.115, 0.12];
}

/** Perez distribution F(theta, gamma). Angles use radians. */
function perez(a: number, b: number, c: number, d: number, e: number, cosTheta: number, gamma: number): number {
  const cosGamma = Math.cos(gamma);
  return (1 + a * Math.exp(b / Math.max(0.01, cosTheta))) * (1 + c * Math.exp(d * gamma) + e * cosGamma * cosGamma);
}

/** Compute the daylight fit once per frame; shader uniforms use these same values. */
export function preethamFrame(spec: PreethamSpec): PreethamFrame {
  const direction = sunDirection(spec.sun);
  const turbidity = clamp(numberOr(spec.turbidity, 10), 2, 10);
  const rayleigh = clamp(numberOr(spec.rayleigh, 3), 0, 8);
  const mieCoefficient = clamp(numberOr(spec.mieCoefficient, 0.005), 0, 0.1);
  const g = clamp(numberOr(spec.mieDirectionalG, 0.8), -0.95, 0.95);
  const intensity = Math.max(0, numberOr(spec.sun.intensity, 1));
  const exposure = Math.max(0, numberOr(spec.exposure, 1));
  const discRadius = clamp(numberOr(spec.sun.discSize, 0.0093), 0, 0.5) / 2;
  const sunfade = smoothstep(-0.105, 0, direction[1]);
  const theta = Math.acos(clamp(direction[1], 0, 1));
  const t2 = turbidity * turbidity;
  const theta2 = theta * theta;
  const theta3 = theta2 * theta;
  const zenithY = Math.max(0, (4.0453 * turbidity - 4.9710) * Math.tan((4 / 9 - turbidity / 120) * (Math.PI - 2 * theta)) - 0.2155 * turbidity + 2.4192);
  const zenithX = (0.00166 * theta3 - 0.00375 * theta2 + 0.00209 * theta) * t2 +
    (-0.02903 * theta3 + 0.06377 * theta2 - 0.03202 * theta + 0.00394) * turbidity +
    0.11693 * theta3 - 0.21196 * theta2 + 0.06052 * theta + 0.25886;
  const zenithSmallY = (0.00275 * theta3 - 0.00610 * theta2 + 0.00317 * theta) * t2 +
    (-0.04214 * theta3 + 0.08970 * theta2 - 0.04153 * theta + 0.00516) * turbidity +
    0.15346 * theta3 - 0.26756 * theta2 + 0.06670 * theta + 0.26688;
  // Published linear fits; array order is x, y, Y, not RGB.
  const a: Vec3 = [-0.0193 * turbidity - 0.2592, -0.0167 * turbidity - 0.2608, 0.1787 * turbidity - 1.4630];
  const b: Vec3 = [-0.0665 * turbidity + 0.0008, -0.0950 * turbidity + 0.0092, -0.3554 * turbidity + 0.4275];
  const c: Vec3 = [-0.0004 * turbidity + 0.2125, -0.0079 * turbidity + 0.2102, -0.0227 * turbidity + 5.3251];
  const d: Vec3 = [-0.0641 * turbidity - 0.8989, -0.0441 * turbidity - 1.6537, 0.1206 * turbidity - 2.5771];
  const e: Vec3 = [-0.0033 * turbidity + 0.0452, -0.0109 * turbidity + 0.0529, -0.0670 * turbidity + 0.3703];
  const normalizer = [0, 1, 2].map(i => Math.max(1e-6, perez(a[i]!, b[i]!, c[i]!, d[i]!, e[i]!, 1, theta))) as unknown as Vec3;
  const molecular = 5.8e-6 * rayleigh / 3;
  const aerosol = 2e-5 * (turbidity / 6) * (mieCoefficient / 0.005);
  return {
    sunDirection: direction, sunE: 1000 * intensity * sunfade, sunfade,
    betaR: [molecular, molecular * (680 / 550) ** 4, molecular * (680 / 440) ** 4],
    betaM: [aerosol, aerosol, aerosol], mieDirectionalG: g, exposure,
    showSunDisc: discRadius > 0 ? 1 : 0, groundColor: linearColor(spec.groundColor),
    perezA: a, perezB: b, perezC: c, perezD: d, perezE: e,
    zenithXyY: [zenithX, zenithSmallY, zenithY], perezZenith: normalizer,
    rayleigh, mieCoefficient, discCosOuter: Math.cos(discRadius), discCosInner: Math.cos(discRadius * 0.8),
    skyScale: intensity * exposure * sunfade
  };
}

/** Evaluate linear sRGB radiance. Inputs are not tone-mapped or gamma encoded. */
export function preethamEvaluate(frame: PreethamFrame, dir: Vec3): Vec3 {
  const direction = normalize3(dir);
  const cosTheta = Math.max(0.01, direction[1]);
  const cosine = clamp(dot3(direction, frame.sunDirection), -1, 1);
  const gamma = Math.acos(cosine);
  const value = [0, 1, 2].map(i => frame.zenithXyY[i]! * perez(
    frame.perezA[i]!, frame.perezB[i]!, frame.perezC[i]!, frame.perezD[i]!, frame.perezE[i]!, cosTheta, gamma
  ) / frame.perezZenith[i]!);
  const y = clamp(value[1]!, 0.001, 0.999);
  const x = clamp(value[0]!, 0.001, 0.999 - y);
  // Y is kcd/m²; the fixed scene scale is an artistic exposure convention.
  const Y = Math.max(0, value[2]!) * 0.035;
  const X = x * Y / y;
  const Z = (1 - x - y) * Y / y;
  const rgb: [number, number, number] = [
    Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z),
    Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z),
    Math.max(0, 0.0557 * X - 0.2040 * Y + 1.0570 * Z)
  ];
  // Optional scattering adjustment. The fitted chromaticity is unchanged at
  // default Rayleigh and the bounded HG halo responds to aerosol controls.
  const tint = (frame.rayleigh - 3) / 3 * 0.2;
  const g = frame.mieDirectionalG;
  const hg = (1 - g * g) / Math.pow(Math.max(1e-4, 1 + g * g - 2 * g * cosine), 1.5);
  const halo = Math.min(1, hg / (1 + hg)) * frame.mieCoefficient * 2;
  const disc = frame.showSunDisc * smoothstep(frame.discCosOuter, frame.discCosInner, cosine) * 20;
  const sky: [number, number, number] = [
    (rgb[0] * Math.max(0, 1 - 0.3 * tint) + halo + disc) * frame.skyScale,
    (rgb[1] + halo + disc * 0.98) * frame.skyScale,
    (rgb[2] * Math.max(0, 1 + 0.5 * tint) + halo + disc * 0.92) * frame.skyScale
  ];
  if (direction[1] < 0) {
    const t = clamp(-direction[1] * 4, 0, 1);
    return [0, 1, 2].map(i => sky[i]! * (1 - t) + frame.groundColor[i]! * 0.04 * frame.exposure * t) as unknown as Vec3;
  }
  return sky;
}

export function normalize3(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(length) || length <= 1e-12) return [0, 1, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
}
export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
