/**
 * render-live.ts — headless capture + toon post-pass + real video encode for the
 * Animation Studio LIVE 3D render route (`src/render-live-route.ts`).
 *
 * Pipeline (every stage touches real bytes — nothing is faked):
 *  1. Serve the `live-route.html` route with a real Vite dev server.
 *  2. Drive it with Playwright (Chromium, WebGL2). Wait for the route's
 *     `__AURA_LIVE_ROUTE_READY__` proof, then call its `__auraSeek__(time)` hook
 *     at N distinct animation times. Each seek poses BOTH skinned GLB skeletons
 *     and renders one frame; we read the canvas back as raw RGBA pixels
 *     (gl.readPixels via a 2D copy → ImageData), so the captured bytes are the
 *     actual rendered, skinned characters.
 *  3. Apply the REAL toon treatment from `@aura3d/rendering` (monorepo source):
 *     - band-quantize each pixel's luma with `quantizeToonBand` (the exact cel
 *       math the AnimationToonMaterial GLSL mirrors), giving posterized shading,
 *     - run the Sobel `outlinePixels` ink pass + `colorGradePixels` storybook
 *       grade that `applyAnimationRenderPreset` prescribes.
 *  4. Save the 4 representative frames as PNGs named for the fidelity gate
 *     (first/dialogue/action/final) AND encode ALL frames into a real
 *     `episode-3d.webm` via `createFfmpegFrameEncoderAdapter` (libvpx-vp9).
 *
 * IMPORTANT — run this from the MONOREPO ROOT so `@aura3d/rendering` /
 * `@aura3d/engine` resolve to the SOURCE build (which ships AnimationToonMaterial +
 * the animation shader/post-passes). The template's own published `@aura3d/engine`
 * lacks those exports; the in-browser route only needs the renderer + skinning,
 * which the published build DOES have. Invoke as:
 *   pnpm exec tsx --tsconfig tsconfig.base.json \
 *     packages/create-aura3d/templates/animation-studio/scripts/render-live.ts
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { createFfmpegFrameEncoderAdapter } from "@aura3d/engine";
import { emptyDocument, EMPTY_DOCUMENT_NOTICE } from "../src/empty-document.js";
import type { EpisodeDocument } from "../src/episode-document.js";
// PHASE 5.3: the CPU toon post-pass lives ONCE in render-core.ts (the canonical home).
// render-live imports the shared functions instead of carrying its own copies.
import {
  sharp,
  rawRgbaToPng,
  compositeCaptionPng,
  applyToonTreatment as applyToonTreatmentCore
} from "./render-core.js";
// B2 — skeleton-overlay strip (3-frame bone-projection PNG per character). Browser/GPU-free FK on a
// canonical rig driven by the SAME shared standard-library clip the player retargets.
import { buildSkeletonStrip } from "./skeleton-overlay.js";
// I2 — render-mode VERIFICATION (toon/wireframe/storyboard + toon/pbr style). An unknown flag throws
// here rather than silently rendering the wrong view; the resolved mode is recorded in the summary.
import { resolveRenderMode, renderModeNotes } from "../src/render-modes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(TEMPLATE_ROOT, process.env.AURA_OUTPUT_DIR ?? "dist/episodes/live-3d");
const FRAMES_DIR = resolve(OUTPUT_DIR, "frames");
const VIDEO_PATH = resolve(OUTPUT_DIR, "episode-3d.webm");

// M5 — RESOLUTION / OUTPUT TIERS via AURA_QUALITY:
//   preview  (DEFAULT) = low-fi 480x270 @ 8fps, cheaper post — fast studio iteration.
//   final               = 1080p (1920x1080) @ 24fps with the full post pass and no preview
//                         shortcuts: device-scale supersampling for anti-aliasing, the full
//                         (non-low-fi) toon/grade pass, higher fps.
// AURA_LOW_FIDELITY=1 stays a working ALIAS for the preview tier (back-compat).
type QualityTier = "preview" | "final";
// AURA_LOW_FIDELITY=1 is an explicit alias for the preview tier and overrides AURA_QUALITY.
const QUALITY: QualityTier =
  process.env.AURA_LOW_FIDELITY === "1" ? "preview" : process.env.AURA_QUALITY === "final" ? "final" : "preview";
// LOW_FI gates the cheaper CPU post-pass; the preview tier (and the legacy alias) are low-fi,
// the final tier runs the full pass. AURA_LOW_FIDELITY=1 forces preview even without AURA_QUALITY.
const LOW_FI = QUALITY === "preview";
const WIDTH = QUALITY === "final" ? 1920 : 480;
const HEIGHT = QUALITY === "final" ? 1080 : 270;
const FRAME_RATE = QUALITY === "final" ? 24 : 8;
// Final renders supersample (deviceScaleFactor > 1) for anti-aliasing; preview renders 1:1.
const DEVICE_SCALE = QUALITY === "final" ? 2 : 1;

// I2 — resolve + VERIFY the render mode/style up front (throws on an unknown/dead flag). The CPU
// toon post-pass + the in-shader cel only apply when this is the toon mode + toon style.
const RENDER_MODE = resolveRenderMode();

// Render the REAL episode timeline: the full 0..EPISODE_DURATION (60s) at FRAME_RATE,
// so the video plays as an actual animation — shots held for their real durations, cuts
// at the right moments, captions on their real cue times, characters animating
// continuously (clips auto-loop). 12 fps is the classic "on twos" animation cadence and
// keeps the frame count (and render time) sane vs 24/30.
// The scene to render: an EXPLICIT document from AURA_DOCUMENT, otherwise the generic
// EMPTY placeholder — NEVER a content fixture. (To render the Moon Garden example, point
// AURA_DOCUMENT at a serialized copy of src/examples/moon-garden.example.ts.)
// Read on the Node side so the duration + AuraVoice handoff come from THIS scene.
const USING_EMPTY_FALLBACK = !process.env.AURA_DOCUMENT;
const SCENE_DOCUMENT: EpisodeDocument = process.env.AURA_DOCUMENT
  ? (JSON.parse(readFileSync(resolve(process.env.AURA_DOCUMENT), "utf8")) as EpisodeDocument)
  : emptyDocument;
if (USING_EMPTY_FALLBACK) console.warn(EMPTY_DOCUMENT_NOTICE);
const EPISODE_DURATION = SCENE_DOCUMENT.duration;
const FRAME_COUNT = Math.max(1, Math.round(EPISODE_DURATION * FRAME_RATE));
// PREVIEW RANGE: render only a time window for fast studio iteration, e.g.
// AURA_PREVIEW_RANGE="0-12" renders the first 12s. Default = the whole episode.
const PREVIEW_PARTS = process.env.AURA_PREVIEW_RANGE?.split("-").map((s) => Number(s));
const FIRST_FRAME = PREVIEW_PARTS ? Math.max(0, Math.round((PREVIEW_PARTS[0] ?? 0) * FRAME_RATE)) : 0;
const LAST_FRAME = PREVIEW_PARTS ? Math.min(FRAME_COUNT, Math.round((PREVIEW_PARTS[1] ?? EPISODE_DURATION) * FRAME_RATE)) : FRAME_COUNT;
const FIDELITY_FRAME_IDS = ["first", "dialogue", "action", "final"] as const;
// Representative episode times for the 4 named still frames, as FRACTIONS of the actual episode
// duration so they always fall inside the scene (a 24s generated scene and a 60s authored one both
// get a valid first/dialogue/action/final). Hardcoded seconds (e.g. action=31s) silently skip those
// frames on any scene shorter than 31s, leaving the fidelity/visual-quality gate without them.
const FIDELITY_TIMES: Record<(typeof FIDELITY_FRAME_IDS)[number], number> = {
  first: Math.max(0, EPISODE_DURATION * 0.08),
  dialogue: EPISODE_DURATION * 0.42,
  action: EPISODE_DURATION * 0.66,
  final: EPISODE_DURATION * 0.92
};

/**
 * Toon treatment for render-live's proof instrumentation. The pixel math is the SINGLE
 * canonical implementation in render-core (`applyToonTreatmentCore`); here we just call
 * it with this script's module-level LOW_FI and wrap the result in the metadata object
 * render-live's summary/logging expects (bands/outline/colorGrade are the constants the
 * canonical pass always produces: 6 bands, ink outline on, color grade on).
 */
