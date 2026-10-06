// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraMaterialSpec, AuraCreateAppRendererOptions, AuraRendererDiagnosticReport, AuraSceneSnapshot, AuraBackend, AuraDiagnostics, AuraAssetProvenance, AuraAssetLoadState, AuraSceneEvidence } from "../nodes/types.js";
import type { LabelTelemetry, TextBucketSummary } from "../LabelTelemetry.js";
import type { ProjectedLabel } from "../WorldLabelRenderer.js";
import { AuraRuntimeError } from "../app/errors.js";
import { collectAuraSceneEvidence } from "./sceneEvidence.js";
import { labels } from "../nodes/labels.js";
import { material } from "../nodes/material.js";
import { model, unsafeModelUrl } from "../nodes/model.js";
import { primitives } from "../nodes/primitives.js";
import { renderer, createRendererDiagnosticReport } from "./rendererDiagnostics.js";
import { scene } from "../nodes/scene.js";

export function validateSceneAssets(snapshot: AuraSceneSnapshot, assets: AuraAssetLoadState[]): void {
  for (const node of snapshot.nodes) {
    if (node.kind !== "model") continue;
    const asset = node.asset;
    if (!asset.url && !asset.optional) {
      throw new AuraRuntimeError(
        "missing-asset",
        `Aura3D asset "${asset.id}" is missing a URL. Suggested fix: run aura3d assets add ./asset.glb --name ${asset.id}.`
      );
    }
    if (asset.type === "model" && !["glb", "gltf"].includes(asset.format)) {
      throw new AuraRuntimeError(
        "failed-glb-load",
        `Aura3D model "${asset.id}" uses unsupported format "${asset.format}". Suggested fix: export GLB/glTF or add an explicit loader before using model(assets.${asset.id}).`
      );
    }
    assets.push({
      id: asset.id,
      type: asset.type,
      url: asset.url,
      status: asset.url ? "ready" : "optional-missing",
      provenance: createAssetProvenance(asset),
      ...(asset.hash ? { hash: asset.hash } : {}),
      message: asset.url ? undefined : "Optional placeholder asset has no URL yet."
    });
    validateMaterialTexture(node.material);
  }
}

export function createAssetProvenance(asset: AuraAssetRef): AuraAssetProvenance {
  const remote = /^https?:\/\//i.test(asset.url);
  /*
   * A deployment may rewrite the URL of a generated manifest asset to an
   * immutable external asset host (for example, GitHub media or an object
   * store) so the site bundle does not need to carry every GLB.  URL location
   * is therefore not a sufficient trust signal: the manifest identity is the
   * typed ref's kind/id/hash plus durable source-path provenance.  Keep
   * `unsafeModelUrl(...)` blocked by its sentinel id, and do not bless an
   * arbitrary remote object that merely happens to carry a hash.
   */
  const manifestPaths = [
    asset.metadata?.provenance?.sourcePath,
    asset.metadata?.sourcePath,
    asset.metadata?.outputPath,
    asset.metadata?.provenance?.outputPath
  ];
  const hasDurableManifestProvenance = asset.kind === "aura-asset-ref"
    && asset.id !== "unsafe"
    && typeof asset.hash === "string"
    && asset.hash.length > 0
    && manifestPaths.some((value) =>
      typeof value === "string" && value.replaceAll("\\", "/").startsWith("public/aura-assets/")
    );
  const trustedManifestAsset = !remote || hasDurableManifestProvenance;
  return {
    source: asset.id === "unsafe" || !trustedManifestAsset
      ? "unsafe-url"
      : asset.hash
        ? "typed-aura-assets-manifest"
        : "inline-definition",
    id: asset.id,
    url: asset.url,
    ...(asset.hash ? { hash: asset.hash } : {}),
    ...(asset.bounds ? { bounds: asset.bounds } : {})
  };
}

function validateMaterialTexture(materialSpec?: AuraMaterialSpec): void {
  const texture = materialSpec?.texture;
  if (!texture) return;
  if (!["png", "jpg", "jpeg", "webp", "ktx2"].includes(texture.format)) {
    throw new AuraRuntimeError(
      "unsupported-texture",
      `Aura3D texture asset "${texture.id}" uses unsupported format "${texture.format}". Suggested fix: use png, jpg, jpeg, webp, or ktx2 textures.`
    );
  }
}

export interface MutableDiagnostics {
  backend: AuraBackend;
  fps: number;
  drawCalls: number;
  renderSize: [number, number];
  assets: AuraAssetLoadState[];
  evidence: AuraSceneEvidence;
  renderer: AuraRendererDiagnosticReport;
  warnings: string[];
  errors: string[];
  /**
   * Last projected label set.
   *
   * Reported as diagnostics so a test can assert a callout was *placed on screen*
   * rather than merely present in the scene graph. Counting label nodes is what
   * let every production callout go missing while reports stayed green.
   */
  labels?: readonly ProjectedLabel[];
  labelTelemetry?: LabelTelemetry;
  textBuckets?: TextBucketSummary;
}

export function createInitialDiagnostics(snapshot: AuraSceneSnapshot, rendererOptions?: AuraCreateAppRendererOptions): MutableDiagnostics {
  return {
    backend: "headless",
    fps: 0,
    drawCalls: 0,
    renderSize: [0, 0],
    assets: [],
    evidence: collectAuraSceneEvidence(snapshot),
    renderer: createRendererDiagnosticReport(snapshot, undefined, rendererOptions),
    warnings: snapshot.nodes.length === 0 ? ["Scene contains no renderable nodes. Add model(assets.assetId) or primitives.box()."] : [],
    errors: []
  };
}

export function snapshotDiagnostics(value: MutableDiagnostics): AuraDiagnostics {
  return {
    backend: value.backend,
    fps: value.fps,
    drawCalls: value.drawCalls,
    renderSize: value.renderSize,
    assets: [...value.assets],
    evidence: value.evidence,
    renderer: value.renderer,
    warnings: [...value.warnings],
    errors: [...value.errors],
    ...(value.labels ? { labels: value.labels } : {}),
    ...(value.labelTelemetry ? { labelTelemetry: value.labelTelemetry } : {}),
    ...(value.textBuckets ? { textBuckets: value.textBuckets } : {})
  };
}
