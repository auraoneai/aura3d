/**
 * Courier Rush city data — streets, delivery docks, colliders, spawn.
 *
 * Authored fresh for the single-path rebuild. The street centrelines are
 * read off the engine `city.block` kit's own road boxes (main roads on the
 * x=0 / z=0 axes, avenues at authored x=-3.45 / 2.55, cross streets at
 * authored z=-2.7 / 2.55) scaled by CITY_SCALE, so the data below always
 * describes the asphalt the kit actually draws. Dock sites, the traffic
 * loop, awning placements, and the spawn are new route-local authoring:
 * every dock sits on a main-street curb, clear of the tower footprints and
 * of the avenue/cross-street rectangle the traffic loop drives.
 *
 * Pure data + geometry helpers: no engine imports, no DOM. The dispatch
 * (`./dispatch`) and the scene/vehicle surface in `./main` both read this
 * one module, which is what makes "zone data with no retired-tree import"
 * structural rather than a promise.
 */

/** Uniform world scale applied to the authored city-block kit. */
export const CITY_SCALE = 6;

/** Kit main-road half-width after scaling (authored 0.22 x CITY_SCALE). */
export const MAIN_ROAD_HALF_WIDTH = 0.22 * CITY_SCALE;
/** Kit side-road half-width after scaling (authored 0.15 x CITY_SCALE). */
export const SIDE_ROAD_HALF_WIDTH = 0.15 * CITY_SCALE;

/**
 * World Y of the kit road tops. Road boxes are authored centred at
 * y=0.012..0.015 with 0.022..0.024 thickness, so the driven surface sits
 * at authored 0.024 x CITY_SCALE. The vehicle chassis samples this per
 * wheel through `streetSurfaceY`; nothing seats the van on a hand-picked
 * lift constant.
 */
export const ROAD_SURFACE_Y = 0.024 * CITY_SCALE;

/** World Y of the kit ground plane (authored y=-0.04 x CITY_SCALE). */
export const GROUND_PLANE_Y = -0.04 * CITY_SCALE;

export interface StreetSegment {
  readonly id: string;
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly halfWidth: number;
}

/**
 * Drivable street centrelines in world units, one per kit road. Endpoints
 * stop inside the drawn asphalt (kit roads run +/-32.4 world units on the
 * mains) so guidance dashes and the surface query never outrun the mesh.
 */
export const STREET_SEGMENTS: readonly StreetSegment[] = [
  { id: "main-street-ns", ax: 0, az: -30, bx: 0, bz: 30, halfWidth: MAIN_ROAD_HALF_WIDTH },
  { id: "main-street-ew", ax: -29, az: 0, bx: 29, bz: 0, halfWidth: MAIN_ROAD_HALF_WIDTH },
  { id: "west-avenue", ax: -20.7, az: -15, bx: -20.7, bz: 14, halfWidth: SIDE_ROAD_HALF_WIDTH },
  { id: "east-avenue", ax: 15.3, az: -15, bx: 15.3, bz: 14, halfWidth: SIDE_ROAD_HALF_WIDTH },
  { id: "south-cross", ax: -20, az: -16.2, bx: 17, bz: -16.2, halfWidth: SIDE_ROAD_HALF_WIDTH },
  { id: "north-cross", ax: -20, az: 15.3, bx: 17, bz: 15.3, halfWidth: SIDE_ROAD_HALF_WIDTH }
];

/** Distance from a point to a street segment's centreline. */
export function distanceToSegment(segment: StreetSegment, x: number, z: number): number {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - segment.ax) * dx + (z - segment.az) * dz) / lengthSq));
  return Math.hypot(x - (segment.ax + dx * t), z - (segment.az + dz * t));
}

/**
 * Driven-surface height at a world point: the kit road top while the point
 * is over a street corridor (road plus a small curb allowance), the kit
 * ground plane elsewhere. This is the query the vehicle chassis samples
 * at each wheel.
 */
export function streetSurfaceY(x: number, z: number): number {
  for (const segment of STREET_SEGMENTS) {
    if (distanceToSegment(segment, x, z) <= segment.halfWidth + 0.7) return ROAD_SURFACE_Y;
  }
  return GROUND_PLANE_Y;
}

export interface ZoneSite {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Short dispatch-radio name shown in the HUD objective. */
  readonly label: string;
  /** Road the dock fronts: bollards line up along this axis. */
  readonly road: "ns" | "ew";
}

/** Sensor radius shared by pickup and drop docks, in world units. */
export const ZONE_RADIUS = 3.2;

/**
 * Delivery docks, all on main-street curbs. The 2.4-unit curb offset parks
 * the van half off the 1.32-unit half-road while the 3.2-unit sensor still
 * reaches the lane centre, so a dock triggers on a clean pull-in. Every
 * site clears the kit tower footprints (`TOWER_BOXES`) and the
 * avenue/cross intersections by construction.
 */
