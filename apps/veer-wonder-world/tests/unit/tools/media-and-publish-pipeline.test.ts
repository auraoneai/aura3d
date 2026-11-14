/// <reference types="node" />
// Unit & CLI integration tests for WP12-WP16 offline media production, QC, thumbnail,
// YouTube governance, and aggregate analytics tools (PRD 09).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

interface RenderEpisodeTools {
  assertRemoteRenderAllowed(env?: Record<string, string | undefined>): void;
  buildSrtFromEvents(
    events: readonly Record<string, unknown>[],
    localePack: { locale: string; lines: Record<string, string>; strings: Record<string, string> },
    options?: Record<string, unknown>
  ): string;
  renderEndCardBuffer(options?: Record<string, unknown>): Promise<Buffer>;
}

interface MixEpisodeTools {
  BASE_BED_GAIN: number;
  DEFAULT_SAMPLE_RATE: number;
  PAUSE_BED_GAIN: number;
  computeDuckEnvelope(options: {
    frameCount: number;
    sampleRate?: number;
    speechIntervalsMs?: readonly [number, number][];
    pauseIntervalsMs?: readonly [number, number][];
    fadeOutMs?: number;
  }): Float32Array;
  encodeWavFloat32Stereo(pcmStereo: Float32Array, sampleRate?: number): Buffer;
  measureEbur128(mediaPath: string): Promise<{
    integratedLufs: number;
    lraLu: number;
    truePeakDbtp: number;
    rawSummary: string;
  }>;
  mixEpisodeDir(options: {
    dir: string;
    locale?: string;
    customAppDir?: string;
  }): Promise<{
    outDir: string;
    rawMixPath: string;
    masterWavPath: string;
    chaptersMetaPath: string;
    episodeMp4Path: string | null;
  }>;
  mixTimelineBuffers(options: {
    durationMs: number;
    sampleRate?: number;
    events: readonly Record<string, unknown>[];
    clipsByKey: Record<string, Float32Array | { pcm: Float32Array; channels?: 1 | 2 }> | Map<string, Float32Array>;
    fadeOutMs?: number;
  }): {
    pcmStereo: Float32Array;
    frameCount: number;
    sampleRate: number;
  };
}

interface QcEpisodeTools {
  analyzeFlashSequence(
    frames: readonly Uint8Array[],
    options?: { width?: number; height?: number; fps?: number }
  ): {
    passed: boolean;
    maxGeneralFlashesPerSec: number;
    maxRedFlashesPerSec: number;
  };
  checkPrivacyText(
    text: string,
    options?: { customAppDir?: string; allowAuraAppUrl?: boolean }
  ): { passed: boolean; issues: string[] };
  checkSafetyFactsText(text: string): { passed: boolean; issues: string[] };
  parseSrtCues(srtText: string): {
    valid: boolean;
    cues: Array<{ index: number; startMs: number; endMs: number; text: string }>;
    errors: string[];
  };
  runQcEpisode(options: {
    dir: string;
    kind?: string;
    locale?: string;
    allowPrototypeAudio?: boolean;
    customAppDir?: string;
    durationBoundsSec?: [number, number];
  }): Promise<{
    passed: boolean;
    gates: Record<string, { passed: boolean }>;
  }>;
}

interface ThumbnailTools {
  MAX_THUMBNAIL_BYTES: number;
  THUMBNAIL_HEIGHT: number;
  THUMBNAIL_WIDTH: number;
  assertRemoteThumbnailAllowed(env?: Record<string, string | undefined>): void;
  compositeThumbnail(options: {
    frameInput: Buffer | string;
    title?: string;
    outPath?: string | null;
  }): Promise<{ byteLength: number; width: number; height: number }>;
  generateThumbnail(options: {
    id?: string;
    fromFrame?: string;
    outPath?: string;
    title?: string;
  }): Promise<{ byteLength: number; width: number; height: number }>;
  validateThumbnailTitle(title: string, customAppDir?: string): string;
}

interface PublishYouTubeTools {
  buildReleaseManifest(options: {
    dir: string;
    reviewer?: string;
    signedAt?: string;
    watchedAt1x?: boolean;
  }): {
    manifestPath: string;
    manifest: {
      readyForUpload: boolean;
      humanReview: { status: string; reviewer: string | null; watchedAt1x: boolean; date: string | null };
      f3Checklist: Record<string, boolean>;
    };
  };
  unpublishYouTubeVideo(options: {
    videoId: string;
    dir?: string;
    dryRun?: boolean;
  }): Promise<{
    ok: boolean;
    mode: string;
    request: { requestBody: { status: Record<string, unknown> } };
  }>;
  uploadEpisodeToYouTube(options: {
    dir: string;
    privacyStatus?: string;
    publishAt?: string;
    nowMs?: number;
    dryRun?: boolean;
  }): Promise<{
    ok: boolean;
    mode: string;
    payload: {
      videosInsert: {
        requestBody: {
          status: Record<string, unknown>;
        };
      };
    };
  }>;
}

