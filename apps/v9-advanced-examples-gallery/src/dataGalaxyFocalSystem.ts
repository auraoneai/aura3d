import { Geometry, type RenderItem } from "@galileo3d/rendering";
import { item, mat, type Resources } from "./sceneBuilderPrimitives";
import { modelMatrix, writeModelMatrix, type Vec3 } from "./math";
import type { DataGalaxyBudgetMode } from "./dataGalaxyBudgets";

export interface DataGalaxyFocalSystemResult {
  readonly items: readonly RenderItem[];
  readonly animatedSystems: readonly string[];
  readonly approximations: readonly string[];
  readonly labels: readonly string[];
}

export function createDataGalaxyFocalSystem(
  r: Resources,
  time: number,
  speed: number,
  mode: DataGalaxyBudgetMode
): DataGalaxyFocalSystemResult {
  const profile = mode === "showcase"
    ? { coreScale: 2.25, arcScale: 1.55, clusterCount: 140, secondaryCount: 78, shellScale: 1.58 }
    : mode === "stress"
      ? { coreScale: 1.25, arcScale: 1.0, clusterCount: 54, secondaryCount: 28, shellScale: 1.0 }
      : { coreScale: 1.15, arcScale: 0.95, clusterCount: 42, secondaryCount: 18, shellScale: 0.92 };
  const items: RenderItem[] = [
    focalWireShellItem(r, "transparent-data-shell", "transparentCyan", time, speed, profile.shellScale),
    item(r, "cube", "cyanGlow", [0, 0.03, 0], [0.055 * profile.coreScale, 0.11 * profile.coreScale, 0.055 * profile.coreScale], [0.18, time * 0.42 * speed, -0.08], "DataGalaxyFocalSystem central data core"),
    item(r, "cube", "violetGlow", [-0.045, 0.068, -0.028], [0.032 * profile.coreScale, 0.07 * profile.coreScale, 0.032 * profile.coreScale], [-0.16, time * -0.34 * speed, 0.12], "DataGalaxyFocalSystem nested model-state core"),
    item(r, "cube", "amberGlow", [0.052, -0.018, 0.034], [0.026 * profile.coreScale, 0.052 * profile.coreScale, 0.026 * profile.coreScale], [0.12, time * 0.48 * speed, 0.2], "DataGalaxyFocalSystem anomaly core shard"),
    focalArcItem(r, "core-orbit", "transparentCyan", [0, 0.032, 0], [profile.arcScale, profile.arcScale, profile.arcScale], [0.34, time * 0.18 * speed, 0.18], 0.27, 0.17, Math.PI * 1.42, 24),
    focalArcItem(r, "vertical-model-orbit", "transparentCyan", [-0.03, 0.046, -0.012], [0.8 * profile.arcScale, 1.05 * profile.arcScale, 0.82 * profile.arcScale], [Math.PI / 2.8, time * -0.16 * speed, -0.22], 0.24, 0.15, Math.PI * 1.16, 20),
    focalArcItem(r, "amber-transfer-orbit", "transparentAmber", [0.06, -0.01, 0.036], [0.72 * profile.arcScale, 0.78 * profile.arcScale, 0.72 * profile.arcScale], [-0.36, time * 0.22 * speed + 0.8, 0.12], 0.2, 0.12, Math.PI * 0.92, 16),
    focalRailItem(r, "foreground-depth-rail", "transparentCyan", [-0.26, -0.12, 0.24], [0.18, -0.01, 0.08], 8),
    focalRailItem(r, "background-depth-rail", "transparentCyan", [0.26, 0.15, -0.22], [0.06, 0.04, -0.04], 7),
    focalFacetRibItem(r, "cyan-facet-ribs", "transparentCyan", time, speed, mode === "showcase" ? 18 : 10, profile.arcScale),
    focalPanelItem(r, "left-data-panel", "transparentCyan", [-0.28, 0.0, 0.2], [0.18, 0.16, 0.02], [-0.1, -0.55, 0.08], 7, 5),
    focalPanelItem(r, "right-data-panel", "transparentAmber", [0.28, 0.08, -0.2], [0.16, 0.14, 0.02], [0.14, -0.5, -0.08], 6, 4),
    focalTransferItem(r, "amber-transfer-lines", "transparentAmber"),
    clusteredNodeItem(r, "cyan-clustered-data-nodes", "cyanGlow", time, speed, [
      [-0.18, -0.035, 0.17],
      [0.18, 0.12, -0.15],
      [-0.23, 0.14, -0.2]
    ], profile.clusterCount),
    clusteredNodeItem(r, "amber-violet-clustered-data-nodes", "amberGlow", time + 1.7, speed * 0.86, [
      [0.22, -0.045, 0.12],
      [-0.08, 0.16, -0.16]
    ], profile.secondaryCount)
  ];

  return {
    items,
    animatedSystems: [
      "DataGalaxyFocalSystem central data core",
      "DataGalaxyFocalSystem transparent data shell",
      "DataGalaxyFocalSystem layered orbit arcs",
      "DataGalaxyFocalSystem clustered node lattice",
    "DataGalaxyFocalSystem facet ribs, data panels, and transfer lines",
      "DataGalaxyFocalSystem depth rails"
    ],
    approximations: [
      "DataGalaxyFocalSystem is route-owned CPU/static focal geometry; it is not native GPU compute and does not promote the generated support GLB to focal hero proof.",
      "Default showcase visual hierarchy is carried by central core, clustered nodes, arcs, data panels, and depth rails rather than object-count filler or generated scaffold geometry."
    ],
    labels: ["DataGalaxyFocalSystem", "Central core", "Layered arcs", "Clustered nodes", "Data panels"]
  };
}

