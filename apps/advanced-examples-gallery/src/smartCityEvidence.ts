import { hash01, writeModelMatrix, type Vec3 } from "./math";

export type SmartCityLevel = "low" | "medium" | "high" | "extreme";
export type SmartCityDistrict = "all" | "north" | "harbor" | "core" | "industrial";
export type SmartCityGeometryKey = "cube" | "sphere" | "capsule" | "lineX";

export interface SmartCityEvidenceOptions {
  readonly time: number;
  readonly level: string;
  readonly selectedDistrict: string;
  readonly traffic: boolean;
  readonly flythrough: boolean;
  readonly pointer: { readonly x: number; readonly y: number };
}

export interface SmartCityInstanceBatch {
  readonly geometry: SmartCityGeometryKey;
  readonly material: string;
  readonly label: string;
  readonly transforms: Float32Array;
  readonly count: number;
}

export interface SmartCityLineGroup {
  readonly material: string;
  readonly label: string;
  readonly positions: readonly Vec3[];
  readonly segments: number;
}

export interface SmartCityPointGroup {
  readonly material: string;
  readonly label: string;
  readonly positions: readonly Vec3[];
}

export interface SmartCitySingleItem {
  readonly geometry: SmartCityGeometryKey;
  readonly material: string;
  readonly label: string;
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly rotation: Vec3;
}

export interface SmartCityRouteEvidence {
  readonly columns: number;
  readonly extent: number;
  readonly selectedDistrict: SmartCityDistrict;
  readonly selectedAnchor: readonly [number, number];
  readonly instanceBatches: readonly SmartCityInstanceBatch[];
  readonly lineGroups: readonly SmartCityLineGroup[];
  readonly pointGroups: readonly SmartCityPointGroup[];
  readonly singles: readonly SmartCitySingleItem[];
  readonly towerInstances: number;
  readonly trafficInstances: number;
  readonly logisticsInstances: number;
  readonly sensorInstances: number;
  readonly maxOverlayWidth: number;
  readonly maxOverlayHeight: number;
  readonly authoredCoreKeepoutRadius: number;
  readonly lineSegments: number;
  readonly pulsePoints: number;
  readonly drawBatches: number;
  readonly systems: readonly string[];
  readonly approximations: readonly string[];
  readonly labels: readonly string[];
}

interface MutableBatch {
  readonly transforms: Float32Array;
  count: number;
}

const DISTRICTS: readonly SmartCityDistrict[] = ["north", "harbor", "core", "industrial"];

/** Authored Tokyo district occupies the hero volume. Overlay pillars stay outside it. */
export const SMART_CITY_AUTHORED_CORE_KEEPOUT_RADIUS = 2.15;
export const SMART_CITY_OVERLAY_MAX_WIDTH = 0.06;
export const SMART_CITY_OVERLAY_MAX_HEIGHT = 0.74;
const SMART_CITY_GRID_HALF_EXTENT = 6.1;
const SMART_CITY_ROAD_Z = [-4.72, -2.28, 0.72, 3.08] as const;
const SMART_CITY_ROAD_X = [-5.18, -2.64, 0.78, 3.38, 5.22] as const;