interface LearnAnalyticsTools {
  analyzeRetentionAgainstSegments(
    rows: readonly number[][],
    segmentWindows: readonly Record<string, unknown>[],
    totalDurationSec?: number
  ): {
    segments: Array<{ segmentId: string; classification: string }>;
    pacingNotes: Array<{ segmentId: string; issue: string; briefGuidance: string }>;
  };
  assertAggregateAnalyticsParams(options?: { dimensions?: string; metrics?: string }): void;
  buildRetentionQueryUrl(options: { videoId: string; startDate: string; endDate: string }): string;
  computeSegmentWindows(showSpec: Record<string, unknown>, totalDurationSec?: number): Array<Record<string, unknown>>;
}

const {
  assertRemoteRenderAllowed,
  buildSrtFromEvents,
  renderEndCardBuffer
} = (await import(new URL("../../../tools/render-episode.mjs", import.meta.url).href)) as RenderEpisodeTools;

const {
  BASE_BED_GAIN,
  DEFAULT_SAMPLE_RATE,
  PAUSE_BED_GAIN,
  computeDuckEnvelope,
  encodeWavFloat32Stereo,
  measureEbur128,
  mixEpisodeDir,
  mixTimelineBuffers
} = (await import(new URL("../../../tools/mix-episode.mjs", import.meta.url).href)) as MixEpisodeTools;

const {
  analyzeFlashSequence,
  checkPrivacyText,
  checkSafetyFactsText,
  parseSrtCues,
  runQcEpisode
} = (await import(new URL("../../../tools/qc-episode.mjs", import.meta.url).href)) as QcEpisodeTools;

const {
  MAX_THUMBNAIL_BYTES,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  assertRemoteThumbnailAllowed,
  generateThumbnail,
  validateThumbnailTitle
} = (await import(new URL("../../../tools/thumbnail.mjs", import.meta.url).href)) as ThumbnailTools;

const {
  buildReleaseManifest,
  unpublishYouTubeVideo,
  uploadEpisodeToYouTube
} = (await import(new URL("../../../tools/publish-youtube.mjs", import.meta.url).href)) as PublishYouTubeTools;

const {
  analyzeRetentionAgainstSegments,
  assertAggregateAnalyticsParams,
  buildRetentionQueryUrl,
  computeSegmentWindows
} = (await import(new URL("../../../tools/learn-analytics.mjs", import.meta.url).href)) as LearnAnalyticsTools;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = resolve(__dirname, "../../..");
const repoRoot = resolve(appRoot, "../..");
const rootRequire = createRequire(join(repoRoot, "package.json"));
const sharp = rootRequire("sharp");

const FFMPEG_BIN = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const HAS_FFMPEG =
  spawnSync(FFMPEG_BIN, ["-version"], { stdio: "ignore" }).status === 0;

const tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeSolidRgb24(width: number, height: number, r: number, g: number, b: number): Uint8Array {
  const buf = new Uint8Array(width * height * 3);
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  }
  return buf;
}

function makeStereoSine(durationMs: number, freqHz: number, amp = 0.45, sampleRate = DEFAULT_SAMPLE_RATE): Float32Array {
  const frames = Math.round((durationMs / 1000) * sampleRate);
  const out = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * amp;
    out[i * 2] = sample;
    out[i * 2 + 1] = sample;
  }
  return out;
}

