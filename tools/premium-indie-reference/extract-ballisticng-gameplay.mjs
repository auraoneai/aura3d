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
  "tests/reports/_visual-critic-refs/ref-ballisticng-gameplay-1.jpg",
);
const outputMetadata = resolve(
  repositoryRoot,
  "tests/reports/_visual-critic-refs/ref-ballisticng-gameplay-1.provenance.json",
);
const workDirectory = mkdtempSync(resolve(tmpdir(), "aura3d-ballisticng-gameplay-"));
const sourceVideo = resolve(workDirectory, "source.mp4");
const extractedFrame = resolve(workDirectory, "frame.jpg");

const videoId = "e0vWr5aBqEU";
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const frameSeconds = 22.5;

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
        game: "BallisticNG",
        productIdentity: {
          developer: "Neognosis",
          publisher: "Neognosis",
          steamAppId: 473770,
        },
        moment:
          "upright live anti-gravity combat-racing frame with a visible rival, colored attack/trail read, coherent track depth, and the normal race HUD",
        image:
          "tests/reports/_visual-critic-refs/ref-ballisticng-gameplay-1.jpg",
        sha256: `sha256-${sha256}`,
        width: 640,
        height: 360,
        source: {
          kind: "official-developer-youtube-gameplay-frame",
          url: videoUrl,
          originalUrl: videoUrl,
          pageUrl: videoUrl,
          videoId,
          title: "BallisticNG 2023 Trailer",
          channel: "Von Snake",
          channelId: "UCxJ3wVvBXl8qRjRJakSqhvQ",
          uploadDate: "2023-11-22",
          frameSeconds,
          downloadedVideoSha256: `sha256-${sourceVideoSha256}`,
          downloadedVideoSizeBytes: statSync(sourceVideo).size,
        },
        corroboration: {
          kind: "official-developer-product-page-embed",
          pageUrl: "https://neognosis.games/",
          embeddedVideoUrl: `https://www.youtube.com/embed/${videoId}`,
          steamUrl: "https://store.steampowered.com/app/473770/BallisticNG/",
          notes:
            "Neognosis's first-party product page embeds this exact trailer and identifies BallisticNG as its anti-gravity combat racer.",
        },
        retrievedAt: new Date().toISOString(),
        generatedBy: "pnpm premium-indie:reference:ballisticng-gameplay",
        licenseAndSourceNotes:
          "Copyright Neognosis. Retained only as a provenance-bound visual-comparison reference from the developer's official product-page trailer; no redistribution or ownership claim is made.",
        comparisonScope: {
          comparableDimensions: [
            "foreground vehicle/rival readability",
            "combat or attack-state legibility",
            "environmental grounding and depth",
            "lighting and focal hierarchy",
            "HUD integration during live play",
          ],
          excludedDimensions: [
            "genre-specific mechanics",
            "mech articulation",
            "hangar or arena layout",
            "direct parity between racing and mech-combat cameras",
          ],
          notes:
            "BallisticNG is a combat racer, not a mech arena game. The pair is defensible only on the listed common presentation dimensions and must be returned as insufficient evidence for broader gameplay or genre parity.",
        },
        notes:
          "This replaces the unprovenanced, severely rolled/clipped local BallisticNG candidate with an upright live gameplay frame from a first-party trailer. A rival, attack/trail lines, track geometry, lap/position telemetry, and depth cues are visible without severe roll or edge clipping.",
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
