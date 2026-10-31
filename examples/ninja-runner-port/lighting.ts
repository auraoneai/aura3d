/**
 * GU47 WP-30 light rig (NR-01..NR-04), kept DOM-free so the art-direction test audits exactly the lights the scene
 * mounts. Evening: the belfast_sunset_puresky 1k HDRI through a real asset ref (it loads; the pre-GU47 plain-object
 * texture never did), one shadowed key (sun, then the moon key from the forest on) with 3 PCSS cascades on High and
 * 1 PCF cascade on Low, and a pool of point lights that `world.ts` moves to the nearest lanterns and spirit flames.
 * No hemisphere, no ambient and no second directional: the HDRI is the fill (PRD §3.2 "fill: environment").
 * `?look=original` returns the pre-GU47 rig unchanged (neutral-room IBL, hemisphere sky fill, cool rim, 2 cascades).
 */
import { defineAuraAssets, environments, lights } from "@aura3d/engine";
import { DISTRICT_LOOKS, ENVIRONMENT_GAIN, EVENING_HDRI, LANTERN_POOL, directionFromAngles, type LookMode } from "./districtLook";

const HDRI_LICENSE = "CC0 1.0, Poly Haven";
export const SKY_ASSETS = defineAuraAssets({
  autumn: { type: "texture", format: "hdr", url: "/hdri/autumn_field_puresky_1k.hdr", metadata: { license: `${HDRI_LICENSE} autumn_field_puresky (1k)` } },
  evening: { type: "texture", format: "hdr", url: `/hdri/${EVENING_HDRI}_1k.hdr`, metadata: { license: `${HDRI_LICENSE} ${EVENING_HDRI} (1k)` } }
});

export interface RigOptions {
  readonly mode: LookMode;
  readonly quality: "low" | "high";
  /** `?shadow=0` turns the key's cascades off (kept from the pre-GU47 page). */
  readonly shadow: boolean;
  /** `?ibl=hdri` (pre-GU47 debug switch): the original look lit by its HDRI through a real asset ref. */
  readonly originalHdri?: boolean;
  /** `?lanterns=0` drops the lantern pool (NR-03 comparison captures). */
  readonly lanterns?: boolean;
}

/** Pool sizes for a tier (0 when `?lanterns=0` or the original look). */
export function lanternPoolSize(o: RigOptions): { readonly amber: number; readonly cyan: number } {
  if (o.mode === "original" || o.lanterns === false) return { amber: 0, cyan: 0 };
  return o.quality === "low" ? LANTERN_POOL.low : LANTERN_POOL.high;
}

/** Key position 100 m along the direction toward the village sun (the runtime moves it with `setLight`). */
export function initialKeyPosition(): [number, number, number] {
  const k = DISTRICT_LOOKS[0]!.key;
  const d = directionFromAngles(k.elevationDeg, k.azimuthDeg);
  return [d[0] * 100, d[1] * 100, d[2] * 100];
}

export function lightRig(o: RigOptions) {
  if (o.mode === "original") {
    return [
      // The "sky ibl" texture is a plain object, not an asset ref, so the engine never loads this HDRI (the pre-GU47
      // look, kept for `?look=original`): the scene lights through the neutral room. `?ibl=hdri` loads it for real.
      environments.hdri({ name: "sky ibl", intensity: 0.7, background: false, texture: (o.originalHdri ? SKY_ASSETS.autumn : { type: "texture", format: "hdr", url: "/hdri/autumn_field_puresky_1k.hdr" }) as never }),
      lights.directional({ name: "sun", position: [-40, 67, 56], target: [0, 0, 0], intensity: 2.8, color: "#ffe3b1", shadow: (o.shadow ? { cascades: 2, maxDistance: 90 } : false) as never }),
      lights.hemisphere({ name: "sky fill", skyColor: "#d3ebf3", groundColor: "#80715b", intensity: 0.5 }),
      lights.directional({ name: "cool rim", position: [30, 20, -40], intensity: 0.4, color: "#bcd9ff" })
    ];
  }
  const village = DISTRICT_LOOKS[0]!;
  const shadow = o.shadow
    ? (o.quality === "low" ? { cascades: 1, maxDistance: 70, filter: "pcf" } : { cascades: 2, maxDistance: 90 })
    : false;
  const pool = lanternPoolSize(o);
  const rig = [
    environments.hdri({ name: "evening ibl", intensity: village.environmentIntensity * ENVIRONMENT_GAIN, background: false, texture: SKY_ASSETS.evening as never }),
    lights.directional({ name: "sun", position: initialKeyPosition(), target: [0, 0, 0], intensity: village.key.intensity, color: village.key.color, shadow: shadow as never }).runtime({ id: "sun" })
  ];
  // Pooled points start parked below the course at zero intensity; `world.ts` places them each frame (+0 draws).
  for (let i = 0; i < pool.amber; i++) rig.push(lights.point({ name: `lantern-light-${i}`, position: [0, -500, 0], intensity: 0, distance: LANTERN_POOL.range, color: LANTERN_POOL.amberColor }).runtime({ id: `lantern-light-${i}` }));
  for (let i = 0; i < pool.cyan; i++) rig.push(lights.point({ name: `spirit-light-${i}`, position: [0, -500, 0], intensity: 0, distance: LANTERN_POOL.range * 0.7, color: LANTERN_POOL.cyanColor }).runtime({ id: `spirit-light-${i}` }));
  return rig;
}