describe("WP12: render-episode remote guard, SRT builder & end card", () => {
  it("blocks local Playwright launch unless CI=1 or AURA3D_REMOTE_ACR=1", () => {
    expect(() => assertRemoteRenderAllowed({})).toThrow(/tools\/remote-acr\/run\.sh/);
    expect(() => assertRemoteRenderAllowed({ CI: "0" })).toThrow(/REMOTE_GUARD_BLOCKED/);
    expect(() => assertRemoteRenderAllowed({ CI: "1" })).not.toThrow();
    expect(() => assertRemoteRenderAllowed({ AURA3D_REMOTE_ACR: "1" })).not.toThrow();
  });

  it("builds valid monotonic .srt cues from line and pause events", () => {
    const localePack = {
      locale: "en",
      lines: {
        "s01e01.s2.hi": "Hi! I'm Momo.",
        "s01e01.s2.ask": "Where is the ball?",
        "s01e01.s2.ans": "There it is! You found it!"
      },
      strings: {
        "s01e01.pause.ball": 'point and say "ball"'
      }
    };

    const events = [
      { t: 500, type: "line", action: "start", id: "s01e01.s2.hi", durationMs: 1400 },
      { t: 2100, type: "line", action: "start", id: "s01e01.s2.ask", durationMs: 1300 },
      { t: 3500, type: "pause", action: "start", id: "s01e01.pause.ball", durationMs: 2500 },
      { t: 6000, type: "pause", action: "stop", id: "s01e01.pause.ball" },
      { t: 6100, type: "line", action: "start", id: "s01e01.s2.ans", durationMs: 1600 }
    ];

    const srt = buildSrtFromEvents(events, localePack);
    const parsed = parseSrtCues(srt);
    expect(parsed.valid).toBe(true);
    expect(parsed.cues).toHaveLength(4);
    expect(parsed.cues[0]).toMatchObject({
      index: 1,
      startMs: 500,
      endMs: 1900,
      text: "Hi! I'm Momo."
    });
    expect(parsed.cues[2]).toMatchObject({
      index: 3,
      startMs: 3500,
      endMs: 6000,
      text: '[pause: point and say "ball"]'
    });
    expect(parsed.cues[3]?.text).toBe("There it is! You found it!");
  });

  it("renders a 1920x1080 calm starlight-navy offline play end card", async () => {
    const pngBuf = await renderEndCardBuffer({
      width: 1920,
      height: 1080,
      heading: "All done! Now try...",
      offlinePlay: "Find five things for a pretend party.",
      caregiverBridge: "Count them on your fingers together.",
      format: "png"
    });
    const meta = await sharp(pngBuf).metadata();
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
    expect(meta.format).toBe("png");
  });
});

describe("WP13: mix-episode sample-exact PCM mixer & ducking", () => {
  it("ducks music bed >= 10 dB under speech and 50% during PAUSE intervals", () => {
    const sr = 48_000;
    const totalMs = 8_000;
    const env = computeDuckEnvelope({
      frameCount: (totalMs / 1000) * sr,
      sampleRate: sr,
      speechIntervalsMs: [[1500, 2800]],
      pauseIntervalsMs: [[4200, 6200]],
      fadeOutMs: 1000
    });

    const atMs = (ms: number) => env[Math.round((ms / 1000) * sr)];

    // Base un-ducked bed level at 500 ms (~0.125 = -18 dB)
    expect(atMs(500)).toBeCloseTo(BASE_BED_GAIN, 3);

    // Mid-speech at 2100 ms: ducked >= 10 dB below base bed AND >= 10 dB below unity speech
    const speechBed = atMs(2100);
    const duckBelowBaseDb = 20 * Math.log10(BASE_BED_GAIN / speechBed);
    const duckBelowUnitySpeechDb = 20 * Math.log10(1.0 / speechBed);
    expect(duckBelowBaseDb).toBeGreaterThanOrEqual(10);
    expect(duckBelowUnitySpeechDb).toBeGreaterThanOrEqual(12);

    // Mid-PAUSE at 5000 ms: dropped 50% (0.0625)
    expect(atMs(5000)).toBeCloseTo(PAUSE_BED_GAIN, 3);

    // Final sample faded out cleanly to 0
    expect(env[env.length - 1]).toBeLessThan(0.002);
  });

  it("places spoken lines at exact sample Math.round((t / 1000) * 48000)", () => {
    const sr = 48_000;
    const impulseClip = new Float32Array(4800 * 2);
    impulseClip[0] = 0.8;
    impulseClip[1] = 0.8;
    for (let i = 1; i < 480; i += 1) {
      impulseClip[i * 2] = 0.5;
      impulseClip[i * 2 + 1] = 0.5;
    }

    const bedClip = makeStereoSine(1000, 220, 0.3, sr);
    const lineStartMs = 1234;
    const expectedSample = Math.round((lineStartMs / 1000) * sr);

    const mixed = mixTimelineBuffers({
      durationMs: 4000,
      sampleRate: sr,
      events: [
        { t: 0, type: "bed", action: "start", id: "meadowBed" },
        { t: 500, type: "line", action: "start", id: "test.impulse" }
      ].map((ev) => (ev.type === "line" ? { ...ev, t: lineStartMs } : ev)),
      clipsByKey: {
        "bed:meadowBed": bedClip,
        "line:test.impulse": impulseClip
      },
      fadeOutMs: 500
    });

    const beforeLineMag = Math.abs(mixed.pcmStereo[(expectedSample - 2) * 2]);
    const atLineOnsetMag = Math.abs(mixed.pcmStereo[expectedSample * 2]);
    // Bed is ducked < 0.04, whereas speech impulse adds +0.80 at exact sample expectedSample!
    expect(beforeLineMag).toBeLessThan(0.05);
    expect(atLineOnsetMag).toBeGreaterThan(0.75);
  });
});

