import { hash01, type Vec3 } from "./math";
import { clampUnit, type EvidenceInstanceBatch, type EvidenceSingleItem, type RouteEvidencePayload } from "./advancedRouteEvidence";
import { DATA_GALAXY_DEFAULT_PARTICLES, createDataGalaxyBudgetPlan, type DataGalaxyOverlayBudget } from "./dataGalaxyBudgets";

export type DataGalaxyFormation = "galaxy" | "sphere" | "vortex" | "network" | "wave";

export interface DataGalaxyEvidenceOptions {
  readonly time: number;
  readonly requestedParticles: number;
  readonly formation: string;
  readonly speed: number;
  readonly turbulence: number;
  readonly connections: boolean;
  readonly pointer?: { readonly x: number; readonly y: number };
  readonly geometryStats?: DataGalaxyGeometryStats;
}

export interface DataGalaxyPointGroup {
  readonly material: string;
  readonly label: string;
  readonly positions: readonly Vec3[];
}

export interface DataGalaxyLineGroup {
  readonly material: string;
  readonly label: string;
  readonly positions: readonly Vec3[];
  readonly segments: number;
}

export interface DataGalaxyGeometryStats {
  readonly pointCount: number;
  readonly pointDrawBatches: number;
  readonly lineSegmentCount: number;
  readonly lineDrawBatches: number;
  readonly drawBatches: number;
  readonly trailSegmentCount: number;
  readonly connectionSegmentCount: number;
  readonly telemetryRingSegmentCount: number;
}

export interface DataGalaxyGeometryEvidence extends DataGalaxyGeometryStats {
  readonly pointGroups: readonly DataGalaxyPointGroup[];
  readonly lineGroups: readonly DataGalaxyLineGroup[];
  readonly attractors: readonly Vec3[];
}

export interface DataGalaxyRuntimeEvidence {
  readonly source: "dataGalaxyBudgets+dataGalaxyEvidence";
  readonly routeId: "data-galaxy";
  readonly updateMode: "static-geometry";
  readonly gpuBackend: {
    readonly supported: false;
    readonly backend: "none";
    readonly nativeGpuComputeDispatches: 0;
    readonly claimBoundary: string;
  };
  readonly budget: {
    readonly defaultShowcaseMode: boolean;
    readonly mode: string;
    readonly densityTier: string;
    readonly requestedParticles: number;
    readonly effectiveParticles: number;
    readonly primaryCount: number;
    readonly vortexCount: number;
    readonly networkCount: number;
    readonly waveCount: number;
    readonly overlaySparkPointBudget: number;
    readonly overlayLineSegmentBudget: number;
  };
  readonly focalHierarchy: {
    readonly centralSubject: string;
    readonly primaryLayerRole: string;
    readonly supportLayerRole: string;
    readonly authoredGlbRole: string;
  };
  readonly geometry: DataGalaxyGeometryStats;
  readonly authoredAssetDisclosure: {
    readonly activeGeneratedAssetIds: readonly ["data-galaxy-core-blender"];
    readonly generatedNoTextureAuthoredGlb: false;
    readonly premiumTextureBackedAuthoredHero: false;
    readonly supportOnlyUntilVisualReview: true;
  };
  readonly unsupportedGaps: readonly string[];
  readonly integrationSteps: readonly string[];
}

