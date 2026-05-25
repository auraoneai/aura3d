import {
  createEnvironmentFogProfile,
  type EnvironmentFogProfile,
  type ForwardEnvironmentFogOptions
} from "@galileo3d/rendering";
import type { RouteEvidencePayload } from "./advancedRouteEvidence";

export const RENDERER_ENVIRONMENT_FOG_SOURCE = "Renderer.environmentFog -> ForwardPass.environmentFog" as const;

export type RendererEnvironmentFogRouteId = "fog-cathedral" | "robotics-lab";

export interface RendererEnvironmentFogEvidence {
  readonly source: typeof RENDERER_ENVIRONMENT_FOG_SOURCE;
  readonly routeId: RendererEnvironmentFogRouteId;
  readonly rendererField: "source.environmentFog";
  readonly forwardPassField: "ForwardPassOptions.environmentFog";
  readonly profile: EnvironmentFogProfile;
  readonly forwardOptions: ForwardEnvironmentFogOptions;
  readonly proxyGeometryExcludedFromClaim: true;
  readonly proxyGeometryLabels: readonly string[];
  readonly proxyGeometryInstanceCount: number;
  readonly rendererEvidence: readonly string[];
  readonly claimBoundary: string;
}

export const FOG_CATHEDRAL_PROXY_FOG_LABELS = [
  "foreground midground background haze lobes",
  "foreground crop mask columns",
  "aperture-local shaft proxy",
  "layered atmospheric depth haze",
  "fog edge occlusion columns",
  "soft light shaft",
  "batched dust evidence field",
  "distant aperture glow",
  "depth-readable capital glint"
] as const;

export function createFogCathedralRendererEnvironmentFog(options: {
  readonly fog: number;
  readonly proxyGeometryInstanceCount: number;
}): RendererEnvironmentFogEvidence {
  const fog = clampUnit(options.fog);
  const profile = createEnvironmentFogProfile({
    preset: "morning-mist",
    mode: "exponential-squared",
    color: [
      round3(0.42 + fog * 0.08),
      round3(0.48 + fog * 0.08),
      round3(0.5 + fog * 0.08)
    ],
    near: 0.55,
    far: round3(11.5 - fog * 2.5),
    density: round5(0.012 + fog * 0.02),
    heightFalloff: round5(0.026 + fog * 0.034),
    heightReference: -0.72,
    maxOpacity: round3(0.24 + fog * 0.22),
    sampleDistances: [0.75, 2.5, 5.5, 8.5]
  });
  return createRendererEnvironmentFogEvidence({
    routeId: "fog-cathedral",
    profile,
    proxyGeometryLabels: FOG_CATHEDRAL_PROXY_FOG_LABELS,
    proxyGeometryInstanceCount: options.proxyGeometryInstanceCount,
    routeClaim: "fog-cathedral supplies distance/height fog through Renderer.environmentFog while transparent haze, shafts, and dust remain route visual helpers."
  });
}

export function createRoboticsLabRendererEnvironmentFog(): RendererEnvironmentFogEvidence {
  const profile = createEnvironmentFogProfile({
    preset: "warehouse-dust",
    mode: "linear",
    color: [0.24, 0.28, 0.34],
    near: 3,
    far: 13.5,
    density: 0.006,
    heightFalloff: 0.04,
    heightReference: -0.55,
    maxOpacity: 0.12,
    sampleDistances: [1.5, 4, 7.5, 10.5]
  });
  return createRendererEnvironmentFogEvidence({
    routeId: "robotics-lab",
    profile,
    proxyGeometryLabels: [],
    proxyGeometryInstanceCount: 0,
    routeClaim: "robotics-lab supplies subtle warehouse dust through Renderer.environmentFog without counting lab overlays or robot guides as fog evidence."
  });
}

export function countFogCathedralProxyGeometryInstances(
  evidence: RouteEvidencePayload,
  beams: boolean
): number {
  const labels = new Set<string>(FOG_CATHEDRAL_PROXY_FOG_LABELS);
  const localAtmosphereInstances = 7 + 8 + (beams ? 6 : 0);
  const evidenceBatchInstances = evidence.batches.reduce((sum, batch) =>
    labels.has(batch.label) ? sum + batch.count : sum, 0);
  const evidenceSingles = evidence.singles.reduce((sum, single) =>
    labels.has(single.label) ? sum + 1 : sum, 0);
  return localAtmosphereInstances + evidenceBatchInstances + evidenceSingles;
}

function createRendererEnvironmentFogEvidence(options: {
  readonly routeId: RendererEnvironmentFogRouteId;
  readonly profile: EnvironmentFogProfile;
  readonly proxyGeometryLabels: readonly string[];
  readonly proxyGeometryInstanceCount: number;
  readonly routeClaim: string;
}): RendererEnvironmentFogEvidence {
  return {
    source: RENDERER_ENVIRONMENT_FOG_SOURCE,
    routeId: options.routeId,
    rendererField: "source.environmentFog",
    forwardPassField: "ForwardPassOptions.environmentFog",
    profile: options.profile,
    forwardOptions: toForwardEnvironmentFogOptions(options.profile),
    proxyGeometryExcludedFromClaim: true,
    proxyGeometryLabels: options.proxyGeometryLabels,
    proxyGeometryInstanceCount: options.proxyGeometryInstanceCount,
    rendererEvidence: [
      RENDERER_ENVIRONMENT_FOG_SOURCE,
      "createEnvironmentFogProfile emits reusable uniform-ready fog parameters.",
      "renderer.render receives source.environmentFog for this SceneFrame."
    ],
    claimBoundary: `${options.routeClaim} Proxy fog geometry is excluded from the renderer-level environmentFog claim.`
  };
}

function toForwardEnvironmentFogOptions(profile: EnvironmentFogProfile): ForwardEnvironmentFogOptions {
  return {
    mode: profile.mode,
    color: profile.color,
    near: profile.near,
    far: profile.far,
    density: profile.density,
    heightFalloff: profile.heightFalloff,
    heightReference: profile.heightReference,
    maxOpacity: profile.maxOpacity
  };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round5(value: number): number {
  return Math.round(value * 100000) / 100000;
}
