import {
  camera,
  createAuraApp,
  game,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

/**
 * E1 wrinkle-map hook proof. The expressive robot's Head carries real morph targets
 * (Angry/Surprised/Sad); the harness sets the Angry weight explicitly (neutral frame,
 * then full frown) and the engine resolves the model's wrinkle hook into
 * `u_wrinkleStrength` every frame. `?wrinkle=off` omits the hook: same morph weights,
 * strength field absent. Comparing the two runs isolates the uniform — neutral frames
 * must match bit-exactly (strength 0 is today's rendering), full-frown frames must differ
 * (procedural normal detail rides the frown).
 */

interface PixelFrame {
  readonly width: number;
  readonly height: number;
  readonly nonBackgroundPixels: number;
  readonly uniqueColorBuckets: number;
  readonly meanLuma: number;
  readonly hash: string;
}

interface MorphFrame {
  readonly weights: Record<string, number>;
  readonly activeMorphTargets: Record<string, number>;
  readonly missingMorphTargets: string[];
  /** Inline mirror of resolveWrinkleMapStrength over the Angry/Surprised/Sad bindings. */
  readonly strength: number;
}

declare global {
  interface Window {
    __AURA3D_WRINKLE_HOOK__?: unknown;
  }
}

const WRINKLE_TARGETS = ["Angry", "Surprised", "Sad"] as const;

function resolveStrength(weights: Record<string, number>): number {
  let strength = 0;
  for (const target of WRINKLE_TARGETS) {
    const weight = weights[target] ?? 0;
    if (!Number.isFinite(weight) || weight === 0) continue;
    strength += Math.min(Math.max(weight, 0), 1);
  }
  return strength;
}

async function run(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const wrinkleEnabled = params.get("wrinkle") !== "off";
  const wrinkle = wrinkleEnabled
    ? { bindings: [{ target: "Angry" }, { target: "Surprised" }, { target: "Sad" }] }
    : undefined;
  const app = createAuraApp(requiredElement("stage"), {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({ position: [1.1, 1.15, 2.1], target: [0, 0.8, 0], fov: 30 }))
      .add(
        model(assets.showcaseExpressiveRobot, { name: "robot", ...(wrinkle ? { wrinkle } : {}) })
          .position(0, 0, 0)
          .runtime(game.runtimeNode("wrinkle-robot", { tags: ["wrinkle-hook", "typed-glb"] }))
      )
      .add(lights.studio())
  });
  await waitForAppDraw(app);

  const handle = app.nodes.require("wrinkle-robot");
  const frames: MorphFrame[] = [];
  const capture = (): MorphFrame => {
    const imported = handle.snapshot().importedAssetEvidence;
    const weights = { ...(handle.morphTargets?.() ?? {}) };
    return {
      weights,
      activeMorphTargets: { ...(imported?.activeMorphTargets ?? {}) },
      missingMorphTargets: [...(imported?.missingMorphTargets ?? [])],
      strength: resolveStrength(weights)
    };
  };

  handle.setMorphTargets({});
  app.step(1 / 60);
  app.step(1 / 60);
  const frameNeutral = readCanvasPixels(app.canvas);
  frames.push(capture());

  handle.setMorphTargets({ Angry: 1 });
  app.step(1 / 60);
  app.step(1 / 60);
  const frameFrown = readCanvasPixels(app.canvas);
  frames.push(capture());

  const diagnostics = app.diagnostics();
  const runtimeSnapshot = handle.snapshot();
  const imported = runtimeSnapshot.importedAssetEvidence;
  const diff = diffFrames(frameNeutral, frameFrown);
  window.__AURA3D_WRINKLE_HOOK__ = {
    imports: ["@aura3d/engine", "../../src/aura-assets"],
    renderer: {
      runtimeBackend: diagnostics.renderer?.runtime.backend,
      fallbackUsed: diagnostics.renderer?.runtime.backend !== "production-runtime",
      backend: diagnostics.backend,
      drawCalls: diagnostics.drawCalls
    },
    asset: {
      typedRef: "assets.showcaseExpressiveRobot",
      assetId: imported?.assetId,
      morphTargets: imported?.morphTargets ?? [],
      renderItemCount: imported?.renderItemCount ?? 0
    },
    animation: {
      wrinkleEnabled,
      cameraStable: true,
      frames,
      frameNeutral: stripPixels(frameNeutral),
      frameFrown: stripPixels(frameFrown),
      changedSubjectPixels: diff.changedSubjectPixels,
      meanDelta: diff.meanDelta,
      hashNeutral: diff.hashA,
      hashFrown: diff.hashB
    },
    claims: [
      "root-createAuraApp-wrinkle-hook",
      "typed-glb-production-bridge",
      "morph-weights-drive-wrinkle-detail"
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
  throw new Error("Timed out waiting for Aura3D wrinkle-hook harness.");
}

function readCanvasPixels(canvas: HTMLCanvasElement | undefined): PixelFrame & { readonly pixels: Uint8Array } {
  if (!canvas) throw new Error("Aura app did not expose a canvas.");
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 context unavailable for wrinkle-hook pixel proof.");
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
): { changedPixels: number; changedSubjectPixels: number; meanDelta: number; maxDelta: number; hashA: string; hashB: string } {
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

void run();
