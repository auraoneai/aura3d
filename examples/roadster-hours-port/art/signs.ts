/**
 * GU47 RH47-17: SDF relay gate signs. Each relay gantry carries its name ("HARBOR RELAY") as engine SDF text hung under the
 * bar, facing the approaching car. Only the next gate's sign is visible (one extra draw at any time); the rest stay hidden.
 *
 * Size: the acceptance asks for a cap height >= 14 px at 60 m. At 720 px and the chase camera's ~62 deg vertical FOV, 60 m
 * gives about 10 px per metre, so the cap height must be >= 1.4 m; `SIGN_SIZE` 2.2 m em with the SDF catalogue's cap ratio
 * (~0.7 em) gives about 1.5 m. The SDF catalogue is A-Z 0-9 space hyphen period; names are uppercased.
 */
import { createAuraText3DGeometry } from "@aura3d/engine";

export const SIGN_SIZE = 2.2;
export const SIGN_DEPTH = 0.12;
export const SIGN_LETTER_SPACING = 0.06;
/** Metres below the gantry bar (the bar sits 12 m above the road). */
export const SIGN_DROP = 2.4;

/** Sign text for a gate name: uppercase, only characters the SDF catalogue carries. */
export function signText(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9 .-]/g, "").replace(/\s+/g, " ").trim();
}

/** Horizontal extent of the laid-out sign in local metres (from the extruded fallback geometry the SDF node also carries). */
export function signSpan(text: string): { readonly min: number; readonly max: number } {
  const { geometry } = createAuraText3DGeometry(text, { size: SIGN_SIZE, depth: SIGN_DEPTH, letterSpacing: SIGN_LETTER_SPACING });
  const p = geometry.positions as unknown as ArrayLike<number | readonly number[]>;
  let min = Infinity, max = -Infinity;
  // positions are [x, y, z] triplets (flat arrays are read with a stride of 3)
  const flat = p.length > 0 && typeof p[0] === "number";
  for (let i = 0; i < p.length; i += flat ? 3 : 1) {
    const x = flat ? (p[i] as number) : (p[i] as readonly number[])[0]!;
    min = Math.min(min, x); max = Math.max(max, x);
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

/**
 * World position of the text origin so the sign's span is centred on `centre`: shift by the span midpoint along the gantry
 * (local +x rotated by the gate yaw `psi` about Y).
 */
export function signOrigin(centre: readonly [number, number, number], psi: number, span: { readonly min: number; readonly max: number }): [number, number, number] {
  const half = (span.min + span.max) / 2;
  return [centre[0] - half * Math.cos(psi), centre[1], centre[2] + half * Math.sin(psi)];
}