export function createSmartCityRouteEvidence(options: SmartCityEvidenceOptions): SmartCityRouteEvidence {
  const level = normalizeLevel(options.level);
  const selectedDistrict = normalizeDistrict(options.selectedDistrict);
  const columns = columnsForLevel(level);
  const extent = SMART_CITY_GRID_HALF_EXTENT;
  const spacing = (extent * 2) / columns;
  const selectedAnchor = districtAnchor(selectedDistrict, extent);
  const capacity = columns * columns;
  const towerA: MutableBatch = { transforms: new Float32Array(capacity * 16), count: 0 };
  const towerB: MutableBatch = { transforms: new Float32Array(capacity * 16), count: 0 };
  const towerC: MutableBatch = { transforms: new Float32Array(capacity * 16), count: 0 };

  let towerInstances = 0;
  let maxOverlayWidth = 0;
  let maxOverlayHeight = 0;
  for (let row = 0; row < columns; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const profile = cityTowerProfile(row, col, columns, spacing, selectedDistrict, level);
      if (!profile) continue;
      const sway = Math.sin(options.time * 0.34 + row * 0.13 + col * 0.19) * (options.flythrough ? 0.018 : 0.008);
      const target = profile.district === "harbor"
        ? towerC
        : profile.district === "industrial"
          ? towerB
          : towerA;
      pushMatrix(
        target,
        [profile.x, -0.42 + profile.height * 0.5, profile.z],
        [profile.width, profile.height, profile.depth],
        [0, sway, 0]
      );
      towerInstances += 1;
      maxOverlayWidth = Math.max(maxOverlayWidth, profile.width, profile.depth);
      maxOverlayHeight = Math.max(maxOverlayHeight, profile.height);
    }
  }

  const trafficBatches = options.traffic ? createTrafficBatches(options.time, columns, spacing) : [];
  const logisticsBatch = createLogisticsBatch(options.time, columns, spacing);
  const sensorBatch = createSensorBatch(options.time, columns, spacing, selectedDistrict);
  const facadeBandBatch = createFacadeBandBatch(options.time, columns, spacing, selectedDistrict);
  const lineGroups = createLineGroups(options.time, columns, spacing, selectedDistrict, options.flythrough, options.pointer);
  const pointGroups = createPulsePointGroups(options.time, columns, spacing, selectedDistrict, options.flythrough);
  const singles = createSingleItems(options.time, selectedDistrict, selectedAnchor, extent, options.flythrough);
  const towerBatches = [
    toInstanceBatch("cube", "cityA", "district load hologram", towerA),
    toInstanceBatch("cube", "cityB", "district load hologram", towerB),
    toInstanceBatch("cube", "cityC", "district load hologram", towerC)
  ].filter((batch) => batch.count > 0);
  const instanceBatches = [
    ...towerBatches,
    ...trafficBatches,
    logisticsBatch,
    sensorBatch,
    facadeBandBatch
  ].filter((batch) => batch.count > 0);
  const trafficInstances = trafficBatches.reduce((sum, batch) => sum + batch.count, 0);
  const lineSegments = lineGroups.reduce((sum, group) => sum + group.segments, 0);
  const pulsePoints = pointGroups.reduce((sum, group) => sum + group.positions.length, 0);
  const drawBatches = instanceBatches.length + lineGroups.length + pointGroups.length + singles.length;

  return {
    columns,
    extent,
    selectedDistrict,
    selectedAnchor,
    instanceBatches,
    lineGroups,
    pointGroups,
    singles,
    towerInstances,
    trafficInstances,
    logisticsInstances: logisticsBatch.count,
    sensorInstances: sensorBatch.count,
    maxOverlayWidth,
    maxOverlayHeight,
    authoredCoreKeepoutRadius: SMART_CITY_AUTHORED_CORE_KEEPOUT_RADIUS,
    lineSegments,
    pulsePoints,
    drawBatches,
    systems: [
      "authored Smart City street grid",
      "restrained district load holograms",
      "instanced yellow traffic fleet",
      "instanced orange logistics-yard cargo",
      "instanced cyan sensor network",
      "street-grid traffic platoons",
      "instanced facade/window bands",
      "batched facade, window, road, and logistics-yard detail",
      "district selection overlays",
      "batched minimap/data telemetry",
      "flythrough route evidence",
      "instancing scale telemetry"
    ],
    approximations: [
      `${towerInstances.toLocaleString("en-US")} thin holographic load pillars trace the city perimeter outside the authored street grid`,
      `${trafficInstances.toLocaleString("en-US")} rounded traffic vehicles stay on the authored street coordinates`,
      `${logisticsBatch.count.toLocaleString("en-US")} orange cargo pallets stay inside the harbor and industrial logistics yards`,
      `${sensorBatch.count.toLocaleString("en-US")} cyan sensor beacons sit at street intersections instead of floating in the skyline`,
      "Yellow capsules are traffic, orange cubes are yard cargo, cyan beacons are sensors, and colored pillars are district load.",
      `${facadeBandBatch.count.toLocaleString("en-US")} thin facade/window ticks use one instanced draw batch`,
      `${lineSegments.toLocaleString("en-US")} facade/window, road, rail, minimap, selection, and data-flow segments are batched line geometry`,
      `${pulsePoints.toLocaleString("en-US")} telemetry pulse points are batched point geometry`,
      "Pointer probe highlights the nearest district as control-level picking evidence; per-building raycast picking is not claimed.",
      options.flythrough ? "flythrough mode modulates route camera and adds corridor breadcrumbs" : "flythrough mode is available but currently off",
      "Authored GLB context remains the hero scene; procedural A3D layers provide scale, motion, selection, and instrumentation evidence."
    ],
    labels: [
      `Load ${level}`,
      `Grid ${columns}x${columns}`,
      "Yellow = street traffic",
      "Orange = yard cargo",
      "Cyan = intersection sensors",
      `${towerInstances.toLocaleString("en-US")} load pillars`,
      `${trafficInstances.toLocaleString("en-US")} traffic vehicles`,
      `${logisticsBatch.count.toLocaleString("en-US")} yard cargo pallets`,
      `${sensorBatch.count.toLocaleString("en-US")} sensor pulses`,
      `${facadeBandBatch.count.toLocaleString("en-US")} facade bands`,
      `${lineSegments.toLocaleString("en-US")} segments`,
      `District ${selectedDistrict}`,
      "Pointer pick probe",
      options.flythrough ? "Flythrough on" : "Flythrough ready"
    ]
  };
}