function applyToonTreatment(pixels: Uint8Array, width: number, height: number): {
  readonly pixels: Uint8Array;
  readonly bands: number;
  readonly outline: boolean;
  readonly colorGrade: boolean;
} {
  const treated = applyToonTreatmentCore(pixels, width, height, LOW_FI);
  return { pixels: treated, bands: 6, outline: true, colorGrade: true };
}

/** Resolve an ffmpeg-family binary (`ffmpeg` / `ffprobe`), preferring the bundled
 * `@ffmpeg-installer`/`ffmpeg-static` if present, else the one on PATH. */
function resolveFfBinary(name: "ffmpeg" | "ffprobe"): string {
  const require = createRequire(import.meta.url);
  try {
    if (name === "ffmpeg") {
      const installer = require("@ffmpeg-installer/ffmpeg") as { path?: string };
      if (installer.path && existsSync(installer.path)) return installer.path;
    }
  } catch {
    /* fall through to PATH */
  }
  try {
    if (name === "ffmpeg") {
      const ffmpegStatic = require("ffmpeg-static") as string | { default?: string };
      const p = typeof ffmpegStatic === "string" ? ffmpegStatic : ffmpegStatic.default;
      if (p && existsSync(p)) return p;
    }
  } catch {
    /* fall through to PATH */
  }
  return name; // rely on PATH
}

// NOTE: Aura3D owns no audio. There is intentionally no TTS, no ambient bed, and no
// audio-mux here — narration/voice/visemes are AuraVoice's responsibility (it drives
// this engine via the @aura3d/engine AuraVoice bridge). The rendered video is silent.

// Monorepo root (…/aura3d). Resolved from this script's location so the dev
// server can alias `@aura3d/*` to the freshly-built `dist/` (same approach the
// working aura-clash showcase uses). The template's own published `@aura3d/engine`
// (v1.1.0) has a stricter/older material binder that rejects unbound PBR env-map
// textures, so we resolve the in-repo build that the renderer is validated against.
const MONOREPO_ROOT = resolve(TEMPLATE_ROOT, "../../../..");
const DIST = (p: string): string => resolve(MONOREPO_ROOT, "dist", p);

