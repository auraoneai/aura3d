/**
 * Aura Diamond 3D stands crowd (GU47 DIA-A2): about 600 seated fans on the bleacher benches, in the park's section
 * colours, drawn as two instanced draws (bodies, heads). The 18 skinned wavers at the wall stay as they are.
 *
 * Interim: the fans are instanced primitives until lane wp36 delivers the four static fan meshes and their impostors
 * (asset need in the lane report); the seat layout and colours here carry over unchanged. Pure and deterministic: the
 * fan colours come from their own seeded generator, never the game's RNG.
 */
import { bleacherPlacements, makeRng, PARK_ORDER, type ParkSpec, type Vec3 } from "../src/rules";
import { PARK_LOOKS, type DiamondTier } from "./look";

/** Fans per bench (7 sections x 3 rows x 28 = 588). */
export const FANS_PER_BENCH = 28;
/** Bench length the fans spread over (bench box is 11.2 m long). */
const BENCH_SPAN = 10.4;
/** Bench box: centre height above the riser top and half its thickness (scene.ts `bleacher-benches`). */
const BENCH_HALF_HEIGHT = 0.11;

/** Skin tones of the crowd (heads). */
export const FAN_SKIN = ["#e3b597", "#c98d66", "#94603f", "#5e3c2a", "#f0cfb3"] as const;

export interface FanSeat {
  /** Seat point on the bench top. */
  readonly position: Vec3;
  readonly yaw: number;
  /** Bleacher section 0..6 (its shirt colour). */
  readonly section: number;
}

/** Every fan seat of a park; the Low tier keeps every other fan (PRD 6.4). */
export function fanSeats(park: ParkSpec, tier: DiamondTier): readonly FanSeat[] {
  const seats: FanSeat[] = [];
  for (const b of bleacherPlacements(park)) {
    const ax = Math.cos(b.yaw);
    const az = -Math.sin(b.yaw);
    const top = b.bench[1] + BENCH_HALF_HEIGHT;
    for (let k = 0; k < FANS_PER_BENCH; k++) {
      if (tier === "low" && k % 2 === 1) continue;
      const s = -BENCH_SPAN / 2 + (BENCH_SPAN * k) / (FANS_PER_BENCH - 1);
      seats.push({ position: [b.bench[0] + ax * s, top, b.bench[2] + az * s], yaw: b.yaw, section: b.sec });
    }
  }
  return seats;
}

/**
 * Shirt and skin colour per fan: six in ten wear their section's colour, the rest any colour of the park's crowd palette;
 * skin from `FAN_SKIN`. Seeded per park, so a park always fills the same way.
 */
export function fanColors(park: ParkSpec, seats: readonly FanSeat[]): { readonly shirts: readonly string[]; readonly skin: readonly string[] } {
  const palette = PARK_LOOKS[park.id].crowd;
  const rng = makeRng(0xfa5 + PARK_ORDER.indexOf(park.id) * 977);
  const shirts: string[] = [];
  const skin: string[] = [];
  for (const seat of seats) {
    const own = palette[seat.section % palette.length]!;
    shirts.push(rng() < 0.6 ? own : palette[Math.floor(rng() * palette.length) % palette.length]!);
    skin.push(FAN_SKIN[Math.floor(rng() * FAN_SKIN.length) % FAN_SKIN.length]!);
  }
  return { shirts, skin };
}

/** Seated fan proportions (metres): torso capsule and head sphere. */
export const FAN_BODY = { diameter: 0.42, height: 0.74 } as const;
export const FAN_HEAD = { diameter: 0.24, height: 0.27 } as const;
