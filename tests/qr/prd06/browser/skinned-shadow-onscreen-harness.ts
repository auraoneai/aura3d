/**
 * PRD-06 §16 I-row — `skinned-shadow-onscreen` lane copy (T0.14).
 *
 * Reported in lane CI; the IoU ≥ 0.85 vs three r185 gates only §17.1
 * integrated acceptance because the deforming depth-caster path is C-11
 * (the lighting lane's `DepthPass` composing `registerDepthVariantFeature`,
 * which it does not do yet). What this harness CAN and does measure today:
 *
 *   - flag-on (`A3D_QR_ANIMATION`, `A3D_QR_ANIMATION_GPU_MORPH`) skinned
 *     Soldier driven through `applyClips` renders under a `castsShadow`
 *     directional light with a ground receiver;
 *   - the on-screen shadow mask — `luma(on) < 0.9 × luma(off)` per §16 —
 *     is computed in-page from two identical-camera readbacks;
 *   - metrics (mask pixels, area fraction, centroid, mean in-shadow luma
 *     delta) are published for the checkpoint to read; `iou` stays null
 *     with `dependency: "C-11"` until the three-side comparator exists.
 *
 * Publishes `window.__AURA3D_QR_SKINNED_SHADOW_ONSCREEN__`.
 */
import { createGLTFSceneAnimationRuntime, loadProductionGLTFRenderPipeline } from "@aura3d/assets/browser";
import { Geometry, PBRMaterial, Renderer } from "@aura3d/rendering";
import { DirectionalLight } from "@aura3d/scene";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph.js";
import type { CollectedLight } from "../../../../packages/rendering/src/LightCollector.js";
import type { QrFlagName, QrFlags, QrFlagValue } from "../../../../packages/rendering/src/contracts/core.js";

// `?a3d-qr=` can't express multi-word sub-flags — install the pair directly.
function flagsOf(values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>>): QrFlags {
  return { values, on: (name: QrFlagName) => { const v = values[name]; return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== ""; } };
}
setRendererQrFlags(flagsOf({ A3D_QR_ANIMATION: true, A3D_QR_ANIMATION_GPU_MORPH: true }));

interface ShadowMaskReport {
  readonly done?: boolean;
  readonly error?: string;
  readonly stack?: string;
  readonly flags?: unknown;
  readonly rendered?: { readonly drawCalls: number; readonly backend: string };
  readonly shadowMask?: {
    readonly maskPixels: number;
    readonly areaFraction: number;
    readonly centroid: readonly [number, number];
    readonly meanLumaDeltaInside: number;
  };
  readonly iou?: number | null;
  readonly dependency?: string;
  readonly gating?: string;
}

declare global {
  interface Window { __AURA3D_QR_SKINNED_SHADOW_ONSCREEN__?: ShadowMaskReport }
}

void run();

