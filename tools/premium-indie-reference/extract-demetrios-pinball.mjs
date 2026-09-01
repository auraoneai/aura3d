import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const outputImage = resolve(
  repositoryRoot,
  "tests/reports/_visual-critic-refs/ref-demetrios-pinball-1.jpg",
);
const outputMetadata = resolve(
  repositoryRoot,
  "tests/reports/_visual-critic-refs/ref-demetrios-pinball-1.provenance.json",
);
const workDirectory = mkdtempSync(resolve(tmpdir(), "aura3d-demetrios-pinball-"));
const sourceVideo = resolve(workDirectory, "source.mp4");
const extractedFrame = resolve(workDirectory, "frame.jpg");

const videoId = "Ia4rqKHE1hc";
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const frameSeconds = 450;

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
  mkdirSync(dirname(outputImage), { recursive: true });
  copyFileSync(extractedFrame, outputImage);
  writeFileSync(
    outputMetadata,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        game: "Demetrios: The BIG Cynical Adventure",
        moment: "Chapter 5 pinball tombstone, active play",
        image: "tests/reports/_visual-critic-refs/ref-demetrios-pinball-1.jpg",
        sha256: `sha256-${sha256}`,
        width: 640,
        height: 360,
        source: {
          kind: "youtube-gameplay-frame",
          url: videoUrl,
          videoId,
          title: "#14| DEMETRIOS The BIG Cynical Adventure Gameplay Walkthrough | Graveyard | PC Full HD",
          channel: "Furo",
          frameSeconds,
        },
        corroboration: {
          kind: "named-screenshot-index",
          url: "https://www.mobygames.com/game/79712/demetrios-the-big-cynical-adventure/screenshots/playstation-4/1026509/",
          caption: "The pinball machine",
          galleryUrl: "https://www.mobygames.com/game/79712/demetrios-the-big-cynical-adventure/screenshots/",
        },
        retrievedAt: new Date().toISOString(),
        generatedBy: "pnpm premium-indie:reference:demetrios-pinball",
        notes:
          "The frame contains the actual Demetrios Chapter 5 tombstone pinball table. It is a visual-comparison reference only and is not an Aura3D-generated artifact.",
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
