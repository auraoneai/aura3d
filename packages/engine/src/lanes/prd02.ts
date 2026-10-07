/**
 * Lane prd02 barrel — owned by lane 02 (CONTRACTS.md §3.8). Re-exports the
 * flag-path lighting/shadow resolvers and registers the lane's C-34 look
 * lint rule `look/ambient-flattens`; engine composition (environment
 * resolution, lighting runtime) lands in later PR-B/C phases.
 */
import { registerLookLintRule } from "../contracts/looks.js";
import type { AuraLightNode, AuraSceneNode } from "../agent-api/index.js";
import { groups } from "../agent-api/index.js";

export {
  physicalLightDescriptor,
  collectPrd02Lights,
  selectShadowedLights,
  resolveLightingTier,
  prd02LightingOn,
  readLightingModelFromUrl,
  resolveLightingModel,
  readLightingKillSwitches,
  type Prd02LightingKillSwitches,
  type PhysicalLightDescriptor,
  type ShadowedLightSelection,
  type HemisphereIrradiance,
  type Prd02CollectedLights
} from "../agent-api/compiler/lights.js";
export {
  resolveShadowSystemConfig,
  sceneShadowRadius,
  createPrd02ShadowOptions,
  prd02ResolveTier,
  type ShadowSystemConfig,
  type Prd02ShadowOptions
} from "../agent-api/compiler/shadows.js";
export {
  explicitEnvironmentResolution,
  prd02AmbientTerm,
  registerPrd02EnvironmentSources,
  bindPrd02EnvironmentProbe,
  type Prd02EnvironmentBindOptions,
  type Prd02EnvironmentBinding
} from "../agent-api/compiler/environment.js";
export { descriptorToAuraLightData } from "../agent-api/compiler/lights.js";
export { probes, type AuraProbeNode, type AuraReflectionProbeOptions, type AuraIrradianceVolumeOptions } from "../agent-api/nodes/probes.js";
export { prd02EnvironmentBuilders, type AuraEnvironmentNodeV2, type AuraEnvironmentPresetName } from "../agent-api/nodes/environments.js";
export { prd02KitLighting } from "../agent-api/nodes/sceneKits.js";

/**
 * C-34 `look/ambient-flattens` (PRD-02): an ambient light stronger than 1
 * while an environment node supplies IBL flattens the scene — the ambient
 * term adds the same radiance everywhere and washes out the probe's
 * directionality. Fires only when BOTH are present.
 */
registerLookLintRule({
  code: "look/ambient-flattens",
  owner: "prd02",
  run(snapshot) {
    const nodes = groups.flatten(snapshot.nodes as readonly AuraSceneNode[]);
    const hasEnvironment = nodes.some((n) => n.kind === "environment");
    if (!hasEnvironment) return [];
    const offenders = nodes.filter(
      (n): n is AuraLightNode => n.kind === "light" && n.light === "ambient" && (n.intensity ?? 0) > 1
    );
    if (offenders.length === 0) return [];
    return [{
      code: "look/ambient-flattens",
      severity: "warning",
      message: "Ambient light intensity > 1 flattens the environment's IBL; prefer the environment for ambient fill.",
      nodes: offenders.map((n) => n.name ?? "ambient")
    }];
  }
});

// ---------- PRD-02 Phase 2 — C-09/C-36/C-38/C-31 registrations ----------

import { registerPrd02EnvironmentSources, explicitEnvironmentResolution, prd02AmbientTerm } from "../agent-api/compiler/environment.js";
import { registerNodeHandler, registerOptionCoverage, type OptionCoverageRow, type SceneCompileContext, type RenderSourceContributions } from "../contracts/compiler.js";
import { registerAppExtension } from "../contracts/app.js";
import { registerDiagnosticsSection } from "../contracts/diagnostics.js";
import { collectPrd02Lights, physicalLightDescriptor, prd02LightingOn, readLightingModelFromUrl } from "../agent-api/compiler/lights.js";
import { auraLightsCounters, auraLightsLastFrame } from "../../../rendering/src/LightUniforms.js";
import type { RenderDevice } from "../../../rendering/src/RenderDevice.js";
import { prd02ShadowDiagnostics, prd02ContactShadowDiagnostics } from "@aura3d/rendering";
import type { AuraEnvironmentNodeV2 } from "../agent-api/nodes/environments.js";
import type { AuraLightingDiagnostics } from "../contracts/lighting.js";
import type { AuraProbeNode } from "../agent-api/nodes/probes.js";

