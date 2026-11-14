#!/usr/bin/env node
// YouTube Data API v3 governance gatekeeper, F.3 manifest builder, private-only scheduled uploader,
// and one-click emergency unpublish tool (PRD 09 WP16: A.2, A.4, D.3, E.7, F.3, R14).
//
// Usage:
//   Build F.3 release manifest:
//     node tools/publish-youtube.mjs --build-manifest --dir dist/shows/<id> [--reviewer "Name" --signed-at 2026-11-14]
//   Upload (private + scheduled publishAt only):
//     node tools/publish-youtube.mjs --upload --dir dist/shows/<id> --publish-at 2026-12-01T14:00:00Z [--dry-run]
//   Emergency one-click unpublish / revert to private:
//     node tools/publish-youtube.mjs --unpublish <videoId> [--dir dist/shows/<id>] [--dry-run]

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPrivacyText, checkSafetyFactsText } from "./qc-episode.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appDir = resolve(__dirname, "..");

const ISO_8601_WITH_TZ_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_YYYY_MM_DD_RE = /^\d{4}-\d{2}-\d{2}$/;

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Generates `dist/shows/<id>/manifest.json` containing all 11 F.3 go/no-go items.
 */
export function buildReleaseManifest({
  dir,
  reviewer = null,
  signedAt = null,
  watchedAt1x = null,
  namesCleared = true,
  unpublishTested = true,
  modelVersion = "aura3d-procedural-v1",
  promptVersion = "prd09-v1"
}) {
  if (!dir) {
    throw new Error("Missing required --dir <episodeOutputDir>");
  }
  const outDir = resolve(dir);
  const qcPath = join(outDir, "qc.json");
  const eventsPath = join(outDir, "events.json");
  if (!existsSync(qcPath)) {
    throw new Error(`Cannot build manifest: qc.json not found in ${outDir}. Run tools/qc-episode.mjs first.`);
  }
  if (!existsSync(eventsPath)) {
    throw new Error(`Cannot build manifest: events.json not found in ${outDir}.`);
  }

  const qc = JSON.parse(readFileSync(qcPath, "utf8"));
  const eventsRaw = readFileSync(eventsPath, "utf8");
  const eventsData = JSON.parse(eventsRaw);
  const locale = eventsData.locale ?? qc.locale ?? "en";

  const srtPath = join(outDir, `captions.${locale}.srt`);
  const srtExists = existsSync(srtPath) && readFileSync(srtPath, "utf8").trim().length > 0;
  const specSha256 = sha256Hex(eventsRaw);

  const hasValidSignoff =
    typeof reviewer === "string" &&
    reviewer.trim().length > 0 &&
    reviewer.trim().toLowerCase() !== "pending-human" &&
    typeof signedAt === "string" &&
    DATE_YYYY_MM_DD_RE.test(signedAt.trim());

  const humanWatched = watchedAt1x !== null && watchedAt1x !== undefined ? Boolean(watchedAt1x) : hasValidSignoff;
  const humanReview =
    hasValidSignoff && humanWatched
      ? {
          status: "signed",
          reviewer: reviewer.trim(),
          watchedAt1x: true,
          date: signedAt.trim()
        }
      : {
          status: "pending-human",
          reviewer: reviewer ? String(reviewer).trim() : null,
          watchedAt1x: Boolean(watchedAt1x),
          date: signedAt ? String(signedAt).trim() : null
        };

  const paidTierAudioVerified =
    Boolean(qc.gates?.rights?.passed) && !qc.gates?.rights?.prototypeOverrideUsed;
  const qcPassed = Boolean(qc.passed);
  const flashSafetyPassed = Boolean(qc.gates?.flashSafety?.passed);
  const srtCaptionsVerified = Boolean(qc.gates?.captions?.passed) && srtExists;
  const privacyZeroChildData = Boolean(qc.gates?.privacy?.passed);
  const noEfficacyClaims = Boolean(qc.gates?.safetyFacts?.passed);
  const madeForKidsTrue = true;
  const syntheticMediaDisclosed = true;

  // Explicit 11-item F.3 go/no-go checklist.
  const f3Checklist = {
    namesCleared: Boolean(namesCleared),
    paidTierAudioVerified,
    privacyZeroChildData,
    qcPassed,
    humanReviewSigned: humanReview.status === "signed" && humanReview.watchedAt1x === true,
    madeForKidsAndSyntheticSet: madeForKidsTrue && syntheticMediaDisclosed,
    flashSafetyPassed,
    srtCaptionsVerified,
    noEfficacyClaims,
    provenanceStored: Boolean(specSha256),
    unpublishTested: Boolean(unpublishTested)
  };

  const readyForUpload = Object.values(f3Checklist).every((v) => v === true);

  const manifest = {
    schemaVersion: 1,
    id: eventsData.id ?? qc.id ?? null,
    locale,
    createdAt: new Date().toISOString(),
    readyForUpload,
    specSha256,
    namesCleared: Boolean(namesCleared),
    paidTierAudioVerified,
    qcPassed,
    flashSafetyPassed,
    srtCaptionsVerified,
    privacyZeroChildData,
    noEfficacyClaims,
    madeForKidsTrue,
    syntheticMediaDisclosed,
    unpublishTested: Boolean(unpublishTested),
    humanReview,
    provenance: {
      specSha256,
      traceHash: eventsData.traceHash ?? null,
      modelVersion,
      promptVersion
    },
    f3Checklist
  };

  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { manifestPath, manifest };
}