describe("WP14: WCAG 2.3.1 general & saturated-red flash detector + privacy/safety scanners", () => {
  it("passes calm colour gradients and gentle transitions", () => {
    const w = 32;
    const h = 18;
    const frames: Uint8Array[] = [];
    for (let f = 0; f < 60; f += 1) {
      const t = f / 59;
      const r = Math.round(30 + t * 160);
      const g = Math.round(45 + t * 140);
      const b = Math.round(80 + t * 110);
      frames.push(makeSolidRgb24(w, h, r, g, b));
    }
    const res = analyzeFlashSequence(frames, { width: w, height: h, fps: 30 });
    expect(res.passed).toBe(true);
    expect(res.maxGeneralFlashesPerSec).toBe(0);
    expect(res.maxRedFlashesPerSec).toBe(0);
  });

  it("catches >3 Hz full-screen black/white strobe", () => {
    const w = 32;
    const h = 18;
    const frames: Uint8Array[] = [];
    // 5 Hz strobe at 30 fps (alternates every 3 frames -> 10 transitions = 5 flashes in 1 second)
    for (let f = 0; f < 30; f += 1) {
      const white = Math.floor(f / 3) % 2 === 1;
      frames.push(white ? makeSolidRgb24(w, h, 250, 250, 250) : makeSolidRgb24(w, h, 10, 10, 10));
    }
    const res = analyzeFlashSequence(frames, { width: w, height: h, fps: 30 });
    expect(res.passed).toBe(false);
    expect(res.maxGeneralFlashesPerSec).toBeGreaterThan(3);
  });

  it("catches >3 Hz saturated-red strobe even when luminance delta |dY| < 0.10", () => {
    const w = 32;
    const h = 18;
    const frames: Uint8Array[] = [];
    // Pure red RGB(200, 0, 0) has Y ~ 0.122; Olive-green RGB(0, 96, 0) has Y ~ 0.083 -> |dY| = 0.039 < 0.10!
    // General flash threshold alone would miss this, so WCAG 2.3.1 saturated-red check must catch it.
    for (let f = 0; f < 30; f += 1) {
      const isRed = Math.floor(f / 3) % 2 === 1;
      frames.push(isRed ? makeSolidRgb24(w, h, 220, 0, 0) : makeSolidRgb24(w, h, 0, 100, 0));
    }
    const res = analyzeFlashSequence(frames, { width: w, height: h, fps: 30 });
    expect(res.passed).toBe(false);
    expect(res.maxRedFlashesPerSec).toBeGreaterThan(3);
  });

  it("detects child name derived from folder prefix, subscribe CTAs, efficacy claims, and choking hazards", () => {
    const suffix = "-wonder-world";
    const folder = basename(appRoot);
    const derivedPrefix = folder.endsWith(suffix) ? folder.slice(0, -suffix.length) : "child";

    expect(checkPrivacyText(`Hello ${derivedPrefix}!`, { customAppDir: appRoot }).passed).toBe(false);
    expect(checkPrivacyText("Don't forget to subscribe and click the bell!").passed).toBe(false);
    expect(checkPrivacyText("Hello, friend! Let's count to five together.").passed).toBe(true);

    expect(checkSafetyFactsText("This show teaches your toddler to talk in 2 weeks!").passed).toBe(false);
    expect(checkSafetyFactsText("Give the baby whole grapes and honey for babies.").passed).toBe(false);
    expect(checkSafetyFactsText("For ages 1-4, best watched together.").passed).toBe(true);
  });
});

describe("WP15: thumbnail.mjs --from-frame compositor & anti-clickbait validation", () => {
  it("enforces remote guard when live browser capture is requested", () => {
    expect(() => assertRemoteThumbnailAllowed({})).toThrow(/REMOTE_GUARD_BLOCKED/);
    expect(() => assertRemoteThumbnailAllowed({ AURA3D_REMOTE_ACR: "1" })).not.toThrow();
  });

  it("rejects >4-word clickbait titles and arrows, and composites a valid 1280x720 PNG < 2 MB", async () => {
    expect(() => validateThumbnailTitle("You Won't Believe What Momo Found Today")).toThrow(/at most 4 calm words/);
    expect(() => validateThumbnailTitle("Hello friend!!!")).toThrow(/clickbait/);
    expect(() => validateThumbnailTitle("Look -> Momo")).toThrow(/clickbait/);

    const tmp = makeTempDir("ww-thumb-test-");
    const rawFramePath = join(tmp, "scene-frame.png");
    const outThumbPath = join(tmp, "thumbnail.png");

    const syntheticScene = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 235, g: 244, b: 252 }
      }
    })
      .png()
      .toBuffer();
    writeFileSync(rawFramePath, syntheticScene);

    const result = await generateThumbnail({
      fromFrame: rawFramePath,
      outPath: outThumbPath,
      title: "Hello, friend!"
    });

    expect(existsSync(outThumbPath)).toBe(true);
    expect(result.byteLength).toBeGreaterThan(1000);
    expect(result.byteLength).toBeLessThan(MAX_THUMBNAIL_BYTES);

    const meta = await sharp(outThumbPath).metadata();
    expect(meta.width).toBe(THUMBNAIL_WIDTH);
    expect(meta.height).toBe(THUMBNAIL_HEIGHT);
    expect(meta.format).toBe("png");
  });
});