// C-09 sources: `prd02.explicit` (400) resolves an authored environment node;
// `prd02.neutral-room` (0) supplies the RoomEnvironment probe fallback.
registerPrd02EnvironmentSources();

/** C-36 node handlers (flag `A3D_QR_LIGHTING`; legacy handlers keep the
 *  flag-off path). Contributions are additive `RenderSource` fields — the
 *  renderer seam consumes them in Phase 3. */
registerNodeHandler({
  kind: "light",
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  compile(node, _ctx, out) {
    const light = node as unknown as AuraLightNode;
    const name = light.name ?? `${light.light}`;
    if (light.light === "hemisphere") {
      const collected = collectPrd02Lights({ nodes: [light] } as never);
      const hemi = collected.hemisphere[0];
      if (hemi) out.set("prd02.hemisphere", hemi);
      out.feature("lights.hemisphere");
      return;
    }
    if (light.light === "ambient") {
      out.set("prd02.ambient", { color: light.color ?? "#ffffff", intensity: light.intensity ?? 0 });
      out.feature("lights.ambient");
      return;
    }
    const descriptor = physicalLightDescriptor(light, name);
    if (!descriptor) return;
    out.addLights([descriptor]);
    if (light.light === "directional" || light.light === "studio") out.feature("lights.directional");
    else if (light.light === "spot") out.feature("lights.spot");
    else if (light.light === "point") out.feature("lights.point");
    if (descriptor.shadowRequested && !descriptor.shadowDisabled) {
      out.feature(light.light === "spot" ? "shadows.spot" : light.light === "point" ? "shadows.point" : "shadows.directional");
    }
  }
});

registerNodeHandler({
  kind: "environment",
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  compile(node, _ctx, out) {
    const env = node as unknown as AuraEnvironmentNodeV2;
    const resolution = explicitEnvironmentResolution(env, null);
    if (!resolution) return;
    out.set("environment", resolution);
    out.feature("environment.ibl");
    if (resolution.background !== false && resolution.background.visible) out.feature("environment.background");
  }
});

registerNodeHandler({
  kind: "probe",
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  compile(node, _ctx, out) {
    const probe = node as unknown as AuraProbeNode;
    out.set(`prd02.probes.${probe.name}`, probe);
    out.set("prd02.probeCountDelta", 1);
  }
});

// ---------- C-36 option coverage rows (PRD-02 builders) ----------

function rows(builder: string, fields: Record<string, readonly [unknown, unknown]>): readonly OptionCoverageRow[] {
  return Object.entries(fields).map(([field, [probeValueA, probeValueB]]) => ({
    builder, field, probeValueA, probeValueB, ownerPrd: 2
  }));
}

const COMMON_NODE = { name: ["a", "b"] as const };