function clusteredNodeItem(
  r: Resources,
  key: string,
  material: string,
  time: number,
  speed: number,
  centers: readonly Vec3[],
  count: number
): RenderItem {
  const transforms = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) {
    const center = centers[i % centers.length]!;
    const ring = Math.floor(i / centers.length);
    const phase = i * 2.399 + time * (0.11 + (i % 6) * 0.007) * speed;
    const radius = 0.04 + (ring % 6) * 0.014;
    const scale = 0.013 + (i % 4) * 0.0024;
    writeModelMatrix(transforms, i * 16, [
      center[0] + Math.cos(phase) * radius,
      center[1] + Math.sin(phase * 1.7) * 0.02,
      center[2] + Math.sin(phase) * radius * 0.68
    ], [scale, scale * 1.8, scale], [0.16, phase * 0.4, -0.08]);
  }
  return {
    geometry: r.geometry.cube,
    material: mat(r, material),
    instanceTransforms: transforms,
    label: `DataGalaxyFocalSystem ${key}`
  };
}

function focalArcItem(
  r: Resources,
  key: string,
  material: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3,
  radiusX: number,
  radiusZ: number,
  sweep: number,
  segments: number
): RenderItem {
  return {
    geometry: focalArcGeometry(r, key, radiusX, radiusZ, sweep, segments),
    material: mat(r, material),
    modelMatrix: modelMatrix(position, scale, rotation),
    label: `DataGalaxyFocalSystem layered ${key}`
  };
}

function focalRailItem(
  r: Resources,
  key: string,
  material: string,
  from: Vec3,
  to: Vec3,
  segments: number
): RenderItem {
  const positions: Vec3[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = i / segments;
    const b = (i + 0.62) / segments;
    const start: Vec3 = [
      from[0] + (to[0] - from[0]) * a,
      from[1] + (to[1] - from[1]) * a,
      from[2] + (to[2] - from[2]) * a
    ];
    const end: Vec3 = [
      from[0] + (to[0] - from[0]) * b,
      from[1] + (to[1] - from[1]) * b,
      from[2] + (to[2] - from[2]) * b
    ];
    positions.push(start, end);
  }
  const cacheKey = `data-galaxy-focal:${key}:${segments}`;
  let geometry = r.dataGalaxyOverlayGeometries.get(cacheKey);
  if (!geometry) {
    geometry = Geometry.lineSegments(positions);
    r.dataGalaxyOverlayGeometries.set(cacheKey, geometry);
  }
  return { geometry, material: mat(r, material), label: `DataGalaxyFocalSystem ${key}` };
}

function focalFacetRibItem(
  r: Resources,
  key: string,
  material: string,
  time: number,
  speed: number,
  count: number,
  scale: number
): RenderItem {
  const transforms = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) {
    const angle = i * Math.PI * 2 / count + time * 0.05 * speed;
    const radius = 0.135 * scale;
    const length = 0.058 * scale * (i % 3 === 0 ? 1.35 : 1);
    writeModelMatrix(transforms, i * 16, [
      Math.cos(angle) * radius,
      0.03 + Math.sin(angle * 1.7) * 0.028,
      Math.sin(angle) * radius * 0.76
    ], [0.007, length, 0.011], [0.22, angle, -0.14]);
  }
  return {
    geometry: r.geometry.cube,
    material: mat(r, material),
    instanceTransforms: transforms,
    label: `DataGalaxyFocalSystem ${key}`
  };
}