export function createDataGalaxyEvidence(options: DataGalaxyEvidenceOptions): RouteEvidencePayload {
  const particleBudget = createDataGalaxyBudgetPlan({
    requestedParticles: options.requestedParticles,
    connections: options.connections
  });
  const formation = normalizeFormation(options.formation);
  const speed = Number.isFinite(options.speed) ? Math.max(0, options.speed) : 1;
  const batches: EvidenceInstanceBatch[] = [];
  const geometryStats = options.geometryStats;

  return {
    routeId: "data-galaxy",
    singles: createCoreEvidence(options.time, speed, formation),
    batches,
    metrics: [
      `${particleBudget.mode} density mode`,
      `${formatCount(particleBudget.requestedParticles)} CPU/static particles requested`,
      `${formatCount(particleBudget.effectiveParticles)} CPU/static particles rendered`,
      `${formatCount(particleBudget.primaryCount)} ${formation} primary points`,
      `${formatCount(particleBudget.vortexCount)} vortex support points`,
      `${formatCount(particleBudget.networkCount)} network support points`,
      `${formatCount(particleBudget.waveCount)} wave support points`,
      particleBudget.requestedParticles === DATA_GALAXY_DEFAULT_PARTICLES
        ? "route-owned default showcase hierarchy active"
        : "explicit particle-count mode active",
      `${formatCount(particleBudget.overlay.sparkPoints + particleBudget.overlay.coreSparkPoints + particleBudget.overlay.focalClusterPoints)} overlay spark point budget`,
      `${formatCount(particleBudget.overlay.trailSegments + particleBudget.overlay.connectionSegments + particleBudget.overlay.contourSegments + particleBudget.overlay.telemetryRingSegments + particleBudget.overlay.budgetLadderSegments)} overlay line-segment budget`,
      geometryStats
        ? `${formatCount(geometryStats.pointCount)} overlay sparks in ${geometryStats.pointDrawBatches} point draws`
        : "overlay sparks use batched point geometry",
      geometryStats
        ? `${formatCount(geometryStats.lineSegmentCount)} trail/link/ring segments in ${geometryStats.lineDrawBatches} line draws`
        : "trail/link/ring evidence uses batched line geometry",
      geometryStats
        ? `${formatCount(geometryStats.trailSegmentCount)} trail history segments`
        : "trail history segments batched",
      geometryStats
        ? `${formatCount(geometryStats.connectionSegmentCount)} connection/attractor segments`
        : "connection/attractor segments batched",
      geometryStats ? `${geometryStats.drawBatches} total overlay draw batches` : "overlay draw batches reported by route",
      `${batches.reduce((sum, batch) => sum + batch.count, 0)} per-spark instance transforms submitted`,
      `${particleBudget.densityTier} count tier active`,
      options.connections ? "connection evidence enabled" : "connection evidence disabled",
      `${particleBudget.nativeGpuComputeDispatches} native GPU compute dispatches`
    ],
    animatedSystems: [
      "multi-layer point-cloud formations",
      "batched inference spark point buffers",
      "batched trail history line geometry",
      "animated pointer-biased attractor field",
      "connection graph segment batches",
      "focal core cluster volume",
      "route-owned central/foreground/support cluster hierarchy",
      "bounded telemetry latitude rings",
      "formation-specific contour overlays",
      "count-tier density switching evidence",
      "bounded CPU/static budget labels"
    ],
    labels: ["Particles", "Formation", "Attractors", "Connections", "Performance", "CPU/static"],
    approximations: [
      "The route uses four dense G3D point-cloud geometries plus dynamic batched point/line geometry; it does not submit one render object per spark.",
      "Particle positions are deterministic CPU-generated point buffers animated by route transforms and refreshed overlay geometry.",
      "The particle-count control changes the point-buffer partition and overlay sample density, but not the CPU/static update mode.",
      "The default showcase hierarchy is route-generated data visualization geometry, not an unrelated prop or a replacement for texture-backed authored content.",
      "Trail evidence is sampled history geometry for readability, not a temporal GPU simulation buffer.",
      "WebGPU availability in the browser is not counted as native GPU particle compute for this WebGL2 gallery route."
    ],
    unsupportedGaps: [
      "No native GPU-compute particle solver is bound to this route.",
      "No compute-shader particle integration, spatial hashing, or GPU trail buffer is exposed here.",
      "The current Data Galaxy authored GLB is a generated support fixture with embedded generated data-glyph textures on key materials, but it is not accepted as premium focal hero proof.",
      "Particle count limits need route-specific screenshot and frame-cadence review before promotion."
    ],
    integrationSteps: [
      "Keep dense particles in four G3D point buffers so particle count scales independently from render object count.",
      "Use route-local Geometry.points and Geometry.lineSegments batches for inference sparks, trails, rings, links, and attractor vectors.",
      "Keep CPU/static particle telemetry visible and do not report navigator WebGPU support as a native particle solver.",
      "Do not mark GPU particles accepted unless a real compute-backed update path replaces this CPU/static point-buffer mode."
    ]
  };
}