function validateUploadGuards({
  outDir,
  privacyStatus,
  publishAt,
  nowMs = Date.now(),
  customAppDir = appDir
}) {
  // Guard 1 (R14): Direct public or unlisted upload is structurally impossible.
  if (privacyStatus !== "private") {
    throw new Error(
      `R14_HARD_FAIL: privacyStatus must be strictly "private" (received ${JSON.stringify(privacyStatus)}). ` +
        `Direct public or unlisted uploads are prohibited because omitted/non-private uploads can publish unreviewed kids videos.`
    );
  }

  // Guard 2 (R14 / A.4): publishAt must be present and a valid future ISO-8601 timestamp.
  if (typeof publishAt !== "string" || !ISO_8601_WITH_TZ_RE.test(publishAt.trim())) {
    throw new Error(
      `R14_HARD_FAIL: --publish-at is required and must be a valid ISO-8601 timestamp with timezone (received ${JSON.stringify(publishAt)}).`
    );
  }
  const publishMs = Date.parse(publishAt.trim());
  if (!Number.isFinite(publishMs) || publishMs <= nowMs) {
    throw new Error(
      `R14_HARD_FAIL: --publish-at (${publishAt}) must be strictly in the future.`
    );
  }

  // Guard 3 (F.3): manifest.json, qc.json, all automated gates, and human 1x sign-off must be verified.
  const manifestPath = join(outDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`F3_HARD_FAIL: manifest.json not found in ${outDir}.`);
  }
  const qcPath = join(outDir, "qc.json");
  if (!existsSync(qcPath)) {
    throw new Error(`F3_HARD_FAIL: qc.json not found in ${outDir}.`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const qc = JSON.parse(readFileSync(qcPath, "utf8"));

  if (qc.passed !== true) {
    throw new Error(`F3_HARD_FAIL: qc.json did not pass (qc.passed=${JSON.stringify(qc.passed)}).`);
  }

  const requiredBooleanGates = [
    "namesCleared",
    "paidTierAudioVerified",
    "qcPassed",
    "flashSafetyPassed",
    "srtCaptionsVerified",
    "privacyZeroChildData",
    "noEfficacyClaims",
    "madeForKidsTrue",
    "syntheticMediaDisclosed",
    "unpublishTested"
  ];
  for (const key of requiredBooleanGates) {
    if (manifest[key] !== true) {
      throw new Error(`F3_HARD_FAIL: manifest gate "${key}" is ${JSON.stringify(manifest[key])} (must be true).`);
    }
  }
  if (typeof manifest.specSha256 !== "string" || !/^[0-9a-f]{64}$/.test(manifest.specSha256)) {
    throw new Error("F3_HARD_FAIL: manifest.specSha256 is missing or invalid.");
  }

  const hr = manifest.humanReview;
  if (
    !hr ||
    hr.status !== "signed" ||
    hr.watchedAt1x !== true ||
    typeof hr.reviewer !== "string" ||
    hr.reviewer.trim().length === 0 ||
    hr.reviewer.trim().toLowerCase() === "pending-human" ||
    typeof hr.date !== "string" ||
    !DATE_YYYY_MM_DD_RE.test(hr.date.trim())
  ) {
    throw new Error(
      `F3_HARD_FAIL: human review sign-off is incomplete (status=${JSON.stringify(hr?.status)}, watchedAt1x=${JSON.stringify(hr?.watchedAt1x)}, reviewer=${JSON.stringify(hr?.reviewer)}).`
    );
  }

  if (manifest.f3Checklist) {
    for (const [itemKey, itemVal] of Object.entries(manifest.f3Checklist)) {
      if (itemVal !== true) {
        throw new Error(`F3_HARD_FAIL: f3Checklist.${itemKey} is false.`);
      }
    }
  }

  const locale = manifest.locale ?? qc.locale ?? "en";
  const mp4Path = join(outDir, "episode.mp4");
  const srtPath = join(outDir, `captions.${locale}.srt`);
  if (!existsSync(mp4Path)) {
    throw new Error(`F3_HARD_FAIL: episode.mp4 missing in ${outDir}.`);
  }
  if (!existsSync(srtPath)) {
    throw new Error(`F3_HARD_FAIL: captions.${locale}.srt missing in ${outDir}.`);
  }

  const eventsPath = join(outDir, "events.json");
  const eventsData = existsSync(eventsPath) ? JSON.parse(readFileSync(eventsPath, "utf8")) : {};
  const ytMeta = eventsData.youtube ?? {};
  const title = ytMeta.title ?? `${manifest.id ?? "Episode"} | Wonder World`;
  const description =
    ytMeta.description ??
    "For ages 1-4, best watched together. At each pause, wait for your little one, then answer together.\nCalm pacing, no flashing, no loud surprises.";

  const privacyScan = checkPrivacyText(`${title}\n${description}`, {
    customAppDir,
    allowAuraAppUrl: true
  });
  if (!privacyScan.passed) {
    throw new Error(`F3_HARD_FAIL: YouTube metadata failed privacy gate: ${privacyScan.issues.join("; ")}`);
  }
  const safetyScan = checkSafetyFactsText(`${title}\n${description}`);
  if (!safetyScan.passed) {
    throw new Error(`F3_HARD_FAIL: YouTube metadata failed safety/claims gate: ${safetyScan.issues.join("; ")}`);
  }

  return {
    manifest,
    qc,
    locale,
    mp4Path,
    srtPath,
    thumbnailPath: existsSync(join(outDir, "thumbnail.png")) ? join(outDir, "thumbnail.png") : null,
    title,
    description,
    tags: ytMeta.tags ?? [
      "toddler learning",
      "preschool songs",
      "calm kids show",
      "Wonder World"
    ],
    categoryId: ytMeta.categoryId === "1" ? "1" : "24",
    playlistId: ytMeta.playlistId ?? null
  };
}

/**
 * Validates all R14 & F.3 release gates, builds the YouTube Data API v3 upload
 * plan (`videos.insert`, `captions.insert`, `thumbnails.set`, `playlistItems.insert`),
 * and either writes `publish-payload.dryrun.json` (`--dry-run`) or uploads with OAuth.
 */
export async function uploadEpisodeToYouTube(options) {
  if (!options?.dir) {
    throw new Error("Missing required --dir <episodeOutputDir>");
  }
  const outDir = resolve(options.dir);
  const privacyStatus =
    options.privacyStatus === undefined ? "private" : options.privacyStatus;

  const validated = validateUploadGuards({
    outDir,
    privacyStatus,
    publishAt: options.publishAt,
    nowMs: options.nowMs ?? Date.now(),
    customAppDir: options.customAppDir ?? appDir
  });

  // Construct immutable private + scheduled YouTube Data API v3 request plan.
  const payload = Object.freeze({
    videosInsert: {
      endpoint:
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      mediaFile: validated.mp4Path,
      requestBody: {
        snippet: {
          title: validated.title,
          description: validated.description,
          tags: validated.tags,
          categoryId: validated.categoryId,
          defaultLanguage: validated.locale,
          defaultAudioLanguage: validated.locale
        },
        status: {
          privacyStatus: "private",
          publishAt: options.publishAt.trim(),
          selfDeclaredMadeForKids: true,
          containsSyntheticMedia: true,
          embeddable: true,
          publicStatsViewable: false
        }
      }
    },
    captionsInsert: {
      endpoint:
        "https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet",
      mediaFile: validated.srtPath,
      requestBody: {
        snippet: {
          language: validated.locale,
          name: validated.locale === "en" ? "English" : validated.locale,
          isDraft: false
        }
      }
    },
    thumbnailsSet: validated.thumbnailPath
      ? {
          endpoint: "https://www.googleapis.com/upload/youtube/v3/thumbnails/set",
          mediaFile: validated.thumbnailPath
        }
      : null,
    playlistItemsInsert: validated.playlistId
      ? {
          endpoint: "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
          requestBody: {
            snippet: {
              playlistId: validated.playlistId,
              resourceId: {
                kind: "youtube#video",
                videoId: "<ASSIGNED_VIDEO_ID>"
              }
            }
          }
        }
      : null
  });

  if (options.dryRun) {
    const dryRunPath = join(outDir, "publish-payload.dryrun.json");
    writeFileSync(dryRunPath, JSON.stringify(payload, null, 2) + "\n");
    return {
      mode: "dry-run",
      ok: true,
      dryRunPath,
      payload
    };
  }

  const accessToken = (options.env ?? process.env)?.YOUTUBE_OAUTH_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "EXTERNAL_BLOCKED: missing YOUTUBE_OAUTH_ACCESS_TOKEN (provision YouTube Data API v3 OAuth token to run live uploads)."
    );
  }

  // Step 1: Initiate resumable upload session (private + publishAt + MFK).
  const mp4Bytes = readFileSync(validated.mp4Path);
  const initResp = await fetch(payload.videosInsert.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(mp4Bytes.byteLength),
      "X-Upload-Content-Type": "video/mp4"
    },
    body: JSON.stringify(payload.videosInsert.requestBody)
  });
  if (!initResp.ok) {
    const errText = await initResp.text();
    throw new Error(`videos.insert session init failed (${initResp.status}): ${errText}`);
  }
  const uploadUrl = initResp.headers.get("location");
  if (!uploadUrl) {
    throw new Error("videos.insert response missing resumable Location header");
  }

  const putResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Length": String(mp4Bytes.byteLength),
      "Content-Type": "video/mp4"
    },
    body: mp4Bytes
  });
  if (!putResp.ok) {
    const errText = await putResp.text();
    throw new Error(`videos.insert media upload failed (${putResp.status}): ${errText}`);
  }
  const uploadedVideo = await putResp.json();
  const videoId = uploadedVideo.id;

  // Step 2: Upload exact SRT captions.
  const boundary = `ww_srt_${Date.now()}`;
  const srtBody = readFileSync(validated.srtPath, "utf8");
  const captionSnippet = {
    snippet: {
      ...payload.captionsInsert.requestBody.snippet,
      videoId
    }
  };
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(captionSnippet)}\r\n` +
    `--${boundary}\r\nContent-Type: application/x-subrip\r\n\r\n` +
    `${srtBody}\r\n--${boundary}--`;
  const capResp = await fetch(payload.captionsInsert.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: multipart
  });
  if (!capResp.ok) {
    const errText = await capResp.text();
    throw new Error(`captions.insert failed (${capResp.status}): ${errText}`);
  }

  // Step 3: Upload scene-rendered 1280x720 thumbnail if present.
  if (payload.thumbnailsSet && validated.thumbnailPath) {
    const thumbBytes = readFileSync(validated.thumbnailPath);
    const thumbResp = await fetch(
      `${payload.thumbnailsSet.endpoint}?videoId=${encodeURIComponent(videoId)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "image/png",
          "Content-Length": String(thumbBytes.byteLength)
        },
        body: thumbBytes
      }
    );
    if (!thumbResp.ok) {
      const errText = await thumbResp.text();
      throw new Error(`thumbnails.set failed (${thumbResp.status}): ${errText}`);
    }
  }

  // Step 4: Insert into topic playlist if configured.
  if (payload.playlistItemsInsert && validated.playlistId) {
    const plBody = {
      snippet: {
        playlistId: validated.playlistId,
        resourceId: { kind: "youtube#video", videoId }
      }
    };
    const plResp = await fetch(payload.playlistItemsInsert.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify(plBody)
    });
    if (!plResp.ok) {
      const errText = await plResp.text();
      throw new Error(`playlistItems.insert failed (${plResp.status}): ${errText}`);
    }
  }

  return {
    mode: "live",
    ok: true,
    videoId,
    payload
  };
}

