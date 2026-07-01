import { cameraForCategoryPlan } from "./showcase-spec-category-plan.js";
import { createPlatformerRouteSource } from "./showcase-spec-platformer-artifacts.js";
import { createRacingRouteSource } from "./showcase-spec-racing-artifacts.js";
import type {
  ShowcaseCategoryPlan,
  ShowcaseSpec,
  ShowcaseSpecAsset,
  ShowcaseSpecFinalStatus
} from "./showcase-spec-types.js";

export function createRouteSource(spec: ShowcaseSpec): string {
  if (spec.platformer) return createPlatformerRouteSource(spec, spec.platformer);
  if (spec.racing) return createRacingRouteSource(spec, spec.racing);
  if (spec.categoryPlan) return createCategoryRouteSource(spec, spec.categoryPlan);
  const heroAsset = requireAsset(spec, spec.layout.heroAsset);
  return createBasicRouteSource(spec, heroAsset);
}

export function createReadme(spec: ShowcaseSpec, finalStatus: ShowcaseSpecFinalStatus, blockers: readonly string[]): string {
  return `# ${spec.label}\n\nStatus: ${finalStatus}\n\nClaim label: ${spec.claimLabel}\n\nPrimary asset: ${spec.layout.heroAsset}\n\n${blockers.length === 0 ? "Release evidence is present for this bounded generated route." : `Blocked by:\n${blockers.map((blocker) => `- ${blocker}`).join("\n")}`}\n`;
}

export function createRouteHealth(spec: ShowcaseSpec, finalStatus: ShowcaseSpecFinalStatus, blockers: readonly string[]) {
  const gameAssetPairEvidence = createGameAssetPairRouteHealth(spec);
  return {
    schema: "aura3d-route-health/1.0",
    appId: spec.routeId,
    route: spec.path,
    classification: finalStatus,
    publicShowcase: finalStatus === "release-ready candidate",
    promotionStatus: blockers.length === 0 ? "evidence-backed-by-showcase-spec-compiler" : "blocked-by-showcase-spec-compiler",
    renderer: {
      path: "createAuraApp root safe API",
      mode: "safe-basic",
      nativeWebGPU: false,
      productionRuntime: false
    },
    primaryAssets: spec.primaryAssets.map((asset) => ({
      typedRef: asset.typedRef,
      role: asset.role,
      status: "typed-primary-asset",
      quality: asset.quality
    })),
    primitiveStatus: {
      sourceOccurrences: 0,
      primitiveBudget: 0,
      role: "none",
      status: "no-primitive-primary-subjects-generated"
    },
    claimStatus: {
      status: finalStatus,
      label: spec.claimLabel,
      allowed: spec.capabilities
        .filter((capability) => capability.status === "root-proven")
        .map((capability) => capability.evidence ? `${capability.name}: ${capability.evidence}` : capability.name),
      notAllowed: [
        ...spec.capabilities
          .filter((capability) => capability.status !== "root-proven")
          .map((capability) => `${capability.name}: ${capability.status}`),
        ...blockers
      ]
    },
    blockers,
    evidence: createRouteHealthEvidence(spec),
    ...(gameAssetPairEvidence ? { gameAssetPairEvidence } : {}),
    ...(spec.platformer ? { platformer: spec.platformer } : {}),
    ...(spec.racing ? { racing: spec.racing } : {}),
    ...(spec.categoryPlan ? { categoryPlan: spec.categoryPlan } : {})
  };
}

export function createRouteGatePatch(spec: ShowcaseSpec, finalStatus: ShowcaseSpecFinalStatus) {
  return {
    schema: "aura3d-showcase-route-gate-patch/1.0",
    route: {
      id: spec.routeId,
      label: spec.label,
      path: spec.path,
      globalName: spec.globalName,
      published: finalStatus === "release-ready candidate",
      primaryAssets: spec.primaryAssets.map((asset) => asset.id),
      primaryAssetRoles: Object.fromEntries(spec.primaryAssets.map((asset) => [asset.id, asset.role])),
      routePrimaryHeroAsset: spec.layout.heroAsset,
      secondaryPrimaryAssets: spec.primaryAssets.map((asset) => asset.id).filter((id) => id !== spec.layout.heroAsset),
      primitiveBudget: 0,
      requiresTypedPrimaryAssets: true
    }
  };
}

export function createEvidenceChecklist(spec: ShowcaseSpec, finalStatus: ShowcaseSpecFinalStatus, blockers: readonly string[]) {
  return {
    schema: "aura3d-showcase-evidence-checklist/1.0",
    routeId: spec.routeId,
    finalStatus,
    requiredCommands: [spec.evidence.deployCommand, "pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line"],
    evidence: spec.evidence,
    capabilities: spec.capabilities,
    ...(spec.platformer ? { platformer: spec.platformer } : {}),
    ...(spec.racing ? { racing: spec.racing } : {}),
    ...(spec.categoryPlan ? { categoryPlan: spec.categoryPlan } : {}),
    blockers
  };
}