export function createDataGalaxyRuntimeEvidence(
  options: DataGalaxyEvidenceOptions,
  geometryStats: DataGalaxyGeometryStats,
  evidence: Pick<RouteEvidencePayload, "unsupportedGaps" | "integrationSteps">
): DataGalaxyRuntimeEvidence {
  const particleBudget = createDataGalaxyBudgetPlan({
    requestedParticles: options.requestedParticles,
    connections: options.connections
  });
  return {
    source: "dataGalaxyBudgets+dataGalaxyEvidence",
    routeId: "data-galaxy",
    updateMode: "static-geometry",
    gpuBackend: {
      supported: false,
      backend: "none",
      nativeGpuComputeDispatches: particleBudget.nativeGpuComputeDispatches,
      claimBoundary: "This route reports CPU/static point-buffer animation only; it is not native GPGPU/WebGPU particle compute evidence."
    },
    budget: {
      defaultShowcaseMode: particleBudget.requestedParticles === DATA_GALAXY_DEFAULT_PARTICLES && particleBudget.mode === "showcase",
      mode: particleBudget.mode,
      densityTier: particleBudget.densityTier,
      requestedParticles: particleBudget.requestedParticles,
      effectiveParticles: particleBudget.effectiveParticles,
      primaryCount: particleBudget.primaryCount,
      vortexCount: particleBudget.vortexCount,
      networkCount: particleBudget.networkCount,
      waveCount: particleBudget.waveCount,
      overlaySparkPointBudget: particleBudget.overlay.sparkPoints + particleBudget.overlay.coreSparkPoints + particleBudget.overlay.focalClusterPoints,
      overlayLineSegmentBudget: particleBudget.overlay.trailSegments
        + particleBudget.overlay.connectionSegments
        + particleBudget.overlay.contourSegments
        + particleBudget.overlay.telemetryRingSegments
        + particleBudget.overlay.budgetLadderSegments
    },
    focalHierarchy: {
      centralSubject: "bright CPU/static data nucleus with route-generated shell and orbit bars",
      primaryLayerRole: "majority particle allocation is staged as the foreground focal galaxy mass",
      supportLayerRole: "vortex, network, and wave layers are smaller secondary context clusters",
      authoredGlbRole: "generated texture-backed data-galaxy-core-blender remains disclosed support-only content"
    },
    geometry: {
      pointCount: geometryStats.pointCount,
      pointDrawBatches: geometryStats.pointDrawBatches,
      lineSegmentCount: geometryStats.lineSegmentCount,
      lineDrawBatches: geometryStats.lineDrawBatches,
      drawBatches: geometryStats.drawBatches,
      trailSegmentCount: geometryStats.trailSegmentCount,
      connectionSegmentCount: geometryStats.connectionSegmentCount,
      telemetryRingSegmentCount: geometryStats.telemetryRingSegmentCount
    },
    authoredAssetDisclosure: {
      activeGeneratedAssetIds: ["data-galaxy-core-blender"],
      generatedNoTextureAuthoredGlb: false,
      premiumTextureBackedAuthoredHero: false,
      supportOnlyUntilVisualReview: true
    },
    unsupportedGaps: evidence.unsupportedGaps,
    integrationSteps: evidence.integrationSteps
  };
}

export function createDataGalaxyGeometryEvidence(options: DataGalaxyEvidenceOptions): DataGalaxyGeometryEvidence {
  const formation = normalizeFormation(options.formation);
  const speed = Number.isFinite(options.speed) ? Math.max(0, options.speed) : 1;
  const turbulence = clampUnit(options.turbulence);
  const budget = createDataGalaxyBudgetPlan({
    requestedParticles: options.requestedParticles,
    connections: options.connections
  });
  const pointGroups = createOverlayPointGroups(options.time, speed, turbulence, formation, budget.overlay, options.pointer);
  const attractors = createAttractorPositions(options.time, speed, options.pointer);
  const lineGroupResult = createOverlayLineGroups(options.time, speed, turbulence, formation, options.connections, attractors, budget.overlay, budget.effectiveParticles);
  const pointCount = pointGroups.reduce((sum, group) => sum + group.positions.length, 0);
  const lineSegmentCount = lineGroupResult.groups.reduce((sum, group) => sum + group.segments, 0);

  return {
    pointGroups,
    lineGroups: lineGroupResult.groups,
    attractors,
    pointCount,
    pointDrawBatches: pointGroups.length,
    lineSegmentCount,
    lineDrawBatches: lineGroupResult.groups.length,
    drawBatches: pointGroups.length + lineGroupResult.groups.length,
    trailSegmentCount: lineGroupResult.trailSegmentCount,
    connectionSegmentCount: lineGroupResult.connectionSegmentCount,
    telemetryRingSegmentCount: lineGroupResult.telemetryRingSegmentCount
  };
}