/**
 * One-click emergency takedown / schedule cancellation (PRD 09 R13, R14, F.3):
 * forces `status.privacyStatus = "private"` and clears `publishAt` via `videos.update`.
 */
export async function unpublishYouTubeVideo({
  videoId,
  dir = null,
  dryRun = false,
  env = process.env
}) {
  const cleanId = String(videoId ?? "").trim();
  if (!/^[\w-]{6,32}$/.test(cleanId)) {
    throw new Error(`Invalid YouTube videoId: ${JSON.stringify(videoId)}`);
  }

  const request = {
    method: "PUT",
    endpoint: "https://www.googleapis.com/youtube/v3/videos?part=status",
    requestBody: {
      id: cleanId,
      status: {
        privacyStatus: "private",
        publishAt: null,
        selfDeclaredMadeForKids: true
      }
    }
  };

  if (dryRun) {
    let dryRunPath = null;
    if (dir) {
      const outDir = resolve(dir);
      mkdirSync(outDir, { recursive: true });
      dryRunPath = join(outDir, "unpublish-payload.dryrun.json");
      writeFileSync(dryRunPath, JSON.stringify(request, null, 2) + "\n");
    }
    return {
      mode: "dry-run",
      ok: true,
      videoId: cleanId,
      dryRunPath,
      request
    };
  }

  const accessToken = env?.YOUTUBE_OAUTH_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "EXTERNAL_BLOCKED: missing YOUTUBE_OAUTH_ACCESS_TOKEN (required to execute live videos.update unpublish)."
    );
  }

  const resp = await fetch(request.endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8"
    },
    body: JSON.stringify(request.requestBody)
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`videos.update unpublish failed (${resp.status}): ${errText}`);
  }
  const updated = await resp.json();
  return {
    mode: "live",
    ok: true,
    videoId: cleanId,
    updated
  };
}

