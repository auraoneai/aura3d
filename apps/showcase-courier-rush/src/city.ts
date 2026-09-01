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
  instances,
  lights,
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

/** Renderer-owned emissive lane cues make the vanishing line readable at chase-camera scale. */
function roadGuidanceNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  for (const segment of STREET_SEGMENTS) {
    const horizontal = Math.abs(segment.bx - segment.ax) >= Math.abs(segment.bz - segment.az);
    const length = Math.hypot(segment.bx - segment.ax, segment.bz - segment.az);
    const dashCount = Math.max(3, Math.floor(length / 7));
    for (let index = 0; index < dashCount; index += 1) {
      const t = (index + 0.5) / dashCount;
      const x = segment.ax + (segment.bx - segment.ax) * t;
      const z = segment.az + (segment.bz - segment.az) * t;
      nodes.push(primitives.box({
        name: `courier lane marker ${segment.id} ${index + 1}`,
        material: material.emissive({ color: "#2dd4bf", emissive: "#0f766e", emissiveIntensity: 0.78, opacity: 0.84 })
      }).position(x, 0.045, z).scale(horizontal ? [2.2, 0.018, 0.08] : [0.08, 0.018, 2.2]));
    }
  }
  return nodes;
}

/** Clean northbound review corridor on the same authored main-street axis. */
function reviewCorridorNodes(): AuraNodeInput[] {
  const road = material.pbr({ name: "courier review wet asphalt", color: "#182633", roughness: 0.32, metallic: 0.34, clearcoat: 0.32 });
  const sidewalk = material.pbr({ name: "courier review sidewalk", color: "#3b4d58", roughness: 0.74, metallic: 0.08 });
  const facade = material.pbr({ name: "courier review facade", color: "#263a4a", roughness: 0.52, metallic: 0.28, emissive: "#0d2030", emissiveIntensity: 0.16 });
  const rib = material.pbr({ name: "courier review structural ribs", color: "#466173", roughness: 0.34, metallic: 0.62, clearcoat: 0.24 });
  const facadeTransforms: Array<{ position: [number, number, number]; scale: [number, number, number] }> = [];
  const practicalTransforms: Array<{ position: [number, number, number]; scale: [number, number, number] }> = [];
  const practicalColors: string[] = [];
  for (let bay = 0; bay < 12; bay += 1) {
    const side = bay % 2 === 0 ? -1 : 1;
    const depthIndex = Math.floor(bay / 2);
    const z = 17 - depthIndex * 7.4;
    const height = 6.2 + (depthIndex % 3) * 1.15;
    facadeTransforms.push({ position: [side * 6.5, height / 2, z], scale: [1.7, height / 2, 3.55] });

    // The inner faces use repeated window bays rather than unrelated neon
    // confetti. Their regular vertical/horizontal cadence carries real scale
    // through the chase lens and leaves the pressure gate as the single focal
    // interruption at the end of the street.
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        practicalTransforms.push({
          position: [side * 4.78, 1.05 + row * 1.16, z - 2.05 + column * 2.05],
          scale: [0.055, 0.22, 0.66]
        });
        practicalColors.push((depthIndex + row + column + (side > 0 ? 1 : 0)) % 5 === 0 ? "#ff9aaa" : "#8af7ff");
      }
    }
  }

  const ribTransforms: Array<{ position: [number, number, number]; scale: [number, number, number] }> = [];
  const ribGlowTransforms: Array<{ position: [number, number, number]; scale: [number, number, number] }> = [];
  const ribGlowColors: string[] = [];
  for (let portal = 0; portal < 6; portal += 1) {
    const z = 13 - portal * 7.5;
    ribTransforms.push(
      { position: [-4.55, 2.55, z], scale: [0.22, 2.55, 0.24] },
      { position: [4.55, 2.55, z], scale: [0.22, 2.55, 0.24] },
      { position: [0, 5.03, z], scale: [4.75, 0.2, 0.24] },
      { position: [-4.92, 1.15, z], scale: [0.34, 1.1, 1.45] },
      { position: [4.92, 1.15, z], scale: [0.34, 1.1, 1.45] }
    );
    ribGlowTransforms.push(
      { position: [-4.3, 2.72, z - 0.26], scale: [0.055, 1.85, 0.055] },
      { position: [4.3, 2.72, z - 0.26], scale: [0.055, 1.85, 0.055] },
      { position: [0, 4.78, z - 0.26], scale: [4.08, 0.055, 0.055] }
    );
    ribGlowColors.push("#8af7ff", "#ff9aaa", portal % 2 === 0 ? "#dffcff" : "#8af7ff");
  }

  for (let marker = 0; marker < 10; marker += 1) {
    const z = 16 - marker * 5.2;
    practicalTransforms.push({ position: [0, 0.035, z], scale: [0.08, 0.018, 1.25] });
    practicalColors.push("#dffcff");
  }
  return [
    instances.box({
      name: "courier review main road",
      size: [1, 1, 1],
      transforms: [{ position: [0, -0.08, -2], scale: [4.6, 0.08, 34] }],
      material: road
    }),
    instances.box({
      name: "courier review sidewalks",
      size: [1, 1, 1],
      transforms: [
        { position: [-6.1, 0.08, -2], scale: [1.45, 0.16, 34] },
        { position: [6.1, 0.08, -2], scale: [1.45, 0.16, 34] }
      ],
      material: sidewalk
    }),
    instances.box({
      name: "courier review facades",
      size: [1, 1, 1],
      transforms: facadeTransforms,
      material: facade
    }),
    instances.box({
      name: "courier review structural ribs",
      size: [1, 1, 1],
      transforms: ribTransforms,
      material: rib
    }),
    instances.box({
      name: "courier review rib practicals",
      size: [1, 1, 1],
      transforms: ribGlowTransforms,
      colors: ribGlowColors,
      material: material.emissive({ name: "courier review rib glow", color: "#8af7ff", emissive: "#22d3ee", emissiveIntensity: 1.32 })
    }),
    instances.box({
      name: "courier review practical lights",
      size: [1, 1, 1],
      transforms: practicalTransforms,
      colors: practicalColors,
      material: material.emissive({ name: "courier review practical", color: "#8af7ff", emissive: "#22d3ee", emissiveIntensity: 1.05 })
    }),
    instances.box({
      name: "courier review converging rails",
      size: [1, 1, 1],
      transforms: [
        { position: [-3.82, 0.055, -2], scale: [0.055, 0.028, 34] },
        { position: [3.82, 0.055, -2], scale: [0.055, 0.028, 34] }
      ],
      colors: ["#8af7ff", "#ff9aaa"],
      material: material.emissive({ name: "courier review rail glow", color: "#8af7ff", emissive: "#22d3ee", emissiveIntensity: 1.65 })
    }),
    instances.box({
      name: "courier review road reflections",
      size: [1, 1, 1],
      transforms: [
        { position: [-2.15, -0.006, -3], scale: [0.11, 0.012, 29] },
        { position: [2.15, -0.005, -3], scale: [0.11, 0.012, 29] },
        { position: [-0.78, -0.004, -10], scale: [0.065, 0.01, 18] },
        { position: [0.78, -0.003, -10], scale: [0.065, 0.01, 18] }
      ],
      colors: ["#42f59b", "#f24f7d", "#77f5ff", "#8dffbc"],
      material: material.emissive({ name: "courier review reflected color", color: "#22d3ee", emissive: "#22d3ee", emissiveIntensity: 0.72, opacity: 0.42 })
    }),
    lights.point({ name: "courier review cyan canyon light", color: "#22d3ee", intensity: 5.2 }).position(-4.8, 3.2, -1),
    lights.point({ name: "courier review coral canyon light", color: "#fb7185", intensity: 4.8 }).position(4.8, 3.0, -8),
    lights.point({ name: "courier review horizon light", color: "#fbbf24", intensity: 4.2 }).position(0, 3.4, -18)
  ];
}

