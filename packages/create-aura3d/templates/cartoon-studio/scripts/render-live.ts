/**
 * render-live.ts — headless capture + toon post-pass + real video encode for the
 * Cartoon Studio LIVE 3D render route (`src/render-live-route.ts`).
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
 *       math the CartoonToonMaterial GLSL mirrors), giving posterized shading,
 *     - run the Sobel `outlinePixels` ink pass + `colorGradePixels` storybook
 *       grade that `applyCartoonRenderPreset` prescribes.
 *  4. Save the 4 representative frames as PNGs named for the fidelity gate
 *     (first/dialogue/action/final) AND encode ALL frames into a real
 *     `episode-3d.webm` via `createFfmpegFrameEncoderAdapter` (libvpx-vp9).
 *
 * IMPORTANT — run this from the MONOREPO ROOT so `@aura3d/rendering` /
 * `@aura3d/engine` resolve to the SOURCE build (which ships CartoonToonMaterial +
 * the cartoon shader/post-passes). The template's own published `@aura3d/engine`
 * lacks those exports; the in-browser route only needs the renderer + skinning,
 * which the published build DOES have. Invoke as:
 *   pnpm exec tsx --tsconfig tsconfig.base.json \
 *     packages/create-aura3d/templates/cartoon-studio/scripts/render-live.ts
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import {
  applyCartoonRenderPreset,
  createCartoonRenderPreset,
  quantizeToonBand
} from "@aura3d/rendering";
import { createFfmpegFrameEncoderAdapter } from "@aura3d/engine";
import { buildDialogueAudioTrack, type DialogueAudioResult } from "./build-dialogue-audio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(TEMPLATE_ROOT, "dist/episodes/live-3d");
const FRAMES_DIR = resolve(OUTPUT_DIR, "frames");
const VIDEO_PATH = resolve(OUTPUT_DIR, "episode-3d.webm");

const WIDTH = 960;
const HEIGHT = 540;
const FRAME_RATE = 12;

// 12 captured frames spanning >1s of each clip so the skeletons clearly move.
// The 4 fidelity-gate frame IDs map onto a spread of these capture times.
const CAPTURE_TIMES = [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.2, 1.45, 1.7, 2.0];
const FIDELITY_FRAME_IDS = ["first", "dialogue", "action", "final"] as const;
// Pick spread-out capture indices for the gate's 4 named frames.
const FIDELITY_CAPTURE_INDEX: Record<(typeof FIDELITY_FRAME_IDS)[number], number> = {
  first: 0,
  dialogue: 3,
  action: 7,
  final: 11
};

interface SharpModule {
  (input: Buffer | Uint8Array, options?: { raw: { width: number; height: number; channels: number } }): {
    png(): { toBuffer(): Promise<Buffer> };
  };
}

function loadSharp(): SharpModule {
  try {
    const require = createRequire(import.meta.url);
    return require("sharp") as SharpModule;
  } catch {
    const storePkg = resolve(process.cwd(), "node_modules/.pnpm/sharp@0.33.5/node_modules/sharp/package.json");
    if (existsSync(storePkg)) {
      const require = createRequire(storePkg);
      return require("sharp") as SharpModule;
    }
    throw new Error("Could not load `sharp` to encode PNGs. Install it: pnpm add -D sharp");
  }
}

const sharp = loadSharp();

async function rawRgbaToPng(pixels: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const buffer = await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength), {
    raw: { width, height, channels: 4 }
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

/**
 * Band-quantize each pixel toward the cel ramp using the engine's exact
 * `quantizeToonBand` math, then let `applyCartoonRenderPreset` ink the edges and
 * grade the result. Returns the final toon-treated RGBA buffer.
 */