export const ZONE_SITES: readonly ZoneSite[] = [
  // North-south docks use the east curb: west-curb bollards at x=-2.4
  // would clip the x=-5.7 tower row (footprint reaches x=-2.46).
  { id: "north-tower-dock", x: 2.4, z: 18, label: "north tower dock", road: "ns" },
  { id: "south-depot-dock", x: 2.4, z: -19, label: "south depot dock", road: "ns" },
  { id: "central-kiosk-dock", x: 2.4, z: -8, label: "central kiosk", road: "ns" },
  { id: "west-market-stand", x: -19, z: 2.4, label: "west market stand", road: "ew" },
  { id: "east-plaza-stand", x: 20, z: -2.4, label: "east plaza stand", road: "ew" },
  { id: "canal-stand", x: -11, z: -2.4, label: "canal stand", road: "ew" }
];

/** The dock whose sensor contains the point, or null between docks. */
export function zoneAt(x: number, z: number): ZoneSite | null {
  for (const site of ZONE_SITES) {
    if (Math.hypot(x - site.x, z - site.z) <= ZONE_RADIUS) return site;
  }
  return null;
}

/**
 * Storefront canopies, hand-placed on the two terminal docks. Positions
 * are checked against `TOWER_BOXES` including the fitted footprint, so no
 * canopy intersects a tower or hangs over the sensor.
 */
export const DOCK_AWNINGS: readonly { readonly x: number; readonly z: number; readonly yaw: number }[] = [
  { x: 5.2, z: -19, yaw: 0 },
  { x: 5.2, z: 18, yaw: 0 }
];

/** Bollard offset along the dock's road axis, just outside the sensor. */
export const BOLLARD_AXIS_OFFSET = ZONE_RADIUS + 1.2;

export interface PropCollider {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * Kit lamp-pole positions (authored units from the kit's lamp table),
 * scaled with the city. Lamp poles are the static strike hazards; dock
 * bollards are dressing without colliders, since a dock the courier must
 * enter cannot wear its own strike ring.
 */
const KIT_LAMP_POSITIONS: readonly (readonly [number, number])[] = [
  [-1.15, 0.85], [1.15, 0.85], [-1.15, -0.85], [1.15, -0.85],
  [-3.85, -2.05], [-2.95, 2.05], [2.05, -2.05], [3.05, 2.05],
  [-5.15, 0.15], [4.25, -0.15], [-0.2, -3.18], [0.2, 3.05]
];

export const LAMP_COLLIDERS: readonly PropCollider[] = KIT_LAMP_POSITIONS.map(([x, z], index) => ({
  id: `lamp-${index + 1}`,
  x: x * CITY_SCALE,
  z: z * CITY_SCALE,
  radius: 0.3
}));

export interface TowerBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Kit tower footprints: the kit instances 20 towers on a 5x4 slot grid
 * (authored x slots -4.25..3.3, z slots -4..3.65) at 1.08 authored units
 * square. Scaled, each footprint is 6.48 world units square. The van is
 * pushed out of these boxes; towers never award strikes.
 */
const KIT_TOWER_X_SLOTS = [-4.25, -2.58, -0.95, 1.45, 3.3] as const;
const KIT_TOWER_Z_SLOTS = [-4, -1.45, 1.3, 3.65] as const;
const TOWER_HALF = (1.08 * CITY_SCALE) / 2;

export const TOWER_BOXES: readonly TowerBox[] = KIT_TOWER_Z_SLOTS.flatMap((zSlot) =>
  KIT_TOWER_X_SLOTS.map((xSlot) => ({
    minX: xSlot * CITY_SCALE - TOWER_HALF,
    maxX: xSlot * CITY_SCALE + TOWER_HALF,
    minZ: zSlot * CITY_SCALE - TOWER_HALF,
    maxZ: zSlot * CITY_SCALE + TOWER_HALF
  }))
);

/**
 * Traffic rectangle: the two avenues joined by the two cross streets,
 * entirely off the main streets the courier legs run on. Corners are the
 * kit intersections; `laneOffset` keeps each direction on its own side of
 * the 0.9-unit half-roads.
 */
export const TRAFFIC_LOOP = {
  corners: [
    { x: -20.7, z: -16.2 },
    { x: 15.3, z: -16.2 },
    { x: 15.3, z: 15.3 },
    { x: -20.7, z: 15.3 }
  ] as const,
  laneOffset: 0.5
} as const;

/**
 * Shift spawn on the north main street, facing south (heading -PI/2 in
 * the arcade vehicle's 0=+X convention). Holding throttle from spawn
 * rolls straight through the first pickup sensor at north-tower-dock.
 */
export const SPAWN_POSE = { x: 0.7, z: 24, heading: -Math.PI / 2 } as const;
