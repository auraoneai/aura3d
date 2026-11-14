// Remote ACR verification suite Part B (PRD 09 P1 Launch Episode S01E01):
// Renders complete 8-segment ~10-minute `s01e01-welcome-to-wonder-world` at 1080p30 + 6s offline play end card across
// multiple 3D worlds (`swapSegment`), mixes 48 kHz sample-exact audio (-14 LUFS) with chapters + SRT, generates live
// 1280x720 scene thumbnail, passes all 10 B.6 QC gates, builds the 11-item F.3 manifest (`pending-human`), verifies
// R14/F.3 hard-fail upload blocking when unsigned, and tests `--unpublish --dry-run`.
//
// Remote runner only: apps/veer-wonder-world/tools/remote-run.sh broadcast-p1-s01e01
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { APP_DIR, emitJson, emitShot, redact } from "./wonder-world-lib";

const repoDir = resolve(".");
const appDir = join(repoDir, APP_DIR);

function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): { status: number | null; out: string } {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: "1", AURA3D_REMOTE_ACR: "1" }
  });
  return {
    status: res.status,
    out: redact(`${res.stdout ?? ""}\n${res.stderr ?? ""}`)
  };
}

function ensureFfmpeg(): void {
  const probe = spawnSync("ffprobe", ["-version"], { encoding: "utf8" });
  const enc = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (probe.status === 0 && enc.status === 0) return;

  const update = spawnSync("apt-get", ["update", "-qq"], {
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" }
  });
  expect(update.status, `apt-get update failed: ${update.stderr ?? ""}`).toBe(0);

  const install = spawnSync(
    "apt-get",
    ["install", "-y", "-qq", "--no-install-recommends", "ffmpeg"],
    {
      encoding: "utf8",
      timeout: 300_000,
      env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" }
    }
  );
  expect(install.status, `apt-get install ffmpeg failed: ${install.stderr ?? ""}`).toBe(0);
}

test("P1 S01E01 Welcome to Wonder World full 1080p30 multi-world render, mix, thumbnail, 10-gate QC, and F.3 manifest", async () => {
  test.setTimeout(45 * 60_000);

  ensureFfmpeg();

  const build = runCmd(join(repoDir, "node_modules", ".bin", "vite"), ["build", appDir], repoDir, 10 * 60_000);
  expect(build.status, `vite build failed:\n${build.out.slice(-3000)}`).toBe(0);

  const showId = "s01e01-welcome-to-wonder-world";
  const outDir = join(appDir, "dist", "shows", showId);

  // 1. Render complete S01E01 8-segment multi-world 1080p30 video + 6s offline play end card.
  const renderRes = runCmd(
    "node",
    [
      join(appDir, "tools", "render-episode.mjs"),
      "--id",
      showId,
      "--out",
      outDir,
      "--fps",
      "30",
      "--locale",
      "en",
      "--aspect",
      "16:9"
    ],
    appDir,
    35 * 60_000
  );
  expect(renderRes.status, `S01E01 render failed:\n${renderRes.out.slice(-3500)}`).toBe(0);

  // 2. Mix 48 kHz sample-exact audio (-14 LUFS) + FFMETADATA1 chapters + .srt captions -> episode.mp4.
  const mixRes = runCmd("node", [join(appDir, "tools", "mix-episode.mjs"), "--dir", outDir], appDir, 5 * 60_000);
  expect(mixRes.status, `S01E01 mix failed:\n${mixRes.out.slice(-3500)}`).toBe(0);

  // 3. Render 1280x720 on-model scene thumbnail + calm brand title.
  const thumbPath = join(outDir, "thumbnail.png");
  const thumbRes = runCmd(
    "node",
    [join(appDir, "tools", "thumbnail.mjs"), "--id", showId, "--out", thumbPath],
    appDir,
    5 * 60_000
  );
  expect(thumbRes.status, `S01E01 thumbnail failed:\n${thumbRes.out.slice(-3500)}`).toBe(0);
  expect(existsSync(thumbPath), "S01E01 thumbnail.png exists").toBe(true);
  emitShot("s01e01-thumbnail", readFileSync(thumbPath), "png");

  // 4. Run all 10 B.6 QC gates -> qc.json.
  const qcRes = runCmd("node", [join(appDir, "tools", "qc-episode.mjs"), "--dir", outDir], appDir, 5 * 60_000);
  const qcJson = JSON.parse(readFileSync(join(outDir, "qc.json"), "utf8")) as Record<string, unknown>;
  emitJson("p1-s01e01-qc", qcJson);
  expect(qcRes.status, `S01E01 QC failed:\n${qcRes.out.slice(-3500)}`).toBe(0);
  expect(Boolean(qcJson["passed"] ?? qcJson["overallPassed"])).toBe(true);

  // 5. Build 11-item F.3 manifest (`pending-human`), verify unsigned `--upload` hard-fails, and test `--unpublish --dry-run`.
  const manifestRes = runCmd(
    "node",
    [join(appDir, "tools", "publish-youtube.mjs"), "--dir", outDir, "--build-manifest"],
    appDir,
    2 * 60_000
  );
  expect(manifestRes.status, `S01E01 --build-manifest failed:\n${manifestRes.out.slice(-2000)}`).toBe(0);

  const manifestJson = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8")) as Record<string, unknown>;
  emitJson("p1-s01e01-manifest", manifestJson);

  const unsignedUpload = runCmd(
    "node",
    [
      join(appDir, "tools", "publish-youtube.mjs"),
      "--dir",
      outDir,
      "--upload",
      "--dry-run",
      "--privacy",
      "private",
      "--publish-at",
      "2027-06-01T14:00:00Z"
    ],
    appDir,
    2 * 60_000
  );
  expect(unsignedUpload.status, "unsigned pending-human manifest must hard-fail upload").not.toBe(0);

  const unpubDry = runCmd(
    "node",
    [join(appDir, "tools", "publish-youtube.mjs"), "--unpublish", "dryrun-video-001", "--dry-run"],
    appDir,
    2 * 60_000
  );
  expect(unpubDry.status, `--unpublish --dry-run failed:\n${unpubDry.out.slice(-2000)}`).toBe(0);

  const eventsJson = JSON.parse(readFileSync(join(outDir, "events.json"), "utf8")) as Record<string, unknown>;
  const srtText = readFileSync(join(outDir, "captions.en.srt"), "utf8");
  emitJson("p1-s01e01-summary", {
    frameCount: eventsJson["frameCount"],
    storyFrameCount: eventsJson["storyFrameCount"],
    endCardFrameCount: eventsJson["endCardFrameCount"],
    durationMs: eventsJson["durationMs"],
    traceHash: eventsJson["traceHash"],
    eventCount: Array.isArray(eventsJson["events"]) ? eventsJson["events"].length : 0,
    srtCuePreview: srtText.slice(0, 1200)
  });

  const endCardPath = join(outDir, "end-card.png");
  if (existsSync(endCardPath)) {
    emitShot("s01e01-endcard", readFileSync(endCardPath), "png");
  }
  const kfs = readdirSync(join(outDir, "keyframes")).sort();
  for (const frac of [0.1, 0.4, 0.75]) {
    const kf = kfs[Math.min(kfs.length - 1, Math.floor(kfs.length * frac))];
    if (kf) {
      emitShot(`s01e01-kf-${Math.round(frac * 100)}`, readFileSync(join(outDir, "keyframes", kf)), "jpg");
    }
  }
});