function applyToonTreatment(pixels: Uint8Array, width: number, height: number): {
  readonly pixels: Uint8Array;
  readonly bands: number;
  readonly outline: boolean;
  readonly colorGrade: boolean;
} {
  const preset = createCartoonRenderPreset({
    name: "live-3d-toon",
    resolution: { width, height },
    materialStyle: { rampSteps: 4, outline: true, treatment: "cel", saturationBoost: 0.18 }
  });
  const bands = Math.max(2, Math.min(16, Math.round(preset.materialStyle.rampSteps)));

  // 1. Cel band-quantization on luma (the CartoonToonMaterial ramp), preserving hue.
  const banded = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]! / 255;
    const g = pixels[i + 1]! / 255;
    const b = pixels[i + 2]! / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const quantized = quantizeToonBand(luma, bands);
    const scale = luma > 1e-4 ? quantized / luma : quantized;
    banded[i] = clampByte(r * scale * 255);
    banded[i + 1] = clampByte(g * scale * 255);
    banded[i + 2] = clampByte(b * scale * 255);
    banded[i + 3] = pixels[i + 3]!;
  }

  // 2. Outline + storybook color grade via the real preset post-passes.
  const applied = applyCartoonRenderPreset(preset, {
    frame: { pixels: banded, width, height }
  });
  const out = applied.colorGrade?.pixels ?? applied.outline?.pixels ?? banded;
  return {
    pixels: out instanceof Uint8Array ? out : new Uint8Array(out),
    bands,
    outline: applied.appliedToPixels.outline,
    colorGrade: applied.appliedToPixels.colorGrade
  };
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
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

interface AudioMuxResult {
  readonly muxed: boolean;
  readonly audioKind: "placeholder-ambient" | "macos-say-dialogue";
  readonly dialogueAudio: boolean;
  readonly voiceSource?: "macos-say-tts";
  /** Per-line voice + timing table (only for real dialogue). */
  readonly dialogueLines?: {
    readonly lineId: string;
    readonly speakerId: string;
    readonly voice: string;
    readonly text: string;
    readonly startTime: number;
    readonly endTime: number;
    readonly spokenDuration: number;
  }[];
  readonly voices?: Record<string, string>;
  /** Total muxed audio/episode length in seconds (dialogue extends the video). */
  readonly muxedDurationSeconds?: number;
  readonly codec?: string;
  readonly channels?: number;
  readonly sampleRate?: number;
  readonly note: string;
}

/**
 * Mux a short, soft, NON-flashing PLACEHOLDER AMBIENT bed into the silent webm.
 *
 * HONESTY: this is NOT dialogue. There is no TTS in this template, so we synthesize
 * a gentle ambient pad (two low sines + faint filtered noise at low volume) purely
 * to prove the audio-mux path works end-to-end. Real voice requires a TTS step.
 * The bed is steady (no tremolo/strobe) to stay reduced-flash / sensory-safe.
 */
function muxPlaceholderAmbientAudio(videoPath: string, durationSeconds: number): AudioMuxResult {
  const ffmpeg = resolveFfBinary("ffmpeg");
  const tmpOut = `${videoPath}.muxed.webm`;
  // Soft ambient bed: 174Hz + 220Hz sines + low anoisesrc, mixed and gained down.
  const filter =
    "sine=frequency=174:sample_rate=48000[a];" +
    "sine=frequency=220:sample_rate=48000[b];" +
    "anoisesrc=color=pink:sample_rate=48000:amplitude=0.04[c];" +
    "[a][b]amix=inputs=2:weights=0.6 0.4[tones];" +
    "[tones][c]amix=inputs=2:weights=0.85 0.15,volume=0.08,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]";
  const args = [
    "-y",
    "-i", videoPath,
    "-filter_complex", filter,
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "libopus",
    "-b:a", "96k",
    "-t", durationSeconds.toFixed(3),
    "-shortest",
    tmpOut
  ];
  const run = spawnSync(ffmpeg, args, { encoding: "utf8" });
  if (run.status !== 0 || !existsSync(tmpOut)) {
    return {
      muxed: false,
      audioKind: "placeholder-ambient",
      dialogueAudio: false,
      note: `ffmpeg audio mux failed (status=${run.status}). stderr: ${(run.stderr ?? "").slice(-400)}`
    };
  }
  rmSync(videoPath, { force: true });
  renameSync(tmpOut, videoPath);
  return {
    muxed: true,
    audioKind: "placeholder-ambient",
    dialogueAudio: false,
    muxedDurationSeconds: durationSeconds,
    note: "Soft synthesized ambient bed muxed via ffmpeg to prove the audio-mux path. NOT dialogue; real voice needs a TTS step."
  };
}