function createTrafficBatches(time: number, columns: number, spacing: number): SmartCityInstanceBatch[] {
  // Keep traffic on the authored street grid. The old extent-wide ring put
  // abstract cubes in empty air around the hero building, which read as cargo
  // packages instead of a city workload.
  const perRoad = Math.max(6, Math.floor(columns * 0.75));
  const eastWest: MutableBatch = {
    transforms: new Float32Array(SMART_CITY_ROAD_Z.length * 2 * perRoad * 16),
    count: 0
  };
  const northSouth: MutableBatch = {
    transforms: new Float32Array(SMART_CITY_ROAD_X.length * 2 * perRoad * 16),
    count: 0
  };
  for (let road = 0; road < SMART_CITY_ROAD_Z.length; road += 1) {
    const z = SMART_CITY_ROAD_Z[road]!;
    for (let lane = 0; lane < 2; lane += 1) {
      const laneOffset = lane === 0 ? -0.13 : 0.13;
      for (let car = 0; car < perRoad; car += 1) {
        const phase = (time * (0.18 + road * 0.012 + lane * 0.008) + car / perRoad + hash01(road * 71 + lane * 19 + car * 13) * 0.12) % 1;
        const x = (phase - 0.5) * 11.7;
        const scale = car % 5 === 0 ? [0.11, 0.26, 0.085] as const : [0.085, 0.17, 0.065] as const;
        pushMatrix(eastWest, [x, -0.3, z + laneOffset], scale, [0, 0, Math.PI / 2]);
      }
    }
  }
  for (let road = 0; road < SMART_CITY_ROAD_X.length; road += 1) {
    const x = SMART_CITY_ROAD_X[road]!;
    for (let lane = 0; lane < 2; lane += 1) {
      const laneOffset = lane === 0 ? -0.13 : 0.13;
      for (let car = 0; car < perRoad; car += 1) {
        const phase = (time * (0.17 + road * 0.011 + lane * 0.007) + car / perRoad + hash01(road * 67 + lane * 23 + car * 17) * 0.12) % 1;
        const z = (phase - 0.5) * 9.25;
        const scale = car % 5 === 0 ? [0.11, 0.26, 0.085] as const : [0.085, 0.17, 0.065] as const;
        pushMatrix(northSouth, [x + laneOffset, -0.3, z], scale, [Math.PI / 2, 0, 0]);
      }
    }
  }
  return [
    toInstanceBatch("capsule", "traffic", "traffic vehicles", eastWest),
    toInstanceBatch("capsule", "traffic", "traffic vehicles", northSouth)
  ];
}

function createLogisticsBatch(time: number, columns: number, spacing: number): SmartCityInstanceBatch {
  const count = Math.max(64, Math.floor(columns * 3.2));
  const batch: MutableBatch = { transforms: new Float32Array(count * 16), count: 0 };
  for (let i = 0; i < count; i += 1) {
    const district = i % 2 === 0 ? "harbor" : "industrial";
    const anchor = districtAnchor(district, SMART_CITY_GRID_HALF_EXTENT);
    const rack = Math.floor(i / 8) % 4;
    const slot = i % 8;
    const x = anchor[0] + (slot - 3.5) * 0.13 + Math.sin(time * 0.22 + i) * 0.012;
    const z = anchor[1] + (rack - 1.5) * 0.16 + Math.cos(time * 0.18 + i * 0.4) * 0.012;
    const lift = ((time * 0.35 + i * 0.07) % 1) * 0.035;
    pushMatrix(batch, [x, -0.29 + lift, z], [0.13, 0.08, 0.17], [0, (i % 4) * Math.PI / 2, 0]);
  }
  return toInstanceBatch("cube", "logistics", "logistics cargo pallets", batch);
}

function createSensorBatch(time: number, columns: number, spacing: number, selectedDistrict: SmartCityDistrict): SmartCityInstanceBatch {
  const count = Math.max(96, Math.floor(columns * 5));
  const batch: MutableBatch = { transforms: new Float32Array(count * 16), count: 0 };
  const intersections = SMART_CITY_ROAD_X.flatMap((x) => SMART_CITY_ROAD_Z.map((z) => [x, z] as const));
  for (let i = 0; i < count; i += 1) {
    const [x, z] = intersections[i % intersections.length]!;
    const district = districtForPosition(x, z);
    const angle = i * 2.399 + time * 0.08;
    const selectedLift = selectedDistrict === district ? 0.22 : 0;
    const size = 0.035 + (i % 4) * 0.006;
    pushMatrix(batch, [
      x + Math.cos(angle) * 0.08,
      -0.12 + selectedLift + (i % 4) * 0.045 + Math.sin(time * 0.7 + i) * 0.012,
      z + Math.sin(angle) * 0.08
    ], [size, size * 2.4, size], [0, angle, 0]);
  }
  return toInstanceBatch("cube", "sensor", "district sensor pulse", batch);
}