registerOptionCoverage([
  ...rows("lights.ambient", { ...COMMON_NODE, color: ["#ffffff", "#88aaff"], intensity: [0.1, 0.9] }),
  ...rows("lights.hemisphere", { ...COMMON_NODE, skyColor: ["#ffffff", "#88aaff"], groundColor: ["#403020", "#101010"], intensity: [0.4, 1.2], position: [[0, 1, 0], [0, -1, 0]] }),
  ...rows("lights.directional", { ...COMMON_NODE, position: [[3, 4, 3], [1, 2, 3]], target: [[0, 0, 0], [1, 1, 1]], intensity: [1, 3], color: ["#ffffff", "#ffd0a0"], shadow: [true, { cascades: 3, bias: 0.0002 }] }),
  ...rows("lights.point", { ...COMMON_NODE, position: [[0, 1, 0], [2, 2, 2]], intensity: [4, 20], power: [40, 400], distance: [0, 8], decay: [1, 2], color: ["#ffffff", "#88aaff"], shadow: [true, { mapSize: 1024 }] }),
  ...rows("lights.spot", { ...COMMON_NODE, position: [[0, 2, 0], [1, 1, 1]], target: [[0, 0, 0], [1, 0, 0]], angle: [0.4, 0.7], penumbra: [0, 0.5], distance: [0, 10], decay: [1, 2], intensity: [10, 60], power: [90, 500], color: ["#ffffff", "#ffd0a0"], shadow: [true, { mapSize: 2048, bias: 0.0001 }] }),
  ...rows("lights.rect", { ...COMMON_NODE, position: [[0, 2, 0], [1, 1, 1]], target: [[0, 0, 0], [0, 1, 0]], width: [1, 3], height: [1, 2], intensity: [1, 5], color: ["#ffffff", "#88aaff"], twoSided: [false, true], shadow: [true, false] }),
  ...rows("lights.softbox", { ...COMMON_NODE, position: [[0, 2, 0], [1, 1, 1]], target: [[0, 0, 0], [0, 1, 0]], width: [1, 3], height: [1, 2], intensity: [1, 5], color: ["#ffffff", "#88aaff"], twoSided: [false, true], shadow: [true, false] }),
  ...rows("lights.desk", { ...COMMON_NODE }),
  ...rows("environments.preset", { ...COMMON_NODE, intensity: [0.6, 1.4], diffuseIntensity: [0.5, 1.2], specularIntensity: [0.8, 1.5], rotation: [0, Math.PI / 2], background: [false, { visible: true, blurriness: 0.3 }] }),
  ...rows("environments.neutral", { ...COMMON_NODE, intensity: [0.6, 1.4], diffuseIntensity: [0.5, 1.2], specularIntensity: [0.8, 1.5], rotation: [0, 1.0], background: [false, true] }),
  ...rows("environments.none", { ...COMMON_NODE }),
  ...rows("environments.capture", { ...COMMON_NODE, intensity: [0.6, 1.4], diffuseIntensity: [0.5, 1.2], specularIntensity: [0.8, 1.5], rotation: [0, 0.5], background: [false, true], include: ["sky-only", "all"], position: [[0, 0, 0], [1, 1, 1]], resolution: [128, 256], update: ["once", "on-demand"] }),
  ...rows("environments.hdri", { ...COMMON_NODE, intensity: [0.6, 1.4], rotation: [0, 0.5], background: [true, false] }),
  ...rows("environments.studio", { ...COMMON_NODE, intensity: [0.6, 1.4], color: ["#ffffff", "#ffd0a0"], rotation: [0, 0.5], background: [false, true] }),
  ...rows("environments.materialLab", { ...COMMON_NODE, intensity: [0.6, 1.4], color: ["#ffffff", "#ffd0a0"], rotation: [0, 0.5], background: [false, true] }),
  ...rows("environments.productHero", { ...COMMON_NODE, intensity: [0.6, 1.4], color: ["#ffffff", "#ffd0a0"], rotation: [0, 0.5], background: [false, true] }),
  ...rows("environments.nightCinematic", { ...COMMON_NODE, intensity: [0.6, 1.4], color: ["#ffffff", "#ffd0a0"], rotation: [0, 0.5], background: [false, true] }),
  ...rows("environments.metalStudio", { ...COMMON_NODE, intensity: [0.6, 1.4], color: ["#ffffff", "#ffd0a0"], rotation: [0, 0.5], background: [false, true] }),
  ...rows("environments.glassStudio", { ...COMMON_NODE, intensity: [0.6, 1.4], color: ["#ffffff", "#ffd0a0"], rotation: [0, 0.5], background: [false, true] }),
  ...rows("shadows.blobShadow", { ...COMMON_NODE, position: [[0, 0.02, 0], [1, 0.02, 1]], footprint: [[1.2, 0.7], [2, 1.4]], opacity: [0.2, 0.6], color: ["#030712", "#000000"] }),
  ...rows("shadows.contact", { ...COMMON_NODE, position: [[0, 0.02, 0], [1, 0.02, 1]], footprint: [[1.2, 0.7], [2, 1.4]], opacity: [0.2, 0.6], color: ["#030712", "#000000"] }),
  ...rows("probes.reflection", { position: [[0, 1, 0], [1, 1, 0]], box: [{ min: [-2, 0, -2], max: [2, 3, 2] }, { min: [-1, 0, -1], max: [1, 2, 1] }], resolution: [128, 256], update: ["once", "on-demand"], blendDistance: [0.5, 2], priority: [0, 4], intensity: [0.8, 1.2] }),
  ...rows("probes.irradianceVolume", { bounds: [{ min: [-2, 0, -2], max: [2, 3, 2] }, { min: [-1, 0, -1], max: [1, 2, 1] }], resolution: [[2, 2, 2], [4, 4, 4]], update: ["once", "on-demand"], intensity: [0.8, 1.2] }),
  ...rows("effects.contactShadows", { length: [0.1, 0.5], thickness: [0.02, 0.1], steps: [8, 16], intensity: [0.6, 1.4], lights: ["sun", "shadowed"] })
]);

// ---------- C-38 app.lighting ----------

