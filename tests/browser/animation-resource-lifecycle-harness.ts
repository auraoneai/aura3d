import { createGLTFSceneAnimationMixer, loadProductionGLTFRenderPipeline } from "@aura3d/assets/browser";
import { ProductionWebGL2Renderer } from "@aura3d/rendering";

declare global { interface Window { __AURA3D_ANIMATION_LIFECYCLE__?: any } }

void run();

async function run(): Promise<void> {
  const canvas = document.getElementById("stage");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing lifecycle canvas.");
  const cycles: any[] = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: `${location.origin}/fixtures/threejs-parity/assets/character/robot-expressive.glb`,
      assetId: `animation-lifecycle-${cycle}`,
      assetName: "Robot Expressive lifecycle fixture",
      width: canvas.width,
      height: canvas.height,
      rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", postprocess: false }
    });
    const mixer = createGLTFSceneAnimationMixer({ scene: pipeline.resources.scene, clips: pipeline.asset.animations, asset: pipeline.asset, autoPlay: false });
    const renderer = await ProductionWebGL2Renderer.create({ canvas, width: canvas.width, height: canvas.height, preserveDrawingBuffer: true, clearColor: [0.01, 0.015, 0.025, 1] });
    const clipName = mixer.listClips().find((name) => /walk|run/i.test(name)) ?? mixer.listClips()[0];
    if (!clipName) throw new Error("Lifecycle fixture has no animation clips.");
    mixer.playExclusive(clipName, { reset: true, weight: 1, loopMode: "repeat" });
    const update = mixer.update(0.35);
    const rendered = renderer.renderFrame({ source: pipeline.source, camera: pipeline.camera, metadata: pipeline.metadata });
    const beforeStop = mixer.snapshot();
    const beforeDispose = renderer.getDiagnostics();
    mixer.stop();
    const afterStop = mixer.snapshot();
    mixer.dispose();
    pipeline.dispose();
    renderer.dispose();
    const afterDispose = renderer.getDiagnostics();
    cycles.push({
      cycle,
      clipName,
      update: { tracksApplied: update.applyResult.tracksApplied, skinningPalettesUpdated: update.applyResult.skinningPalettesUpdated },
      rendered: { drawCalls: rendered.diagnostics.drawCalls, backend: rendered.backend },
      beforeStop: { activeClipNames: beforeStop.activeClipNames, mixerActionCount: beforeStop.mixerActionCount },
      afterStop: { activeClipNames: afterStop.activeClipNames },
      bindingAfterDispose: { actionCount: mixer.actions.size, mixer: mixer.mixer.snapshot() },
      resourcesBeforeDispose: resourceCounts(beforeDispose),
      resourcesAfterDispose: resourceCounts(afterDispose)
    });
  }
  window.__AURA3D_ANIMATION_LIFECYCLE__ = { status: "ready", cycles };
}

function resourceCounts(value: any) {
  return { buffers: value.buffers ?? 0, shaders: value.shaders ?? 0, textures: value.textures ?? 0, renderTargets: value.renderTargets ?? 0, bufferBytes: value.bufferBytes ?? 0, textureBytes: value.textureBytes ?? 0, approximateGpuMemoryBytes: value.approximateGpuMemoryBytes ?? 0 };
}

run().catch((error) => { window.__AURA3D_ANIMATION_LIFECYCLE__ = { status: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) }; });
export {};