describe("WP16: publish-youtube R14/F.3 hard-fail guards, unpublish, & learn-analytics privacy", () => {
  function seedSignedOrUnsignedShowDir(signed: boolean) {
    const dir = makeTempDir("ww-publish-test-");
    writeFileSync(join(dir, "episode.mp4"), Buffer.from("synthetic-mp4-placeholder"));
    writeFileSync(
      join(dir, "captions.en.srt"),
      "1\n00:00:00,500 --> 00:00:02,000\nHello, friend!\n\n2\n00:00:02,200 --> 00:00:04,700\n[pause: wave hello]\n"
    );
    writeFileSync(
      join(dir, "events.json"),
      JSON.stringify(
        {
          id: "s01e01-welcome-to-wonder-world",
          kind: "show",
          locale: "en",
          fps: 30,
          frameCount: 18000,
          durationMs: 600000,
          traceHash: "a".repeat(64),
          youtube: {
            title: "Welcome to Wonder World! | Count to 5 Party for Kids",
            description: "For ages 1-4, best watched together. Play in the app: https://aura3d.auraone.ai"
          },
          events: []
        },
        null,
        2
      )
    );
    writeFileSync(
      join(dir, "qc.json"),
      JSON.stringify(
        {
          id: "s01e01-welcome-to-wonder-world",
          kind: "show",
          locale: "en",
          passed: true,
          gates: {
            duration: { passed: true },
            flashSafety: { passed: true },
            audio: { passed: true },
            sync: { passed: true },
            onModel: { passed: true },
            privacy: { passed: true },
            rights: { passed: true, prototypeOverrideUsed: false },
            captions: { passed: true },
            originality: { passed: true },
            safetyFacts: { passed: true }
          }
        },
        null,
        2
      )
    );

    const built = buildReleaseManifest(
      signed
        ? {
            dir,
            reviewer: "Parent Reviewer",
            signedAt: "2026-11-14",
            watchedAt1x: true
          }
        : { dir }
    );
    return { dir, manifest: built.manifest };
  }

  it("builds all 11 F.3 checklist items and blocks unsigned pending-human manifests", async () => {
    const { dir, manifest } = seedSignedOrUnsignedShowDir(false);
    expect(Object.keys(manifest.f3Checklist)).toHaveLength(11);
    expect(manifest.humanReview.status).toBe("pending-human");
    expect(manifest.readyForUpload).toBe(false);

    await expect(
      uploadEpisodeToYouTube({
        dir,
        publishAt: "2027-06-01T14:00:00Z",
        dryRun: true
      })
    ).rejects.toThrow(/human review sign-off is incomplete/);
  });

  it("hard-fails public/unlisted privacyStatus and missing or past publishAt (R14)", async () => {
    const { dir } = seedSignedOrUnsignedShowDir(true);

    await expect(
      uploadEpisodeToYouTube({
        dir,
        privacyStatus: "public",
        publishAt: "2027-06-01T14:00:00Z",
        dryRun: true
      })
    ).rejects.toThrow(/R14_HARD_FAIL.*private/);

    await expect(
      uploadEpisodeToYouTube({
        dir,
        privacyStatus: "unlisted",
        publishAt: "2027-06-01T14:00:00Z",
        dryRun: true
      })
    ).rejects.toThrow(/R14_HARD_FAIL.*private/);

    await expect(
      uploadEpisodeToYouTube({
        dir,
        publishAt: undefined,
        dryRun: true
      })
    ).rejects.toThrow(/R14_HARD_FAIL.*--publish-at/);

    await expect(
      uploadEpisodeToYouTube({
        dir,
        publishAt: "2020-01-01T00:00:00Z",
        nowMs: Date.parse("2026-11-14T00:00:00Z"),
        dryRun: true
      })
    ).rejects.toThrow(/strictly in the future/);
  });

  it("passes signed F.3 manifest in --dry-run with MFK=true, synthetic=true, private+publishAt, and supports --unpublish --dry-run", async () => {
    const { dir } = seedSignedOrUnsignedShowDir(true);
    const futureIso = "2027-06-01T14:00:00Z";

    const res = await uploadEpisodeToYouTube({
      dir,
      publishAt: futureIso,
      nowMs: Date.parse("2026-11-14T00:00:00Z"),
      dryRun: true
    });

    expect(res.ok).toBe(true);
    expect(res.mode).toBe("dry-run");
    expect(existsSync(join(dir, "publish-payload.dryrun.json"))).toBe(true);
    expect(res.payload.videosInsert.requestBody.status).toMatchObject({
      privacyStatus: "private",
      publishAt: futureIso,
      selfDeclaredMadeForKids: true,
      containsSyntheticMedia: true
    });

    const unpub = await unpublishYouTubeVideo({
      videoId: "dQw4w9WgXcQ",
      dir,
      dryRun: true
    });
    expect(unpub.ok).toBe(true);
    expect(unpub.request.requestBody.status).toEqual({
      privacyStatus: "private",
      publishAt: null,
      selfDeclaredMadeForKids: true
    });
    expect(existsSync(join(dir, "unpublish-payload.dryrun.json"))).toBe(true);
  });

  it("enforces aggregate-only YouTube Analytics dimensions and maps retention dips to ShowSpec segments", () => {
    expect(() => assertAggregateAnalyticsParams({ dimensions: "ageGroup" })).toThrow(/PRIVACY_HARD_FAIL/);
    expect(() => assertAggregateAnalyticsParams({ dimensions: "gender" })).toThrow(/PRIVACY_HARD_FAIL/);
    expect(() => assertAggregateAnalyticsParams({ dimensions: "country" })).toThrow(/PRIVACY_HARD_FAIL/);
    expect(() => assertAggregateAnalyticsParams({ dimensions: "elapsedVideoTimeRatio" })).not.toThrow();

    const url = buildRetentionQueryUrl({
      videoId: "abc123XYZ09",
      startDate: "2026-11-01",
      endDate: "2026-11-30"
    });
    expect(url).toContain("dimensions=elapsedVideoTimeRatio");
    expect(url).not.toContain("ageGroup");

    const mockShow = {
      id: "s01e01",
      estimatedDurationSec: 200,
      chapters: [
        { segmentId: "s1", titleKey: "ch1", atSec: 0 },
        { segmentId: "s2", titleKey: "ch2", atSec: 100 }
      ],
      segments: [
        { id: "s1", template: "theme", world: "meadow", beats: [] },
        { id: "s2", template: "wordGame", world: "station", beats: [] }
      ]
    };
    const windows = computeSegmentWindows(mockShow, 200);
    const analysis = analyzeRetentionAgainstSegments(
      [
        [0.0, 1.0, 0.65],
        [0.45, 0.98, 0.62],
        [0.55, 0.90, 0.38],
        [0.95, 0.72, 0.35]
      ],
      windows,
      200
    );
    expect(analysis.segments[0]?.classification).toBe("strong-hold");
    expect(analysis.segments[1]?.classification).toBe("dip");
    expect(analysis.pacingNotes.some((n: { segmentId: string }) => n.segmentId === "s2")).toBe(true);
  });
});

