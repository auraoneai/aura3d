import { Geometry, type RenderItem } from "@aura3d/rendering";
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
    ? { coreScale: 1.36, arcScale: 2.05, clusterCount: 86, secondaryCount: 58, shellScale: 1.44 }
    : mode === "stress"
      ? { coreScale: 1.25, arcScale: 1.0, clusterCount: 54, secondaryCount: 28, shellScale: 1.0 }
      : { coreScale: 1.15, arcScale: 0.95, clusterCount: 42, secondaryCount: 18, shellScale: 0.92 };
  const items: RenderItem[] = [
    focalWireShellItem(r, "transparent-data-shell", "transparentCyan", time, speed, profile.shellScale),
    item(r, "sphere", "cyanGlow", [0, 0.03, 0], [0.092 * profile.coreScale, 0.092 * profile.coreScale, 0.092 * profile.coreScale], [0.18, time * 0.42 * speed, -0.08], "DataGalaxyFocalSystem luminous data nucleus"),
    item(r, "sphere", "violetGlow", [-0.055, 0.078, -0.036], [0.038 * profile.coreScale, 0.038 * profile.coreScale, 0.038 * profile.coreScale], [-0.16, time * -0.34 * speed, 0.12], "DataGalaxyFocalSystem violet model-state satellite"),
    item(r, "sphere", "amberGlow", [0.066, -0.024, 0.044], [0.034 * profile.coreScale, 0.034 * profile.coreScale, 0.034 * profile.coreScale], [0.12, time * 0.48 * speed, 0.2], "DataGalaxyFocalSystem amber anomaly satellite"),
    focalArcItem(r, "core-orbit", "transparentCyan", [0, 0.032, 0], [profile.arcScale, profile.arcScale, profile.arcScale], [0.34, time * 0.18 * speed, 0.18], 0.27, 0.17, Math.PI * 1.42, mode === "showcase" ? 42 : 24),
    focalArcItem(r, "vertical-model-orbit", "transparentCyan", [-0.03, 0.046, -0.012], [0.8 * profile.arcScale, 1.05 * profile.arcScale, 0.82 * profile.arcScale], [Math.PI / 2.8, time * -0.16 * speed, -0.22], 0.24, 0.15, Math.PI * 1.16, mode === "showcase" ? 36 : 20),
    focalArcItem(r, "amber-transfer-orbit", "transparentAmber", [0.06, -0.01, 0.036], [0.72 * profile.arcScale, 0.78 * profile.arcScale, 0.72 * profile.arcScale], [-0.36, time * 0.22 * speed + 0.8, 0.12], 0.2, 0.12, Math.PI * 0.92, mode === "showcase" ? 28 : 16),
    focalArcItem(r, "equatorial-data-ring", "transparentCyan", [0, 0.032, 0], [1.05 * profile.arcScale, 1.05 * profile.arcScale, 1.05 * profile.arcScale], [0.04, time * 0.055 * speed, 0.02], 0.31, 0.205, Math.PI * 2, mode === "showcase" ? 88 : 30),
    focalArcItem(r, "vertical-context-ring", "transparentCyan", [0, 0.034, 0], [0.9 * profile.arcScale, 1.08 * profile.arcScale, 0.92 * profile.arcScale], [Math.PI / 2.08, time * -0.044 * speed, -0.18], 0.275, 0.18, Math.PI * 1.78, mode === "showcase" ? 68 : 24),
    focalArcItem(r, "warm-anomaly-ring", "transparentAmber", [0.028, 0.012, 0.022], [0.78 * profile.arcScale, 0.82 * profile.arcScale, 0.78 * profile.arcScale], [-0.2, time * 0.064 * speed + 0.42, 0.24], 0.235, 0.145, Math.PI * 1.56, mode === "showcase" ? 54 : 20),
    focalStreamItem(r, "foreground-cyan-stream", "transparentCyan", [-0.3, -0.1, 0.22], [0.22, -0.02, 0.08], time, speed, mode === "showcase" ? 22 : 14),
    focalStreamItem(r, "background-cyan-stream", "transparentCyan", [0.28, 0.16, -0.24], [0.04, 0.05, -0.04], time + 1.2, speed, mode === "showcase" ? 20 : 12),
    focalStreamItem(r, "amber-cross-stream", "transparentAmber", [-0.08, 0.14, -0.2], [0.28, -0.04, 0.12], time + 2.1, speed, mode === "showcase" ? 18 : 10),
    focalHaloNodeItem(r, "cyan-halo-nodes", "cyanGlow", time, speed, mode === "showcase" ? 22 : 12, profile.arcScale),
    focalTransferItem(r, "curved-transfer-streams", "transparentAmber"),
    focalConstellationWebItem(r, "front-constellation-filaments", "transparentCyan", time, speed, mode === "showcase" ? 78 : 48, 0.9 * profile.arcScale),
    focalConstellationWebItem(r, "warm-anomaly-filaments", "transparentAmber", time + 1.4, speed * 0.92, mode === "showcase" ? 52 : 32, 0.7 * profile.arcScale),
    focalConstellationWebItem(r, "green-context-filaments", "transparentGreen", time + 2.2, speed * 0.74, mode === "showcase" ? 30 : 24, 0.56 * profile.arcScale),
    focalSignalBandItem(r, "curated-signal-band-cyan", "cyanGlow", time, speed, mode === "showcase" ? 34 : 18, 0.62 * profile.arcScale),
    focalSignalBandItem(r, "curated-signal-band-violet", "violetGlow", time + 0.8, speed * 0.88, mode === "showcase" ? 24 : 14, 0.46 * profile.arcScale),
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
      "DataGalaxyFocalSystem curated constellation filaments",
      "DataGalaxyFocalSystem front signal bands",
      "DataGalaxyFocalSystem clustered node lattice",
      "DataGalaxyFocalSystem organic orbit streams and halo nodes"
    ],
    approximations: [
      "DataGalaxyFocalSystem is route-owned CPU/static focal geometry; it uses no renderer-side particle solver and does not promote the generated support GLB to focal hero proof.",
      "Default showcase visual hierarchy is carried by spherical nuclei, clustered nodes, orbit arcs, and curved streams; no cuboid scaffold, grid panel, debug axis, or object-count filler is allowed to carry the hero."
    ],
    labels: ["DataGalaxyFocalSystem", "Central nucleus", "Layered arcs", "Constellation filaments", "Signal bands", "Spherical clusters", "Curved streams"]
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
    const scale = 0.011 + (i % 4) * 0.002;
    writeModelMatrix(transforms, i * 16, [
      center[0] + Math.cos(phase) * radius,
      center[1] + Math.sin(phase * 1.7) * 0.02,
      center[2] + Math.sin(phase) * radius * 0.68
    ], [scale, scale, scale], [0.16, phase * 0.4, -0.08]);
  }
  return {
    geometry: r.geometry.sphere,
    material: mat(r, material),
    instanceTransforms: transforms,
    label: `DataGalaxyFocalSystem ${key}`
  };
}

