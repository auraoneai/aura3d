/**
 * Courier Rush city assembly - night cityBlock kit + route-local street graph.
 *
 * The PRD is explicit that this route inherits no certified racing topology:
 * the world is a new route-local street grid laid on top of the proven
 * city.cityBlock night kit look. This module owns three things and nothing
 * else:
 *
 * 1. The scaled kit group plus one documented node edit (the kit's four
 *    decorative parked cars are removed because typed-GLB traffic drives these
 *    lanes; keeping both would put static boxes inside live traffic).
 * 2. The street graph: drivable segments in world units, derived once from the
 *    kit's authored road geometry times CITY_SCALE. Traffic loops, zone
 *    placement, strike colliders and the autopilot all read this one table.
 * 3. Static dressing nodes (zone rings, bollards, awnings) and the static prop
 *    collision list used for strike detection. City towers sit far enough
 *    off-road that they never need a collider.
 *
 * Pure data + declarative scene nodes: importable from Node for unit tests.
 */
import {
  city,
  group,
  material,
  model,
  primitives,
  type AuraAssetRef,
  type AuraNodeInput,
  type AuraSceneNode
} from "@aura3d/engine";

/**
 * World scale applied to the authored ~11-unit city block.
 *
 * At 6x the main road is 2.64 units wide (two comfortable van lanes) and the
 * whole grid spans roughly 66 units, which keeps delivery timers tuneable in
 * human ranges at van speeds.
 */
export const CITY_SCALE = 6;

/** Kit road half-widths after scaling: main roads 0.22 authored, side roads 0.15. */
export const MAIN_ROAD_HALF_WIDTH = 0.22 * CITY_SCALE;
export const SIDE_ROAD_HALF_WIDTH = 0.15 * CITY_SCALE;

export interface StreetSegment {
  readonly id: string;
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly halfWidth: number;
}

/**
 * Drivable segments in world units, one per kit road.
 *
 * Endpoints are shortened inside the drawn asphalt so vehicles turn around
 * before reaching the grid edge. Tower rows clear every segment by
 * construction (checked against the kit slot tables); only lamp poles near the
 * roadway need colliders.
 */
export const STREET_SEGMENTS: readonly StreetSegment[] = [
  { id: "main-north-south", ax: 0, az: -29.5, bx: 0, bz: 29.5, halfWidth: MAIN_ROAD_HALF_WIDTH },
  { id: "main-east-west", ax: -28.5, az: 0, bx: 28.5, bz: 0, halfWidth: MAIN_ROAD_HALF_WIDTH },
  { id: "avenue-west", ax: -20.7, az: -14.6, bx: -20.7, bz: 13.7, halfWidth: SIDE_ROAD_HALF_WIDTH },
  { id: "avenue-east", ax: 15.3, az: -14.6, bx: 15.3, bz: 13.7, halfWidth: SIDE_ROAD_HALF_WIDTH },
  { id: "cross-street-front", ax: -19.4, az: -16.2, bx: 16.6, bz: -16.2, halfWidth: SIDE_ROAD_HALF_WIDTH },
  { id: "cross-street-back", ax: -19.4, az: 15.3, bx: 16.6, bz: 15.3, halfWidth: SIDE_ROAD_HALF_WIDTH }
];

export interface ZoneSite {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Short dispatch-radio name shown in the HUD toast. */
  readonly label: string;
}

/** Sensor radius shared by pickup and drop zones, in world units. */
export const ZONE_RADIUS = 3.1;

/**
 * Authored loading docks, ALL on the main NS/EW roads - the two streets no
 * traffic loop uses. Curbside offsets keep a parked van clear of any lane,
 * and the 3.1-unit sensors reach the road so drivers trigger from the lane
 * edge while pulling in.
 */
export const ZONE_SITES: readonly ZoneSite[] = [
  { id: "depot-west-curb", x: -2.35, z: -14, label: "south depot bay" },
  { id: "riverside-west-curb", x: -24, z: -2.35, label: "riverside stand" },
  { id: "tower-north-curb", x: -2.35, z: 14, label: "north tower lobby" },
  { id: "plaza-east-curb", x: 22, z: -2.35, label: "east plaza" },
  { id: "depot-east-curb", x: 2.35, z: -14, label: "east depot bay" },
  { id: "midtown-west-curb", x: -2.35, z: -6, label: "midtown kiosk" }
];

export interface PropCollider {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** Traffic colliders carry their current speed so side-by-side passes at matched pace are not strikes. */
  readonly speed?: number;
}

/** Kit lamp positions (authored units), scaled here like every other kit node. */
const KIT_LAMP_POSITIONS: readonly (readonly [number, number])[] = [
  [-1.15, 0.85], [1.15, 0.85], [-1.15, -0.85], [1.15, -0.85],
  [-3.85, -2.05], [-2.95, 2.05], [2.05, -2.05], [3.05, 2.05],
  [-5.15, 0.15], [4.25, -0.15], [-0.2, -3.18], [0.2, 3.05]
];