describe.runIf(HAS_FFMPEG)("WP13 + WP14: end-to-end synthetic ffmpeg mix (-14 LUFS) & 10-gate QC", () => {
  it("mixes synthetic clips to -14 LUFS (+/- 0.8), muxes MP4 + SRT + chapters, and passes all 10 QC gates", async () => {
    const tmp = makeTempDir("ww-e2e-mix-qc-");
    const showDir = join(tmp, "episode-out");
    const fakeAppDir = join(tmp, "app-fixture");
    mkdirSync(join(showDir, "keyframes"), { recursive: true });
    mkdirSync(join(fakeAppDir, "src", "assets", "audio", "en", "lines"), { recursive: true });
    mkdirSync(join(fakeAppDir, "src", "assets", "audio", "music"), { recursive: true });
    mkdirSync(join(fakeAppDir, "src", "assets", "portraits"), { recursive: true });
    mkdirSync(join(fakeAppDir, "provenance", "audio"), { recursive: true });

    // Create textured non-flat portrait & keyframe so Gate 5 (onModel) passes.
    const gradientSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFF3E0"/>
          <stop offset="100%" stop-color="#4A6FA5"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#g)"/>
      <circle cx="320" cy="180" r="95" fill="#F2994A"/>
      <circle cx="290" cy="160" r="14" fill="#1D2842"/>
      <circle cx="350" cy="160" r="14" fill="#1D2842"/>
    </svg>`;
    const frameJpg = await sharp(Buffer.from(gradientSvg)).jpeg({ quality: 92 }).toBuffer();
    writeFileSync(join(showDir, "keyframes", "frame-000000.jpg"), frameJpg);
    await sharp(Buffer.from(gradientSvg))
      .resize(256, 256)
      .webp({ quality: 90 })
      .toFile(join(fakeAppDir, "src", "assets", "portraits", "momo.webp"));

    // Build a 4-second (120 frames @ 30 fps) calm video via ffmpeg image2pipe.
    const framesCount = 120;
    const repeatedJpegs = Buffer.concat(Array.from({ length: framesCount }, () => frameJpg));
    execFileSync(
      FFMPEG_BIN,
      [
        "-y",
        "-v",
        "error",
        "-f",
        "image2pipe",
        "-c:v",
        "mjpeg",
        "-framerate",
        "30",
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "30",
        join(showDir, "frames.mp4")
      ],
      { input: repeatedJpegs }
    );

    // Write synthetic line WAV and bed WAV into fakeAppDir.
    writeFileSync(
      join(fakeAppDir, "src", "assets", "audio", "en", "lines", "test.hello.wav"),
      encodeWavFloat32Stereo(makeStereoSine(1100, 330, 0.5))
    );
    writeFileSync(
      join(fakeAppDir, "src", "assets", "audio", "music", "meadowBed.mp3"),
      encodeWavFloat32Stereo(makeStereoSine(1500, 196, 0.35))
    );

    // Provenance records: paid tier ("creator") vs prototype check.
    writeFileSync(
      join(fakeAppDir, "provenance", "audio", "lines.json"),
      JSON.stringify({ "test.hello": { tier: "creator" } })
    );
    writeFileSync(
      join(fakeAppDir, "provenance", "audio", "beds.json"),
      JSON.stringify({ meadowBed: { tier: "creator" } })
    );
    writeFileSync(join(fakeAppDir, "provenance", "audio", "songs.json"), "{}");
    writeFileSync(join(fakeAppDir, "provenance", "audio", "sfx.json"), "{}");

    const events = [
      { t: 0, type: "bed", action: "start", id: "meadowBed" },
      { t: 400, type: "line", action: "start", id: "test.hello", speaker: "momo", durationMs: 1100 },
      { t: 1700, type: "pause", action: "start", id: "test.pause", durationMs: 1200 }
    ];

    writeFileSync(
      join(showDir, "events.json"),
      JSON.stringify(
        {
          id: "synthetic-test-show",
          kind: "show",
          locale: "en",
          aspect: "16:9",
          fps: 30,
          width: 640,
          height: 360,
          frameCount: framesCount,
          durationMs: 4000,
          offlinePlay: "Count five toys together.",
          caregiverBridge: "Wait calmly at each pause.",
          chapters: [{ segmentId: "s1", titleKey: "Opening", atSec: 0 }],
          events
        },
        null,
        2
      )
    );

    const srt = buildSrtFromEvents(events, {
      locale: "en",
      lines: { "test.hello": "Hello, Wonder World!" },
      strings: { "test.pause": 'say "hello"' }
    });
    writeFileSync(join(showDir, "captions.en.srt"), srt);

    const mixOut = await mixEpisodeDir({
      dir: showDir,
      locale: "en",
      customAppDir: fakeAppDir
    });
    expect(mixOut.episodeMp4Path).toBeTruthy();

    const masterStats = await measureEbur128(mixOut.masterWavPath);
    expect(masterStats.integratedLufs).toBeGreaterThanOrEqual(-14.8);
    expect(masterStats.integratedLufs).toBeLessThanOrEqual(-13.2);
    expect(masterStats.truePeakDbtp).toBeLessThanOrEqual(-1.2);

    const qcReport = await runQcEpisode({
      dir: showDir,
      kind: "show",
      locale: "en",
      customAppDir: fakeAppDir,
      durationBoundsSec: [3.5, 4.5]
    });
    expect(qcReport.passed).toBe(true);
    expect(Object.keys(qcReport.gates)).toHaveLength(10);

    // Verify prototype audio tier is rejected for kind="show" even with allowPrototypeAudio=true,
    // and accepted ONLY for legacy kind="episode" with allowPrototypeAudio=true.
    writeFileSync(
      join(fakeAppDir, "provenance", "audio", "lines.json"),
      JSON.stringify({ "test.hello": { tier: "free" } })
    );
    const qcShowFree = await runQcEpisode({
      dir: showDir,
      kind: "show",
      allowPrototypeAudio: true,
      customAppDir: fakeAppDir,
      durationBoundsSec: [3.5, 4.5]
    });
    expect(qcShowFree.gates.rights.passed).toBe(false);

    const qcEpisodeProto = await runQcEpisode({
      dir: showDir,
      kind: "episode",
      allowPrototypeAudio: true,
      customAppDir: fakeAppDir,
      durationBoundsSec: [3.5, 4.5]
    });
    expect(qcEpisodeProto.gates.rights.passed).toBe(true);
  });
});

describe("CLI subprocess entrypoints & non-zero hard-fail exit codes", () => {
  it("enforces remote guard and R14/F.3 exit codes when invoked via node CLI", async () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.CI;
    delete cleanEnv.AURA3D_REMOTE_ACR;

    // 1. render-episode.mjs CLI refuses local run with exit code 1
    const renderRes = spawnSync(
      process.execPath,
      [join(appRoot, "tools", "render-episode.mjs"), "--id", "momos-day"],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(renderRes.status).toBe(1);
    expect(renderRes.stderr).toContain("tools/remote-acr/run.sh");

    // 2. thumbnail.mjs CLI --from-frame succeeds locally and rejects >4-word title
    const tmp = makeTempDir("ww-cli-smoke-");
    const framePng = join(tmp, "frame.png");
    const outThumb = join(tmp, "thumb.png");
    await sharp({
      create: { width: 1280, height: 720, channels: 3, background: { r: 245, g: 238, b: 224 } }
    })
      .png()
      .toFile(framePng);

    const thumbOk = spawnSync(
      process.execPath,
      [
        join(appRoot, "tools", "thumbnail.mjs"),
        "--from-frame",
        framePng,
        "--out",
        outThumb,
        "--title",
        "Play Together!"
      ],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(thumbOk.status).toBe(0);
    expect(existsSync(outThumb)).toBe(true);

    const thumbBad = spawnSync(
      process.execPath,
      [
        join(appRoot, "tools", "thumbnail.mjs"),
        "--from-frame",
        framePng,
        "--out",
        outThumb,
        "--title",
        "Five Huge Surprises Inside Today"
      ],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(thumbBad.status).toBe(1);

    // 3. publish-youtube.mjs CLI --build-manifest, --upload guards, and --unpublish --dry-run
    const pubDir = join(tmp, "pub");
    mkdirSync(pubDir, { recursive: true });
    writeFileSync(join(pubDir, "episode.mp4"), Buffer.from("mp4"));
    writeFileSync(join(pubDir, "captions.en.srt"), "1\n00:00:00,100 --> 00:00:01,500\nHello!\n");
    writeFileSync(
      join(pubDir, "events.json"),
      JSON.stringify({ id: "s01e01", kind: "show", locale: "en", traceHash: "b".repeat(64), events: [] })
    );
    writeFileSync(
      join(pubDir, "qc.json"),
      JSON.stringify({
        id: "s01e01",
        kind: "show",
        locale: "en",
        passed: true,
        gates: {
          duration: { passed: true },
          flashSafety: { passed: true },
          audio: { passed: true },
          sync: { passed: true },
          onModel: { passed: true },
          privacy: { passed: true },
          rights: { passed: true, prototypeOverrideUsed: false },
          captions: { passed: true },
          originality: { passed: true },
          safetyFacts: { passed: true }
        }
      })
    );

    const buildUnsigned = spawnSync(
      process.execPath,
      [join(appRoot, "tools", "publish-youtube.mjs"), "--build-manifest", "--dir", pubDir],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(buildUnsigned.status).toBe(0);

    const uploadUnsigned = spawnSync(
      process.execPath,
      [
        join(appRoot, "tools", "publish-youtube.mjs"),
        "--upload",
        "--dir",
        pubDir,
        "--publish-at",
        "2028-01-01T12:00:00Z",
        "--dry-run"
      ],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(uploadUnsigned.status).toBe(1);

    const buildSigned = spawnSync(
      process.execPath,
      [
        join(appRoot, "tools", "publish-youtube.mjs"),
        "--build-manifest",
        "--dir",
        pubDir,
        "--reviewer",
        "Human Parent",
        "--signed-at",
        "2026-11-14"
      ],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(buildSigned.status).toBe(0);

    const uploadPublic = spawnSync(
      process.execPath,
      [
        join(appRoot, "tools", "publish-youtube.mjs"),
        "--upload",
        "--dir",
        pubDir,
        "--privacy",
        "public",
        "--publish-at",
        "2028-01-01T12:00:00Z",
        "--dry-run"
      ],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(uploadPublic.status).toBe(1);

    const uploadSignedDry = spawnSync(
      process.execPath,
      [
        join(appRoot, "tools", "publish-youtube.mjs"),
        "--upload",
        "--dir",
        pubDir,
        "--publish-at",
        "2028-01-01T12:00:00Z",
        "--dry-run"
      ],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(uploadSignedDry.status).toBe(0);

    const unpubDry = spawnSync(
      process.execPath,
      [join(appRoot, "tools", "publish-youtube.mjs"), "--unpublish", "vid_123456", "--dir", pubDir, "--dry-run"],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(unpubDry.status).toBe(0);

    // 4. learn-analytics.mjs CLI rejects demographic dimensions
    const analyticsBad = spawnSync(
      process.execPath,
      [join(appRoot, "tools", "learn-analytics.mjs"), "--dimensions", "ageGroup", "--dry-run"],
      { env: cleanEnv, encoding: "utf8" }
    );
    expect(analyticsBad.status).toBe(1);
    expect(analyticsBad.stderr).toContain("PRIVACY_HARD_FAIL");
  });
});