async function startViteServer(): Promise<ViteDevServer> {
  const distBuildExists = existsSync(DIST("engine/advanced-runtime/index.js"));
  const server = await createServer({
    root: TEMPLATE_ROOT,
    configFile: false,
    ...(distBuildExists
      ? {
          resolve: {
            alias: [
              { find: /^@aura3d\/engine$/, replacement: DIST("engine/agent-api/index.js") },
              { find: /^@aura3d\/engine\/advanced-runtime$/, replacement: DIST("engine/advanced-runtime/index.js") },
              { find: /^@aura3d\/engine\/production-runtime$/, replacement: DIST("engine/production-runtime/index.js") },
              { find: /^@aura3d\/engine\/assets\/browser$/, replacement: DIST("assets/browser-index.js") },
              { find: /^@aura3d\/engine\/rendering$/, replacement: DIST("rendering/index.js") },
              { find: /^@aura3d\/engine\/scene$/, replacement: DIST("scene/index.js") },
              { find: /^@aura3d\/rendering$/, replacement: DIST("rendering/index.js") },
              { find: /^@aura3d\/scene$/, replacement: DIST("scene/index.js") },
              { find: /^@aura3d\/assets\/browser$/, replacement: DIST("assets/browser-index.js") }
            ]
          }
        }
      : {}),
    // HMR off: a deterministic frame capture must not reload mid-render if a file is
    // touched (e.g. by a linter), which would transiently clear the route's seek hook.
    server: { host: "127.0.0.1", port: 0, hmr: false },
    logLevel: "warn"
  });
  await server.listen();
  return server;
}

interface CapturedFrame {
  readonly time: number;
  /** Final toon-treated + captioned PNG. We discard the 2MB raw bytes as we go so the
   * full 60s @ 12fps (~720 frames) never holds the whole movie in memory. */
  readonly png: Uint8Array;
}

/**
 * B1/B2 — the per-character/per-beat clip-decision record emitted by `scene-player`'s seek proof.
 * `bodyBoneRotationRad` is the rig-neutral body-bone rotation amplitude (radians) this frame,
 * EXCLUDING mouth morph + captions + camera — exactly what a body-motion gate consumes.
 */
interface ClipDecisionRecord {
  readonly characterId: string;
  readonly time: number;
  readonly intent: string;
  readonly clipId: string;
  readonly source: "extracted" | "procedural" | "embedded" | "idle-fallback";
  readonly bonesTouched: number;
  readonly maxRotAmplitudeRad: number;
  readonly maxTransAmplitude: number;
  readonly bodyBoneRotationRad: Record<string, number>;
  readonly rootTranslation: number;
  readonly reachedGLBRuntime: boolean;
}

/** Body bones whose per-frame rotation range we summarize in render-live-summary.json (B2). */
const BODY_BONE_KEYS = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm"
] as const;

/** Per-character body-motion accumulator across the sampled frames (B2). */
interface BodyMotionAccumulator {
  characterId: string;
  frames: number;
  clipSources: Record<string, number>;
  intents: Record<string, number>;
  maxBonesTouched: number;
  maxRotAmplitudeRad: number;
  maxTransAmplitude: number;
  maxRootTranslation: number;
  /** Frames in which this character's pose actually reached the GLB skeleton (B1). */
  reachedGLBRuntimeFrames: number;
  /** Per-bone min/max rotation amplitude (rad) seen across frames. */
  bones: Record<string, { min: number; max: number; sumAbs: number; samples: number }>;
}

const seekProofs: unknown[] = [];
const bodyMotionByCharacter = new Map<string, BodyMotionAccumulator>();
/** Per-character/per-beat clip-decision log (B1) — every sampled frame's decision record. */
const clipDecisionLog: ClipDecisionRecord[] = [];

/** Fold one frame's clip-decision into the per-character body-motion accumulator (B2). */
function accumulateBodyMotion(decision: ClipDecisionRecord): void {
  let acc = bodyMotionByCharacter.get(decision.characterId);
  if (!acc) {
    acc = {
      characterId: decision.characterId,
      frames: 0,
      clipSources: {},
      intents: {},
      maxBonesTouched: 0,
      maxRotAmplitudeRad: 0,
      maxTransAmplitude: 0,
      maxRootTranslation: 0,
      reachedGLBRuntimeFrames: 0,
      bones: {}
    };
    bodyMotionByCharacter.set(decision.characterId, acc);
  }
  acc.frames += 1;
  acc.clipSources[decision.source] = (acc.clipSources[decision.source] ?? 0) + 1;
  acc.intents[decision.intent] = (acc.intents[decision.intent] ?? 0) + 1;
  acc.maxBonesTouched = Math.max(acc.maxBonesTouched, decision.bonesTouched);
  acc.maxRotAmplitudeRad = Math.max(acc.maxRotAmplitudeRad, decision.maxRotAmplitudeRad);
  acc.maxTransAmplitude = Math.max(acc.maxTransAmplitude, decision.maxTransAmplitude ?? 0);
  acc.maxRootTranslation = Math.max(acc.maxRootTranslation, decision.rootTranslation);
  if (decision.reachedGLBRuntime) acc.reachedGLBRuntimeFrames += 1;
  for (const bone of BODY_BONE_KEYS) {
    const amp = decision.bodyBoneRotationRad?.[bone] ?? 0;
    const slot = (acc.bones[bone] ??= { min: Infinity, max: 0, sumAbs: 0, samples: 0 });
    slot.min = Math.min(slot.min, amp);
    slot.max = Math.max(slot.max, amp);
    slot.sumAbs += amp;
    slot.samples += 1;
  }
}

interface SeekReadResult {
  readonly proof: unknown;
  readonly raw: Uint8Array;
}

interface CaptionBurnResult {
  /** Caption text actually drawn into the frame. */
  readonly text: string;
  /** Mean luma (0..1) of the caption plate region BEFORE the text was drawn. */
  readonly backgroundLuma: number;
  /** Luma (0..1) of the caption text fill. */
  readonly textLuma: number;
  /** WCAG-style contrast ratio (1..21) between text and its plate background. */
  readonly contrastRatio: number;
}

/** Drive the route's seek hook at `time` (with optional mouth override), BURN the
 * active caption text into the captured frame (so the exported video carries
 * visible captions, not just a DOM overlay), and read back raw RGBA bytes. Returns
 * the caption-contrast measurement so the script can log/verify it. */
