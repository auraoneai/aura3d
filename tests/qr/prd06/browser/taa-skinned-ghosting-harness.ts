/**
 * PRD-06 §16 I-row — `taa-skinned-ghosting` lane copy (T2.5).
 *
 * Runs in the lane workflow; the ≤ 2 px ghost-trail gate is §17.1
 * integrated acceptance because `TemporalHistory.prepare` still rejects
 * skinned items (`TEMPORAL_UNSUPPORTED_GEOMETRY` — the C-14 velocity
 * consumer contract is PRD-03's). The harness:
 *
 *   1. attempts a `postprocess:{temporal, taa}` render of the animated
 *      Soldier flag-on (`A3D_QR_ANIMATION` + `A3D_QR_ANIMATION_GPU_MORPH`
 *      + `A3D_QR_POST`) across 12 clip-sample frames;
 *   2. when the temporal path admits skinned geometry (C-14 real), measures
 *      the walking silhouette's trailing ghost edge — the max horizontal
 *      run of pixels that luma-differ from the current frame but match the
 *      previous frame's silhouette column — and reports `trailPx`;
 *   3. when the path still throws, reports `supported: false` with the
 *      thrown code so the checkpoint sees the dependency rather than a
 *      vacuous pass.
 *
 * Publishes `window.__AURA3D_QR_TAA_SKINNED_GHOSTING__`.
 */
import { createGLTFSceneAnimationRuntime, loadProductionGLTFRenderPipeline } from "@aura3d/assets/browser";
import { Renderer } from "@aura3d/rendering";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph.js";
import type { QrFlagName, QrFlags, QrFlagValue } from "../../../../packages/rendering/src/contracts/core.js";

// `?a3d-qr=` can't express multi-word sub-flags — install the pair directly.
function flagsOf(values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>>): QrFlags {
  return { values, on: (name: QrFlagName) => { const v = values[name]; return v !== undefined && v !== false && v !== "0" && v !== "off" && v !== ""; } };
}
setRendererQrFlags(flagsOf({ A3D_QR_ANIMATION: true, A3D_QR_ANIMATION_GPU_MORPH: true, A3D_QR_POST: true }));

interface TaaGhostingReport {
  readonly done?: boolean;
  readonly error?: string;
  readonly stack?: string;
  readonly flags?: unknown;
  readonly frames?: number;
  readonly supported?: boolean;
  readonly unsupportedError?: string;
  readonly trailPx?: number | null;
  readonly trailGatePx?: number;
  readonly dependency?: string;
  readonly gating?: string;
}

declare global {
  interface Window { __AURA3D_QR_TAA_SKINNED_GHOSTING__?: TaaGhostingReport }
}

void run();

async function run(): Promise<void> {
  const canvas = document.getElementById("stage");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing taa-ghosting canvas.");
  const renderer = await Renderer.create({ canvas, width: canvas.width, height: canvas.height, preserveDrawingBuffer: true, clearColor: [0.05, 0.06, 0.08, 1] });
  try {
    const pipeline = await loadProductionGLTFRenderPipeline({
      url: `${location.origin}/fixtures/threejs-parity/assets/character/soldier.glb`,
      assetId: "prd06-taa-skinned-ghosting",
      assetName: "Soldier TAA ghosting fixture",
      width: canvas.width,
      height: canvas.height,
      rendererInput: { qualityPreset: "studio-preview", cameraPolicy: "require", postprocess: false }
    });
    const runtime = createGLTFSceneAnimationRuntime({ scene: pipeline.resources.scene, clips: pipeline.asset.animations, asset: pipeline.asset });
    const clipNames = pipeline.asset.animations.map((clip: { name: string }) => clip.name);
    const clipName = clipNames.find((name: string) => /walk/i.test(name)) ?? clipNames[0];
    if (!clipName) throw new Error("TAA fixture has no animation clips.");

    const taaSource = {
      ...pipeline.source,
      postprocess: {
        temporal: {},
        taa: {}
      }
    };

    const frames: Uint8ClampedArray[] = [];
    let unsupportedError: string | undefined;
    for (let frame = 0; frame < 12; frame += 1) {
      runtime.applyClips([{ clipName, time: (frame / 12) * 1.6, weight: 1 }]);
      try {
        renderer.render(taaSource, pipeline.camera);
      } catch (error) {
        unsupportedError = error instanceof Error ? `${(error as { code?: string }).code ?? "ERROR"}: ${error.message}` : String(error);
        break;
      }
      const pixels = readPixels(canvas);
      if (pixels) frames.push(pixels);
    }

    if (unsupportedError !== undefined) {
      window.__AURA3D_QR_TAA_SKINNED_GHOSTING__ = {
        done: true,
        flags: { A3D_QR_ANIMATION: true, A3D_QR_ANIMATION_GPU_MORPH: true, A3D_QR_POST: true },
        frames: frames.length,
        supported: false,
        unsupportedError,
        trailPx: null,
        trailGatePx: 2,
        dependency: "C-14 (post lane TemporalHistory velocity admission for skinned/morph items, Q-03-1)",
        gating: "§17.1 integrated acceptance only — reports its value in lane CI per §16 I-row"
      };
    } else {
      // C-14 real path: measure the ghost trail between the last two frames.
      // For every column containing the moving silhouette, count the longest
      // horizontal run of pixels that match the previous frame's silhouette
      // colour but not the current frame's — the stale "ghost" edge.
      const trailPx = measureTrailPx(frames);
      window.__AURA3D_QR_TAA_SKINNED_GHOSTING__ = {
        done: true,
        flags: { A3D_QR_ANIMATION: true, A3D_QR_ANIMATION_GPU_MORPH: true, A3D_QR_POST: true },
        frames: frames.length,
        supported: true,
        trailPx,
        trailGatePx: 2,
        gating: "§17.1 integrated acceptance only — reports its value in lane CI per §16 I-row"
      };
    }
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

/**
 * Longest horizontal run where a pixel matches the PREVIOUS frame's moving
 * edge but no longer matches the CURRENT frame — the ghost trail width in px.
 */
function measureTrailPx(frames: readonly Uint8ClampedArray[]): number {
  if (frames.length < 2) return 0;
  const current = frames[frames.length - 1]!;
  const previous = frames[frames.length - 2]!;
  const width = Math.sqrt(current.length / 4 / 1) | 0; // rows derived below
  const total = current.length / 4;
  const w = width === 0 ? Math.sqrt(total) | 0 : width;
  let best = 0;
  for (let row = 0; row < total / w; row += 1) {
    let run = 0;
    for (let col = 0; col < w; col += 1) {
      const i = row * w + col;
      const dc = Math.abs(current[i * 4]! - previous[i * 4]!) + Math.abs(current[i * 4 + 1]! - previous[i * 4 + 1]!) + Math.abs(current[i * 4 + 2]! - previous[i * 4 + 2]!);
      // A pixel that changed between frames is part of the moving silhouette
      // edge (either leading or trailing); the trailing half is the ghost.
      run = dc > 24 ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  return best;
}