function focalConstellationWebItem(
  r: Resources,
  key: string,
  material: string,
  time: number,
  speed: number,
  segments: number,
  scale: number
): RenderItem {
  const cacheKey = `data-galaxy-focal:${key}:${segments}:${scale.toFixed(2)}`;
  let geometry = r.dataGalaxyOverlayGeometries.get(cacheKey);
  if (!geometry) {
    const positions: Vec3[] = [];
    for (let i = 0; i < segments; i += 1) {
      const a = i * 2.399;
      const b = a + 0.42 + (i % 7) * 0.037;
      const radiusA = (0.08 + (i % 11) * 0.012) * scale;
      const radiusB = (0.12 + (i % 13) * 0.014) * scale;
      const layer = ((i % 9) - 4) * 0.009 * scale;
      positions.push(
        [Math.cos(a) * radiusA, 0.02 + Math.sin(a * 1.7) * 0.044 * scale + layer, Math.sin(a) * radiusA * 0.74],
        [Math.cos(b) * radiusB, 0.02 + Math.sin(b * 1.5) * 0.04 * scale - layer * 0.6, Math.sin(b) * radiusB * 0.72]
      );
    }
    geometry = Geometry.lineSegments(positions);
    r.dataGalaxyOverlayGeometries.set(cacheKey, geometry);
  }
  return {
    geometry,
    material: mat(r, material),
    modelMatrix: modelMatrix([0, 0.026, 0.018], [1, 1, 1], [0.16, time * 0.08 * speed, -0.1]),
    label: `DataGalaxyFocalSystem curated constellation filaments ${key}`
  };
}