function createFacadeBandBatch(time: number, columns: number, spacing: number, selectedDistrict: SmartCityDistrict): SmartCityInstanceBatch {
  const capacity = columns * columns * 3;
  const batch: MutableBatch = { transforms: new Float32Array(capacity * 16), count: 0 };
  for (let row = 0; row < columns; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const profile = cityTowerProfile(row, col, columns, spacing, selectedDistrict, "medium");
      if (!profile) continue;
      const selected = selectedDistrict === profile.district || (selectedDistrict === "all" && profile.district === "core");
      const visibleDetailTower = selected || (row + col) % 3 === 0;
      if (!visibleDetailTower) continue;

      const frontZ = profile.z - profile.depth * 0.64;
      const bandCount = selected ? 2 : 1;
      for (let band = 0; band < bandCount; band += 1) {
        const heightT = 0.42 + band * 0.22;
        const y = -0.42 + profile.height * heightT + Math.sin(time * 0.36 + row * 0.19 + col * 0.23 + band) * 0.003;
        pushMatrix(
          batch,
          [profile.x, y, frontZ],
          [profile.width * 0.72, 0.012, 0.01],
          [0, 0, 0]
        );
      }
    }
  }
  return toInstanceBatch("cube", "white", "facade window data pulse", batch);
}

function createLineGroups(
  time: number,
  columns: number,
  spacing: number,
  selectedDistrict: SmartCityDistrict,
  flythrough: boolean,
  pointer: { readonly x: number; readonly y: number }
): SmartCityLineGroup[] {
  const extent = columns * spacing * 0.5;
  const gridLines: Vec3[] = [];
  const railLines: Vec3[] = [];
  const selectionLines: Vec3[] = [];
  const dataLines: Vec3[] = [];
  const droneLines: Vec3[] = [];
  const minimapLines: Vec3[] = [];
  const roadMarkLines: Vec3[] = [];
  const facadeLines: Vec3[] = [];
  const windowFrameLines: Vec3[] = [];
  const logisticsYardLines: Vec3[] = [];
  const pointerX = (pointer.x - 0.5) * extent * 1.3;
  const pointerZ = (pointer.y - 0.5) * extent * 1.3;

  for (const p of SMART_CITY_ROAD_Z) {
    addSegment(gridLines, [-extent, -0.452, p], [extent, -0.452, p]);
  }
  for (const p of SMART_CITY_ROAD_X) {
    addSegment(gridLines, [p, -0.448, -extent], [p, -0.448, extent]);
  }

  addRoadAndYardDetail(roadMarkLines, logisticsYardLines, time, columns, spacing);
  addSmartCityFacadeLines(facadeLines, windowFrameLines, time, columns, spacing, selectedDistrict);

  for (let lane = 0; lane < SMART_CITY_ROAD_Z.length; lane += 1) {
    const y = -0.22 + lane * 0.012;
    const z = SMART_CITY_ROAD_Z[lane]!;
    const sweep = ((time * (0.14 + lane * 0.012) + lane * 0.11) % 1 - 0.5) * 11.2;
    addSegment(railLines, [sweep - 0.65, y, z], [sweep + 0.65, y, z]);
  }

  const selected = selectedDistrict === "all" ? DISTRICTS : [selectedDistrict];
  for (const district of selected) {
    const anchor = districtAnchor(district, extent);
    const width = district === "core" ? 1.05 : 0.86;
    addRectangle(selectionLines, anchor[0], -0.405, anchor[1], width, width * 0.78);
    addSegment(selectionLines, [anchor[0], -0.38, anchor[1]], [anchor[0], 0.22, anchor[1]]);
  }
  const nearestPointerDistrict = districtForPosition(pointerX, pointerZ);
  const nearestPointerAnchor = districtAnchor(nearestPointerDistrict, extent);
  addRectangle(selectionLines, pointerX, -0.34, pointerZ, 0.42, 0.42);
  addSegment(selectionLines, [pointerX, -0.32, pointerZ], [nearestPointerAnchor[0], -0.32, nearestPointerAnchor[1]]);

  for (let i = 0; i < 72; i += 1) {
    const fromDistrict = DISTRICTS[i % DISTRICTS.length]!;
    const toDistrict = DISTRICTS[(i + 1 + (i % 2)) % DISTRICTS.length]!;
    const from = districtAnchor(fromDistrict, extent);
    const to = districtAnchor(toDistrict, extent);
    const phase = (time * 0.38 + i * 0.013) % 1;
    const start: Vec3 = [
      from[0] + (to[0] - from[0]) * phase,
      0.42 + (i % 8) * 0.065,
      from[1] + (to[1] - from[1]) * phase
    ];
    const end: Vec3 = [
      from[0] + (to[0] - from[0]) * Math.min(1, phase + 0.08),
      start[1] + Math.sin(time * 0.5 + i) * 0.035,
      from[1] + (to[1] - from[1]) * Math.min(1, phase + 0.08)
    ];
    addSegment(dataLines, start, end);
  }

  if (flythrough) {
    for (let i = 0; i < 14; i += 1) {
      const angle = i * Math.PI * 2 / 14 + time * 0.24;
      const radius = 2.0 + (i % 5) * 0.22;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle * 0.82) * radius * 0.72;
      const y = 0.92 + (i % 4) * 0.19;
      addSegment(droneLines, [x * 0.72, y - 0.18, z * 0.72], [x, y, z]);
      addSegment(droneLines, [x, y, z], [pointerX, 1.35, pointerZ]);
    }
  }

  const miniX = extent * 0.55;
  const miniZ = -extent * 0.58;
  addRectangle(minimapLines, miniX, 2.35, miniZ, 1.55, 1.05);
  for (let i = 0; i < DISTRICTS.length; i += 1) {
    const district = DISTRICTS[i]!;
    const anchor = districtAnchor(district, 0.6);
    const pulse = 0.08 + ((time * 0.28 + i * 0.17) % 1) * 0.18;
    addRectangle(minimapLines, miniX + anchor[0], 2.35 + i * 0.02, miniZ + anchor[1], 0.22 + pulse, 0.16 + pulse * 0.6);
  }

  return [
    toLineGroup("transparentCyan", "selected district highlight", gridLines),
    toLineGroup("transparentAmber", "district light rail trail", railLines),
    toLineGroup("transparentAmber", "selected district highlight", selectionLines),
    toLineGroup("transparentCyan", "central city data pulse", dataLines),
    toLineGroup("wire", "selected district highlight", facadeLines),
    toLineGroup("wire", "facade window data pulse", windowFrameLines),
    toLineGroup("wire", "district light rail trail", roadMarkLines),
    toLineGroup("wire", "logistics yard data pulse", logisticsYardLines),
    toLineGroup("wire", "aerial transit path", droneLines),
    toLineGroup("transparentAmber", "smart-city minimap data pulse", minimapLines)
  ].filter((group) => group.segments > 0);
}