/**
 * PRD-02 lighting runtime. Phase 2: observed bookkeeping (rotation /
 * intensity round-trip, model+flag in diagnostics); the real probe /
 * irradiance mutation paths land in Phase 3 (env) and Phase 5 (probes).
 */
export class Prd02LightingRuntime {
  private rotation = 0;
  private intensity = 1;
  private device: RenderDevice | null = null;
  private readonly pendingProbes = new Set<string>();

  /**
   * C-28 counters are consumed from the bound device, never counted here
   * (PRD-02 Phase 4). The flag-path env/probe binding attaches the device.
   */
  attachDevice(device: RenderDevice): void { this.device = device; }

  updateProbe(name: string): Promise<void> { this.pendingProbes.add(name); return Promise.resolve(); }
  rebakeIrradiance(name?: string): Promise<void> { if (name) this.pendingProbes.add(name); return Promise.resolve(); }
  setEnvironmentRotation(radians: number): void { this.rotation = radians; }
  setEnvironmentIntensity(value: number): void { this.intensity = value; }

  /** §17 timing spans (item: C-31 `lighting` section). C-28 exposes only a
   *  capability flag today — no per-pass GPU timer API exists on
   *  `RenderDevice` — so every span is `null` and `timingsSource` reports
   *  "none" unless a real query path lands; the capture report fills the
   *  budgets via the §17 toggle-delta method (`?a3dLighting=*=off`). */
  lightingTimings(): {
    readonly pmrem: number | null;
    readonly shadowCascade: readonly (number | null)[];
    readonly shadowLocal: number | null;
    readonly contactShadow: number | null;
    readonly background: number | null;
    readonly probes: number | null;
    readonly timingsSource: "timer-query" | "none";
    readonly timerQueryAvailable: boolean;
  } {
    return {
      pmrem: null,
      shadowCascade: [],
      shadowLocal: null,
      contactShadow: null,
      background: null,
      probes: null,
      timingsSource: "none",
      timerQueryAvailable: this.device?.probe?.timerQuery === true
    };
  }

  /** Observed values only — fields the runtime cannot measure are null (C-31). */
  diagnostics(): AuraLightingDiagnostics {
    void this.rotation; void this.intensity;
    return {
      environment: {
        source: "prd02", faceSize: 0, mipCount: 0, format: "rgba16f",
        shBound: false, backgroundDrawn: false, pmremGpuMs: null
      },
      shadows: prd02ShadowDiagnostics()?.shadows ?? [],
      droppedFeatures: prd02ShadowDiagnostics()?.droppedFeatures ?? [],
      contactShadows: prd02ContactShadowDiagnostics().contactShadows,
      programCompileCount: this.device?.getDiagnostics().programCompileCount ?? 0,
      readPixelsCalls: this.device?.getDiagnostics().readPixelsCalls ?? 0
    };
  }
}

registerAppExtension({
  id: "prd02.lighting",
  member: "lighting",
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  create: () => new Prd02LightingRuntime()
});

// ---------- C-31 diagnostics sections ("lighting" / "shadows") ----------

interface AppLike { readonly lighting?: { diagnostics(): AuraLightingDiagnostics; lightingTimings?(): unknown } }

registerDiagnosticsSection({
  id: "prd02.lighting",
  key: "lighting",
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  collect(app) {
    const lighting = (app as unknown as AppLike).lighting;
    const diag = lighting?.diagnostics();
    const counters = auraLightsCounters();
    return {
      model: prd02LightingOn() ? readLightingModelFromUrl().model ?? "physical" : "legacy-3.0",
      environment: diag?.environment ?? null,
      lightsEvaluated: counters?.lightsEvaluated ?? null,
      lightsCulledByRange: null,
      lightsDroppedByCap: counters?.lightsDroppedByCap ?? null,
      // §4.2 runtime collectedLights: one row per evaluated light.
      lights: auraLightsLastFrame() ?? null,
      timings: lighting?.lightingTimings?.() ?? null
    };
  }
});

registerDiagnosticsSection({
  id: "prd02.shadows",
  key: "shadows",
  owner: "prd02",
  flag: "A3D_QR_LIGHTING",
  collect(app) {
    const lighting = (app as unknown as AppLike).lighting;
    const diag = lighting?.diagnostics();
    return {
      shadows: diag?.shadows ?? null,
      droppedFeatures: diag?.droppedFeatures ?? null,
      contactShadows: diag ? diag.contactShadows : null
    };
  }
});