async function run(): Promise<void> {
  const canvas = document.getElementById("stage");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing shadow-onscreen canvas.");
  const renderer = await Renderer.create({ canvas, width: canvas.width, height: canvas.height, preserveDrawingBuffer: true, clearColor: [0.05, 0.06, 0.08, 1] });
  try {
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: `${location.origin}/fixtures/threejs-parity/assets/character/soldier.glb`,
      assetId: "prd06-shadow-onscreen",
      assetName: "Soldier shadow-onscreen fixture",
      width: canvas.width,
      height: canvas.height,
      rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", postprocess: false }
    });
    const runtime = createGLTFSceneAnimationRuntime({ scene: pipeline.resources.scene, clips: pipeline.asset.animations, asset: pipeline.asset });
    const clipNames = pipeline.asset.animations.map((clip: { name: string }) => clip.name);
    const clipName = clipNames.find((name: string) => /walk/i.test(name)) ?? clipNames[0];
    if (!clipName) throw new Error("Shadow fixture has no animation clips.");
    runtime.applyClips([{ clipName, time: 0.4, weight: 1 }]);

    // Ground receiver under the rig's feet (soldier stands on y ≈ 0). Scene
    // renderables resolve geometry/material by string handle through the
    // pipeline's libraries, so register the receiver there first.
    const geometryLibrary = pipeline.resources.geometryLibrary as Map<string, Geometry>;
    const materialLibrary = pipeline.resources.materialLibrary as Map<string, PBRMaterial>;
    geometryLibrary.set("qr-shadow-ground-geom", Geometry.litCube(1));
    materialLibrary.set("qr-shadow-ground-mat", new PBRMaterial({ name: "qr-shadow-ground-mat", baseColor: [0.62, 0.64, 0.68, 1], metallic: 0, roughness: 0.85 }));
    const ground = pipeline.resources.scene.createMesh({ name: "qr-shadow-ground" });
    ground.setRenderable({ geometry: "qr-shadow-ground-geom", material: "qr-shadow-ground-mat", receiveShadow: true });
    ground.setLocalMatrix([
      8, 0, 0, 0,
      0, 0.04, 0, 0,
      0, 0, 8, 0,
      0, -0.05, 0, 1
    ]);
    pipeline.resources.scene.root.addChild(ground);

    const light = new DirectionalLight("qr-shadow-key");
    light.castsShadow = true;
    light.intensity = 3.2;
    const collectedLight: CollectedLight = {
      kind: "directional",
      color: [1, 0.97, 0.9],
      intensity: 3.2,
      position: [4, 6, 3],
      direction: [-0.55, -0.75, -0.35],
      range: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: true,
      layerMask: 0xffffffff,
      source: light
    };
    const source = pipeline.source;
    const shadowedSource = {
      ...source,
      collectedLights: [collectedLight],
      shadow: { size: 1024, bias: 0.0015, pcfSamples: 16, pcfRadius: 1.5, strength: 0.85, filter: "pcf" as const }
    };
    const unshadowedSource = {
      ...source,
      collectedLights: [{ ...collectedLight, castsShadow: false }]
    };

    const on = renderer.render(shadowedSource, pipeline.camera);
    const onPixels = readPixels(canvas);
    const off = renderer.render(unshadowedSource, pipeline.camera);
    const offPixels = readPixels(canvas);
    if (!onPixels || !offPixels) throw new Error("Canvas readback unavailable.");

    // §16 mask: luma(shadow-on) < 0.9 × luma(shadow-off), measured on the
    // ground/character pixels (skip the uniform clear background rows).
    let maskPixels = 0;
    let sumX = 0;
    let sumY = 0;
    let deltaSum = 0;
    const total = onPixels.length / 4;
    for (let i = 0; i < total; i += 1) {
      const lumaOn = 0.2126 * onPixels[i * 4]! + 0.7152 * onPixels[i * 4 + 1]! + 0.0722 * onPixels[i * 4 + 2]!;
      const lumaOff = 0.2126 * offPixels[i * 4]! + 0.7152 * offPixels[i * 4 + 1]! + 0.0722 * offPixels[i * 4 + 2]!;
      if (lumaOn < 0.9 * lumaOff) {
        maskPixels += 1;
        sumX += i % canvas.width;
        sumY += Math.floor(i / canvas.width);
        deltaSum += lumaOff - lumaOn;
      }
    }
    window.__AURA3D_QR_SKINNED_SHADOW_ONSCREEN__ = {
      done: true,
      flags: { A3D_QR_ANIMATION: true, A3D_QR_ANIMATION_GPU_MORPH: true },
      rendered: { drawCalls: on.drawCalls + off.drawCalls, backend: renderer.device.kind },
      shadowMask: {
        maskPixels,
        areaFraction: maskPixels / total,
        centroid: maskPixels > 0 ? [sumX / maskPixels / canvas.width, sumY / maskPixels / canvas.height] : [0, 0],
        meanLumaDeltaInside: maskPixels > 0 ? deltaSum / maskPixels : 0
      },
      iou: null,
      dependency: "C-11 (lighting lane DepthPass composing the registered prd06.deform depth feature + three r185 comparator)",
      gating: "§17.1 integrated acceptance only — reports its value in lane CI per §16 I-row"
    };
    runtime.dispose();
    pipeline.dispose();
  } finally {
    renderer.dispose();
  }
}

function readPixels(canvas: HTMLCanvasElement): Uint8ClampedArray | null {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.canvas.width = canvas.width;
  ctx.canvas.height = canvas.height;
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}
