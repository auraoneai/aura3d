import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build } from "esbuild";

const outputPath = resolve("tests/reports/audio-backend-bakeoff/report.json");
const externalAudit = JSON.parse(readFileSync("tests/reports/external-candidate-package-audit.json", "utf8"));
const chrome = JSON.parse(readFileSync("tests/reports/audio-chrome.json", "utf8"));
const webkit = JSON.parse(readFileSync("tests/reports/audio-webkit.json", "utf8"));
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n");
const consumers = tracked.filter((path) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(path) && !path.startsWith("tests/reports/") && readFileSync(path, "utf8").includes("@aura3d/audio"));
const contextConstructors = tracked.filter((path) => /^(?:packages|apps|examples|templates|marketing|src)\//.test(path) && /\.(?:ts|tsx)$/.test(path) && !path.includes("/tests/") && /new\s+AudioContext\s*\(|new\s+AudioCtor\s*\(|webkitAudioContext/.test(readFileSync(path, "utf8")));

const bundleResult = await build({
  stdin: {
    contents: 'export { AudioContextManager, AudioFileManager, AudioSource, AudioBus, AudioMixer, SpatialAudio, FilterEffect, ReverbEffect } from "./packages/audio/src/index.ts";',
    resolveDir: process.cwd(),
    sourcefile: "audio-workload.ts"
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  treeShaking: true,
  write: false,
  logLevel: "silent"
});
const bundle = Buffer.from(bundleResult.outputFiles[0]?.contents ?? []);
const howler = externalAudit.packages.find((entry: { name: string }) => entry.name === "howler");
const chromePass = chrome.stats?.unexpected === 0 && chrome.stats?.expected >= 1;
const webkitPass = webkit.stats?.unexpected === 0 && webkit.stats?.expected >= 1;
const report = {
  schema: "aura3d.audio-backend-bakeoff/1.0",
  generatedAt: new Date().toISOString(),
  pass: chromePass && webkitPass && contextConstructors.length === 1,
  decision: "Keep one direct Web Audio owner in @aura3d/audio; reject Howler because it would duplicate context, cache, playback, spatial, and unlock ownership required by the retained Aura semantic layer.",
  consumers,
  currentFeatures: {
    cues: "packages/engine/src/game/GameAudio.ts semantic layer delegates playback",
    spatialAudio: "PannerNode adapter and SceneAudioBridge",
    sprites: "AudioSource.playSprite",
    fade: "AudioSource.fade",
    loop: "AudioSource.loop",
    codecFallback: "AudioFileManager.loadFirstSupported uses canPlayType",
    unlockPolicy: "AudioContextManager is the only constructor owner",
    lifecycle: ["unlock", "suspend", "resume", "close", "source/bus/effect disposal"],
    typedAssetCaching: "AudioFileManager coalesces inflight loads and caches decoded AudioClip values",
    routeEvidence: "GameAudio cue and bus evidence"
  },
  candidates: {
    directWebAudio: {
      status: "selected-browser-standard",
      workloadBundle: { rawBytes: bundle.length, gzipBytes: gzipSync(bundle).length, brotliBytes: brotliCompressSync(bundle).length },
      chrome: { pass: chromePass, stats: chrome.stats },
      webkit: { pass: webkitPass, stats: webkit.stats },
      contextConstructors
    },
    howler: {
      version: "2.2.4",
      status: "rejected-duplicate-owner",
      packageAudit: howler,
      strengths: ["playback sprites", "fades", "codec fallback", "mobile unlock compatibility"],
      missingAuraSemantics: ["typed asset provenance", "scene-node linkage", "shared effect graph", "semantic cue evidence", "editor timeline/waveform contracts"],
      topologyCost: "Howler would retain its own global audio/context/cache graph while Aura3D still needs its typed semantic and spatial graph."
    }
  },
  duplicateOwnerAudit: {
    contextConstructorCount: contextConstructors.length,
    allowedOwner: "packages/audio/src/AudioContextManager.ts",
    routeLocalContextOwners: contextConstructors.filter((path) => !path.endsWith("packages/audio/src/AudioContextManager.ts")),
    routeLocalPlaybackRemoved: !readFileSync("apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts", "utf8").includes("decodeAudioData")
  },
  fixtureMigrationQueue: ["AdaptiveMusicFixtures.ts", "AudioEffectsAnalysisFixtures.ts", "SpatialAudioFixtures.ts"],
  claimBoundary: "Browser lifecycle and synthetic short-buffer playback evidence; no claim about every device, codec, or production mix."
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ pass: report.pass, decision: report.decision, duplicateOwnerAudit: report.duplicateOwnerAudit, browsers: { chromePass, webkitPass } }, null, 2));
if (!report.pass) process.exitCode = 1;