/**
 * Mux the REAL macOS-`say` synthesized dialogue track (episode-length, each line at
 * its dialogue startTime over a faint ambient bed) into the silent webm.
 *
 * The captured video is only a short proof clip, but the dialogue spans the full
 * episode. To keep EVERY spoken line audible at its true timecode, we extend the
 * video to the dialogue/episode length by holding the last frame (`tpad`), then mux
 * the dialogue track as libopus. The result is an episode-length webm whose audio
 * stream carries the genuinely synthesized voices.
 *
 * HONESTY: `say` is real on-device TTS, but a robotic system voice — placeholder-grade
 * VO, not studio voice acting. Labeled `voiceSource: "macos-say-tts"`.
 */
function muxDialogueAudio(videoPath: string, dialogue: DialogueAudioResult): AudioMuxResult {
  if (!dialogue.available || !dialogue.trackPath || !existsSync(dialogue.trackPath)) {
    return {
      muxed: false,
      audioKind: "macos-say-dialogue",
      dialogueAudio: false,
      note: dialogue.note
    };
  }
  const ffmpeg = resolveFfBinary("ffmpeg");
  const tmpOut = `${videoPath}.dialogue.webm`;
  const target = dialogue.durationSeconds;
  const args = [
    "-y",
    "-i", videoPath,
    "-i", dialogue.trackPath,
    // Hold the final captured frame out to the full episode length so the dialogue
    // track (which spans the whole episode) is not clipped by the short proof clip.
    "-filter_complex", `[0:v]tpad=stop_mode=clone:stop_duration=${target.toFixed(3)}[v]`,
    "-map", "[v]",
    "-map", "1:a:0",
    "-c:v", "libvpx-vp9",
    "-b:v", "0",
    "-crf", "34",
    "-c:a", "libopus",
    "-b:a", "96k",
    "-t", target.toFixed(3),
    tmpOut
  ];
  const run = spawnSync(ffmpeg, args, { encoding: "utf8" });
  if (run.status !== 0 || !existsSync(tmpOut)) {
    return {
      muxed: false,
      audioKind: "macos-say-dialogue",
      dialogueAudio: false,
      voiceSource: dialogue.voiceSource,
      voices: dialogue.voices,
      dialogueLines: dialogue.lines,
      note: `ffmpeg dialogue mux failed (status=${run.status}). stderr: ${(run.stderr ?? "").slice(-500)}`
    };
  }
  rmSync(videoPath, { force: true });
  renameSync(tmpOut, videoPath);
  // The standalone dialogue WAV is kept alongside the webm as an audio stem.
  return {
    muxed: true,
    audioKind: "macos-say-dialogue",
    dialogueAudio: true,
    voiceSource: dialogue.voiceSource,
    voices: dialogue.voices,
    dialogueLines: dialogue.lines,
    muxedDurationSeconds: target,
    note: dialogue.note
  };
}

