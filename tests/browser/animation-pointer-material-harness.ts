import {
  camera,
  createAnimationController,
  createAuraApp,
  game,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

/**
 * M1 box-1 browser proof: a real `KHR_animation_pointer` channel from a typed fixture GLB
 * (`animationPointerPanel`, clip `pointerFade`, pointer
 * `/materials/0/pbrMetallicRoughness/baseColorFactor`) drives the live material's
 * `u_baseColorFactor`/`u_baseColor` uniforms through the root public API only. The harness
 * scrubs the clip to t=0 (white) and t=1 (near-black) with a stable camera and publishes
 * frame hashes, the pixel diff, and the runtime's own material-track counter on
 * `window.__AURA3D_POINTER_MATERIAL__`.
 */

interface PixelFrame {
  readonly width: number;
  readonly height: number;
  readonly nonBackgroundPixels: number;
  readonly uniqueColorBuckets: number;
  readonly meanLuma: number;
  readonly hash: string;
}

interface PixelDiff {
  readonly changedPixels: number;
  readonly changedSubjectPixels: number;
  readonly meanDelta: number;
  readonly maxDelta: number;
  readonly hashA: string;
  readonly hashB: string;
}

interface PointerMaterialEvidence {
  readonly imports: readonly string[];
  readonly renderer: {
    readonly mode: string;
    readonly runtimeBackend: string | undefined;
    readonly fallbackUsed: boolean;
    readonly backend: string;
    readonly drawCalls: number;
  };
  readonly asset: {
    readonly typedRef: string;
    readonly assetId: string | undefined;
    readonly clips: readonly string[];
    readonly activeClip: string | undefined;
    readonly materialTracksApplied: number;
    readonly lightTracksApplied: number;
    readonly renderItemCount: number;
  };
  readonly animation: {
    readonly runtimeClip: string | undefined;
    readonly bindingClip: string | undefined;
    readonly cameraStable: boolean;
    readonly frameA: PixelFrame;
    readonly frameB: PixelFrame;
    readonly diff: PixelDiff;
  };
  readonly claims: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_POINTER_MATERIAL__?: PointerMaterialEvidence;
    __AURA3D_POINTER_MATERIAL_ERROR__?: string;
  }
}

void run().catch((error: unknown) => {
  window.__AURA3D_POINTER_MATERIAL_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const app = createAuraApp(requiredElement("stage"), {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({ position: [0, 0.05, 2.4], target: [0, 0.05, 0], fov: 30 }))
      .add(
        model(assets.animationPointerPanel, { name: "pointer panel" })
          .position(0, 0, 0)
          .animate({ clip: "pointerFade", loop: false, captureTime: 0, speed: 1 })
          .runtime(game.runtimeNode("pointer-panel", { tags: ["pointer-material", "typed-glb"] }))
      )
      .add(lights.studio())
  });

  await waitForAppDraw(app);
  const node = app.nodes.require("pointer-panel");
  const controller = createAnimationController<string>({
    id: "pointer-panel-controller",
    requiredClips: ["pointerFade"],
    clips: [{ id: "pointerFade", name: "pointerFade", duration: 1, loop: false }]
  });
  controller.bindRuntimeNode(node, {
    id: "pointer-panel-binding",
    applyPose: false,
    applyMorphTargets: false,
    syncCaptureTime: true,
    syncLoop: true,
    syncSpeed: true
  });

  // Scrub the pointer clip's real sampler endpoints: t=0 is white, t=1 is near-black.
  controller.scrub("pointerFade", 0, { play: true });
  app.step(1 / 60);
  const frameA = readCanvasPixels(app.canvas);
  controller.scrub("pointerFade", 1, { play: true });
  app.step(1 / 60);
  const frameB = readCanvasPixels(app.canvas);

  const diagnostics = app.diagnostics();
  const runtimeSnapshot = node.snapshot();
  const imported = runtimeSnapshot.importedAssetEvidence;
  const binding = runtimeSnapshot.animationBinding;
  window.__AURA3D_POINTER_MATERIAL__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    renderer: {
      mode: diagnostics.renderer?.runtime.backend === "production-runtime" ? "production" : "safe-basic",
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      fallbackUsed: diagnostics.renderer?.runtime.backend !== "production-runtime",
      backend: diagnostics.backend,
      drawCalls: diagnostics.drawCalls
    },
    asset: {
      typedRef: "assets.animationPointerPanel",
      assetId: imported?.assetId,
      clips: imported?.clips ?? [],
      activeClip: imported?.activeClip,
      materialTracksApplied: imported?.lastMaterialTracksApplied ?? 0,
      lightTracksApplied: imported?.lastLightTracksApplied ?? 0,
      renderItemCount: imported?.renderItemCount ?? 0
    },
    animation: {
      runtimeClip: runtimeSnapshot.animation?.clip,
      bindingClip: binding?.activeClipId,
      cameraStable: true,
      frameA: stripPixels(frameA),
      frameB: stripPixels(frameB),
      diff: diffFrames(frameA, frameB)
    },
    claims: [
      "root-createAuraApp-animation-pointer",
      "typed-glb-production-bridge",
      "pointer-material-track-visible-fade"
    ]
  };
}

