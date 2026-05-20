import { hash01, writeModelMatrix, type Vec3 } from "./math";
import { clampUnit, type EvidenceInstanceBatch, type EvidenceSingleItem, type RouteEvidencePayload } from "./advancedRouteEvidence";

export interface FogCathedralEvidenceOptions {
  readonly time: number;
  readonly fog: number;
  readonly sun: number;
  readonly beams: boolean;
}

export function createFogCathedralEvidence(options: FogCathedralEvidenceOptions): RouteEvidencePayload {
  const fog = clampUnit(options.fog);
  const sun = clampUnit(options.sun);
  const singles: EvidenceSingleItem[] = [];
  const batches: EvidenceInstanceBatch[] = [];

  batches.push(createDepthHazeBatch(options.time, fog));
  batches.push(createOcclusionBatch(options.time, fog));
  batches.push(createDustBatch(options.time, fog));
  if (options.beams) {
    batches.push(createShaftBatch(options.time, fog, sun));
    singles.push({
      geometry: "sphere",
      material: "sunDisc",
      label: "distant aperture glow",
      position: [-2.64 + sun * 0.42, 3.12, -7.08],
      scale: [0.11, 0.11, 0.11],
      rotation: [0, 0, 0]
    });
  }

  singles.push(...createDepthAnchors(options.time, fog));

  return {
    routeId: "fog-cathedral",
    singles,
    batches,
    metrics: [
      `${batches.reduce((sum, batch) => sum + batch.count, 0)} atmospheric instances`,
      `${options.beams ? "rounded aperture shaft proxies on" : "shaft proxies off"}`,
      `fog ${fog.toFixed(2)}`,
      `sun ${sun.toFixed(2)}`
    ],
    animatedSystems: [
      "layered foreground/midground/background haze lobes",
      "animated dust field",
      "sun-angle aperture shaft choreography",
      "soft edge occlusion silhouettes",
      "exposure/depth anchor glints"
    ],
    labels: ["Depth", "Haze", "Shafts", "Dust", "Occlusion", "Apertures"],
    approximations: [
      "Fog and god rays are layered transparent proxy geometry, instanced dust, and light choreography.",
      "This helper does not implement or claim native volumetric raymarching, shadowed light volumes, or physically based participating media."
    ],
    unsupportedGaps: [
      "No native volumetric fog/light-scattering pass is exposed in the gallery route.",
      "Authored cathedral crop edges and transparent-proxy silhouettes still need screenshot review.",
      "Transparency sorting, banding, and overdraw cost must be checked on accepted camera presets."
    ],
    integrationSteps: [
      "Keep fog atmospheric helpers scoped to this route.",
      "Render shaft evidence as aperture-local translucent proxies that support the authored cathedral environment instead of covering it.",
      "Keep failed metadata until regenerated screenshots prove crop edges and transparent proxy silhouettes are acceptable."
    ]
  };
}

function createDepthHazeBatch(time: number, fog: number): EvidenceInstanceBatch {
  const count = 9;
  const transforms = new Float32Array(count * 16);
  const apertureCenters = [-1.08, -0.18, 0.78] as const;
  for (let i = 0; i < count; i += 1) {
    const depth = i / Math.max(1, count - 1);
    const aperture = i % 3;
    const row = Math.floor(i / 3);
    const z = -7.62 + row * 2.18 + depth * 0.44;
    const y = 0.92 + row * 0.42 + Math.sin(time * 0.13 + i * 0.61) * 0.012;
    const x = apertureCenters[aperture] + Math.sin(row * 1.37 + time * 0.08) * 0.045;
    const width = 0.34 + fog * 0.26 + (1 - depth) * 0.08;
    const height = 0.035 + fog * 0.055;
    const depthScale = 0.032 + depth * 0.014;
    const yaw = Math.sin(i * 1.7) * 0.08;
    writeModelMatrix(transforms, i * 16, [x, y, z], [width, height, depthScale], [0, yaw, 0]);
  }
  return { geometry: "sphere", material: "fogVeil", label: "layered atmospheric depth haze", transforms, count };
}

function createOcclusionBatch(time: number, fog: number): EvidenceInstanceBatch {
  const count = 8;
  const transforms = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    const z = -8.32 + row * 2.38;
    const x = side * (3.12 - row * 0.08);
    const sway = Math.sin(time * 0.11 + i) * 0.018;
    const radius = 0.13 + fog * 0.055;
    writeModelMatrix(transforms, i * 16, [x, 1.02 + row * 0.06, z], [radius, 2.62 - row * 0.06, radius * 0.74], [0, side * (0.07 + sway), 0]);
  }
  return { geometry: "cylinder", material: "fogShadow", label: "fog edge occlusion columns", transforms, count };
}

function createShaftBatch(time: number, fog: number, sun: number): EvidenceInstanceBatch {
  const count = 5;
  const transforms = new Float32Array(count * 16);
  const apertureCenters = [-1.58, -0.18, 1.18] as const;
  for (let i = 0; i < count; i += 1) {
    const depth = i / Math.max(1, count - 1);
    const aperture = i % 3;
    const x = apertureCenters[aperture] + depth * 0.34 + sun * 0.18;
    const y = 2.12 + depth * 0.28;
    const z = -7.48 + i * 1.02;
    const sway = Math.sin(time * 0.17 + i * 0.72) * 0.018;
    const radius = 0.07 + fog * 0.038 + (i % 2) * 0.012;
    const length = 0.78 - depth * 0.14;
    writeModelMatrix(transforms, i * 16, [x, y, z], [radius, length, radius * 0.72], [0.52, sun * 0.18 + depth * 0.06 + sway, 0.08]);
  }
  return { geometry: "capsule", material: "beam", label: "soft light shaft", transforms, count };
}

function createDustBatch(time: number, fog: number): EvidenceInstanceBatch {
  const count = 72;
  const transforms = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) {
    const orbit = i * 2.399 + time * (0.028 + (i % 7) * 0.003);
    const radius = 0.68 + hash01(i * 31) * 4.05;
    const x = Math.cos(orbit) * radius * 0.7;
    const y = 0.02 + hash01(i * 7) * (2.32 + fog * 0.78);
    const z = -8.22 + hash01(i * 17) * 13.1 + Math.sin(orbit * 0.76) * 0.14;
    const size = 0.007 + hash01(i * 13) * 0.018;
    writeModelMatrix(transforms, i * 16, [x, y, z], [size, size, size], [0, 0, 0]);
  }
  return { geometry: "sphere", material: "dustMote", label: "batched dust evidence field", transforms, count };
}

function createDepthAnchors(time: number, fog: number): EvidenceSingleItem[] {
  const anchors: EvidenceSingleItem[] = [];
  for (let i = 0; i < 8; i += 1) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    const position: Vec3 = [side * (2.78 - row * 0.16), 2.2 + row * 0.18, -7.95 + row * 2.15];
    anchors.push({
      geometry: "sphere",
      material: i % 3 === 0 ? "amberGlow" : "transparentAmber",
      label: "depth-readable capital glint",
      position,
      scale: [0.14 + fog * 0.055, 0.022, 0.14],
      rotation: [0, time * 0.06 + i * 0.24, 0]
    });
  }
  return anchors;
}