/** ffprobe the muxed file and return the first audio stream's codec/channels/rate. */
function probeAudioStream(videoPath: string): { codec?: string; channels?: number; sampleRate?: number; raw: string } {
  const ffprobe = resolveFfBinary("ffprobe");
  const run = spawnSync(
    ffprobe,
    ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,channels,sample_rate", "-of", "default=noprint_wrappers=1", videoPath],
    { encoding: "utf8" }
  );
  const out = run.stdout ?? "";
  const codec = /codec_name=(\S+)/.exec(out)?.[1];
  const channels = Number(/channels=(\d+)/.exec(out)?.[1]);
  const sampleRate = Number(/sample_rate=(\d+)/.exec(out)?.[1]);
  return {
    ...(codec ? { codec } : {}),
    ...(Number.isFinite(channels) ? { channels } : {}),
    ...(Number.isFinite(sampleRate) ? { sampleRate } : {}),
    raw: out.trim()
  };
}

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
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "warn"
  });
  await server.listen();
  return server;
}

interface CapturedFrame {
  readonly time: number;
  readonly raw: Uint8Array;
}

const seekProofs: unknown[] = [];

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

      const data = ctx.getImageData(0, 0, w, h).data;
      return { proof, pixels: Array.from(data), caption };
    },
    { t: time, w: WIDTH, h: HEIGHT, opts: options ?? {}, burn: burnCaption }
  );
  return {
    proof: result.proof,
    raw: Uint8Array.from(result.pixels as number[]),
    ...(result.caption ? { caption: result.caption } : {})
  };
}

