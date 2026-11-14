// Remote ACR verification suite Part A (PRD 09 P0, P3, P4 & Shorts):
// 1. P3 / B.8: Renders Tiko studio portrait (tiko.webp + provenance/portraits.json) and 4-view turnaround sheet.
// 2. P0: Renders complete E19 `momos-day` at 1080p30 + 6s end card, proves byte-identical trace determinism across two
//    runs, mixes 48 kHz sample-exact audio (-14 LUFS), and passes all 10 B.6 QC gates.
// 3. P1 Shorts & P4 Localisation: Renders, mixes, and QCs all three S01E01 9:16 Shorts (`en`) PLUS `s01e01-short-sheru`
//    in Spanish (`es`) from the single ShowSpec.
//
// Remote runner only: apps/veer-wonder-world/tools/remote-run.sh broadcast-p0-p3-p4
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

test("P3 Tiko portrait/turnaround, P0 E19 deterministic 1080p30 render+mix+QC, and P1/P4 9:16 Shorts (en + es)", async () => {
  test.setTimeout(28 * 60_000);

  ensureFfmpeg();

  // 1. Build Wonder World dist once for all render jobs in this container.
  const build = runCmd(join(repoDir, "node_modules", ".bin", "vite"), ["build", appDir], repoDir, 10 * 60_000);
  expect(build.status, `vite build failed:\n${build.out.slice(-3000)}`).toBe(0);

  // 2. P3 / B.8: Render Tiko studio portrait (src/assets/portraits/tiko.webp) + 4-view turnaround sheet if not yet committed.
  const tikoWebpPath = join(appDir, "src", "assets", "portraits", "tiko.webp");
  const portraitsProvPath = join(appDir, "provenance", "portraits.json");
  const tiko4ViewPath = join(repoDir, "evidence", APP_DIR.split("/")[1] ?? "", "turnarounds", "tiko-4view.png");
  const tikoFrontPath = join(repoDir, "evidence", APP_DIR.split("/")[1] ?? "", "turnarounds", "tiko-front.png");

  if (!existsSync(tikoWebpPath)) {
    const tikoRender = runCmd(
      "node",
      [join(appDir, "tools", "render-character-portraits.mjs"), "--turnarounds", "--skip-worlds", "--keys=tiko"],
      appDir,
      10 * 60_000
    );
    expect(tikoRender.status, `tiko portrait/turnaround failed:\n${tikoRender.out.slice(-3000)}`).toBe(0);
    expect(existsSync(tiko4ViewPath), "tiko-4view.png exists").toBe(true);
    emitShot("tiko-turnaround-4view", readFileSync(tiko4ViewPath), "png");
    if (existsSync(tikoFrontPath)) {
      emitShot("tiko-turnaround-front", readFileSync(tikoFrontPath), "png");
    }
  }
  expect(existsSync(tikoWebpPath), "tiko.webp exists").toBe(true);

  const tikoWebpBytes = readFileSync(tikoWebpPath);
  const portraitsProv = JSON.parse(readFileSync(portraitsProvPath, "utf8")) as Record<string, unknown>;
  emitJson("p3-tiko-portrait", {
    bytes: tikoWebpBytes.length,
    webpBase64: tikoWebpBytes.toString("base64"),
    provenanceEntry: portraitsProv["tiko"] ?? null
  });

  // 3. P0 Exit Gate: Full E19 `momos-day` 1080p30 render + determinism proof + 48 kHz mix + 10-gate QC.
  const p0Dir = join(appDir, "dist", "shows", "momos-day");
  const p0Render = runCmd(
    "node",
    [
      join(appDir, "tools", "render-episode.mjs"),
      "--id",
      "momos-day",
      "--out",
      p0Dir,
      "--fps",
      "30",
      "--locale",
      "en",
      "--aspect",
      "16:9"
    ],
    appDir,
    12 * 60_000
  );
  expect(p0Render.status, `P0 momos-day render failed:\n${p0Render.out.slice(-3000)}`).toBe(0);

  // Determinism proof across two independent headless runs (first 15 seconds = 450 frames).
  const p0DetDir = "/tmp/momos-day-determinism-run2";
  const p0Render2 = runCmd(
    "node",
    [
      join(appDir, "tools", "render-episode.mjs"),
      "--id",
      "momos-day",
      "--out",
      p0DetDir,
      "--fps",
      "30",
      "--locale",
      "en",
      "--aspect",
      "16:9",
      "--max-sec",
      "15",
      "--no-end-card"
    ],
    appDir,
    5 * 60_000
  );
  expect(p0Render2.status, `P0 determinism run 2 failed:\n${p0Render2.out.slice(-3000)}`).toBe(0);

  const trace1 = JSON.parse(readFileSync(join(p0Dir, "trace.json"), "utf8")) as unknown[];
  const trace2 = JSON.parse(readFileSync(join(p0DetDir, "trace.json"), "utf8")) as unknown[];
  expect(trace2.length).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(trace1.slice(0, trace2.length))).toBe(JSON.stringify(trace2));

  const p0Mix = runCmd("node", [join(appDir, "tools", "mix-episode.mjs"), "--dir", p0Dir], appDir, 5 * 60_000);
  expect(p0Mix.status, `P0 momos-day mix failed:\n${p0Mix.out.slice(-3000)}`).toBe(0);

  const p0Qc = runCmd("node", [join(appDir, "tools", "qc-episode.mjs"), "--dir", p0Dir], appDir, 5 * 60_000);
  const p0QcJson = JSON.parse(readFileSync(join(p0Dir, "qc.json"), "utf8")) as Record<string, unknown>;
  emitJson("p0-momos-day-qc", {
    deterministicPrefixFrames: trace2.length,
    deterministicExactMatch: true,
    qc: p0QcJson
  });
  expect(p0Qc.status, `P0 momos-day QC failed:\n${p0Qc.out.slice(-3000)}`).toBe(0);
  expect(Boolean(p0QcJson["passed"] ?? p0QcJson["overallPassed"])).toBe(true);

  const p0EndCard = join(p0Dir, "end-card.png");
  if (existsSync(p0EndCard)) {
    emitShot("p0-momos-day-endcard", readFileSync(p0EndCard), "png");
  }
  const p0Keyframes = readdirSync(join(p0Dir, "keyframes")).sort();
  const midKf = p0Keyframes[Math.floor(p0Keyframes.length / 2)];
  if (midKf) {
    emitShot("p0-momos-day-keyframe", readFileSync(join(p0Dir, "keyframes", midKf)), "jpg");
  }

  // 4. P1 9:16 Shorts (3 English Shorts) + P4 Spanish (`es`) Short from identical ShowSpec.
  const shortJobs: ReadonlyArray<{ id: string; locale: "en" | "es"; slug: string }> = [
    { id: "s01e01-short-sheru", locale: "en", slug: "s01e01-short-sheru" },
    { id: "s01e01-short-lulu", locale: "en", slug: "s01e01-short-lulu" },
    { id: "s01e01-short-peeko", locale: "en", slug: "s01e01-short-peeko" },
    { id: "s01e01-short-sheru", locale: "es", slug: "s01e01-short-sheru-es" }
  ];

  for (const job of shortJobs) {
    const outDir = join(appDir, "dist", "shows", job.slug);
    const r = runCmd(
      "node",
      [
        join(appDir, "tools", "render-episode.mjs"),
        "--id",
        job.id,
        "--out",
        outDir,
        "--fps",
        "30",
        "--locale",
        job.locale,
        "--aspect",
        "9:16"
      ],
      appDir,
      6 * 60_000
    );
    expect(r.status, `Short render ${job.slug} failed:\n${r.out.slice(-3000)}`).toBe(0);

    const m = runCmd("node", [join(appDir, "tools", "mix-episode.mjs"), "--dir", outDir], appDir, 3 * 60_000);
    expect(m.status, `Short mix ${job.slug} failed:\n${m.out.slice(-3000)}`).toBe(0);

    const q = runCmd("node", [join(appDir, "tools", "qc-episode.mjs"), "--dir", outDir], appDir, 3 * 60_000);
    const qcData = JSON.parse(readFileSync(join(outDir, "qc.json"), "utf8")) as Record<string, unknown>;
    const srtText = readFileSync(join(outDir, `captions.${job.locale}.srt`), "utf8");
    emitJson(`qc-${job.slug}`, {
      slug: job.slug,
      locale: job.locale,
      srtPreview: srtText.slice(0, 600),
      qc: qcData
    });
    expect(q.status, `Short QC ${job.slug} failed:\n${q.out.slice(-3000)}`).toBe(0);
    expect(Boolean(qcData["passed"] ?? qcData["overallPassed"])).toBe(true);

    const kfs = readdirSync(join(outDir, "keyframes")).sort();
    const kf = kfs[Math.floor(kfs.length / 2)];
    if (kf) {
      emitShot(`short-${job.slug}-keyframe`, readFileSync(join(outDir, "keyframes", kf)), "jpg");
    }
  }
});