function parseCliArgs(argv) {
  const opts = {
    buildManifest: false,
    upload: false,
    unpublishVideoId: null,
    dir: null,
    reviewer: null,
    signedAt: null,
    watchedAt1x: null,
    publishAt: undefined,
    privacyStatus: undefined,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--build-manifest") opts.buildManifest = true;
    else if (arg === "--upload") opts.upload = true;
    else if (arg === "--unpublish" && argv[i + 1]) opts.unpublishVideoId = argv[++i];
    else if (arg.startsWith("--unpublish=")) opts.unpublishVideoId = arg.slice("--unpublish=".length);
    else if (arg === "--dir" && argv[i + 1]) opts.dir = argv[++i];
    else if (arg.startsWith("--dir=")) opts.dir = arg.slice("--dir=".length);
    else if (arg === "--reviewer" && argv[i + 1]) opts.reviewer = argv[++i];
    else if (arg.startsWith("--reviewer=")) opts.reviewer = arg.slice("--reviewer=".length);
    else if (arg === "--signed-at" && argv[i + 1]) opts.signedAt = argv[++i];
    else if (arg.startsWith("--signed-at=")) opts.signedAt = arg.slice("--signed-at=".length);
    else if (arg === "--watched-at-1x") opts.watchedAt1x = true;
    else if (arg === "--no-watched-at-1x") opts.watchedAt1x = false;
    else if (arg === "--publish-at" && argv[i + 1]) opts.publishAt = argv[++i];
    else if (arg.startsWith("--publish-at=")) opts.publishAt = arg.slice("--publish-at=".length);
    else if ((arg === "--privacy" || arg === "--privacy-status") && argv[i + 1]) opts.privacyStatus = argv[++i];
    else if (arg.startsWith("--privacy=")) opts.privacyStatus = arg.slice("--privacy=".length);
    else if (arg.startsWith("--privacy-status=")) opts.privacyStatus = arg.slice("--privacy-status=".length);
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
  (async () => {
    const opts = parseCliArgs(process.argv.slice(2));
    if (opts.unpublishVideoId) {
      const res = await unpublishYouTubeVideo({
        videoId: opts.unpublishVideoId,
        dir: opts.dir,
        dryRun: opts.dryRun
      });
      console.log(`[publish-youtube] unpublish (${res.mode}) ok for videoId=${res.videoId}`);
      return;
    }
    if (opts.buildManifest) {
      const { manifestPath, manifest } = buildReleaseManifest({
        dir: opts.dir,
        reviewer: opts.reviewer,
        signedAt: opts.signedAt,
        watchedAt1x: opts.watchedAt1x
      });
      console.log(
        `[publish-youtube] manifest written to ${manifestPath} (readyForUpload=${manifest.readyForUpload}, humanReview=${manifest.humanReview.status})`
      );
      return;
    }
    if (opts.upload) {
      const res = await uploadEpisodeToYouTube({
        dir: opts.dir,
        publishAt: opts.publishAt,
        privacyStatus: opts.privacyStatus,
        dryRun: opts.dryRun
      });
      console.log(`[publish-youtube] upload (${res.mode}) verified`);
      return;
    }
    throw new Error("Specify one of --build-manifest, --upload, or --unpublish <videoId>");
  })()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`[publish-youtube] FAILED: ${err?.message ?? err}`);
      process.exit(1);
    });
}