function focalSignalBandItem(
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
    const row = i % 6;
    const column = Math.floor(i / 6);
    const angle = column * 0.42 + row * 0.14 + time * 0.028 * speed;
    const radius = (0.13 + column * 0.009) * scale;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * 0.72;
    const y = -0.12 + row * 0.043 + Math.sin(time * 0.2 * speed + i * 0.31) * 0.008;
    const length = 0.045 + (i % 5) * 0.012;
    writeModelMatrix(transforms, i * 16, [x, y, z], [length, 0.0065, 0.008], [0.08, angle + Math.PI / 2, -0.06]);
  }
  return {
    geometry: r.geometry.cube,
    material: mat(r, material),
    instanceTransforms: transforms,
    label: `DataGalaxyFocalSystem curated signal bands ${key}`
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

function focalStreamItem(
  r: Resources,
  key: string,
  material: string,
  from: Vec3,
  to: Vec3,
  time: number,
  speed: number,
  segments: number
): RenderItem {
  const positions: Vec3[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = i / segments;
    const b = (i + 0.74) / segments;
    positions.push(streamPoint(from, to, a, time, speed, i), streamPoint(from, to, b, time, speed, i + 1));
  }
  const cacheKey = `data-galaxy-focal:${key}:${segments}:curved`;
  let geometry = r.dataGalaxyOverlayGeometries.get(cacheKey);
  if (!geometry) {
    geometry = Geometry.lineSegments(positions);
    r.dataGalaxyOverlayGeometries.set(cacheKey, geometry);
  } else {
    positions.forEach((position, index) => {
      geometry!.vertexBuffer.setAttribute(index, "position", position);
    });
  }
  return { geometry, material: mat(r, material), label: `DataGalaxyFocalSystem organic ${key}` };
}

function streamPoint(from: Vec3, to: Vec3, t: number, time: number, speed: number, phaseSeed: number): Vec3 {
  const wave = Math.sin(t * Math.PI * 2 + time * 0.18 * speed + phaseSeed * 0.31);
  const lift = Math.sin(t * Math.PI) * 0.035;
  return [
    from[0] + (to[0] - from[0]) * t + wave * 0.018,
    from[1] + (to[1] - from[1]) * t + lift,
    from[2] + (to[2] - from[2]) * t + Math.cos(t * Math.PI * 2 + phaseSeed * 0.19) * 0.016
  ];
}

function focalHaloNodeItem(
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
    const size = 0.0085 * scale * (i % 3 === 0 ? 1.18 : 1);
    writeModelMatrix(transforms, i * 16, [
      Math.cos(angle) * radius,
      0.03 + Math.sin(angle * 1.7) * 0.028,
      Math.sin(angle) * radius * 0.76
    ], [size, size, size], [0.22, angle, -0.14]);
  }
  return {
    geometry: r.geometry.sphere,
    material: mat(r, material),
    instanceTransforms: transforms,
    label: `DataGalaxyFocalSystem ${key}`
  };
}

function focalTransferItem(r: Resources, key: string, material: string): RenderItem {
  const positions: readonly Vec3[] = [
    [0.066, -0.024, 0.044], [0.02, 0.04, 0.012],
    [0.02, 0.04, 0.012], [0, 0.03, 0],
    [0.066, -0.024, 0.044], [0.15, 0.02, 0.1],
    [0.15, 0.02, 0.1], [0.22, -0.035, 0.16],
    [-0.055, 0.078, -0.036], [-0.16, 0.12, -0.15],
    [-0.16, 0.12, -0.15], [0.02, 0.16, -0.18]
  ];
  const cacheKey = `data-galaxy-focal:${key}`;
  let geometry = r.dataGalaxyOverlayGeometries.get(cacheKey);
  if (!geometry) {
    geometry = Geometry.lineSegments(positions);
    r.dataGalaxyOverlayGeometries.set(cacheKey, geometry);
  }
  return { geometry, material: mat(r, material), label: `DataGalaxyFocalSystem ${key}` };
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
    appendEllipseSegments(positions, 0.21 * scale, 0.13 * scale, "xz", 42);
    appendEllipseSegments(positions, 0.17 * scale, 0.11 * scale, "xy", 32);
    appendEllipseSegments(positions, 0.15 * scale, 0.1 * scale, "yz", 32);
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