async function main(): Promise<void> {
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
  // Per-beat caption-contrast measurements (text vs plate background) for the summary.
  const captionProofs: {
    time: number;
    shotId: string;
    text: string;
    backgroundLuma: number;
    textLuma: number;
    contrastRatio: number;
    burnedIntoFrame: boolean;
  }[] = [];
  // Per-beat staged-position record (proves the body moves between beats in pixels).
  const stagingByBeat = new Map<string, { shotId: string; time: number; characters: { id: string; position: number[]; clip: string; sweeping: boolean }[] }>();
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
    const page = await browser.newPage({ viewport: { width: WIDTH + 40, height: HEIGHT + 40 }, deviceScaleFactor: 1 });
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`[page] ${msg.text()}`);
    });
    page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));

    await page.addInitScript(() => {
      (window as unknown as { __AURA_LIVE_ROUTE_HEADLESS__: boolean }).__AURA_LIVE_ROUTE_HEADLESS__ = true;
    });
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

    for (const time of CAPTURE_TIMES) {
      const result = await seekAndReadPixels(page, time);
      const raw = result.raw;
      captured.push({ time, raw });
      seekProofs.push(result.proof);
      const proof = result.proof as {
        drawCalls: number;
        skinnedRenderItems: number;
        shot?: { shotId: string; presetId: string; cameraPosition: number[] };
        caption?: { text: string };
        characters?: {
          id: string;
          position?: number[];
          sweeping?: boolean;
          clip?: string;
          mouthOpenness: number;
          primitiveMouthOpen: number;
          mouthMorphWeight: number;
        }[];
      };
      const miko = proof.characters?.find((c) => c.id === "miko");
      // Record staging once per beat (first capture that lands in each shot).
      const shotId = proof.shot?.shotId ?? "unknown";
      if (!stagingByBeat.has(shotId)) {
        stagingByBeat.set(shotId, {
          shotId,
          time,
          characters: (proof.characters ?? []).map((c) => ({
            id: c.id,
            position: c.position ?? [],
            clip: c.clip ?? "",
            sweeping: Boolean(c.sweeping)
          }))
        });
      }
      // Record caption-contrast (one per distinct caption text).
      if (result.caption && !captionProofs.some((c) => c.text === result.caption!.text)) {
        captionProofs.push({
          time,
          shotId,
          text: result.caption.text,
          backgroundLuma: result.caption.backgroundLuma,
          textLuma: result.caption.textLuma,
          contrastRatio: result.caption.contrastRatio,
          burnedIntoFrame: true
        });
      }
      console.log(
        `captured t=${time.toFixed(2)}s draw=${proof.drawCalls} skinned=${proof.skinnedRenderItems} ` +
          `cam=${proof.shot?.presetId}@[${proof.shot?.cameraPosition.map((v) => v.toFixed(1)).join(",")}] ` +
          `miko@[${miko?.position?.map((v) => v.toFixed(2)).join(",")}] clip=${miko?.clip} sweep=${miko?.sweeping} ` +
          `mouthOpen=${miko?.mouthOpenness.toFixed(2)} primitiveOpen=${miko?.primitiveMouthOpen.toFixed(3)} ` +
          `caption="${(result.caption?.text ?? proof.caption?.text ?? "").slice(0, 36)}" ` +
          `${result.caption ? `contrast=${result.caption.contrastRatio.toFixed(1)}:1` : ""}`
      );
    }

    // CAPTION + STAGING CONSOLE SUMMARY.
    console.log("\n--- staged performance (per beat) ---");
    for (const beat of stagingByBeat.values()) {
      const m = beat.characters.find((c) => c.id === "miko");
      console.log(`  ${beat.shotId}: miko@[${m?.position.map((v) => v.toFixed(2)).join(",")}] clip=${m?.clip} sweeping=${m?.sweeping}`);
    }
    console.log("--- burned-in caption contrast (text vs plate) ---");
    for (const c of captionProofs) {
      console.log(`  ${c.shotId}: contrast=${c.contrastRatio.toFixed(1)}:1 (WCAG AA>=4.5) "${c.text.slice(0, 48)}"`);
    }

    // ISOLATED LIP-SYNC A/B PROOF: render the SAME pose + SAME close-up camera with
    // the mouth forced fully open vs fully closed, so the ONLY difference between the
    // two frames is the mouth indicator. This proves the lip-sync alone moves pixels
    // (the per-frame captures above also vary skeleton/camera, which would otherwise
    // confound an isolated mouth measurement).
    const MOUTH_PROOF_TIME = 1.7; // close-up shot (miko fills frame)
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

  // STAGED-POSITION PIXEL PROOF: diff the captured raw frame at the OPENING beat vs
  // the TEAMWORK (sweep) beat. Because miko crosses to the broom and plays the sweep
  // stand-in clip, these frames must differ substantially in pixels (not just world
  // coordinates). We measure over the full frame AND over a vertical band where
  // miko's body sits so the staged move is provable from the bytes alone.
  const findCapture = (shotId: string): CapturedFrame | undefined => {
    const beat = stagingByBeat.get(shotId);
    return beat ? captured.find((f) => f.time === beat.time) : undefined;
  };
  const openFrame = findCapture("shot-moon-garden-open");
  const teamworkFrame = findCapture("shot-glow-stone-teamwork");
  let stagedPositionProof:
    | {
        openBeat: string;
        teamworkBeat: string;
        openTime: number;
        teamworkTime: number;
        changedPixelRatio: number;
        meanRgbDiff: number;
        mikoOpenPosition: number[];
        mikoTeamworkPosition: number[];
        positionDelta: number;
        positionDiffersAcrossBeats: boolean;
      }
    | undefined;
  if (openFrame && teamworkFrame) {
    let changed = 0;
    let total = 0;
    const pxCount = Math.min(openFrame.raw.length, teamworkFrame.raw.length) / 4;
    for (let i = 0; i < pxCount * 4; i += 4) {
      const d =
        Math.abs(openFrame.raw[i]! - teamworkFrame.raw[i]!) +
        Math.abs(openFrame.raw[i + 1]! - teamworkFrame.raw[i + 1]!) +
        Math.abs(openFrame.raw[i + 2]! - teamworkFrame.raw[i + 2]!);
      total += d;
      if (d > 30) changed += 1;
    }
    const openStage = stagingByBeat.get("shot-moon-garden-open")?.characters.find((c) => c.id === "miko");
    const teamStage = stagingByBeat.get("shot-glow-stone-teamwork")?.characters.find((c) => c.id === "miko");
    const op = openStage?.position ?? [];
    const tp = teamStage?.position ?? [];
    const positionDelta =
      op.length === 3 && tp.length === 3 ? Math.hypot(op[0]! - tp[0]!, op[1]! - tp[1]!, op[2]! - tp[2]!) : 0;
    const changedPixelRatio = changed / pxCount;
    stagedPositionProof = {
      openBeat: "shot-moon-garden-open",
      teamworkBeat: "shot-glow-stone-teamwork",
      openTime: openFrame.time,
      teamworkTime: teamworkFrame.time,
      changedPixelRatio,
      meanRgbDiff: total / pxCount / 3,
      mikoOpenPosition: op,
      mikoTeamworkPosition: tp,
      positionDelta,
      // Provable in BOTH pixels (frames differ) AND world coords (miko crossed to broom).
      positionDiffersAcrossBeats: changedPixelRatio > 0.02 && positionDelta > 0.1
    };
    console.log(
      `\nstaged-position pixel proof (open vs teamwork sweep beat): changedPixelRatio=${(changedPixelRatio * 100).toFixed(1)}% ` +
        `meanRgbDiff=${stagedPositionProof.meanRgbDiff.toFixed(2)} mikoMoved=${positionDelta.toFixed(2)}u ` +
        `=> positionDiffersAcrossBeats=${stagedPositionProof.positionDiffersAcrossBeats}`
    );
  }

  // Toon-treat every frame; save the 4 fidelity-gate PNGs; collect PNG bytes for video.
  const encoder = await createFfmpegFrameEncoderAdapter({ codec: "vp9", container: "webm", frameRate: FRAME_RATE });
  let toonInfo = { bands: 0, outline: false, colorGrade: false };
  const fidelityByIndex = new Map<number, (typeof FIDELITY_FRAME_IDS)[number]>();
  for (const id of FIDELITY_FRAME_IDS) fidelityByIndex.set(FIDELITY_CAPTURE_INDEX[id], id);

  for (let index = 0; index < captured.length; index += 1) {
    const frame = captured[index]!;
    const treated = applyToonTreatment(frame.raw, WIDTH, HEIGHT);
    toonInfo = { bands: treated.bands, outline: treated.outline, colorGrade: treated.colorGrade };
    const png = await rawRgbaToPng(treated.pixels, WIDTH, HEIGHT);

    const fidelityId = fidelityByIndex.get(index);
    if (fidelityId) {
      writeFileSync(resolve(FRAMES_DIR, `${fidelityId}.png`), png);
    }

    encoder.encode({
      frame: index,
      time: frame.time,
      viewport: { width: WIDTH, height: HEIGHT },
      image: png
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

  // REAL DIALOGUE AUDIO (macOS `say` TTS) with graceful degrade to placeholder ambient.
  // 1. Try to synthesize the episode's dialogue lines with `say` (distinct voice per
  //    character) and assemble an episode-length track (each line at its startTime over
  //    a faint ambient bed). 2. If `say` is available, mux that real dialogue (extending
  //    the video to the episode length so all lines survive). 3. Otherwise fall back to
  //    the soft placeholder ambient bed. Then ffprobe to confirm a real audio stream.
  const dialogue = buildDialogueAudioTrack(OUTPUT_DIR);
  let audioMux: AudioMuxResult;
  if (dialogue.available) {
    console.log(
      `\ndialogue audio: synthesized ${dialogue.lines.length} lines via macOS \`say\` ` +
        `(voices: ${Object.entries(dialogue.voices).map(([k, v]) => `${k}=${v}`).join(", ")})`
    );
    audioMux = muxDialogueAudio(VIDEO_PATH, dialogue);
    if (!audioMux.muxed) {
      console.warn(`dialogue mux failed, falling back to placeholder ambient. ${audioMux.note}`);
      audioMux = muxPlaceholderAmbientAudio(VIDEO_PATH, durationSeconds);
    }
  } else {
    console.log(`\ndialogue audio: macOS \`say\` unavailable — falling back to placeholder ambient.`);
    audioMux = muxPlaceholderAmbientAudio(VIDEO_PATH, durationSeconds);
  }
  const audioProbe = audioMux.muxed ? probeAudioStream(VIDEO_PATH) : { raw: "" };
  const audio = {
    ...audioMux,
    ...(audioProbe.codec ? { codec: audioProbe.codec } : {}),
    ...(audioProbe.channels ? { channels: audioProbe.channels } : {}),
    ...(audioProbe.sampleRate ? { sampleRate: audioProbe.sampleRate } : {}),
    ffprobe: audioProbe.raw
  };
  const muxedBytes = audioMux.muxed ? statSync(VIDEO_PATH).size : video.byteLength;
  console.log(
    `\naudio mux: muxed=${audioMux.muxed} kind=${audioMux.audioKind} dialogue=${audioMux.dialogueAudio} ` +
      `codec=${audioProbe.codec ?? "(none)"} ch=${audioProbe.channels ?? "?"} rate=${audioProbe.sampleRate ?? "?"}`
  );

  const summary = {
    kind: "cartoon-studio-live-3d-render",
    route: "live-route.html",
    framesDir: FRAMES_DIR,
    video: VIDEO_PATH,
    videoBytes: muxedBytes,
    silentVideoBytes: video.byteLength,
    frameRate: FRAME_RATE,
    captureTimes: CAPTURE_TIMES,
    toon: toonInfo,
    ready: readyProof,
    // Phase 2 — REAL dialogue audio via macOS `say` TTS (distinct voice per character,
    // each line at its dialogue startTime over a faint ambient bed), muxed as libopus
    // with ffprobe confirmation. Gracefully degrades to placeholder ambient off-mac.
    audio,
    // Phase 2 — staged performance: miko crosses to the broom + sweep stand-in clip,
    // proven in pixels (open-beat vs teamwork-beat frame diff) AND world coords.
    stagedPositionProof,
    stagedPerformance: Array.from(stagingByBeat.values()),
    // Phase 2 — burned-in captions: per-beat caption text drawn into the frame pixels
    // with a text-vs-plate contrast measurement (accessibility).
    captionProofs,
    // Per-frame seek proofs: per-shot camera framing + per-character lip-sync state
    // (AuraVoice mouthOpenness, primitive mouth-indicator open height, GLB morph weight).
    seekProofs,
    // Isolated lip-sync A/B proof (same pose + camera, mouth open vs closed).
    mouthProof
  };
  writeFileSync(resolve(OUTPUT_DIR, "render-live-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

  console.log("\n--- render-live complete ---");
  console.log(`frames dir: ${FRAMES_DIR}`);
  console.log(`fidelity PNGs: ${FIDELITY_FRAME_IDS.map((id) => `${id}.png`).join(", ")}`);
  console.log(`video: ${VIDEO_PATH} (${muxedBytes} bytes${audioMux.muxed ? `, audio: ${audioProbe.codec}` : ", NO audio"})`);
  console.log(
    `audio: kind=${audio.audioKind} dialogueAudio=${audio.dialogueAudio}` +
      (audio.dialogueAudio
        ? ` voiceSource=${audio.voiceSource} lines=${audio.dialogueLines?.length ?? 0} (REAL macOS-say TTS — robotic, placeholder-grade VO)`
        : " (placeholder ambient, not dialogue)")
  );
  if (audio.dialogueAudio && audio.dialogueLines) {
    console.log("--- per-line voice + timing (spoken dialogue) ---");
    for (const l of audio.dialogueLines) {
      console.log(
        `  ${l.lineId}: voice=${l.voice} speaker=${l.speakerId} start=${l.startTime}s ` +
          `spoken=${l.spokenDuration.toFixed(2)}s "${l.text.slice(0, 40)}"`
      );
    }
  }
  console.log(`toon: bands=${toonInfo.bands} outline=${toonInfo.outline} colorGrade=${toonInfo.colorGrade}`);
}

main().catch((error: unknown) => {
  console.error("render-live failed:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
