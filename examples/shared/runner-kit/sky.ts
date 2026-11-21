/**
 * 5.7.0: the runner-kit stop gradients on the engine's `sky.gradient` (stylised profile) instead of a custom dome.
 *
 * `gradientSkyFragment(stops)` chained `c = mix(c, stop[i], smoothstep(t[i-1], t[i], t))` over `t = 0.5 - 0.5 * y`
 * from the zenith down. The same chain read from the bottom up is the stylised profile: the lowest stop is the
 * `horizon` base, each stop above it is a `mid` band blending over `[y(i+1), y(i)]` with `y = 1 - 2t`, and the top
 * stop is the `zenith`. Smoothstep is symmetric (`S(1 - x) = 1 - S(x)`), so both chains give the same colour.
 */
import type { AuraSkyGradientHaze, AuraSkyGradientMidBand, AuraSkyGradientOptions, AuraSkyGradientSunSpec } from "@aura3d/engine";
import type { SkyStop } from "./shaders";

/** Most stops a stop gradient can carry: horizon + 6 mid bands + zenith. */
export const MAX_SKY_STOPS = 8;

export interface GradientSkyExtras {
  readonly haze?: AuraSkyGradientHaze;
  readonly sun?: AuraSkyGradientSunSpec;
  readonly dither?: boolean;
  readonly horizonHeight?: number;
  readonly horizonSharpness?: number;
}

/** `sky.gradient` options that draw the same colours as `gradientSkyFragment(stops)`. */
export function gradientSkyOptions(stops: readonly SkyStop[], extras?: GradientSkyExtras): AuraSkyGradientOptions {
  if (stops.length < 2) throw new Error("runner-kit: a sky gradient needs at least two stops");
  if (stops.length > MAX_SKY_STOPS) throw new Error(`runner-kit: sky.gradient carries at most ${MAX_SKY_STOPS} stops`);
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  const y = (i: number): number => 1 - 2 * sorted[i]!.t;
  const last = sorted.length - 1;
  const mid: AuraSkyGradientMidBand[] = [];
  for (let i = last - 1; i >= 1; i--) mid.push({ color: sorted[i]!.hex, blend: [y(i + 1), y(i)] });
  return {
    style: "stylized",
    zenith: sorted[0]!.hex,
    horizon: sorted[last]!.hex,
    ...(mid.length > 0 ? { mid } : {}),
    zenithBlend: [y(1), y(0)],
    ...(extras?.haze ? { haze: extras.haze } : {}),
    ...(extras?.sun ? { sun: extras.sun } : {}),
    ...(extras?.dither !== undefined ? { dither: extras.dither } : {}),
    ...(extras?.horizonHeight !== undefined ? { horizonHeight: extras.horizonHeight } : {}),
    ...(extras?.horizonSharpness !== undefined ? { horizonSharpness: extras.horizonSharpness } : {}),
    captureEnvironment: false,
    affectsFog: false
  };
}

/** Elevation and azimuth (engine convention: azimuth 0 faces +z, 90 faces +x) of a direction vector. */
export function sunAngles(direction: readonly [number, number, number]): Pick<AuraSkyGradientSunSpec, "elevationDeg" | "azimuthDeg"> {
  const len = Math.hypot(direction[0], direction[1], direction[2]);
  const [x, yy, z] = [direction[0] / len, direction[1] / len, direction[2] / len];
  return {
    elevationDeg: (Math.asin(Math.max(-1, Math.min(1, yy))) * 180) / Math.PI,
    azimuthDeg: (Math.atan2(x, z) * 180) / Math.PI
  };
}