function normalizeFormation(value: string): DataGalaxyFormation {
  return value === "sphere" || value === "vortex" || value === "network" || value === "wave" ? value : "galaxy";
}

function createOverlayPointGroups(
  time: number,
  speed: number,
  turbulence: number,
  formation: DataGalaxyFormation,
  overlay: DataGalaxyOverlayBudget,
  pointer: { readonly x: number; readonly y: number } | undefined
): DataGalaxyPointGroup[] {
  const groups: Record<string, Vec3[]> = {
    dataParticle: [],
    dataParticleViolet: [],
    dataParticleWarm: [],
    dataParticleGreen: []
  };
  const pointerAttractor = pointerAttractorPosition(pointer);
  const sparkCount = overlay.sparkPoints;
  const coreSparkCount = overlay.coreSparkPoints;
  const focalClusterCount = overlay.focalClusterPoints;

  for (let i = 0; i < sparkCount; i += 1) {
    const band = i % 5;
    const angle = i * 2.399 + time * (0.24 + band * 0.026) * speed;
    const radius = 0.18 + Math.sqrt(hash01(i * 41)) * (0.78 + turbulence * 0.22);
    const position = pullToward(
      tokenPositionForFormation(i, angle, radius, turbulence, formation),
      pointerAttractor,
      i % 19 === 0 ? 0.18 : 0.035
    );
    const material = i % 17 === 0
      ? "dataParticleWarm"
      : i % 11 === 0
        ? "dataParticleGreen"
        : i % 5 === 0
          ? "dataParticleViolet"
          : "dataParticle";
    groups[material]!.push(position);
  }

  for (let i = 0; i < coreSparkCount; i += 1) {
    const angle = i * 2.399 + time * (0.52 + (i % 4) * 0.018) * speed;
    const radius = 0.08 + hash01(i * 53) * 0.84;
    const y = (hash01(i * 23) - 0.5) * 0.68 + Math.sin(angle * 1.9) * 0.06;
    groups[i % 5 === 0 ? "dataParticleWarm" : i % 2 === 0 ? "dataParticle" : "dataParticleViolet"]!.push([
      Math.cos(angle) * radius,
      y,
      Math.sin(angle) * radius * 0.78
    ]);
  }

  for (let i = 0; i < focalClusterCount; i += 1) {
    const angle = i * 2.399 + time * (0.34 + (i % 7) * 0.014) * speed;
    const shell = 0.24 + Math.sqrt(hash01(i * 97)) * 0.74;
    const verticalBand = (i % 13) / 12 - 0.5;
    const y = verticalBand * 0.84 + Math.sin(angle * 1.7 + i * 0.13) * 0.055;
    const pulse = 0.82 + Math.sin(time * 0.7 * speed + i * 0.31) * 0.1;
    const point: Vec3 = [
      Math.cos(angle) * shell * pulse,
      y,
      Math.sin(angle) * shell * 0.72
    ];
    groups[i % 9 === 0 ? "dataParticleWarm" : i % 4 === 0 ? "dataParticleViolet" : "dataParticle"]!.push(point);
  }

  for (const attractor of createAttractorPositions(time, speed, pointer)) {
    groups.dataParticleWarm.push(attractor);
  }

  return [
    { material: "dataParticle", label: "batched cyan inference spark points", positions: groups.dataParticle },
    { material: "dataParticleViolet", label: "batched violet model-state spark points", positions: groups.dataParticleViolet },
    { material: "dataParticleWarm", label: "batched amber attractor spark points", positions: groups.dataParticleWarm },
    { material: "dataParticleGreen", label: "batched green telemetry spark points", positions: groups.dataParticleGreen }
  ].filter((group) => group.positions.length > 0);
}

