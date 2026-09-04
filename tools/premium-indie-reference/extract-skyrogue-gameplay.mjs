import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
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
  "tests/reports/_visual-critic-refs/ref-skyrogue-gameplay-1.jpg",
);
const outputMetadata = resolve(
  repositoryRoot,
  "tests/reports/_visual-critic-refs/ref-skyrogue-gameplay-1.provenance.json",
);
const workDirectory = mkdtempSync(resolve(tmpdir(), "aura3d-skyrogue-gameplay-"));
const sourceVideo = resolve(workDirectory, "source.mp4");
const extractedFrame = resolve(workDirectory, "frame.jpg");

const videoId = "iX-GDfniCXs";
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const frameSeconds = 60;

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
        game: "Sky Rogue",
        productIdentity: {
          developer: "Fractal Phase",
          publisher: "Fractal Phase",
          steamAppId: 381020,
        },
        moment: "Video Chums gameplay capture, frame at 60s",
        image: "tests/reports/_visual-critic-refs/ref-skyrogue-gameplay-1.jpg",
        sha256: `sha256-${sha256}`,
        width: 640,
        height: 360,
        source: {
          kind: "official-youtube-gameplay-frame",
          url: videoUrl,
          originalUrl: videoUrl,
          pageUrl: videoUrl,
          videoId,
          title: "Sky Rogue Gameplay | XboxOne Switch (Video Chums)",
          channel: "Video Chums",
          frameSeconds,
          downloadedVideoSha256: `sha256-${sourceVideoSha256}`,
          downloadedVideoSizeBytes: statSync(sourceVideo).size,
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote ${outputImage}`);
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}