const LAMP_POLE_RADIUS = 0.26;
const BOLLARD_RADIUS = 0.34;
/**
 * Bollard rims stand well outside the sensor circle as the dock's visual
 * boundary. Keeping the rim this far out guarantees the rings never reach the
 * traffic lanes, so a legal dock approach can never be struck by the very
 * props that mark the dock; lamp poles remain the on-road strike hazards.
 */
const BOLLARD_RING_RADIUS = ZONE_RADIUS + 2.1;

/**
 * Static strike colliders: scaled kit lamp poles only. Dock bollard rims are
 * deliberate set dressing WITHOUT colliders - a dock the courier must both
 * enter and exit cannot wear its own strike ring without manufacturing
 * unavoidable damage. Lamp poles near the roadway stay honest hazards.
 */
export function buildPropColliders(): PropCollider[] {
  return KIT_LAMP_POSITIONS.map(([x, z], index) => ({
    id: "lamp-pole-" + (index + 1),
    x: x * CITY_SCALE,
    z: z * CITY_SCALE,
    radius: LAMP_POLE_RADIUS
  }));
}

/**
 * The kit's four decorative parked cars ("red northbound", "blue southbound",
 * "yellow crosstown taxi", "white crosstown van") are removed: their boxes sit
 * inside lanes that typed-GLB traffic now drives. The name pattern comes
 * straight from the kit's makeCityVehicle naming.
 */
const KIT_PARKED_CAR_NAME_PATTERN =
  /(red northbound|blue southbound|yellow crosstown|white crosstown).*(car body|windshield|headlight pair)/;

function nodeName(node: AuraSceneNode): string {
  return "name" in node && typeof node.name === "string" ? node.name : "";
}

function stripKitParkedCars(nodes: readonly AuraSceneNode[]): AuraSceneNode[] {
  return nodes.filter((node) => !KIT_PARKED_CAR_NAME_PATTERN.test(nodeName(node)));
}

/** Typed asset members this module renders (generated CLI asset refs). */
export interface CityAssetRefs {
  readonly courierZoneBollard: AuraAssetRef<"model">;
  readonly courierZoneAwning: AuraAssetRef<"model">;
}


/** Ground ring + beacon column pair for one zone, as flat registry-safe nodes. */
function ringNodes(kind: "pickup" | "drop", displayName: string, color: string, emissive: string): readonly AuraNodeInput[] {
  return [
    primitives.torus({
      name: displayName + " ground ring",
      material: material.emissive({ color, emissive, emissiveIntensity: 1.55 })
    }).position(-999, 0.06, -999).scale([ZONE_RADIUS * 1.12, ZONE_RADIUS * 1.12, 0.42])
      .rotate(1.5708, 0, 0)
      .runtime({ id: "courier-" + kind + "-ring", tags: ["zone-sensor", "renderer-owned"] }),
    primitives.cylinder({
      name: displayName + " beacon column",
      material: material.emissive({ color, emissive, emissiveIntensity: 0.8, opacity: 0.14 })
    }).position(-999, 2.6, -999).scale([0.44, 5.2, 0.44])
      .runtime({ id: "courier-" + kind + "-beacon", tags: ["zone-sensor", "renderer-owned"] })
  ];
}

export interface CityZoneDressing {
  /** Movable pickup zone nodes: [ground ring, beacon column]. */
  readonly pickupZone: readonly AuraNodeInput[];
  /** Movable drop zone nodes: [ground ring, beacon column]. */
  readonly dropZone: readonly AuraNodeInput[];
  /** All static scene inputs: scaled kit group plus per-site bollards and awnings. */
  readonly staticNodes: readonly AuraNodeInput[];
  /** Number of primitive set-dressing nodes added by this route (route-health names it). */
  readonly routePrimitiveCount: number;
}

/**
 * Assemble the full static city dressing plus the two movable zone rigs.
 *
 * Every model comes from the generated typed map, so a catalog swap needs no
 * edit in this file.
 */
