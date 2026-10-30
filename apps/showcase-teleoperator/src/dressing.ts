/**
 * GD-19 street dressing (GU47 WP-14): SDF street-name signs that match the HUD `where` panel, parked cars on the cross
 * streets, and trolley catenary over the avenue. Pure layout tables; scene.ts mounts the nodes and main.ts recycles them
 * on the intersection and lamp strides. Presentation only: nothing here is in the sim (D8), so the parked cars sit on the
 * cross streets between the kerb and the building fronts, outside every lane the player or the traffic can reach (the player is clamped to |x| <= 9.2).
 * GU47(WP-36): bus shelters, hydrants, news boxes and catenary poles are Meshy street furniture (asset needs).
 */
import type { GridAssetKey } from "./aura-assets";

/** District rows of the HUD `where` panel: [hood, street, "→ cross street[ · landmark]", coordinates]. */
export const DISTRICTS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["Nob Hill", "California Street", "→ Mason St", "37.7919° N · 122.4102° W"],
  ["Chinatown", "California Street", "→ Grant Ave", "37.7924° N · 122.4058° W"],
  ["Financial District", "California Street", "→ Montgomery St", "37.7931° N · 122.4026° W"],
  ["SoMa", "Market Street", "→ Fremont St", "37.7897° N · 122.3972° W"],
  ["The Embarcadero", "The Embarcadero", "→ Washington St · Ferry Terminal", "37.7955° N · 122.3937° W"],
  ["North Beach", "Columbus Avenue", "→ Broadway", "37.7992° N · 122.4076° W"]
];
/** Metres of avenue per district (the HUD and the signs use the same split). */
export const DISTRICT_LENGTH_M = 160;

/** District index for a world z (the car drives towards -z). */
export function districtAt(worldZ: number): number {
  return Math.abs(Math.floor(-worldZ / DISTRICT_LENGTH_M)) % DISTRICTS.length;
}

/** The sign text of a district: the HUD cross street without the arrow and the landmark ("Washington St"). */
export function crossStreetName(district: number): string {
  return DISTRICTS[district]![2].replace(/^→\s*/, "").split(" · ")[0]!;
}

/**
 * Sign nodes: two per district (intersections are 92 m apart and a district is 160 m, so at most two visible crossings
 * share a district). Node id `sf-sign-<district>-<slot>`.
 */
export const SIGN_SLOTS = 2;
export const signNodeId = (district: number, slot: number): string => `sf-sign-${district}-${slot}`;
export const SIGN = { size: 0.42, plate: [2.9, 0.62, 0.06] as [number, number, number], x: 9.2, y: 5.4, dz: -9.05, plateColor: "#1f5a3a", textColor: "#f4f7f2" } as const;

/** Which sign node stands at each intersection: `[nodeId, intersectionWorldZ]`, in the order given. */
export function signAssignments(intersectionZs: readonly number[]): [string, number][] {
  const used = new Map<number, number>();
  const out: [string, number][] = [];
  for (const z of intersectionZs) {
    const d = districtAt(z);
    const slot = used.get(d) ?? 0;
    if (slot >= SIGN_SLOTS) continue;
    used.set(d, slot + 1);
    out.push([signNodeId(d, slot), z]);
  }
  return out;
}

/** Parked cars on the cross streets: asset, world x, z offset from the intersection centre, yaw. */
export const PARKED: ReadonlyArray<{ readonly asset: GridAssetKey; readonly maxDim: number; readonly slots: ReadonlyArray<readonly [number, number, number]> }> = [
  { asset: "gridSedan", maxDim: 4.75, slots: [[-13.6, -5.3, Math.PI / 2], [13.6, 5.3, -Math.PI / 2]] },
  { asset: "gridHatch", maxDim: 3.9, slots: [[-14.2, 5.3, -Math.PI / 2], [14.2, -5.3, Math.PI / 2]] }
];
/** Parked cars stand between the kerb (10.8 m) and the building fronts (19.5 m): their x extent, nose to tail. */
export const PARKED_X_EXTENT: readonly [number, number] = [
  Math.min(...PARKED.flatMap((p) => p.slots.map(([x]) => Math.abs(x) - p.maxDim / 2))),
  Math.max(...PARKED.flatMap((p) => p.slots.map(([x]) => Math.abs(x) + p.maxDim / 2)))
];

/** World transforms of one parked-car pool for the intersections at `intersectionZs`. */
export function parkedLayout(poolIndex: number, intersectionZs: readonly number[]): { x: number; z: number; yaw: number }[] {
  const pool = PARKED[poolIndex]!;
  return intersectionZs.flatMap((iz) => pool.slots.map(([x, dz, yaw]) => ({ x, z: iz + dz, yaw })));
}

/**
 * Trolley catenary: two wire pairs above the inner lanes as long strips (like the road strips), plus a cross span at
 * every lamp pair (pole to pole). One instanced node each (+2 draws).
 */
export const CATENARY = { wiresX: [-3.6, -3.0, 3.0, 3.6] as const, wireY: 5.9, wire: [0.025, 0.025, 420] as [number, number, number], span: [22.4, 0.03, 0.03] as [number, number, number], spanY: 6.0 } as const;