function addRoadAndYardDetail(
  roadMarkLines: Vec3[],
  logisticsYardLines: Vec3[],
  time: number,
  columns: number,
  spacing: number
): void {
  const extent = columns * spacing * 0.5;
  const roadCoordinates = [...SMART_CITY_ROAD_Z, ...SMART_CITY_ROAD_X];

  for (const p of roadCoordinates) {
    const tickCount = 24;
    for (let tick = 0; tick < tickCount; tick += 1) {
      const t = tick / Math.max(1, tickCount - 1);
      const sweep = -extent + t * extent * 2;
      const phase = ((time * 0.18 + tick * 0.071 + p * 0.013) % 1) * 0.05;
      addSegment(roadMarkLines, [sweep - 0.08, -0.438, p + phase], [sweep + 0.08, -0.438, p + phase]);
      addSegment(roadMarkLines, [p - phase, -0.436, sweep - 0.08], [p - phase, -0.436, sweep + 0.08]);
      if (tick % 3 === 1) {
        addSegment(roadMarkLines, [sweep - 0.06, -0.434, p - 0.07], [sweep + 0.06, -0.434, p + 0.07]);
      }
    }

    for (const q of roadCoordinates) {
      for (let stripe = -4; stripe <= 4; stripe += 1) {
        const offset = stripe * 0.035;
        addSegment(roadMarkLines, [p + offset, -0.432, q - 0.22], [p + offset, -0.432, q + 0.22]);
        addSegment(roadMarkLines, [p - 0.22, -0.43, q + offset], [p + 0.22, -0.43, q + offset]);
      }
    }
  }

  for (const district of ["harbor", "industrial"] as const) {
    const anchor = districtAnchor(district, extent);
    addRectangle(logisticsYardLines, anchor[0], -0.424, anchor[1], 1.35, 0.92);
    for (let row = 0; row < 6; row += 1) {
      const z = anchor[1] - 0.36 + row * 0.14;
      addSegment(logisticsYardLines, [anchor[0] - 0.58, -0.418, z], [anchor[0] + 0.58, -0.418, z]);
    }
    for (let col = 0; col < 7; col += 1) {
      const x = anchor[0] - 0.54 + col * 0.18;
      addSegment(logisticsYardLines, [x, -0.416, anchor[1] - 0.42], [x, -0.416, anchor[1] + 0.42]);
    }
    for (let gate = 0; gate < 5; gate += 1) {
      const x = anchor[0] - 0.48 + gate * 0.24;
      const lift = 0.08 + ((time * 0.24 + gate * 0.13) % 1) * 0.16;
      addSegment(logisticsYardLines, [x, -0.36, anchor[1] - 0.5], [x, -0.36 + lift, anchor[1] - 0.5]);
    }
  }
}

