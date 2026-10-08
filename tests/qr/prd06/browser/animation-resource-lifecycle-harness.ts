/**
 * PRD-06 §16 S3 flag-on copy of `tests/browser/animation-resource-lifecycle.spec.ts`.
 *
 * Flags installed via `setRendererQrFlags` (`?a3d-qr=` can't spell the
 * multi-word GPU_MORPH sub-flag). The lane counters come from the C-18
 * singleton `skinningPaletteCache` (palette bytes), the forwardFeature
 * morph-texture cache (`morphTextureDiagnostics`), and the WebGL2 device
 * live-texture count (`renderer.getDiagnostics().textures`). Each cycle loads
 * robot-expressive (skinned + morph targets), samples a clip through the
 * pose-mixer runtime (`applyClips` stamps `paletteKey` per skin binding),
 * acquires through the same seams the deform feature's `bindUniforms` calls
 * (`bindBoneTexture` per skinned item, `morphTextureFor` per morph item),
 * renders one frame, then disposes the runtime and pipeline. All three
 * counters must return to their pre-load values exactly — and palette/morph
 * must have risen during acquisition so the test is not vacuous.
 */
import { createGLTFSceneAnimationRuntime, loadProductionGLTFRenderPipeline } from "@aura3d/assets/browser";
import { bindBoneTextureForSkinning, ensureMorphTargetTexture, morphTextureDiagnostics, paletteKeyOf, prd06QrFlags, releaseMorphScratchGeometry, releaseMorphTargetTexture, Renderer, skinningPaletteCache } from "@aura3d/rendering";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph.js";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem.js";
import type { QrFlagName, QrFlags, QrFlagValue } from "../../../../packages/rendering/src/contracts/core.js";

// `?a3d-qr=` tokens can't express multi-word sub-flags (the splitter rejects
// `animation.gpu_morph`), so the flag-on lane installs the pair directly —
// same mechanism the renderer picks up via `rendererQrFlags()`. The draws
// stay on the non-v2 path: `Renderer.render` under A3D_QR_CORE=v2 allocates a
// multisampled MRT HDR target WebGL2 forbids (pre-existing lane gap — the
// palette/morph counters come from the feature bind seams below, which are
// exactly what generated-program `bindUniforms` calls per item per frame).
function flagsOf(values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>>): QrFlags {
  return { values, on: (name: QrFlagName) => { const v = values[name]; return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== ""; } };
}
setRendererQrFlags(flagsOf({ A3D_QR_ANIMATION: true, A3D_QR_ANIMATION_GPU_MORPH: true }));

interface LifecycleCounters {
  readonly paletteBytes: number;
  readonly morphBytes: number;
  readonly liveTextures: number;
}

interface LifecycleReport {
  readonly done?: boolean;
  readonly error?: string;
  readonly stack?: string;
  readonly cycles?: readonly {
    readonly cycle: number;
    readonly clipName?: string;
    readonly applied?: unknown;
    readonly flags?: unknown;
    readonly paletteAcquires?: number;
    readonly morphAcquires?: number;
    readonly rendered?: unknown;
    readonly baseline: LifecycleCounters;
    readonly afterRender: LifecycleCounters;
    readonly afterDispose: LifecycleCounters;
  }[];
}

declare global {
  interface Window { __AURA3D_QR_ANIMATION_LIFECYCLE__?: LifecycleReport }
}

void run();

async function run(): Promise<void> {
  const canvas = document.getElementById("stage");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing lifecycle canvas.");
  const cycles: any[] = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const renderer = await Renderer.create({ canvas, width: canvas.width, height: canvas.height, preserveDrawingBuffer: true, clearColor: [0.01, 0.015, 0.025, 1] });
    const baseline = {
      paletteBytes: skinningPaletteCache.diagnostics().bytes,
      morphBytes: morphTextureDiagnostics().bytes,
      liveTextures: renderer.getDiagnostics().textures ?? 0
    };
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: `${location.origin}/fixtures/threejs-parity/assets/character/robot-expressive.glb`,
      assetId: `prd06-animation-lifecycle-${cycle}`,
      assetName: "Robot Expressive lifecycle fixture",
      width: canvas.width,
      height: canvas.height,
      rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", postprocess: false }
    });
    const runtime = createGLTFSceneAnimationRuntime({ scene: pipeline.resources.scene, clips: pipeline.asset.animations, asset: pipeline.asset });
    const clipNames = pipeline.asset.animations.map((clip: { name: string }) => clip.name);
    const clipName = clipNames.find((name: string) => /walk|run/i.test(name)) ?? clipNames[0];
    if (!clipName) throw new Error("Lifecycle fixture has no animation clips.");
    const applied = runtime.applyClips([{ clipName, time: 0.35, weight: 1 }]);
    // Acquire the resources exactly the way the flag-on draw does: the deform
    // feature's bindUniforms calls `bindBoneTexture` per skinned item and
    // `morphTextureFor` per morph item — same seams, same caches.
    let paletteAcquires = 0;
    for (const { renderable } of pipeline.resources.scene.collectRenderables()) {
      const skinning = renderable.skinning;
      if (!skinning || paletteKeyOf(skinning) === null) continue;
      if (bindBoneTextureForSkinning(() => undefined, skinningPaletteCache, skinning)) paletteAcquires += 1;
    }
    let morphAcquires = 0;
    for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
      const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
      if (!morphTargets || morphTargets.length === 0) continue;
      const item = { label: node.name, geometry: pipeline.resources.geometryLibrary.get(renderable.geometry), morphTargets, morphWeights: renderable.morphWeights } as unknown as RenderItem;
      if (item.geometry === undefined) continue;
      if (ensureMorphTargetTexture(item) !== undefined) morphAcquires += 1;
    }
    const rendered = renderer.render(pipeline.source, pipeline.camera);
    const afterRender = {
      paletteBytes: skinningPaletteCache.diagnostics().bytes,
      morphBytes: morphTextureDiagnostics().bytes,
      liveTextures: renderer.getDiagnostics().textures ?? 0
    };
    runtime.dispose();
    // Same seam the prd06.animation actor extension runs at dispose: release
    // the §8.2 morph array texture + CPU-morph scratch keyed on each geometry
    // the pipeline owns.
    for (const geometry of pipeline.resources.geometryLibrary.values()) {
      releaseMorphTargetTexture(geometry);
      releaseMorphScratchGeometry(geometry);
    }
    pipeline.dispose();
    const afterDispose = {
      paletteBytes: skinningPaletteCache.diagnostics().bytes,
      morphBytes: morphTextureDiagnostics().bytes,
      liveTextures: renderer.getDiagnostics().textures ?? 0
    };
    renderer.dispose();
    cycles.push({
      cycle,
      clipName,
      applied: { tracksApplied: applied.tracksApplied, skinningPalettesUpdated: applied.skinningPalettesUpdated },
      flags: { values: prd06QrFlags().values, animation: prd06QrFlags().on("A3D_QR_ANIMATION"), gpuMorph: prd06QrFlags().on("A3D_QR_ANIMATION_GPU_MORPH") },
      paletteAcquires,
      morphAcquires,
      rendered: { drawCalls: rendered.drawCalls, backend: renderer.device.kind },
      baseline,
      afterRender,
      afterDispose
    });
  }
  window.__AURA3D_QR_ANIMATION_LIFECYCLE__ = { cycles, done: true };
}