function createOverlayLineGroups(
  time: number,
  speed: number,
  turbulence: number,
  formation: DataGalaxyFormation,
  connections: boolean,
  attractors: readonly Vec3[],
  overlay: DataGalaxyOverlayBudget,
  requestedParticles: number
): {
  readonly groups: DataGalaxyLineGroup[];
  readonly trailSegmentCount: number;
  readonly connectionSegmentCount: number;
  readonly telemetryRingSegmentCount: number;
} {
  const cyanTrail: Vec3[] = [];
  const violetTrail: Vec3[] = [];
  const amberTrail: Vec3[] = [];
  const connectionLines: Vec3[] = [];
  const attractorLines: Vec3[] = [];
  const telemetryLines: Vec3[] = [];
  const contourLines: Vec3[] = [];
  const budgetLines: Vec3[] = [];
  const trailCount = overlay.trailSegments;

  for (let i = 0; i < trailCount; i += 1) {
    const band = i % 6;
    const angle = i * 2.399 + time * (0.26 + band * 0.018) * speed;
    const radius = 0.22 + Math.sqrt(hash01(i * 37)) * (0.86 + turbulence * 0.2);
    const head = tokenPositionForFormation(i, angle, radius, turbulence, formation);
    const tail = tokenPositionForFormation(i, angle - 0.11 - band * 0.012, radius * (0.95 - band * 0.006), turbulence, formation);
    addSegment(i % 9 === 0 ? amberTrail : i % 4 === 0 ? violetTrail : cyanTrail, tail, head);
  }

  let connectionSegmentCount = 0;
  if (connections) {
    const connectionCount = overlay.connectionSegments;
    for (let i = 0; i < connectionCount; i += 1) {
      const source = tokenPositionForFormation(i * 5, i * 0.41 + time * 0.08 * speed, 0.34 + (i % 9) * 0.055, turbulence * 0.7, formation);
      const targetAngle = i * 1.17 + time * 0.045 * speed;
      const target: Vec3 = [
        Math.cos(targetAngle) * (0.58 + (i % 5) * 0.075),
        Math.sin(i * 0.37 + time * 0.08 * speed) * 0.34,
        Math.sin(targetAngle) * (0.48 + (i % 7) * 0.055)
      ];
      addSegment(connectionLines, source, target);
      connectionSegmentCount += 1;
    }
  }

  for (let i = 0; i < attractors.length; i += 1) {
    const attractor = attractors[i]!;
    addSegment(attractorLines, attractor, [attractor[0] * 0.32, attractor[1] * 0.18, attractor[2] * 0.32]);
  }

  let telemetryRingSegmentCount = 0;
  const telemetryRingCount = overlay.telemetryRingCount;
  for (let ring = 0; ring < telemetryRingCount; ring += 1) {
    const y = -0.64 + ring * 0.07;
    const radiusX = 0.54 + ring * 0.04 + Math.sin(ring * 0.91) * 0.045;
    const radiusZ = radiusX * (formation === "sphere" ? 0.88 : 0.64);
    const segments = 28;
    addEllipseRing(telemetryLines, radiusX, radiusZ, y, segments, time * 0.16 * speed + ring * 0.22);
    telemetryRingSegmentCount += segments;
  }

  const contourCount = overlay.contourSegments;
  for (let i = 0; i < contourCount; i += 1) {
    const t = i / contourCount;
    const angle = i * 0.299 + time * 0.09 * speed;
    const radius = 0.2 + t * (0.92 + turbulence * 0.18);
    const start = tokenPositionForFormation(i, angle, radius, turbulence * 0.55, formation);
    const end = tokenPositionForFormation(i, angle + 0.03 + (i % 5) * 0.003, radius + 0.02, turbulence * 0.55, formation);
    addSegment(contourLines, start, end);
  }

  const tier = Math.min(1, Math.max(0, (requestedParticles - 4000) / (50000 - 4000)));
  for (let i = 0; i < overlay.budgetLadderSegments; i += 1) {
    const normalized = overlay.budgetLadderSegments <= 1 ? 0 : i / (overlay.budgetLadderSegments - 1);
    const x = -0.72 + i * 0.13;
    const height = 0.035 + normalized * 0.22 * (0.35 + tier * 0.65);
    addSegment(budgetLines, [x, -0.82, 0.88], [x, -0.82 + height, 0.88]);
  }

  const groups: DataGalaxyLineGroup[] = [
    toLineGroup("transparentCyan", "batched cyan particle trail history", cyanTrail),
    toLineGroup("transparentCyan", `${formation} formation contour segment batch`, contourLines),
    toLineGroup("transparentCyan", "batched telemetry latitude rings", telemetryLines),
    toLineGroup("transparentAmber", "particle-count budget ladder", budgetLines),
    toLineGroup("transparentAmber", "batched amber anomaly trail history", amberTrail),
    toLineGroup("transparentCyan", "batched violet model-state trail history", violetTrail),
    toLineGroup("transparentAmber", "batched attractor field vectors", attractorLines)
  ];

  if (connections) {
    groups.splice(3, 0, toLineGroup("transparentCyan", "batched connection graph filaments", connectionLines));
  }

  return {
    groups: groups.filter((group) => group.segments > 0),
    trailSegmentCount: cyanTrail.length / 2 + violetTrail.length / 2 + amberTrail.length / 2,
    connectionSegmentCount: connectionSegmentCount + attractorLines.length / 2,
    telemetryRingSegmentCount
  };
}

