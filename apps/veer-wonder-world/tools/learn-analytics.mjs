#!/usr/bin/env node
// Aggregate-only YouTube Analytics API v2 retention curve fetcher & segment pacing analyzer
// (PRD 09 WP16: A.3, B.2 step 13, D.4).
//
// Privacy invariant: structurally permits ONLY aggregate `elapsedVideoTimeRatio` retention curves
// and hard-rejects any viewer, demographic, age, gender, geographic, or device dimension.
//
// Usage:
//   Offline analysis from saved retention JSON:
//     node tools/learn-analytics.mjs --from-json <retention.json> --id <showId> [--out dist/shows/<id>/pacing-notes.json]
//   Query YouTube Analytics API v2 (or --dry-run):
//     node tools/learn-analytics.mjs --video-id <ytVideoId> --id <showId> --start-date 2026-11-01 --end-date 2026-11-30 [--dry-run]

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = resolve(__dirname, "..");
const repoDir = resolve(appDir, "../..");

export const ALLOWED_DIMENSIONS = "elapsedVideoTimeRatio";
export const ALLOWED_METRICS = new Set([
  "audienceWatchRatio",
  "relativeRetentionPerformance"
]);

const FORBIDDEN_DIMENSION_TOKENS = new Set([
  "agegroup",
  "gender",
  "viewerpercentage",
  "user",
  "userid",
  "country",
  "province",
  "city",
  "continent",
  "subcontinent",
  "devicetype",
  "operatingsystem",
  "subscribedstatus",
  "sharingservice"
]);

function getRootRequire() {
  const rootPkg = join(repoDir, "package.json");
  const localPkg = join(appDir, "package.json");
  return createRequire(existsSync(rootPkg) ? rootPkg : localPkg);
}

/**
 * Enforces COPPA / zero-viewer-profiling rule: only `dimensions=elapsedVideoTimeRatio`
 * and aggregate retention ratio metrics may ever be queried.
 */