/**
 * A small authored skyline layer makes the chase frame read as a lived-in
 * courier district instead of an empty asphalt plane.  These are deliberately
 * set-dressing boxes and window practicals; the typed van, parcel, traffic,
 * bollards, and awnings remain the route's primary/secondary assets.
 */
function skylineDressingNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  const towerMaterial = material.pbr({ name: "courier skyline concrete", color: "#27526a", roughness: 0.62, metallic: 0.2 });
  const glassMaterial = material.pbr({ name: "courier skyline blue glass", color: "#347b92", roughness: 0.18, metallic: 0.48, clearcoat: 0.46, clearcoatRoughness: 0.14 });
  const cyanWindow = material.emissive({ name: "courier skyline cyan windows", color: "#8af7ff", emissive: "#2dd4bf", emissiveIntensity: 1.85, opacity: 0.9 });
  const coralWindow = material.emissive({ name: "courier skyline coral windows", color: "#ffb199", emissive: "#fb7185", emissiveIntensity: 1.55, opacity: 0.86 });
  const towers = [
    { x: -11, z: -10, width: 3.5, depth: 3.1, height: 8.4, glass: true },
    { x: 11, z: -10, width: 3.1, depth: 3.4, height: 6.6, glass: false },
    { x: -12.5, z: 10.5, width: 3.4, depth: 2.8, height: 6.2, glass: false },
    { x: 12.5, z: 10.5, width: 3.8, depth: 3.2, height: 8.8, glass: true },
    // Near-field facades sit just outside the central road so the chase
    // camera has readable scale and material depth on both sides of the van.
    // They are dressing only; no collision or route topology changes.
    { x: -4.9, z: 7.2, width: 2.7, depth: 2.4, height: 5.4, glass: true },
    { x: 4.9, z: 7.2, width: 2.7, depth: 2.4, height: 6.2, glass: false },
    // The retained parcel frame is captured just after the van leaves the
    // southern depot. Bring two facades into that near-field frustum so the
    // typed van is grounded between real city volumes instead of floating in
    // an empty blue-black road wedge.
    { x: -6.2, z: 17.6, width: 2.6, depth: 2.2, height: 7.2, glass: true },
    { x: 6.2, z: 17.6, width: 2.6, depth: 2.2, height: 6.6, glass: false },
    { x: -8, z: 22, width: 3.2, depth: 2.4, height: 5.3, glass: false },
    { x: 8, z: 22, width: 3.2, depth: 2.4, height: 5.9, glass: true }
  ] as const;
  for (let towerIndex = 0; towerIndex < towers.length; towerIndex += 1) {
    const tower = towers[towerIndex]!;
    nodes.push(
      primitives.box({
        name: `courier skyline tower ${towerIndex + 1}`,
        material: tower.glass ? glassMaterial : towerMaterial,
        receiveShadow: true
      }).position(tower.x, tower.height / 2, tower.z).scale([tower.width, tower.height / 2, tower.depth])
    );
    const windowMaterial = towerIndex % 2 === 0 ? cyanWindow : coralWindow;
    for (let row = 0; row < 4; row += 1) {
      nodes.push(
        primitives.box({ name: `courier skyline window ${towerIndex + 1}-${row + 1}`, material: windowMaterial })
          .position(tower.x + (towerIndex % 2 === 0 ? tower.width * 0.76 : -tower.width * 0.76), 1.2 + row * 1.25, tower.z - tower.depth * 0.52)
          .scale([0.08, 0.26, tower.depth * 0.42])
      );
    }
  }
  const signMaterial = material.emissive({ name: "courier dispatch signage", color: "#f5d0fe", emissive: "#e879f9", emissiveIntensity: 1.7 });
  const aquaSignMaterial = material.emissive({ name: "courier aqua signage", color: "#cffafe", emissive: "#22d3ee", emissiveIntensity: 1.8 });
  nodes.push(
    primitives.box({ name: "courier dispatch billboard", material: signMaterial }).position(-7.3, 4.1, -14.8).rotate(0, 0.08, 0).scale([1.45, 0.78, 0.05]),
    primitives.box({ name: "courier drop billboard", material: aquaSignMaterial }).position(7.6, 3.4, -14.8).rotate(0, -0.1, 0).scale([1.2, 0.62, 0.05]),
    primitives.box({ name: "courier overhead guide beam", material: aquaSignMaterial }).position(0, 4.8, -3.2).scale([6.8, 0.045, 0.045])
  );

  // Repeating portal ribs create the forward tunnel read that the typed van
  // needs in a still image. They are shallow, non-colliding set dressing on
  // the existing streets; the delivery route and strike colliders remain
  // entirely driven by STREET_SEGMENTS and buildPropColliders().
  const portalBody = material.pbr({ name: "courier portal body", color: "#172f49", roughness: 0.42, metallic: 0.64 });
  const portalCyan = material.emissive({ name: "courier portal cyan", color: "#75ecff", emissive: "#22d3ee", emissiveIntensity: 1.28 });
  const portalCoral = material.emissive({ name: "courier portal coral", color: "#ff9ca6", emissive: "#fb7185", emissiveIntensity: 1.12 });
  for (let portal = 0; portal < 4; portal += 1) {
    const z = 13.2 - portal * 7.1;
    nodes.push(
      primitives.box({ name: `courier portal post left ${portal}`, material: portalBody }).position(-4.25, 2.35, z).scale([0.26, 2.35, 0.22]),
      primitives.box({ name: `courier portal post right ${portal}`, material: portalBody }).position(4.25, 2.35, z).scale([0.26, 2.35, 0.22]),
      primitives.box({ name: `courier portal lintel ${portal}`, material: portalBody }).position(0, 4.62, z).scale([4.5, 0.24, 0.22]),
      primitives.box({ name: `courier portal cyan strip ${portal}`, material: portalCyan }).position(-3.65, 4.42, z - 0.16).scale([0.72, 0.045, 0.05]),
      primitives.box({ name: `courier portal coral strip ${portal}`, material: portalCoral }).position(3.65, 4.42, z - 0.16).scale([0.72, 0.045, 0.05])
    );
  }

  const curbCyan = material.emissive({ name: "courier curb cyan", color: "#8af7ff", emissive: "#2dd4bf", emissiveIntensity: 0.92, opacity: 0.86 });
  const curbCoral = material.emissive({ name: "courier curb coral", color: "#ffafba", emissive: "#fb7185", emissiveIntensity: 0.8, opacity: 0.82 });
  for (let segment = 0; segment < 8; segment += 1) {
    const z = 17.5 - segment * 4.9;
    nodes.push(
      primitives.box({ name: `courier left curb marker ${segment}`, material: curbCyan }).position(-2.0, 0.08, z).scale([0.055, 0.035, 1.05]),
      primitives.box({ name: `courier right curb marker ${segment}`, material: curbCoral }).position(2.0, 0.08, z + 0.35).scale([0.055, 0.035, 0.82])
    );
  }

  // Renderer-owned rain and skyline light traces add the layered, atmospheric
  // tunnel language that the typed van needs in a still pressure frame. They
  // are static non-colliding set dressing around the street; no DOM overlay,
  // vehicle state, or delivery rule is represented by these marks.
  const rainCool = material.emissive({ name: "courier rain cool", color: "#a5f3fc", emissive: "#22d3ee", emissiveIntensity: 1.35, opacity: 0.58 });
  const rainWarm = material.emissive({ name: "courier rain warm", color: "#fecdd3", emissive: "#fb7185", emissiveIntensity: 1.18, opacity: 0.5 });
  const rainNodes: AuraNodeInput[] = [];
  for (let streak = 0; streak < 30; streak += 1) {
    const lane = streak % 10;
    const band = Math.floor(streak / 10);
    const x = -7.2 + lane * 1.6 + (band % 2) * 0.35;
    const z = 15.6 - lane * 3.25 - band * 1.8;
    const y = 1.8 + (lane % 4) * 0.72;
    const length = 0.7 + (lane % 3) * 0.3;
    rainNodes.push(
      primitives.box({ name: `courier rain trace ${streak + 1}`, material: streak % 4 === 0 ? rainWarm : rainCool })
        .position(x, y, z)
        .rotate(0.08, 0, (lane % 2 === 0 ? -1 : 1) * 0.12)
        .scale([0.028, length, 0.028])
    );
  }
  nodes.push(...rainNodes);
  const guideGlow = material.emissive({ name: "courier overhead guide glow", color: "#cffafe", emissive: "#22d3ee", emissiveIntensity: 1.35, opacity: 0.74 });
  for (let guide = 0; guide < 3; guide += 1) {
    const z = 9.8 - guide * 8.6;
    nodes.push(
      primitives.box({ name: `courier overhead crossbeam ${guide}`, material: guideGlow })
        .position(0, 5.7 - guide * 0.22, z)
        .scale([5.25 - guide * 0.28, 0.045, 0.045]),
      primitives.box({ name: `courier overhead side glow ${guide}`, material: guideGlow })
        .position(-4.7, 4.35 - guide * 0.18, z - 0.2)
        .scale([0.045, 0.8, 0.045]),
      primitives.box({ name: `courier overhead side glow right ${guide}`, material: guideGlow })
        .position(4.7, 4.35 - guide * 0.18, z - 0.2)
        .scale([0.045, 0.8, 0.045])
    );
  }
  // The canonical parcel frame leaves the depot on the eastbound cross street
  // (z ~= 14). Add a second set of tunnel ribs aligned to that real road so the
  // producer does not look down an empty side of the city when the van turns
  // toward its first delivery. These are visual architecture only.
  const crossPortalBody = material.pbr({ name: "courier cross-street portal body", color: "#2f5f80", roughness: 0.34, metallic: 0.58, emissive: "#124f70", emissiveIntensity: 0.34 });
  const crossPortalGlow = material.emissive({ name: "courier cross-street portal glow", color: "#d5fbff", emissive: "#22d3ee", emissiveIntensity: 1.82, opacity: 0.9 });
  const crossPortalWarm = material.emissive({ name: "courier cross-street portal warm", color: "#ffd2d8", emissive: "#fb7185", emissiveIntensity: 1.48, opacity: 0.88 });
  for (let portal = 0; portal < 4; portal += 1) {
    const x = 1.5 + portal * 6.4;
    nodes.push(
      primitives.box({ name: `courier eastbound portal near ${portal}`, material: crossPortalBody }).position(x, 2.45, 9.9).scale([0.24, 2.45, 0.24]),
      primitives.box({ name: `courier eastbound portal far ${portal}`, material: crossPortalBody }).position(x, 2.45, 19.5).scale([0.24, 2.45, 0.24]),
      primitives.box({ name: `courier eastbound portal lintel ${portal}`, material: crossPortalBody }).position(x, 4.88, 14.7).scale([0.24, 0.22, 4.8]),
      primitives.box({ name: `courier eastbound portal cyan ${portal}`, material: crossPortalGlow }).position(x - 0.28, 2.5, 10.5).scale([0.09, 2.0, 0.11]),
      primitives.box({ name: `courier eastbound portal coral ${portal}`, material: crossPortalWarm }).position(x - 0.28, 2.5, 18.9).scale([0.09, 2.0, 0.11]),
      primitives.box({ name: `courier eastbound portal lintel glow ${portal}`, material: crossPortalGlow }).position(x - 0.28, 5.16, 14.7).scale([0.09, 0.1, 4.2])
    );
  }
  // Small practicals lift the authored skyline and give the night road a
  // readable near/mid/far rhythm in the chase capture. They are scene lights,
  // not UI illumination, and have no bearing on the delivery simulation.
  nodes.push(
    lights.point({ name: "courier west tower practical", color: "#22d3ee", intensity: 2.0 }).position(-11, 4.4, -10),
    lights.point({ name: "courier east tower practical", color: "#fb7185", intensity: 1.8 }).position(11, 3.7, -10),
    lights.point({ name: "courier north tower practical", color: "#67e8f9", intensity: 2.15 }).position(12.5, 5.2, 10.5),
    lights.point({ name: "courier near west practical", color: "#22d3ee", intensity: 1.45 }).position(-4.9, 3.2, 7.2),
    lights.point({ name: "courier near east practical", color: "#fb7185", intensity: 1.35 }).position(4.9, 3.4, 7.2),
    lights.point({ name: "courier depot west practical", color: "#22d3ee", intensity: 1.8 }).position(-6.2, 3.8, 17.6),
    lights.point({ name: "courier depot east practical", color: "#fb7185", intensity: 1.65 }).position(6.2, 3.5, 17.6),
    lights.point({ name: "courier road practical", color: "#fbbf24", intensity: 1.4 }).position(0, 3.0, 14)
  );
  return nodes;
}


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
export function buildCityDressing(assets: CityAssetRefs, reviewCapture = false): CityZoneDressing {
  const kitNodes = stripKitParkedCars(city.block({ timeOfDay: "night", blocks: 20 }));
  const guidanceNodes = roadGuidanceNodes();
  const staticNodes: AuraNodeInput[] = reviewCapture
    // The cinematic capture is an east-avenue slice, not a separate stage:
    // its centre line is the physical x=15.3 avenue used by both seeded
    // traffic loops. The source test selects a live vertical-lane car here,
    // so van, traffic, wet road, and canyon share world coordinates.
    ? [group("courier review east-avenue canyon", reviewCorridorNodes(), {}).position(15.3, 0, 0)]
    : [
        group("courier city block night kit", kitNodes, {}).scale([CITY_SCALE, CITY_SCALE, CITY_SCALE]),
        ...guidanceNodes,
        ...skylineDressingNodes()
      ];

  let primitiveCount = 0;
  for (const site of reviewCapture ? [] : ZONE_SITES) {
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
    routePrimitiveCount: primitiveCount + guidanceNodes.length + 4
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