function createAttractorPositions(time: number, speed: number, pointer: { readonly x: number; readonly y: number } | undefined): Vec3[] {
  const attractors: Vec3[] = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = time * (0.27 + i * 0.032) * speed + i * Math.PI * 0.2;
    const radius = 0.68 + (i % 4) * 0.16;
    attractors.push([
      Math.cos(angle) * radius,
      Math.sin(angle * 0.7 + i * 0.2) * 0.48,
      Math.sin(angle) * radius * 0.78
    ]);
  }
  attractors.push(pointerAttractorPosition(pointer));
  return attractors;
}

function createCoreEvidence(time: number, speed: number, formation: DataGalaxyFormation): EvidenceSingleItem[] {
  return [
    {
      geometry: "sphere",
      material: "violetGlow",
      label: `${formation} data core evidence`,
      position: [0, 0, 0],
      scale: [0.72, 0.72, 0.72],
      rotation: [0, time * speed, 0]
    },
    {
      geometry: "sphere",
      material: "transparentCyan",
      label: "focal inference cluster shell",
      position: [0, 0.02, 0],
      scale: [0.64, 0.64, 0.64],
      rotation: [0.14, -time * 0.32 * speed, 0.08]
    },
    {
      geometry: "sphere",
      material: "cyanGlow",
      label: "bright central inference nucleus",
      position: [0, 0.03, 0],
      scale: [0.42, 0.42, 0.42],
      rotation: [0.08, time * 0.8 * speed, -0.06]
    },
    {
      geometry: "sphere",
      material: "cyanGlow",
      label: "foreground focal data cluster anchor",
      position: [-0.34, -0.08, 0.38],
      scale: [0.18, 0.18, 0.18],
      rotation: [0.04, time * 0.62 * speed, 0.18]
    },
    {
      geometry: "sphere",
      material: "amberGlow",
      label: "warm secondary attractor cluster anchor",
      position: [0.42, 0.16, -0.28],
      scale: [0.15, 0.15, 0.15],
      rotation: [-0.08, -time * 0.52 * speed, 0.1]
    },
    {
      geometry: "sphere",
      material: "violetGlow",
      label: "violet background model-state cluster anchor",
      position: [-0.52, 0.18, -0.34],
      scale: [0.14, 0.14, 0.14],
      rotation: [0.12, time * 0.44 * speed, -0.08]
    },
    {
      geometry: "cube",
      material: "transparentCyan",
      label: "focal inference orbit bar",
      position: [0, 0.02, 0],
      scale: [1.36, 0.028, 0.028],
      rotation: [0.12, time * 0.54 * speed, 0.04]
    },
    {
      geometry: "cube",
      material: "transparentAmber",
      label: "focal attractor orbit bar",
      position: [0, -0.02, 0],
      scale: [0.028, 0.028, 1.28],
      rotation: [-0.08, -time * 0.46 * speed, 0.12]
    },
    {
      geometry: "cube",
      material: "transparentCyan",
      label: "orthogonal inference orbit bar",
      position: [0, 0.01, 0],
      scale: [0.026, 0.026, 1.22],
      rotation: [0.34, time * 0.36 * speed + 1.1, -0.18]
    },
    {
      geometry: "cube",
      material: "transparentAmber",
      label: "foreground data-system contour chord",
      position: [-0.12, 0.12, 0.32],
      scale: [1.16, 0.024, 0.024],
      rotation: [0.24, -time * 0.28 * speed + 0.52, 0.2]
    },
    {
      geometry: "cube",
      material: "transparentCyan",
      label: "foreground data-system contour chord",
      position: [0.16, -0.06, 0.24],
      scale: [0.024, 0.024, 1.12],
      rotation: [-0.18, time * 0.3 * speed + 0.94, -0.24]
    },
    {
      geometry: "cube",
      material: "transparentAmber",
      label: "central data-system vertical spine",
      position: [-0.16, 0.08, 0.08],
      scale: [0.034, 0.74, 0.034],
      rotation: [0.16, time * 0.22 * speed, 0.32]
    },
    {
      geometry: "cube",
      material: "transparentCyan",
      label: "central data-system vertical spine",
      position: [0.18, -0.02, -0.1],
      scale: [0.03, 0.66, 0.03],
      rotation: [-0.24, -time * 0.18 * speed + 0.42, -0.18]
    },
    {
      geometry: "cube",
      material: "transparentAmber",
      label: "performance budget readout anchor",
      position: [0, -0.92, 0.18],
      scale: [1.1, 0.02, 0.02],
      rotation: [0, time * 0.16 * speed, 0]
    },
    {
      geometry: "cube",
      material: "transparentCyan",
      label: "formation readout spine",
      position: [0.08, 0.86, -0.08],
      scale: [0.04, 0.56, 0.04],
      rotation: [0.16, time * 0.1 * speed, 0.16]
    }
  ];
}