export function assertAggregateAnalyticsParams({
  dimensions = ALLOWED_DIMENSIONS,
  metrics = "audienceWatchRatio,relativeRetentionPerformance"
} = {}) {
  const dims = String(dimensions ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  if (dims.length !== 1 || dims[0] !== ALLOWED_DIMENSIONS) {
    const hasForbidden = dims.some((d) => FORBIDDEN_DIMENSION_TOKENS.has(d.toLowerCase()));
    throw new Error(
      `PRIVACY_HARD_FAIL: YouTube Analytics query rejected dimensions=${JSON.stringify(dimensions)}` +
        (hasForbidden ? " (viewer/demographic/geographic profiling is strictly prohibited)" : "") +
        `; only "${ALLOWED_DIMENSIONS}" is permitted.`
    );
  }

  const metricList = String(metrics ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (metricList.length === 0 || metricList.some((m) => !ALLOWED_METRICS.has(m))) {
    throw new Error(
      `PRIVACY_HARD_FAIL: YouTube Analytics query rejected metrics=${JSON.stringify(metrics)}; ` +
        `only ${[...ALLOWED_METRICS].join(",")} are permitted.`
    );
  }
}

export function buildRetentionQueryUrl({
  videoId,
  startDate,
  endDate,
  dimensions = ALLOWED_DIMENSIONS,
  metrics = "audienceWatchRatio,relativeRetentionPerformance"
}) {
  assertAggregateAnalyticsParams({ dimensions, metrics });

  const cleanVid = String(videoId ?? "").trim();
  if (!/^[\w-]{6,32}$/.test(cleanVid)) {
    throw new Error(`Invalid videoId: ${JSON.stringify(videoId)}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate ?? "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate ?? ""))) {
    throw new Error(`startDate and endDate must be YYYY-MM-DD (got ${startDate} .. ${endDate})`);
  }

  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);
  url.searchParams.set("dimensions", ALLOWED_DIMENSIONS);
  url.searchParams.set("metrics", metrics);
  url.searchParams.set("filters", `video==${cleanVid};audienceType==ORGANIC`);
  return url.toString();
}

/**
 * Derives approximate `[startSec, endSec]` boundaries for each segment in a `ShowSpec`
 * using `chapters` (`atSec`) when available or beat counts as a deterministic fallback.
 */
export function computeSegmentWindows(showSpec, totalDurationSec = null) {
  const segments = showSpec?.segments ?? [];
  const totalSec =
    Number.isFinite(totalDurationSec) && totalDurationSec > 0
      ? totalDurationSec
      : Number(showSpec?.estimatedDurationSec) || 600;

  if (segments.length === 0) {
    return [
      {
        id: showSpec?.id ?? "main",
        template: "story",
        world: showSpec?.world ?? "meadow",
        startSec: 0,
        endSec: totalSec
      }
    ];
  }

  const chapterStartBySeg = new Map();
  for (const ch of showSpec?.chapters ?? []) {
    const segId = ch.segmentId ?? ch.atSegment;
    if (segId && Number.isFinite(ch.atSec)) {
      chapterStartBySeg.set(segId, Number(ch.atSec));
    }
  }

  if (chapterStartBySeg.size === segments.length) {
    return segments.map((seg, idx) => {
      const startSec = chapterStartBySeg.get(seg.id) ?? 0;
      const nextSeg = segments[idx + 1];
      const endSec = nextSeg ? (chapterStartBySeg.get(nextSeg.id) ?? totalSec) : totalSec;
      return {
        id: seg.id,
        template: seg.template ?? "segment",
        world: seg.world ?? "meadow",
        startSec,
        endSec: Math.max(startSec + 1, endSec)
      };
    });
  }

  const weights = segments.map((seg) => Math.max(1, (seg.beats ?? []).length));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let accSec = 0;

  return segments.map((seg, idx) => {
    const startSec = accSec;
    const spanSec = idx === segments.length - 1 ? totalSec - accSec : (weights[idx] / weightSum) * totalSec;
    accSec += spanSec;
    return {
      id: seg.id,
      template: seg.template ?? "segment",
      world: seg.world ?? "meadow",
      startSec: Number(startSec.toFixed(2)),
      endSec: Number(Math.max(startSec + 1, accSec).toFixed(2))
    };
  });
}

/**
 * Maps aggregate `[elapsedVideoTimeRatio, audienceWatchRatio, relativeRetentionPerformance]`
 * curve rows onto `ShowSpec` segment boundaries and outputs calm, child-safe pacing notes.
 */
export function analyzeRetentionAgainstSegments(rows, segmentWindows, totalDurationSec = 600) {
  const cleanRows = (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      ratio: Number(r[0]),
      watchRatio: Number(r[1]),
      relativePerf: r.length > 2 ? Number(r[2]) : 0.5
    }))
    .filter((r) => Number.isFinite(r.ratio) && Number.isFinite(r.watchRatio))
    .sort((a, b) => a.ratio - b.ratio);

  const windows = Array.isArray(segmentWindows) && segmentWindows.length > 0
    ? segmentWindows
    : [{ id: "main", template: "story", world: "meadow", startSec: 0, endSec: totalDurationSec }];

  const segmentReports = [];
  const pacingNotes = [];

  for (const win of windows) {
    const r0 = win.startSec / totalDurationSec;
    const r1 = win.endSec / totalDurationSec;
    const inSeg = cleanRows.filter((pt) => pt.ratio >= r0 - 1e-6 && pt.ratio <= r1 + 1e-6);

    if (inSeg.length === 0) {
      segmentReports.push({
        segmentId: win.id,
        template: win.template,
        world: win.world,
        startSec: win.startSec,
        endSec: win.endSec,
        samples: 0,
        entryWatchRatio: null,
        exitWatchRatio: null,
        deltaWatchRatio: 0,
        meanRelativeRetention: null,
        classification: "insufficient-data"
      });
      continue;
    }

    const entry = inSeg[0].watchRatio;
    const exit = inSeg[inSeg.length - 1].watchRatio;
    const delta = Number((exit - entry).toFixed(4));
    const meanRel = Number(
      (inSeg.reduce((acc, p) => acc + p.relativePerf, 0) / inSeg.length).toFixed(4)
    );

    let classification = "steady";
    if (delta <= -0.08 || meanRel < 0.42) {
      classification = "dip";
      pacingNotes.push({
        segmentId: win.id,
        template: win.template,
        issue: `Retention dip (delta=${delta}, rel=${meanRel}) in ${win.id} (${win.template})`,
        briefGuidance:
          "Move the interactive PAUSE question or concrete prop reveal 1-2 beats earlier and trim abstract exposition; keep camera cut rate strictly within the calm age-band cap."
      });
    } else if (meanRel >= 0.58 && delta >= -0.03) {
      classification = "strong-hold";
      pacingNotes.push({
        segmentId: win.id,
        template: win.template,
        issue: `Strong calm engagement (delta=${delta}, rel=${meanRel}) in ${win.id} (${win.template})`,
        briefGuidance:
          "Preserve this segment's direct-address banter and gentle pause rhythm as a reference template for upcoming weekly briefs."
      });
    }

    segmentReports.push({
      segmentId: win.id,
      template: win.template,
      world: win.world,
      startSec: win.startSec,
      endSec: win.endSec,
      samples: inSeg.length,
      entryWatchRatio: Number(entry.toFixed(4)),
      exitWatchRatio: Number(exit.toFixed(4)),
      deltaWatchRatio: delta,
      meanRelativeRetention: meanRel,
      classification
    });
  }

  const avgWatchRatio =
    cleanRows.length > 0
      ? Number((cleanRows.reduce((s, r) => s + r.watchRatio, 0) / cleanRows.length).toFixed(4))
      : 0;

  return {
    privacyMode: "aggregate-elapsed-ratio-only",
    totalDurationSec,
    pointsAnalyzed: cleanRows.length,
    averageAudienceWatchRatio: avgWatchRatio,
    segments: segmentReports,
    pacingNotes
  };
}

async function tryLoadShowOrStory(id) {
  if (!id) return null;
  try {
    const req = getRootRequire();
    const { tsImport } = req("tsx/esm/api");
    const parentUrl = pathToFileURL(join(appDir, "package.json")).href;
    const showsIdx = join(appDir, "src", "content", "shows", "index.ts");
    if (existsSync(showsIdx)) {
      const showsMod = await tsImport("./src/content/shows/index.ts", parentUrl);
      const found = showsMod.showById
        ? showsMod.showById(id)
        : (showsMod.SHOWS ?? []).find((s) => s.id === id || s.code === id);
      if (found) return found;
    }
    const catalogMod = await tsImport("./src/content/catalog.ts", parentUrl);
    return catalogMod.storyById(id) ?? catalogMod.storyByCode(id) ?? null;
  } catch {
    return null;
  }
}

export async function runLearnAnalytics(options) {
  assertAggregateAnalyticsParams({
    dimensions: options.dimensions ?? ALLOWED_DIMENSIONS,
    metrics: options.metrics ?? "audienceWatchRatio,relativeRetentionPerformance"
  });

  const spec = options.showSpec ?? (await tryLoadShowOrStory(options.id));
  const totalDurationSec =
    Number(options.durationSec) ||
    Number(spec?.estimatedDurationSec) ||
    600;
  const windows = computeSegmentWindows(spec, totalDurationSec);

  let rawResponse = null;

  if (options.fromJson) {
    rawResponse = JSON.parse(readFileSync(resolve(options.fromJson), "utf8"));
  } else {
    const queryUrl = buildRetentionQueryUrl({
      videoId: options.videoId,
      startDate: options.startDate,
      endDate: options.endDate,
      dimensions: options.dimensions ?? ALLOWED_DIMENSIONS,
      metrics: options.metrics ?? "audienceWatchRatio,relativeRetentionPerformance"
    });

    if (options.dryRun) {
      return {
        mode: "dry-run",
        ok: true,
        queryUrl,
        segmentWindows: windows
      };
    }

    const accessToken = (options.env ?? process.env)?.YOUTUBE_OAUTH_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error(
        "EXTERNAL_BLOCKED: missing YOUTUBE_OAUTH_ACCESS_TOKEN (required to query YouTube Analytics API v2)."
      );
    }

    const resp = await fetch(queryUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`YouTube Analytics reports.query failed (${resp.status}): ${errText}`);
    }
    rawResponse = await resp.json();
  }

  // Verify returned columnHeaders also contain zero viewer/demographic columns.
  if (Array.isArray(rawResponse?.columnHeaders)) {
    for (const col of rawResponse.columnHeaders) {
      const name = String(col?.name ?? "");
      if (name !== ALLOWED_DIMENSIONS && !ALLOWED_METRICS.has(name)) {
        throw new Error(`PRIVACY_HARD_FAIL: unexpected column "${name}" in analytics payload.`);
      }
    }
  }

  const analysis = analyzeRetentionAgainstSegments(
    rawResponse?.rows ?? [],
    windows,
    totalDurationSec
  );

  if (options.outPath) {
    const resolvedOut = resolve(options.outPath);
    mkdirSync(dirname(resolvedOut), { recursive: true });
    writeFileSync(resolvedOut, JSON.stringify(analysis, null, 2) + "\n");
  }

  return {
    mode: options.fromJson ? "offline" : "live",
    ok: true,
    analysis
  };
}

function parseCliArgs(argv) {
  const opts = {
    id: null,
    videoId: null,
    fromJson: null,
    startDate: null,
    endDate: null,
    dimensions: ALLOWED_DIMENSIONS,
    metrics: "audienceWatchRatio,relativeRetentionPerformance",
    outPath: null,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--id" && argv[i + 1]) opts.id = argv[++i];
    else if (arg.startsWith("--id=")) opts.id = arg.slice("--id=".length);
    else if (arg === "--video-id" && argv[i + 1]) opts.videoId = argv[++i];
    else if (arg.startsWith("--video-id=")) opts.videoId = arg.slice("--video-id=".length);
    else if (arg === "--from-json" && argv[i + 1]) opts.fromJson = argv[++i];
    else if (arg.startsWith("--from-json=")) opts.fromJson = arg.slice("--from-json=".length);
    else if (arg === "--start-date" && argv[i + 1]) opts.startDate = argv[++i];
    else if (arg.startsWith("--start-date=")) opts.startDate = arg.slice("--start-date=".length);
    else if (arg === "--end-date" && argv[i + 1]) opts.endDate = argv[++i];
    else if (arg.startsWith("--end-date=")) opts.endDate = arg.slice("--end-date=".length);
    else if (arg === "--dimensions" && argv[i + 1]) opts.dimensions = argv[++i];
    else if (arg.startsWith("--dimensions=")) opts.dimensions = arg.slice("--dimensions=".length);
    else if (arg === "--metrics" && argv[i + 1]) opts.metrics = argv[++i];
    else if (arg.startsWith("--metrics=")) opts.metrics = arg.slice("--metrics=".length);
    else if (arg === "--out" && argv[i + 1]) opts.outPath = argv[++i];
    else if (arg.startsWith("--out=")) opts.outPath = arg.slice("--out=".length);
    else if (arg === "--dry-run") opts.dryRun = true;
  }

  return opts;
}

function isExecutedDirectly(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return fileURLToPath(metaUrl) === process.argv[1];
  }
}

if (isExecutedDirectly(import.meta.url)) {
  const cliOpts = parseCliArgs(process.argv.slice(2));
  runLearnAnalytics(cliOpts)
    .then((res) => {
      if (res.mode === "dry-run") {
        console.log(`[learn-analytics] dry-run query verified: ${res.queryUrl}`);
      } else {
        console.log(
          `[learn-analytics] analyzed ${res.analysis.pointsAnalyzed} points (avgWatchRatio=${res.analysis.averageAudienceWatchRatio}, notes=${res.analysis.pacingNotes.length})`
        );
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[learn-analytics] FAILED: ${err?.message ?? err}`);
      process.exit(1);
    });
}