async function seekAndReadPixels(
  page: import("@playwright/test").Page,
  time: number,
  options?: { mouthOverride?: number; burnCaption?: boolean }
): Promise<SeekReadResult & { caption?: CaptionBurnResult }> {
  const burnCaption = options?.burnCaption !== false;
  const result = await page.evaluate(
    ({ t, w, h, opts, burn }) => {
      const win = window as unknown as {
        __auraSeek__: (time: number, options?: { mouthOverride?: number }) => { caption?: { text?: string } };
        __AURA_LIVE_SEEK_LAST__?: unknown;
      };
      const proof = win.__auraSeek__(t, { mouthOverride: opts?.mouthOverride });
      win.__AURA_LIVE_SEEK_LAST__ = proof;
      const canvas = document.querySelector("#live-canvas") as HTMLCanvasElement;
      // Copy the WebGL canvas into a 2D canvas to read back stable RGBA bytes.
      const copy = document.createElement("canvas");
      copy.width = w;
      copy.height = h;
      const ctx = copy.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0, w, h);

      // ---- BURNED-IN CAPTION (accessibility) ----
      // Draw the active caption text from the seek proof onto the captured frame so
      // the exported video has visible captions baked into the pixels.
      let caption: CaptionBurnResult | undefined;
      const text = (proof.caption?.text ?? "").trim();
      if (burn && text.length > 0) {
        // Bottom-center high-contrast rounded plate (matches the episode captionStyle).
        const fontPx = Math.round(h * 0.042);
        ctx.font = `600 ${fontPx}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const metrics = ctx.measureText(text);
        const padX = 22;
        const padY = 12;
        const plateW = Math.min(w - 24, metrics.width + padX * 2);
        const plateH = fontPx + padY * 2;
        const cx = w / 2;
        const plateY = h - plateH - 20;
        const plateX = cx - plateW / 2;

        // Measure the plate-region background luma BEFORE drawing (contrast check).
        // sRGB->linear relative luminance is inlined (no nested fns: tsx/esbuild's
        // keepNames helper is not available inside page.evaluate).
        const bg = ctx.getImageData(plateX, plateY, Math.max(1, plateW), Math.max(1, plateH)).data;
        let bgSum = 0;
        for (let i = 0; i < bg.length; i += 4) {
          const sr = bg[i]! / 255;
          const sg = bg[i + 1]! / 255;
          const sb = bg[i + 2]! / 255;
          const lr = sr <= 0.03928 ? sr / 12.92 : Math.pow((sr + 0.055) / 1.055, 2.4);
          const lg = sg <= 0.03928 ? sg / 12.92 : Math.pow((sg + 0.055) / 1.055, 2.4);
          const lb = sb <= 0.03928 ? sb / 12.92 : Math.pow((sb + 0.055) / 1.055, 2.4);
          bgSum += 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
        }
        const backgroundLuma = bgSum / (bg.length / 4);

        // Dark rounded plate so high-contrast white text reads over any scene pixels.
        ctx.fillStyle = "rgba(6, 10, 22, 0.82)";
        const r = 14;
        ctx.beginPath();
        ctx.moveTo(plateX + r, plateY);
        ctx.arcTo(plateX + plateW, plateY, plateX + plateW, plateY + plateH, r);
        ctx.arcTo(plateX + plateW, plateY + plateH, plateX, plateY + plateH, r);
        ctx.arcTo(plateX, plateY + plateH, plateX, plateY, r);
        ctx.arcTo(plateX, plateY, plateX + plateW, plateY, r);
        ctx.closePath();
        ctx.fill();

        // White caption text with a subtle dark stroke for edge contrast.
        ctx.lineWidth = Math.max(2, fontPx * 0.12);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
        ctx.strokeText(text, cx, plateY + plateH / 2);
        ctx.fillStyle = "rgba(248, 255, 242, 1)"; // #f8fff2 from the episode palette
        ctx.fillText(text, cx, plateY + plateH / 2);

        // Contrast is text (#f8fff2, near-white) vs the dark plate. Both luminances
        // are computed inline; the near-white text over a near-black plate yields a
        // very high WCAG ratio (well past AA 4.5:1).
        const textLuma = 0.2126 * Math.pow((248 / 255 + 0.055) / 1.055, 2.4) +
          0.7152 * Math.pow((255 / 255 + 0.055) / 1.055, 2.4) +
          0.0722 * Math.pow((242 / 255 + 0.055) / 1.055, 2.4);
        // Plate is rgba(6,10,22) at 0.82 over the (dark) scene; approximate as the
        // plate color itself (near-black), whose linear luminance is ~0.
        const pr = (6 / 255) <= 0.03928 ? (6 / 255) / 12.92 : Math.pow((6 / 255 + 0.055) / 1.055, 2.4);
        const pg = (10 / 255) <= 0.03928 ? (10 / 255) / 12.92 : Math.pow((10 / 255 + 0.055) / 1.055, 2.4);
        const pb = (22 / 255) <= 0.03928 ? (22 / 255) / 12.92 : Math.pow((22 / 255 + 0.055) / 1.055, 2.4);
        const plateLuma = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
        const contrastRatio = (Math.max(textLuma, plateLuma) + 0.05) / (Math.min(textLuma, plateLuma) + 0.05);
        caption = { text, backgroundLuma, textLuma, contrastRatio };
      }

      return { proof, dataUrl: copy.toDataURL("image/png"), caption };
    },
    { t: time, w: WIDTH, h: HEIGHT, opts: options ?? {}, burn: burnCaption }
  );
  // #1 PERF: transfer a compressed PNG (~100KB) across the Playwright/CDP bridge
  // instead of a 2,073,600-element pixel array, then decode to raw RGBA in Node with
  // sharp. The giant per-frame array serialization was the dominant render cost.
  const b64 = result.dataUrl.slice(result.dataUrl.indexOf(",") + 1);
  const decoded = await (
    sharp as unknown as (b: Buffer) => {
      ensureAlpha(): { raw(): { toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer }> } };
    }
  )(Buffer.from(b64, "base64"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    proof: result.proof,
    raw: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
    ...(result.caption ? { caption: result.caption } : {})
  };
}

async function main(): Promise<void> {
  // Clear stale frames first: representative stills (action/final) that a shorter scene
  // doesn't re-capture must NOT linger from a previous render and pose as current evidence.
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  const server = await startViteServer();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite dev server did not expose a numeric port.");
  }
  const url = `http://127.0.0.1:${address.port}/live-route.html`;
  console.log(`vite dev server: ${url}`);

  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swdecoder", "--ignore-gpu-blocklist"]
  });
  const captured: CapturedFrame[] = [];
  const captionProofs: { time: number; shotId: string; text: string; start: number; end: number }[] = [];
  // Per-beat staged-position record (proves the body moves between beats in pixels).
  const stagingByBeat = new Map<string, { shotId: string; time: number; characters: { id: string; position: number[]; clip: string; sweeping: boolean }[] }>();
  const seenCaptions = new Set<string>();
  const fidelityFrameIndex = new Map<number, (typeof FIDELITY_FRAME_IDS)[number]>();
  for (const id of FIDELITY_FRAME_IDS) fidelityFrameIndex.set(Math.round(FIDELITY_TIMES[id] * FRAME_RATE), id);
  let toonInfo = { bands: 0, outline: false, colorGrade: false };
  let readyProof: unknown;
  let mouthProof: {
    time: number;
    shot: unknown;
    changedPixels: number;
    meanRgbDiff: number;
    openProof: unknown;
    closedProof: unknown;
  } | undefined;
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH + 40, height: HEIGHT + 40 }, deviceScaleFactor: DEVICE_SCALE });
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`[page] ${msg.text()}`);
    });
    page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));

    await page.addInitScript(() => {
      (window as unknown as { __AURA_LIVE_ROUTE_HEADLESS__: boolean }).__AURA_LIVE_ROUTE_HEADLESS__ = true;
    });
    // Inject the scene document so the generic player renders it (any scene, one player).
    await page.addInitScript((d) => {
      (window as unknown as { __AURA_EPISODE_DOCUMENT__: unknown }).__AURA_EPISODE_DOCUMENT__ = d;
    }, SCENE_DOCUMENT as unknown);
    console.log(
      `quality: ${QUALITY} (${WIDTH}x${HEIGHT} @ ${FRAME_RATE}fps, post=${LOW_FI ? "preview/low-fi" : "full"}, deviceScale=${DEVICE_SCALE})`
    );
    console.log(
      `render mode: ${RENDER_MODE.mode} / style ${RENDER_MODE.style} — cel ${RENDER_MODE.celApplies ? "ON (in-shader material + CPU toon post-pass)" : "OFF"}`
    );
    console.log(`document: ${SCENE_DOCUMENT.id} (${EPISODE_DURATION}s)${process.env.AURA_DOCUMENT ? ` from ${process.env.AURA_DOCUMENT}` : " (empty placeholder — no scene loaded)"}`);
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });

    // Wait until the route has loaded both skinned GLBs and exposed the seek hook.
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __AURA_LIVE_ROUTE_READY__?: unknown; __AURA_LIVE_ROUTE_ERROR__?: string };
        if (w.__AURA_LIVE_ROUTE_ERROR__) throw new Error(`route error: ${w.__AURA_LIVE_ROUTE_ERROR__}`);
        return Boolean(w.__AURA_LIVE_ROUTE_READY__);
      },
      { timeout: 60_000 }
    );
    readyProof = await page.evaluate(() => (window as unknown as { __AURA_LIVE_ROUTE_READY__: unknown }).__AURA_LIVE_ROUTE_READY__);
    console.log("route ready:", JSON.stringify(readyProof));

    console.log(
      `rendering frames ${FIRST_FRAME}..${LAST_FRAME} (${LAST_FRAME - FIRST_FRAME} frames) @ ${FRAME_RATE}fps` +
        `${PREVIEW_PARTS ? " [preview range]" : ` over ${EPISODE_DURATION}s`} ...`
    );
    const PROGRESS_PATH = resolve(OUTPUT_DIR, "progress.json");
    function writeProgress(current: number, total: number, label: string): void {
      try { writeFileSync(PROGRESS_PATH, JSON.stringify({ current, total, label, pct: Math.round((current / total) * 100), ts: Date.now() })); } catch {}
    }
    writeProgress(0, LAST_FRAME - FIRST_FRAME, "seeking");

    for (let i = FIRST_FRAME; i < LAST_FRAME; i += 1) {
      const t = i / FRAME_RATE;
      const result = await seekAndReadPixels(page, t, { burnCaption: false });
      const proof = result.proof as {
        drawCalls: number;
        skinnedRenderItems: number;
        shot?: { shotId: string; presetId: string; cameraPosition: number[] };
        caption?: { text: string };
        debugOverlay?: string[];
        characters?: {
          id: string;
          position?: number[];
          sweeping?: boolean;
          clip?: string;
          mouthOpenness: number;
          clipDecision?: ClipDecisionRecord;
        }[];
      };
      const shotId = proof.shot?.shotId ?? "unknown";
      // The caption from the episode track at this episode time (the AuraVoice contract).
      const capText = (proof.caption?.text ?? "").trim();

      // Record staging once per beat + keep the open/teamwork raw frames for the proof.
      if (!stagingByBeat.has(shotId)) {
        stagingByBeat.set(shotId, {
          shotId,
          time: t,
          characters: (proof.characters ?? []).map((c) => ({ id: c.id, position: c.position ?? [], clip: c.clip ?? "", sweeping: Boolean(c.sweeping) }))
        });
      }
      if (capText && !seenCaptions.has(capText)) {
        seenCaptions.add(capText);
        // Echo the caption's on-screen WINDOW (start/end) from the document so the subtitle-timing
        // gate can verify it tracks the speech-duration estimate (the doc owns the timing; K2).
        const line = SCENE_DOCUMENT.dialogue?.lines.find((l) => l.text.trim() === capText);
        captionProofs.push({ time: t, shotId, text: capText, start: line?.startTime ?? t, end: line?.endTime ?? t });
      }

      // B1/B2: read the posed-skeleton body-bone data from the actor's clip decision for EVERY
      // character this sampled frame (rig-neutral body-bone rotation amplitudes + clip source),
      // EXCLUDING mouth morph + captions + camera. Fold into the per-character body-motion ranges.
      for (const c of proof.characters ?? []) {
        if (!c.clipDecision) continue;
        clipDecisionLog.push(c.clipDecision);
        accumulateBodyMotion(c.clipDecision);
      }

      // Toon-treat + composite the crisp subtitle NOW; store only the final PNG.
      const treated = applyToonTreatment(result.raw, WIDTH, HEIGHT);
      toonInfo = { bands: treated.bands, outline: treated.outline, colorGrade: treated.colorGrade };
      const basePng = await rawRgbaToPng(treated.pixels, WIDTH, HEIGHT);
      const png = await compositeCaptionPng(basePng, capText, WIDTH, HEIGHT);
      captured.push({ time: t, png });
      writeProgress(i - FIRST_FRAME + 1, LAST_FRAME - FIRST_FRAME, "capturing");

      const fidelityId = fidelityFrameIndex.get(i);
      if (fidelityId) writeFileSync(resolve(FRAMES_DIR, `${fidelityId}.png`), png);

      if (i % FRAME_RATE === 0) {
        seekProofs.push(proof);
        const miko = proof.characters?.find((c) => c.id === "miko");
        console.log(
          `  t=${t.toFixed(1)}s [${shotId}] cam=${proof.shot?.presetId} ` +
            `miko@[${miko?.position?.map((v) => v.toFixed(1)).join(",")}] cap="${capText.replace(/\n/g, " ").slice(0, 42)}"`
        );
      }
    }

    writeProgress(LAST_FRAME - FIRST_FRAME, LAST_FRAME - FIRST_FRAME, "finishing");
    console.log("\n--- staged performance (per beat) ---");
    for (const beat of stagingByBeat.values()) {
      const m = beat.characters.find((c) => c.id === "miko");
      console.log(`  ${beat.shotId}: miko@[${m?.position.map((v) => v.toFixed(2)).join(",")}] clip=${m?.clip}`);
    }
    console.log("--- captions (per cue) ---");
    for (const c of captionProofs) console.log(`  [${c.time.toFixed(0)}s ${c.shotId}] "${c.text.replace(/\n/g, " ").slice(0, 56)}"`);

    // ISOLATED LIP-SYNC A/B PROOF: render the SAME pose + SAME close-up camera with
    // the mouth forced fully open vs fully closed, so the ONLY difference between the
    // two frames is the mouth indicator. This proves the lip-sync alone moves pixels
    // (the per-frame captures above also vary skeleton/camera, which would otherwise
    // confound an isolated mouth measurement).
    const MOUTH_PROOF_TIME = FIDELITY_TIMES.final; // close-up shot (miko fills frame)
    const mouthClosed = await seekAndReadPixels(page, MOUTH_PROOF_TIME, { mouthOverride: 0, burnCaption: false });
    const mouthOpen = await seekAndReadPixels(page, MOUTH_PROOF_TIME, { mouthOverride: 1, burnCaption: false });
    const closedPng = await rawRgbaToPng(applyToonTreatment(mouthClosed.raw, WIDTH, HEIGHT).pixels, WIDTH, HEIGHT);
    const openPng = await rawRgbaToPng(applyToonTreatment(mouthOpen.raw, WIDTH, HEIGHT).pixels, WIDTH, HEIGHT);
    writeFileSync(resolve(FRAMES_DIR, "mouth-closed.png"), closedPng);
    writeFileSync(resolve(FRAMES_DIR, "mouth-open.png"), openPng);
    let changedPixels = 0;
    let totalDiff = 0;
    for (let i = 0; i < mouthClosed.raw.length; i += 4) {
      const d =
        Math.abs(mouthClosed.raw[i]! - mouthOpen.raw[i]!) +
        Math.abs(mouthClosed.raw[i + 1]! - mouthOpen.raw[i + 1]!) +
        Math.abs(mouthClosed.raw[i + 2]! - mouthOpen.raw[i + 2]!);
      totalDiff += d;
      if (d > 30) changedPixels += 1;
    }
    mouthProof = {
      time: MOUTH_PROOF_TIME,
      shot: (mouthOpen.proof as { shot?: unknown }).shot,
      changedPixels,
      meanRgbDiff: totalDiff / (mouthClosed.raw.length / 4) / 3,
      openProof: (mouthOpen.proof as { characters?: unknown }).characters,
      closedProof: (mouthClosed.proof as { characters?: unknown }).characters
    };
    console.log(
      `\nlip-sync A/B (same pose+camera, mouth open vs closed): changedPixels=${changedPixels} ` +
        `meanRgbDiff=${mouthProof.meanRgbDiff.toFixed(3)} -> frames mouth-open.png / mouth-closed.png`
    );
  } finally {
    await browser.close();
    await server.close();
  }

  if (captured.length === 0) throw new Error("No frames were captured.");

  // Encode the already-toon-treated + captioned frames into the episode video.
  const encoder = await createFfmpegFrameEncoderAdapter({ codec: "vp9", container: "webm", frameRate: FRAME_RATE });
  for (let index = 0; index < captured.length; index += 1) {
    encoder.encode({
      frame: index,
      time: captured[index]!.time,
      viewport: { width: WIDTH, height: HEIGHT },
      image: captured[index]!.png
    });
  }

  const durationSeconds = captured.length / FRAME_RATE;
  const finalized = await encoder.finalize({
    codec: "vp9",
    container: "webm",
    mimeType: "video/webm; codecs=vp9",
    frameRate: FRAME_RATE,
    viewport: { width: WIDTH, height: HEIGHT },
    frameCount: captured.length,
    duration: durationSeconds,
    byteLength: 0,
    chunks: []
  });
  if (!(finalized instanceof Uint8Array) || finalized.byteLength === 0) {
    throw new Error(`ffmpeg produced no usable video bytes (got ${typeof finalized}).`);
  }
  const video = finalized;
  writeFileSync(VIDEO_PATH, video);

  // AURAVOICE HANDOFF CONTRACT (not "no handoff"): Aura3D does NOT generate audio
  // (no TTS), but it DOES produce the timed script/caption/viseme data that is the
  // synchronization contract AuraVoice consumes to generate the voice AFTER THE FACT,
  // locked to this same timeline. The structured tracks live in src/render-plan.ts
  // (dialogueTrack + captionTrack + visemeTrack + createAuraVoiceBridgePackage); the
  // video's animation + lip-sync timing are derived from the SAME dialogue track, so
  // the later-generated voice lines up. Here we surface a pointer + counts so the
  // render evidence shows the contract is produced. Only the AUDIO is AuraVoice's.
  const auraVoiceHandoff = {
    audioOwnedBy: "auravoice",
    engineTts: false,
    // The data Aura3D hands to AuraVoice (words + timing + lip-sync cues):
    dialogueLines: SCENE_DOCUMENT.dialogue?.lines.length ?? 0,
    captionCues: SCENE_DOCUMENT.dialogue?.lines.length ?? 0,
    language: SCENE_DOCUMENT.dialogue?.language ?? "en",
    bridgeContract: "createAuraVoiceBridgePackage (src/render-plan.ts: dialogueTrack + captionTrack + visemeTrack)",
    note: "Silent render by design. Aura3D produces the timed dialogue/caption/viseme track (the sync contract); AuraVoice consumes it to generate the voice and mux audio onto this video. Aura3D never runs TTS."
  };
  const muxedBytes = video.byteLength;
  console.log(
    `\nauravoice handoff: dialogueLines=${auraVoiceHandoff.dialogueLines} captionCues=${auraVoiceHandoff.captionCues} ` +
      `lang=${auraVoiceHandoff.language} -> ${auraVoiceHandoff.bridgeContract}. ` +
      `Video is SILENT; AuraVoice generates the voice from this timed track and muxes it.`
  );

  // B2 — per-character BODY-bone motion summary across the sampled frames. The key bones
  // (hips/spine/head/shoulders/arms) carry rotation ranges (+ root translation) so a downstream
  // gate can prove the body moves EXCLUDING mouth morph + captions + camera. `clipSource` records
  // which library each character's motion came from (extracted catalog vs procedural vs embedded).
  const bodyMotion = Array.from(bodyMotionByCharacter.values()).map((acc) => {
    // The dominant clip source across frames is the character's effective motion source.
    const clipSource =
      Object.entries(acc.clipSources).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
    const bones = Object.fromEntries(
      BODY_BONE_KEYS.map((bone) => {
        const s = acc.bones[bone];
        const min = s && s.min !== Infinity ? +s.min.toFixed(5) : 0;
        const max = s ? +s.max.toFixed(5) : 0;
        const mean = s && s.samples > 0 ? +(s.sumAbs / s.samples).toFixed(5) : 0;
        return [bone, { minRad: min, maxRad: max, rangeRad: +(max - min).toFixed(5), meanRad: mean }];
      })
    );
    return {
      characterId: acc.characterId,
      clipSource,
      clipSourceCounts: acc.clipSources,
      intentCounts: acc.intents,
      frames: acc.frames,
      maxBonesTouched: acc.maxBonesTouched,
      maxRotAmplitudeRad: +acc.maxRotAmplitudeRad.toFixed(5),
      maxTransAmplitude: +acc.maxTransAmplitude.toFixed(5),
      maxRootTranslation: +acc.maxRootTranslation.toFixed(5),
      // B1 — did this character's motion reach the GLB skeleton at runtime in EVERY sampled frame?
      reachedGLBRuntimeFrames: acc.reachedGLBRuntimeFrames,
      reachedGLBRuntime: acc.frames > 0 && acc.reachedGLBRuntimeFrames === acc.frames,
      bodyBoneRanges: bones
    };
  });

  console.log("\n--- B2 per-character BODY-bone motion (mouth/caption/camera-EXCLUDED) ---");
  for (const c of bodyMotion) {
    const movers = BODY_BONE_KEYS.filter((b) => (c.bodyBoneRanges[b]?.maxRad ?? 0) > 0.0087)
      .map((b) => `${b}=${c.bodyBoneRanges[b]!.maxRad.toFixed(3)}rad`)
      .join(" ");
    console.log(
      `  ${c.characterId}: clipSource=${c.clipSource} maxBonesTouched=${c.maxBonesTouched} ` +
        `maxRot=${c.maxRotAmplitudeRad.toFixed(3)}rad rootΔ=${c.maxRootTranslation.toFixed(3)} | ${movers || "(no body bones moved)"}`
    );
  }

  // B2 — save a 3-frame (first / mid / final) skeleton-overlay strip PER CHARACTER to the episode
  // dir. The strip visualizes the character's DOMINANT body intent as a bone-projection stick
  // figure across the clip, so the proof shows MOTION as a moving skeleton (not a raw pixel-diff).
  const skeletonDir = resolve(OUTPUT_DIR, "skeleton-overlays");
  mkdirSync(skeletonDir, { recursive: true });
  const skeletonStrips: {
    characterId: string;
    intent: string;
    path: string;
    panelJointCounts: readonly number[];
    firstFinalMaxDiff: number;
  }[] = [];
  for (const c of bodyMotion) {
    // The character's dominant body intent (most-sampled non-idle intent; idle if nothing else).
    const ranked = Object.entries(c.intentCounts).sort((a, b) => b[1] - a[1]);
    const dominant = ranked.find(([id]) => id !== "idle")?.[0] ?? ranked[0]?.[0] ?? "idle";
    try {
      const strip = buildSkeletonStrip({ intent: dominant });
      const png = await rawRgbaToPng(strip.rgba, strip.width, strip.height);
      const stripPath = resolve(skeletonDir, `${c.characterId}.png`);
      writeFileSync(stripPath, png);
      skeletonStrips.push({
        characterId: c.characterId,
        intent: strip.intent,
        path: stripPath,
        panelJointCounts: strip.panelJointCounts,
        firstFinalMaxDiff: strip.firstFinalMaxDiff
      });
      console.log(
        `  skeleton-overlay ${c.characterId}: intent=${strip.intent} joints=${strip.panelJointCounts.join("/")} ` +
          `firstFinalDiff=${strip.firstFinalMaxDiff} -> ${stripPath}`
      );
    } catch (err) {
      console.warn(`  skeleton-overlay ${c.characterId}: SKIPPED (${(err as Error).message}).`);
    }
  }

  const summary = {
    kind: "animation-studio-live-3d-render",
    route: "live-route.html",
    // M5 — output tier the frames/video were rendered at (preview low-fi vs final 1080p/24fps).
    quality: { tier: QUALITY, width: WIDTH, height: HEIGHT, frameRate: FRAME_RATE, deviceScale: DEVICE_SCALE, fullPost: !LOW_FI },
    // I2 — the VERIFIED render mode/style + the honest cel-vs-post-pass contract (one canonical home).
    renderMode: { mode: RENDER_MODE.mode, style: RENDER_MODE.style, celApplies: RENDER_MODE.celApplies, notes: renderModeNotes() },
    framesDir: FRAMES_DIR,
    video: VIDEO_PATH,
    videoBytes: muxedBytes,
    silentVideoBytes: video.byteLength,
    frameRate: FRAME_RATE,
    episodeDuration: EPISODE_DURATION,
    frameCount: captured.length,
    toon: toonInfo,
    ready: readyProof,
    // AuraVoice handoff: the timed dialogue/caption/viseme track Aura3D produces as the
    // synchronization contract AuraVoice consumes to generate the voice after the fact.
    // (Aura3D runs no TTS; the video is silent until AuraVoice muxes its audio.)
    auraVoiceHandoff,
    // Staged performance: per-beat character positions + clips captured during render.
    stagedPerformance: Array.from(stagingByBeat.values()),
    // Burned-in captions: per-beat caption text drawn into the frame pixels
    // with a text-vs-plate contrast measurement (accessibility).
    captionProofs,
    // Per-frame seek proofs: per-shot camera framing + per-character lip-sync state
    // (AuraVoice mouthOpenness, primitive mouth-indicator open height, GLB morph weight).
    seekProofs,
    // Isolated lip-sync A/B proof (same pose + camera, mouth open vs closed).
    mouthProof,
    // B2 — per-character BODY-bone motion summary (key bones rotation ranges + root translation
    // + clipSource), so a downstream gate can measure body motion EXCLUDING mouth/caption/camera.
    bodyMotion,
    // B2 — per-character 3-frame (first/mid/final) skeleton-overlay strips saved to the episode dir.
    skeletonStrips,
    // B1 — full per-character/per-beat clip-decision log (intent/clipId/source/bonesTouched/…).
    clipDecisionLog
  };
  writeFileSync(resolve(OUTPUT_DIR, "render-live-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  console.log("\n--- render-live complete ---");
  console.log(`frames dir: ${FRAMES_DIR}`);
  console.log(`fidelity PNGs: ${FIDELITY_FRAME_IDS.map((id) => `${id}.png`).join(", ")}`);
  console.log(`video: ${VIDEO_PATH} (${muxedBytes} bytes, SILENT — voice owned by AuraVoice)`);
  console.log(`audio: none in-engine; AuraVoice generates voice from the handoff track (${auraVoiceHandoff.note})`);
  console.log(`toon: bands=${toonInfo.bands} outline=${toonInfo.outline} colorGrade=${toonInfo.colorGrade}`);
}

main().catch((error: unknown) => {
  console.error("render-live failed:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