function tokenPositionForFormation(i: number, angle: number, radius: number, turbulence: number, formation: DataGalaxyFormation): Vec3 {
  if (formation === "sphere") {
    const v = hash01(i * 11);
    const phi = Math.acos(2 * v - 1);
    const shell = 0.36 + radius * (0.58 + hash01(i * 19) * 0.38);
    return [
      Math.sin(phi) * Math.cos(angle) * shell,
      Math.cos(phi) * shell * (0.82 + turbulence * 0.12),
      Math.sin(phi) * Math.sin(angle) * shell
    ];
  }
  if (formation === "vortex") {
    const lift = ((i % 37) / 36 - 0.5) * (1.55 + turbulence * 0.58);
    const spiralRadius = 0.28 + ((i % 53) / 52) * radius;
    return [Math.cos(angle) * spiralRadius, lift, Math.sin(angle) * spiralRadius * 0.72];
  }
  if (formation === "network") {
    const cluster = i % 6;
    const clusterAngle = cluster * Math.PI / 3;
    const local = angle * 1.3;
    const localRadius = 0.18 + hash01(i * 23) * (0.48 + turbulence * 0.24);
    return [
      Math.cos(clusterAngle) * 1.28 + Math.cos(local) * localRadius,
      (hash01(i * 17) - 0.5) * (1.0 + turbulence * 0.62),
      Math.sin(clusterAngle) * 1.0 + Math.sin(local) * localRadius * 0.72
    ];
  }
  if (formation === "wave") {
    const row = i % 14;
    const x = -1.85 + ((i * 7) % 42) * 0.09;
    const z = -1.2 + row * 0.18;
    const phase = x * 1.8 + angle;
    return [x, Math.sin(phase) * (0.36 + turbulence * 0.3), z + Math.cos(phase) * 0.08];
  }
  const y = (hash01(i * 17) - 0.5) * (0.82 + turbulence * 0.64) + Math.sin(angle * 1.2) * 0.08;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius * 0.76];
}

function pointerAttractorPosition(pointer: { readonly x: number; readonly y: number } | undefined): Vec3 {
  const x = ((pointer?.x ?? 0.5) - 0.5) * 1.1;
  const z = ((pointer?.y ?? 0.5) - 0.5) * 0.86;
  return [x, 0.24 + Math.sin((pointer?.x ?? 0.5) * Math.PI) * 0.24, z];
}

function pullToward(position: Vec3, target: Vec3, strength: number): Vec3 {
  return [
    position[0] + (target[0] - position[0]) * strength,
    position[1] + (target[1] - position[1]) * strength,
    position[2] + (target[2] - position[2]) * strength
  ];
}

function addEllipseRing(target: Vec3[], radiusX: number, radiusZ: number, y: number, segments: number, phase: number): void {
  for (let i = 0; i < segments; i += 1) {
    const a = phase + i * Math.PI * 2 / segments;
    const b = phase + (i + 1) * Math.PI * 2 / segments;
    addSegment(
      target,
      [Math.cos(a) * radiusX, y + Math.sin(a * 2.0 + phase) * 0.018, Math.sin(a) * radiusZ],
      [Math.cos(b) * radiusX, y + Math.sin(b * 2.0 + phase) * 0.018, Math.sin(b) * radiusZ]
    );
  }
}

function addSegment(target: Vec3[], start: Vec3, end: Vec3): void {
  target.push(start, end);
}

function toLineGroup(material: string, label: string, positions: readonly Vec3[]): DataGalaxyLineGroup {
  return { material, label, positions, segments: positions.length / 2 };
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}