function createRouteHealthEvidence(spec: ShowcaseSpec) {
  return {
    global: `window.${spec.globalName}`,
    sourceReview: `apps/${spec.routeId}/src/main.ts`,
    routePrimaryProbe: spec.evidence.routePrimaryProbe,
    routePrimaryScreenshot: spec.evidence.routePrimaryScreenshot,
    desktopScreenshot: spec.evidence.routePrimaryScreenshot,
    mobileScreenshot: spec.evidence.routePrimaryScreenshot,
    deployCommand: spec.evidence.deployCommand,
    deployPassed: spec.evidence.deployPassed,
    routePrimaryPassed: spec.evidence.routePrimaryPassed,
    ...("gameplayProof" in spec.evidence ? { gameplayProof: spec.evidence.gameplayProof } : {}),
    ...("gameplayPassed" in spec.evidence ? { gameplayPassed: spec.evidence.gameplayPassed } : {}),
    ...("releaseAssetProbes" in spec.evidence ? { releaseAssetProbes: spec.evidence.releaseAssetProbes } : {})
  };
}

function createGameAssetPairRouteHealth(spec: ShowcaseSpec) {
  const assetPairEvidence = spec.racing?.raceDesign.assetPairEvidence ?? spec.platformer?.levelDesign.assetPairEvidence;
  if (!assetPairEvidence) return undefined;

  return {
    category: assetPairEvidence.category,
    assets: assetPairEvidence.assets,
    screenshotEvidence: assetPairEvidence.screenshotEvidence,
    routePrimaryProbe: assetPairEvidence.routePrimaryProbe,
    screenshotSha256: assetPairEvidence.screenshotSha256,
    verdict: assetPairEvidence.verdict,
    notes: assetPairEvidence.notes,
    blockers: assetPairEvidence.blockers
  };
}

function createBasicRouteSource(spec: ShowcaseSpec, heroAsset: ShowcaseSpecAsset): string {
  return `import { camera, createAuraApp, lights, model, scene } from "@aura3d/engine";\nimport { assets } from "../../../src/aura-assets";\n\nconst app = createAuraApp("#app", {\n  scene: scene()\n    .add(model(${heroAsset.typedRef}))\n    .add(lights.studio())\n    .add(camera.perspective({ position: [0, 1.4, 4], target: [0, 1, 0] }))\n});\n\nconst mountedEvidence = {\n  schema: "aura3d-showcase-compiled-route/1.0",\n  appId: "${spec.routeId}",\n  status: "ready",\n  diagnostics: app.diagnostics()\n};\nObject.defineProperty(window, "${spec.globalName}", {\n  value: mountedEvidence,\n  configurable: true,\n  writable: true\n});\n`;
}

function createCategoryRouteSource(spec: ShowcaseSpec, categoryPlan: ShowcaseCategoryPlan): string {
  const heroAsset = requireAsset(spec, categoryPlan.primaryAsset);
  const cameraSpec = cameraForCategoryPlan(categoryPlan);
  return `import { camera, createAuraApp, lights, model, scene } from "@aura3d/engine";\nimport { assets } from "../../../src/aura-assets";\n\nconst routeFrame = {\n  cameraIntent: "${categoryPlan.cameraIntent}",\n  evidenceMargin: ${cameraSpec.evidenceMargin},\n  position: [0, ${cameraSpec.y}, ${cameraSpec.z}],\n  targetMaxDimension: ${cameraSpec.targetMaxDimension},\n  cameraPosition: ${cameraSpec.position},\n  cameraTarget: ${cameraSpec.target},\n  fov: ${cameraSpec.fov}\n};\n\nconst app = createAuraApp("#app", {\n  diagnostics: { overlay: false, performancePanel: false },\n  scene: scene()\n    .add(model(${heroAsset.typedRef}, {\n      name: "${categoryPlan.kind}-primary",\n      role: "routePrimary",\n      scaleMode: "fit",\n      targetMaxDimension: routeFrame.targetMaxDimension\n    }).position(routeFrame.position[0], routeFrame.position[1], routeFrame.position[2]))\n    .add(lights.studio())\n    .camera(camera.perspective({ position: routeFrame.cameraPosition, target: routeFrame.cameraTarget, fov: routeFrame.fov }))\n});\n\nconst mountedEvidence = {\n  schema: "aura3d-showcase-compiled-non-game-route/1.0",\n  appId: "${spec.routeId}",\n  status: "ready",\n  categoryPlan: ${JSON.stringify(categoryPlan, null, 2)},\n  routeFrame,\n  primaryAssets: [${spec.primaryAssets.map((asset) => `"${asset.id}"`).join(", ")}],\n  diagnostics: app.diagnostics()\n};\nObject.defineProperty(window, "${spec.globalName}", {\n  value: mountedEvidence,\n  configurable: true,\n  writable: true\n});\n`;
}

function requireAsset(spec: ShowcaseSpec, assetId: string): ShowcaseSpecAsset {
  const asset = spec.primaryAssets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`missing primary asset ${assetId}`);
  return asset;
}