function addSmartCityFacadeLines(
  facadeLines: Vec3[],
  windowFrameLines: Vec3[],
  time: number,
  columns: number,
  spacing: number,
  selectedDistrict: SmartCityDistrict
): void {
  for (let row = 0; row < columns; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const profile = cityTowerProfile(row, col, columns, spacing, selectedDistrict, "medium");
      if (!profile) continue;

      const baseY = -0.42;
      const topY = baseY + profile.height;
      const floorCount = Math.max(3, Math.min(10, Math.floor(profile.height * 5.4)));
      const selected = selectedDistrict === profile.district || (selectedDistrict === "all" && profile.district === "core");
      const denseFacade = selected || profile.district === "core" || (row + col) % 3 === 0;
      const frontZ = profile.z - profile.depth * 0.58;
      const backZ = profile.z + profile.depth * 0.58;
      const leftX = profile.x - profile.width * 0.58;
      const rightX = profile.x + profile.width * 0.58;

      addRectangle(facadeLines, profile.x, topY + 0.006, profile.z, profile.width * 1.18, profile.depth * 1.18);

      for (let floor = 1; floor <= floorCount; floor += 1) {
        const y = baseY + profile.height * floor / (floorCount + 1);
        addSegment(facadeLines, [leftX, y, frontZ], [rightX, y, frontZ]);
        if (denseFacade || floor % 2 === 0) addSegment(facadeLines, [leftX, y, backZ], [rightX, y, backZ]);
        if (floor % 3 === 0 || denseFacade) {
          addSegment(facadeLines, [leftX, y - 0.035, profile.z], [leftX, y + 0.035, profile.z]);
          addSegment(facadeLines, [rightX, y - 0.035, profile.z], [rightX, y + 0.035, profile.z]);
        }
        if (denseFacade && floor % 2 === 1) {
          const midX = profile.x + Math.sin(time * 0.18 + row * 0.37 + col * 0.29) * profile.width * 0.12;
          addSegment(facadeLines, [midX, y - 0.028, frontZ - 0.005], [midX, y + 0.04, frontZ - 0.005]);
        }

        const slots = 2 + ((row + col + floor) % 3);
        for (let slot = 0; slot < slots; slot += 1) {
          if (!denseFacade && (slot + floor + row) % 2 === 0) continue;
          const offset = (slot - (slots - 1) / 2) * profile.width * 0.28;
          const dash = profile.width * 0.08;
          const pulseY = y + Math.sin(time * 0.7 + row * 0.11 + col * 0.17 + slot) * 0.004;
          addSegment(windowFrameLines, [profile.x + offset - dash, pulseY, frontZ - 0.006], [profile.x + offset + dash, pulseY, frontZ - 0.006]);
          if (denseFacade && slot % 2 === 0) {
            addSegment(windowFrameLines, [profile.x + offset - dash, pulseY, backZ + 0.006], [profile.x + offset + dash, pulseY, backZ + 0.006]);
          }
        }
      }
      if (denseFacade) {
        addSegment(facadeLines, [leftX, baseY + profile.height * 0.22, frontZ - 0.008], [profile.x, topY - 0.045, frontZ - 0.008]);
        addSegment(facadeLines, [rightX, baseY + profile.height * 0.22, frontZ - 0.008], [profile.x, topY - 0.045, frontZ - 0.008]);
      }
    }
  }
}

function createPulsePointGroups(
  time: number,
  columns: number,
  spacing: number,
  selectedDistrict: SmartCityDistrict,
  flythrough: boolean
): SmartCityPointGroup[] {
  const extent = columns * spacing * 0.5;
  const cyan: Vec3[] = [];
  const amber: Vec3[] = [];
  const green: Vec3[] = [];
  const windowCyan: Vec3[] = [];
  const windowAmber: Vec3[] = [];
  const count = flythrough ? 220 : 160;
  for (let i = 0; i < count; i += 1) {
    const district = selectedDistrict === "all" ? DISTRICTS[i % DISTRICTS.length]! : selectedDistrict;
    const anchor = districtAnchor(district, extent);
    const angle = i * 2.399 + time * (0.18 + (i % 5) * 0.008);
    const radius = 0.28 + hash01(i * 47) * (district === "core" ? 1.7 : 1.2);
    const point: Vec3 = [
      anchor[0] + Math.cos(angle) * radius,
      -0.18 + hash01(i * 17) * 0.72 + Math.sin(time * 0.9 + i) * 0.018,
      anchor[1] + Math.sin(angle) * radius * 0.72
    ];
    if (i % 11 === 0) amber.push(point);
    else if (i % 7 === 0) green.push(point);
    else cyan.push(point);
  }
  addSmartCityWindowPulsePoints(windowCyan, windowAmber, time, columns, spacing, selectedDistrict);
  return [
    { material: "particle", label: "batched smart-city data pulse points", positions: cyan },
    { material: "particleWarm", label: "batched logistics data pulse points", positions: amber },
    { material: "particleGreen", label: "batched sensor data pulse points", positions: green },
    { material: "particle", label: "batched facade window data pulse points", positions: windowCyan },
    { material: "particleWarm", label: "batched active-window data pulse points", positions: windowAmber }
  ].filter((group) => group.positions.length > 0);
}

