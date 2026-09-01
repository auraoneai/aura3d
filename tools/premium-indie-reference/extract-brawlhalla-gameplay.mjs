import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const outputImage = resolve(
  repositoryRoot,
  "tests/reports/_visual-critic-refs/ref-brawlhalla-gameplay-1.jpg",
);
const outputMetadata = resolve(
  repositoryRoot,
  "tests/reports/_visual-critic-refs/ref-brawlhalla-gameplay-1.provenance.json",
);
const workDirectory = mkdtempSync(resolve(tmpdir(), "aura3d-brawlhalla-gameplay-"));
const sourceVideo = resolve(workDirectory, "source.mp4");
const extractedFrame = resolve(workDirectory, "frame.jpg");

const videoId = "9NUOLq0By1o";
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const frameSeconds = 75;

try {
  execFileSync(
    "yt-dlp",
    [
      "--no-update",
      "--no-playlist",
      "--extractor-args",
      "youtube:player_client=android",
      "-f",
      "18",
      "-o",
      sourceVideo,
      videoUrl,
    ],
    { cwd: repositoryRoot, stdio: "inherit" },
  );

  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(frameSeconds),
      "-i",
      sourceVideo,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-y",
      extractedFrame,
    ],
    { cwd: repositoryRoot, stdio: "inherit" },
  );

  const imageBytes = readFileSync(extractedFrame);
  const sha256 = createHash("sha256").update(imageBytes).digest("hex");
  const sourceVideoBytes = readFileSync(sourceVideo);
  const sourceVideoSha256 = createHash("sha256")
    .update(sourceVideoBytes)
    .digest("hex");
  mkdirSync(dirname(outputImage), { recursive: true });
  copyFileSync(extractedFrame, outputImage);
  writeFileSync(
    outputMetadata,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        game: "Brawlhalla",
        productIdentity: {
          developer: "Blue Mammoth Games",
          publisher: "Ubisoft",
          steamAppId: 291550,
        },
        moment:
          "Summer Championship 2026 EU 1v1, Ahmet attacks Godly during live arena play",
        image:
          "tests/reports/_visual-critic-refs/ref-brawlhalla-gameplay-1.jpg",
        sha256: `sha256-${sha256}`,
        width: 640,
        height: 360,
        source: {
          kind: "official-youtube-gameplay-frame",
          url: videoUrl,
          originalUrl: videoUrl,
          pageUrl: videoUrl,
          videoId,
          title:
            "Ahmet vs Godly - Winners Final - Summer Championship 2026 - EU 1v1",
          channel: "Brawlhalla",
          channelId: "UCQ5k469r1kRZ10zvyxQsFCg",
          uploadDate: "2026-08-09",
          frameSeconds,
          downloadedVideoSha256: `sha256-${sourceVideoSha256}`,
          downloadedVideoSizeBytes: statSync(sourceVideo).size,
        },
        corroboration: {
          kind: "official-press-kit",
          pageUrl: "https://www.brawlhalla.com/presskit",
          archiveUrl:
            "https://www.dropbox.com/sh/x55accwsf0e44vd/AACPBOIU3I4fxu-Hw4mx2vsDa?dl=0",
          notes:
            "Brawlhalla's first-party press-kit link redirects to this Blue Mammoth Games Dropbox archive and identifies its screenshot folder as Brawlhalla gameplay.",
        },
        retrievedAt: new Date().toISOString(),
        generatedBy: "pnpm premium-indie:reference:brawlhalla-gameplay",
        licenseAndSourceNotes:
          "Copyright Blue Mammoth Games/Ubisoft. Retained only as a provenance-bound visual-comparison reference from Brawlhalla's official YouTube channel; no redistribution or ownership claim is made.",
        notes:
          "The frame is live two-fighter tournament gameplay with the normal side-view game camera, stage, stock portraits, clock, player labels, a readable attack trail, and both fighters visible. It replaces promotional key art that was not comparable to Aura Clash gameplay.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        outputImage,
        outputMetadata,
        sha256: `sha256-${sha256}`,
        frameSeconds,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}