export function buildCityDressing(assets: CityAssetRefs): CityZoneDressing {
  const kitNodes = stripKitParkedCars(city.block({ timeOfDay: "night", blocks: 20 }));
  const staticNodes: AuraNodeInput[] = [
    group("courier city block night kit", kitNodes, {}).scale([CITY_SCALE, CITY_SCALE, CITY_SCALE])
  ];

  let primitiveCount = 0;
  for (const site of ZONE_SITES) {
    for (let index = 0; index < 4; index += 1) {
      const angle = Math.PI / 4 + index * (Math.PI / 2);
      staticNodes.push(
        model(assets.courierZoneBollard, {
          name: "zone bollard " + site.id + "-" + (index + 1),
          role: "setDressing",
          scaleMode: "fit",
          targetMaxDimension: 1.15,
          castShadow: false
        }).position(
          site.x + Math.cos(angle) * BOLLARD_RING_RADIUS,
          0.02,
          site.z + Math.sin(angle) * BOLLARD_RING_RADIUS
        )
      );
      primitiveCount += 1;
    }
    // One awning propped at the site rim facing outward.
    staticNodes.push(
      model(assets.courierZoneAwning, {
        name: "zone awning " + site.id,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 3.4,
        castShadow: false
      }).position(site.x + ZONE_RADIUS * 0.72, 2.35, site.z + ZONE_RADIUS * 0.72).rotate(0, Math.PI / 4, 0)
    );
    primitiveCount += 1;
  }

  return {
    pickupZone: ringNodes("pickup", "courier pickup zone", "#37e0ff", "#7ce8ff"),
    dropZone: ringNodes("drop", "courier drop zone", "#ffc65c", "#ffe08a"),
    staticNodes,
    routePrimitiveCount: primitiveCount + 4
  };
}

/**
 * Authored courier legs running ONLY over loop-free lanes. Traffic loops own
 * exactly four lane segments (NS northbound through the central district,
 * EW eastbound through it, both avenues, both cross streets); every leg below
 * stays on NS southbound, EW westbound, NS northbound SOUTH of the central
 * district, or EW eastbound WEST of it - so routine traffic and the courier
 * never share asphalt, and contacts are genuine player mistakes.
 */
export interface GridPoint {
  readonly x: number;
  readonly z: number;
}

export interface CourierRouteLegs {
  /** From the previous drop (or spawn) to this job's pickup dock. */
  readonly pickupLeg: readonly GridPoint[];
  /** From the pickup dock to this job's drop dock. */
  readonly dropLeg: readonly GridPoint[];
}

const pt = (x: number, z: number): GridPoint => ({ x, z });

export const COURIER_ROUTES: readonly CourierRouteLegs[] = [
  {
    // Job 1: tower-north-curb -> depot-west-curb (straight south run)
    pickupLeg: [pt(-0.45, 16.2), pt(-0.45, 14.8)],
    dropLeg: [pt(-0.45, 13), pt(-0.45, -12.8), pt(-1.4, -13.4), pt(-2.3, -13.9)]
  },
  {
    // Job 2: depot-west-curb -> riverside-west-curb (south, left onto WB)
    pickupLeg: [pt(-1.6, -13.4), pt(0.45, -12.4), pt(0.45, -1.6), pt(-0.3, -0.9), pt(-6, -0.45), pt(-23.4, -0.45), pt(-24, -1.7)],
    dropLeg: [pt(-24, -1.7), pt(-23.7, 0.45), pt(-10, 0.45), pt(-0.45, 1.4), pt(-0.45, 12.6), pt(-1.4, 13.4), pt(-2.3, 13.8)]
  },
  {
    // Job 3: tower-north-curb -> midtown-west-curb -> depot-east-curb
    pickupLeg: [pt(-0.45, 13), pt(-0.45, -4.8), pt(-0.45, -6.4)],
    dropLeg: [pt(-0.45, -4.8), pt(0.45, -5.6), pt(0.45, -12.6), pt(1.5, -13.2), pt(2.3, -13.7)]
  },
  {
    // Job 4: depot-east-curb -> riverside-west-curb (south, left onto WB)
    pickupLeg: [pt(1.5, -13.2), pt(0.45, -11.8), pt(0.45, -1.6), pt(-0.3, -0.9), pt(-6, -0.45), pt(-23.4, -0.45), pt(-24, -1.7)],
    dropLeg: [pt(-24, -1.7), pt(-23.7, 0.45), pt(-10, 0.45), pt(0.9, 0.45), pt(-0.45, -0.5), pt(-0.45, -12.6), pt(-1.4, -13.4), pt(-2.3, -13.9)]
  },
  {
    // Job 5: depot-west-curb -> plaza-east-curb -> riverside-west-curb
    // (north up NS, east along the traffic-free EW main, then back west)
    pickupLeg: [pt(-1.4, -13.4), pt(-0.45, -12.6), pt(-0.45, -2), pt(0.3, -0.9), pt(6, -0.45), pt(21.2, -0.45), pt(22, -1.7)],
    dropLeg: [pt(22.4, -0.9), pt(21.4, -0.45), pt(-23.4, -0.45), pt(-24, -1.7)]
  }
];

/** Signed shortest distance from a point to a segment, plus the closest t. */
export function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { readonly distance: number; readonly t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return { distance: Math.hypot(px - cx, pz - cz), t };
}

/** True when the point sits inside any drivable street segment (plus margin). */
export function pointOnStreet(x: number, z: number, margin = 0.35): boolean {
  for (const segment of STREET_SEGMENTS) {
    const { distance } = distanceToSegment(x, z, segment.ax, segment.az, segment.bx, segment.bz);
    if (distance <= segment.halfWidth + margin) return true;
  }
  return false;
}
