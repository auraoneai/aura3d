import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  interactions,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraAsset,
  type AuraNodeInput
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

type RotationPreset = "none" | "xneg" | "xpos" | "y90" | "yneg90" | "z90";

declare global {
  interface Window {
    __AURA3D_ASSET_AUDITION__?: {
      readonly assetName: string;
      readonly rotation: RotationPreset;
      readonly scale: number;
      readonly bounds: readonly [number, number, number];
      readonly provenance: {
        readonly license: string;
        readonly author: string;
        readonly sourceFamily?: string;
      };
      readonly diagnostics: Record<string, unknown>;
    };
  }
}

const assetMap = assets as unknown as Record<string, AuraAsset>;
const params = new URLSearchParams(window.location.search);
const assetName = params.get("asset") ?? "showcaseButterflyCircuit";
const rotation = readRotation(params.get("rotation"));
const target = readNumber(params.get("target"), 5.2);
const y = readNumber(params.get("y"), 0);
const fov = readNumber(params.get("fov"), 42);
const cameraHeight = readNumber(params.get("cameraHeight"), 4.2);
const cameraDistance = readNumber(params.get("cameraDistance"), 6.6);
const targetY = readNumber(params.get("targetY"), 0.45);
const asset = assetMap[assetName];

if (!asset) {
  const panel = document.querySelector<HTMLElement>("#panel");
  if (panel) panel.textContent = `Unknown typed asset: ${assetName}`;
  throw new Error(`Unknown typed asset: ${assetName}`);
}

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: Math.min(1.35, window.devicePixelRatio || 1),
  scene: scene()
    .background("#070909")
    .addMany(createAuditionNodes())
    .add(lights.ambient({ name: "audition ambient", intensity: 0.46, color: "#e8f7ff" }))
    .add(lights.directional({ name: "audition key", position: [-2.8, 5.2, 4.6], intensity: 1.35, color: "#ffffff" }))
    .add(lights.directional({ name: "audition rim", position: [3.4, 3.2, -3.8], intensity: 0.72, color: "#bcfff0" }))
    .add(interactions.orbit())
    .camera(camera.perspective({
      position: [0.2, cameraHeight, cameraDistance],
      target: [0, targetY, 0],
      fov
    }))
});

renderPanel();
window.setTimeout(publishEvidence, 120);

function createAuditionNodes(): AuraNodeInput[] {
  const assetNode = model(asset, {
    name: `typed asset audition ${assetName}`,
    castShadow: true,
    receiveShadow: true
  })
    .position(0, y, 0)
    .rotate(...rotationEuler(rotation))
    .scale(target / 1.55);

  return [
    primitives.box({
      name: "neutral audition floor",
      material: material.pbr({ color: "#1b2528", roughness: 0.82, metallic: 0.02 })
    }).position(0, -0.05, 0).scale([3.6, 0.025, 3.6]),
    assetNode
  ];
}

function publishEvidence(): void {
  const diagnostics = app.diagnostics();
  window.__AURA3D_ASSET_AUDITION__ = {
    assetName,
    rotation,
    scale: Number((target / 1.55).toFixed(4)),
    bounds: asset.bounds,
    provenance: {
      license: asset.metadata.provenance.license,
      author: asset.metadata.provenance.author,
      sourceFamily: asset.metadata.provenance.sourceFamily
    },
    diagnostics: {
      auraScene: collectAuraSceneEvidence(app.scene),
      backend: app.backend,
      fps: diagnostics.fps,
      drawCalls: diagnostics.drawCalls,
      warnings: diagnostics.warnings,
      errors: diagnostics.errors
    }
  };
}

function renderPanel(): void {
  const panel = document.querySelector<HTMLElement>("#panel");
  if (!panel) return;
  panel.innerHTML = `
    <h1>${escapeHtml(assetName)}</h1>
    <dl>
      <dt>Rotation</dt><dd>${rotation}</dd>
      <dt>Target</dt><dd>${target.toFixed(2)}</dd>
      <dt>Bounds</dt><dd>${asset.bounds.map((value) => value.toFixed(3)).join(" x ")}</dd>
      <dt>License</dt><dd>${escapeHtml(asset.metadata.provenance.license)}</dd>
      <dt>Author</dt><dd>${escapeHtml(asset.metadata.provenance.author)}</dd>
      <dt>Source</dt><dd>${escapeHtml(asset.metadata.provenance.sourceFamily ?? "unknown")}</dd>
    </dl>
  `;
}

function readRotation(value: string | null): RotationPreset {
  if (value === "xneg" || value === "xpos" || value === "y90" || value === "yneg90" || value === "z90") return value;
  return "none";
}

function rotationEuler(value: RotationPreset): [number, number, number] {
  if (value === "xneg") return [-Math.PI / 2, 0, 0];
  if (value === "xpos") return [Math.PI / 2, 0, 0];
  if (value === "y90") return [0, Math.PI / 2, 0];
  if (value === "yneg90") return [0, -Math.PI / 2, 0];
  if (value === "z90") return [0, 0, Math.PI / 2];
  return [0, 0, 0];
}

function readNumber(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