function focalTransferItem(r: Resources, key: string, material: string): RenderItem {
  const positions: readonly Vec3[] = [
    [0.052, -0.018, 0.034], [0, 0.03, 0],
    [0.052, -0.018, 0.034], [0.16, 0.02, 0.1],
    [0.052, -0.018, 0.034], [0.12, -0.055, 0.16],
    [-0.045, 0.068, -0.028], [-0.18, 0.11, -0.15],
    [-0.045, 0.068, -0.028], [0.02, 0.16, -0.18]
  ];
  const cacheKey = `data-galaxy-focal:${key}`;
  let geometry = r.dataGalaxyOverlayGeometries.get(cacheKey);
  if (!geometry) {
    geometry = Geometry.lineSegments(positions);
    r.dataGalaxyOverlayGeometries.set(cacheKey, geometry);
  }
  return { geometry, material: mat(r, material), label: `DataGalaxyFocalSystem ${key}` };
}

function focalPanelItem(
  r: Resources,
  key: string,
  material: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3,
  columns: number,
  rows: number
): RenderItem {
  const positions: Vec3[] = [];
  for (let x = 0; x <= columns; x += 1) {
    const normalized = x / columns - 0.5;
    positions.push([normalized, -0.5, 0], [normalized, 0.5, 0]);
  }
  for (let y = 0; y <= rows; y += 1) {
    const normalized = y / rows - 0.5;
    positions.push([-0.5, normalized, 0], [0.5, normalized, 0]);
  }
  const cacheKey = `data-galaxy-focal:${key}:${columns}:${rows}`;
  let geometry = r.dataGalaxyOverlayGeometries.get(cacheKey);
  if (!geometry) {
    geometry = Geometry.lineSegments(positions);
    r.dataGalaxyOverlayGeometries.set(cacheKey, geometry);
  }
  return {
    geometry,
    material: mat(r, material),
    modelMatrix: modelMatrix(position, scale, rotation),
    label: `DataGalaxyFocalSystem ${key}`
  };
}

function focalWireShellItem(
  r: Resources,
  key: string,
  material: string,
  time: number,
  speed: number,
  scale: number
): RenderItem {
  const cacheKey = `data-galaxy-focal:${key}:${scale}`;
  let geometry = r.dataGalaxyOverlayGeometries.get(cacheKey);
  if (!geometry) {
    const positions: Vec3[] = [];
    appendEllipseSegments(positions, 0.21 * scale, 0.13 * scale, "xz", 24);
    appendEllipseSegments(positions, 0.17 * scale, 0.11 * scale, "xy", 18);
    appendEllipseSegments(positions, 0.15 * scale, 0.1 * scale, "yz", 18);
    geometry = Geometry.lineSegments(positions);
    r.dataGalaxyOverlayGeometries.set(cacheKey, geometry);
  }
  return {
    geometry,
    material: mat(r, material),
    modelMatrix: modelMatrix([0, 0.034, 0], [1, 1, 1], [0.12, time * 0.16 * speed, -0.08]),
    label: "DataGalaxyFocalSystem transparent data shell"
  };
}

function appendEllipseSegments(
  positions: Vec3[],
  radiusA: number,
  radiusB: number,
  plane: "xy" | "xz" | "yz",
  segments: number
): void {
  for (let i = 0; i < segments; i += 1) {
    const a = i / segments * Math.PI * 2;
    const b = (i + 0.76) / segments * Math.PI * 2;
    positions.push(ellipsePoint(radiusA, radiusB, plane, a), ellipsePoint(radiusA, radiusB, plane, b));
  }
}

function ellipsePoint(radiusA: number, radiusB: number, plane: "xy" | "xz" | "yz", angle: number): Vec3 {
  const x = Math.cos(angle) * radiusA;
  const y = Math.sin(angle) * radiusB;
  if (plane === "xy") return [x, y, 0];
  if (plane === "xz") return [x, 0, y];
  return [0, x, y];
}

function focalArcGeometry(
  r: Resources,
  key: string,
  radiusX: number,
  radiusZ: number,
  sweep: number,
  segments: number
): Geometry {
  const cacheKey = `data-galaxy-focal:${key}:${radiusX}:${radiusZ}:${sweep}:${segments}`;
  let geometry = r.dataGalaxyOverlayGeometries.get(cacheKey);
  if (geometry) return geometry;
  const positions: Vec3[] = [];
  const start = -sweep * 0.5;
  for (let i = 0; i < segments; i += 1) {
    const a = start + sweep * i / segments;
    const b = start + sweep * (i + 0.72) / segments;
    positions.push(
      [Math.cos(a) * radiusX, Math.sin(a * 1.7) * 0.025, Math.sin(a) * radiusZ],
      [Math.cos(b) * radiusX, Math.sin(b * 1.7) * 0.025, Math.sin(b) * radiusZ]
    );
  }
  geometry = Geometry.lineSegments(positions);
  r.dataGalaxyOverlayGeometries.set(cacheKey, geometry);
  return geometry;
}