function addSmartCityWindowPulsePoints(
  cyan: Vec3[],
  amber: Vec3[],
  time: number,
  columns: number,
  spacing: number,
  selectedDistrict: SmartCityDistrict
): void {
  for (let row = 0; row < columns; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const profile = cityTowerProfile(row, col, columns, spacing, selectedDistrict, "medium");
      if (!profile) continue;
      const selected = selectedDistrict === profile.district || (selectedDistrict === "all" && profile.district === "core");
      if (!selected && (row + col) % 2 !== 0) continue;

      const floorCount = Math.max(2, Math.min(4, Math.floor(profile.height * 4.8)));
      const step = selected || profile.district === "core" ? 1 : 2;
      const slots = 2 + ((row + col) % 3);
      for (let floor = 1; floor <= floorCount; floor += step) {
        const y = -0.48 + profile.height * floor / (floorCount + 1);
        for (let slot = 0; slot < slots; slot += 1) {
          if ((floor + slot + row + col) % 3 === 0) continue;
          const x = profile.x + (slot - (slots - 1) / 2) * profile.width * 0.34;
          const z = profile.z - profile.depth * 0.63;
          const point: Vec3 = [x, y + Math.sin(time * 0.82 + floor + slot) * 0.006, z];
          if ((floor + slot + row) % 7 === 0) amber.push(point);
          else cyan.push(point);
        }
      }
    }
  }
}

function createSingleItems(
  time: number,
  selectedDistrict: SmartCityDistrict,
  selectedAnchor: readonly [number, number],
  extent: number,
  flythrough: boolean
): SmartCitySingleItem[] {
  const singles: SmartCitySingleItem[] = [];
  const activeDistricts = selectedDistrict === "all" ? DISTRICTS : [selectedDistrict];
  for (let i = 0; i < activeDistricts.length; i += 1) {
    const district = activeDistricts[i]!;
    const anchor = districtAnchor(district, extent);
    const scale = district === selectedDistrict || selectedDistrict === "all" ? 0.052 : 0.04;
    singles.push({
      geometry: "sphere",
      material: i % 2 ? "amberGlow" : "cyanGlow",
      label: "district data pulse",
      position: [anchor[0], 0.34 + i * 0.06 + Math.sin(time * 0.8 + i) * 0.02, anchor[1]],
      scale: [scale, scale, scale],
      rotation: [0, 0, 0]
    });
    singles.push({
      geometry: "cube",
      material: "transparentCyan",
      label: "vertical data pulse",
      position: [anchor[0], -0.02, anchor[1]],
      scale: [0.014, 0.42 + i * 0.04, 0.014],
      rotation: [0, time * 0.12, 0]
    });
  }

  if (flythrough) {
    for (let i = 0; i < 14; i += 1) {
      const angle = i * Math.PI * 2 / 14 + time * 0.24;
      const radius = 2.0 + (i % 5) * 0.22;
      singles.push({
        geometry: "capsule",
        material: i % 2 === 0 ? "cyanGlow" : "white",
        label: "aerial transit drone",
        position: [Math.cos(angle) * radius, 0.92 + (i % 4) * 0.19, Math.sin(angle * 0.82) * radius * 0.72],
        scale: [0.07, 0.32, 0.07],
        rotation: [Math.PI / 2, angle, 0.08]
      });
    }
  }

  if (flythrough) {
    for (let i = 0; i < 8; i += 1) {
      const z = SMART_CITY_ROAD_Z[i % SMART_CITY_ROAD_Z.length]!;
      const sweep = ((time * (0.2 + i * 0.007) + i * 0.13) % 1 - 0.5) * 11.2;
      singles.push({
        geometry: "capsule",
        material: i % 2 === 0 ? "cyanGlow" : "amberGlow",
        label: "district light rail car",
        position: [sweep, -0.18, z],
        scale: [0.09, 0.28, 0.09],
        rotation: [0, 0, Math.PI / 2]
      });
    }
  }

  if (flythrough) {
    for (let i = 0; i < 10; i += 1) {
      const t = i / 9;
      singles.push({
        geometry: "sphere",
        material: i % 2 ? "amberGlow" : "cyanGlow",
        label: "flythrough route data pulse",
        position: [
          selectedAnchor[0] * (1 - t) + Math.sin(time * 0.3 + i) * 0.3,
          0.65 + t * 1.45,
          selectedAnchor[1] * (1 - t) + Math.cos(time * 0.24 + i) * 0.3
        ],
        scale: [0.035, 0.035, 0.035],
        rotation: [0, 0, 0]
      });
    }
  }

  return singles;
}