async function waitForAppDraw(app: ReturnType<typeof createAuraApp>): Promise<void> {
  await waitFor(() => app.diagnostics().drawCalls > 0 && app.diagnostics().renderSize[0] > 0, 15_000);
  app.step(1 / 60);
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Aura3D pointer-material harness.");
}

function readCanvasPixels(canvas: HTMLCanvasElement | undefined): PixelFrame & { readonly pixels: Uint8Array } {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for pointer-material pixel proof.");
  const width = canvas.width;
  const height = canvas.height;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let nonBackgroundPixels = 0;
  const buckets = new Set<string>();
  let lumaTotal = 0;
  let hash = 2166136261;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const alpha = pixels[index + 3] ?? 0;
    lumaTotal += (red + green + blue) / 3;
    if (alpha > 0 && (red > 18 || green > 18 || blue > 22)) {
      nonBackgroundPixels += 1;
      buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
    hash ^= red + (green << 8) + (blue << 16) + alpha;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return {
    width,
    height,
    nonBackgroundPixels,
    uniqueColorBuckets: buckets.size,
    meanLuma: lumaTotal / (pixels.length / 4),
    hash: hash.toString(16).padStart(8, "0"),
    pixels
  };
}

function stripPixels<T extends { readonly pixels: Uint8Array }>(frame: T): Omit<T, "pixels"> {
  const { pixels: _dropped, ...rest } = frame;
  return rest;
}

function diffFrames(
  a: PixelFrame & { readonly pixels: Uint8Array },
  b: PixelFrame & { readonly pixels: Uint8Array }
): PixelDiff {
  const pixelCount = Math.min(a.pixels.length, b.pixels.length) / 4;
  let changedPixels = 0;
  let changedSubjectPixels = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  for (let index = 0; index < pixelCount * 4; index += 4) {
    const dr = Math.abs((a.pixels[index] ?? 0) - (b.pixels[index] ?? 0));
    const dg = Math.abs((a.pixels[index + 1] ?? 0) - (b.pixels[index + 1] ?? 0));
    const db = Math.abs((a.pixels[index + 2] ?? 0) - (b.pixels[index + 2] ?? 0));
    const delta = (dr + dg + db) / 3;
    const subject =
      (a.pixels[index] ?? 0) > 18 || (a.pixels[index + 1] ?? 0) > 18 || (a.pixels[index + 2] ?? 0) > 22 ||
      (b.pixels[index] ?? 0) > 18 || (b.pixels[index + 1] ?? 0) > 18 || (b.pixels[index + 2] ?? 0) > 22;
    totalDelta += delta;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > 10) changedPixels += 1;
    if (subject && delta > 10) changedSubjectPixels += 1;
  }
  return {
    changedPixels,
    changedSubjectPixels,
    meanDelta: pixelCount > 0 ? totalDelta / pixelCount : 0,
    maxDelta,
    hashA: a.hash,
    hashB: b.hash
  };
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
