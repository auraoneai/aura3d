// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraSceneNode, AuraModelNode, AuraPrimitiveNode, AuraGroupNode, AuraInteractionNode, AuraProductStageStyle, AuraProductViewerOptions, AuraProductPlacement, AuraProductDiagnostics } from "./types.js";
import { AuraSceneBuilder, scene } from "./scene.js";
import { animation } from "./animation.js";
import { camera } from "./camera.js";
import { createAssetProvenance } from "../diagnostics.js";
import { environments } from "./environments.composite.js";
import { groups } from "./groups.js";
import { interactions } from "./interactions.js";
import { prefabs } from "./prefabs/index.js";
import { timeline } from "./timeline.js";
import { validateProductVisualQA } from "../looks/structuralQA.js";
import { productViewer } from "../product-viewer-runtime.js";
import { lazyNamespace } from "../lazyNamespace.js";


export function productPlacement(asset: AuraAssetRef<"model">): AuraProductPlacement {
  const bounds = asset.bounds ?? [1, 1, 1] as const;
  const maxExtent = Math.max(0.001, bounds[0], bounds[1], bounds[2]);
  const scale = asset.bounds ? Math.max(0.72, Math.min(1.24, 1.35 / maxExtent)) : 1;
  return {
    kind: "aura-product-placement",
    assetId: asset.id,
    bounds,
    position: [0, 0.54, -0.65],
    scale: Number(scale.toFixed(3)),
    plinthSeatY: 0.54,
    centered: true,
    seatedOnPlinth: true,
    normalizedFromBounds: Boolean(asset.bounds)
  };
}

function productScene(asset: AuraAssetRef<"model">, options: AuraProductViewerOptions = {}): AuraSceneBuilder {
  return scene()
    .background("#f6f8fb")
    .addMany(prefabs.productViewer(asset, options))
    .add(environments.productHero({ intensity: 1.22 }))
    .add(interactions.orbit({ target: "auto-centered bounded product model" }))
    .camera(camera.product())
    .timeline(timeline.loop({ seconds: 8 }));
}

function productDiagnostics(asset: AuraAssetRef<"model">, nodes: readonly AuraSceneNode[], options: AuraProductViewerOptions = {}): AuraProductDiagnostics {
  const flattened = groups.flatten(nodes);
  const names = flattened.map((node) => "name" in node ? node.name ?? "" : "");
  const placement = productPlacement(asset);
  const inspectionGuidesVisible = names.some((name) => name.includes("fit to bounds") || name.includes("normalized asset") || name.includes("bracket"));
  const provenanceBadgeVisible = names.some((name) => name.includes("provenance badge"));
  const turntable = flattened.find((node): node is AuraModelNode | AuraPrimitiveNode | AuraGroupNode =>
    (node.kind === "model" || node.kind === "primitive" || node.kind === "group") && node.animation?.clip === "turntable"
  );
  const orbitInteraction = flattened.some((node): node is AuraInteractionNode => node.kind === "interaction" && node.mode === "orbit");
  return {
    kind: "aura-product-diagnostics",
    stageStyle: options.stageStyle ?? "hero-clean",
    placement,
    provenance: createAssetProvenance(asset),
    orbitEnabled: orbitInteraction || names.some((name) => name.includes("orbit control arc") || name.includes("turntable orbit cue")),
    turntableEnabled: Boolean(turntable),
    turntableCaptureFrame: turntable?.animation?.captureTime ?? options.captureFrame ?? 0.32,
    inspectionGuidesVisible,
    provenanceBadgeVisible,
    cleanHeroMode: (options.stageStyle ?? "hero-clean") !== "inspection" && !inspectionGuidesVisible && !provenanceBadgeVisible
  };
}

export const product = lazyNamespace(() => ({
  placement: productPlacement,
  stage: (options: { readonly style?: AuraProductStageStyle } = {}): readonly AuraSceneNode[] => prefabs.productStage(options),
  viewer: (asset: AuraAssetRef<"model">, options: AuraProductViewerOptions = {}): readonly AuraSceneNode[] => prefabs.productViewer(asset, options),
  scene: productScene,
  diagnostics: productDiagnostics,
  visualQA: validateProductVisualQA
} as const));