function normalizeLevel(value: string): SmartCityLevel {
  return value === "low" || value === "high" || value === "extreme" ? value : "medium";
}

function normalizeDistrict(value: string): SmartCityDistrict {
  return value === "north" || value === "harbor" || value === "core" || value === "industrial" ? value : "all";
}

function columnsForLevel(level: SmartCityLevel): number {
  if (level === "extreme") return 24;
  if (level === "high") return 20;
  if (level === "low") return 14;
  return 16;
}

function districtForPosition(x: number, z: number): SmartCityDistrict {
  if (Math.abs(x) < 1.18 && Math.abs(z) < 1.18) return "core";
  if (x > 0 && z > 0) return "harbor";
  if (x > 0 && z <= 0) return "industrial";
  return "north";
}

function districtAnchor(district: SmartCityDistrict, extent: number): readonly [number, number] {
  if (district === "north") return [-4.25, 3.18];
  if (district === "harbor") return [4.25, 3.04];
  if (district === "industrial") return [4.25, -3.66];
  return [0, 0];
}

function cityTowerProfile(
  row: number,
  col: number,
  columns: number,
  spacing: number,
  selectedDistrict: SmartCityDistrict,
  level: SmartCityLevel = "medium"
): {
  readonly x: number;
  readonly z: number;
  readonly district: SmartCityDistrict;
  readonly height: number;
  readonly width: number;
  readonly depth: number;
} | null {
  const x = (col - (columns - 1) / 2) * spacing;
  const z = (row - (columns - 1) / 2) * spacing;
  if (Math.hypot(x, z) < SMART_CITY_AUTHORED_CORE_KEEPOUT_RADIUS) return null;
  const district = districtForPosition(x, z);
  if (selectedDistrict !== "all" && district !== selectedDistrict) return null;
  const densityStride = level === "low" ? 3 : level === "medium" ? 2 : 1;
  if ((row + col) % densityStride !== 0) return null;
  const onAvenue = row % 6 === 0 || col % 6 === 0;
  if (onAvenue && (row + col) % 2 === 0) return null;
  const selectedBoost = selectedDistrict === district ? 0.14 : 0;
  const height = Math.min(
    SMART_CITY_OVERLAY_MAX_HEIGHT,
    0.18 + hash01(row * 83 + col * 41) * 0.38 + selectedBoost
  );
  const width = Math.min(SMART_CITY_OVERLAY_MAX_WIDTH, 0.026 + hash01(col * 19 + row) * 0.024);
  const depth = width;
  return { x, z, district, height, width, depth };
}

export function smartCityColumnsForLevel(level: string): number {
  return columnsForLevel(normalizeLevel(level));
}

export function createSmartCityControlSnapshot(options: SmartCityEvidenceOptions): {
  readonly towerInstances: number;
  readonly trafficInstances: number;
  readonly selectedDistrict: SmartCityDistrict;
  readonly maxOverlayWidth: number;
  readonly maxOverlayHeight: number;
  readonly authoredCoreKeepoutRadius: number;
  readonly flythrough: boolean;
} {
  const evidence = createSmartCityRouteEvidence(options);
  return {
    towerInstances: evidence.towerInstances,
    trafficInstances: evidence.trafficInstances,
    selectedDistrict: evidence.selectedDistrict,
    maxOverlayWidth: evidence.maxOverlayWidth,
    maxOverlayHeight: evidence.maxOverlayHeight,
    authoredCoreKeepoutRadius: evidence.authoredCoreKeepoutRadius,
    flythrough: options.flythrough
  };
}

function pushMatrix(batch: MutableBatch, position: Vec3, scale: Vec3, rotation: Vec3): void {
  writeModelMatrix(batch.transforms, batch.count * 16, position, scale, rotation);
  batch.count += 1;
}

function toInstanceBatch(
  geometry: SmartCityGeometryKey,
  material: string,
  label: string,
  batch: MutableBatch
): SmartCityInstanceBatch {
  return {
    geometry,
    material,
    label,
    transforms: batch.transforms.subarray(0, batch.count * 16),
    count: batch.count
  };
}

function addSegment(target: Vec3[], start: Vec3, end: Vec3): void {
  target.push(start, end);
}

function addRectangle(target: Vec3[], x: number, y: number, z: number, width: number, depth: number): void {
  const x0 = x - width * 0.5;
  const x1 = x + width * 0.5;
  const z0 = z - depth * 0.5;
  const z1 = z + depth * 0.5;
  addSegment(target, [x0, y, z0], [x1, y, z0]);
  addSegment(target, [x1, y, z0], [x1, y, z1]);
  addSegment(target, [x1, y, z1], [x0, y, z1]);
  addSegment(target, [x0, y, z1], [x0, y, z0]);
}

function toLineGroup(material: string, label: string, positions: readonly Vec3[]): SmartCityLineGroup {
  return { material, label, positions, segments: positions.length / 2 };
}
