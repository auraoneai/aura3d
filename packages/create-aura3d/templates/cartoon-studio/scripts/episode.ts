import { createHash } from "node:crypto";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createCartoonEpisodePackage,
  type CartoonEpisodePackageBuild,
  type CartoonEpisodePackageMode
} from "../src/episode-renderer";

const command = process.argv[2] ?? "package";

async function main() {
  if (command === "plan") {
    await writePackage("plan", { only: new Set(["episode-plan.json", "metadata.json"]) });
    return;
  }
  if (command === "preview") {
    await writePackage("preview", { only: new Set(["route-proof.json", "metadata.json"]) });
    return;
  }
  if (command === "render") {
    await writePackage("render");
    return;
  }
  if (command === "package") {
    await writePackage("package");
    return;
  }
  if (command === "review") {
    await writePackage("review", { only: new Set(["review-package.md", "visual-acceptance.json", "render-manifest.json"]) });
    return;
  }
  if (command === "verify") {
    await verifyPackage(createCartoonEpisodePackage("package"));
    return;
  }
  throw new Error(`Unknown episode command "${command}". Use plan, preview, render, package, review, or verify.`);
}

async function writePackage(mode: CartoonEpisodePackageMode, options: { only?: ReadonlySet<string> } = {}) {
  const pkg = createCartoonEpisodePackage(mode);
  await mkdir(pkg.packageDirectory, { recursive: true });
  if (mode === "render" || mode === "package") {
    await rm(path.join(pkg.packageDirectory, "frames"), { recursive: true, force: true });
    await rm(path.join(pkg.packageDirectory, "episode.png-sequence-fallback.json"), { force: true });
  }

  for (const file of pkg.files) {
    if (options.only && !options.only.has(file.path)) continue;
    const target = path.join(pkg.packageDirectory, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    if (file.kind === "png-base64") {
      await writeFile(target, Buffer.from(file.contents, "base64"));
    } else {
      await writeFile(target, file.contents, "utf8");
    }
  }

  if (!options.only && (mode === "render" || mode === "package")) {
    await renderEpisodeMedia(pkg);
    await verifyEncodedOutputs(pkg);
  }
  if (!options.only && mode === "package") await captureRouteThumbnail(pkg);
  if (!options.only) await writeChecksumManifest(pkg);
  console.log(JSON.stringify({
    ok: true,
    command: mode,
    packageDirectory: pkg.packageDirectory,
    hasWebm: pkg.hasWebm,
    hasPngSequenceFallback: pkg.hasPngSequenceFallback,
    publishReady: pkg.publishReady,
    fileCount: options.only ? options.only.size : pkg.files.length
  }, null, 2));
}

async function writeChecksumManifest(pkg: CartoonEpisodePackageBuild) {
  const artifactEntries = [];
  const packageArtifacts = [
    ...pkg.files.map((file) => ({ path: file.path, kind: file.kind })),
    { path: "episode.webm", kind: "video/webm" },
    { path: "thumbnail.png", kind: "png" },
    { path: "frames/first.png", kind: "png" },
    { path: "frames/dialogue.png", kind: "png" },
    { path: "frames/action.png", kind: "png" },
    { path: "frames/final.png", kind: "png" }
  ];
  for (const file of packageArtifacts) {
    const target = path.join(pkg.packageDirectory, file.path);
    if (!existsSync(target)) continue;
    const bytes = await readFile(target);
    artifactEntries.push({
      path: file.path,
      kind: file.kind,
      byteSize: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }
  const manifestPath = path.join(pkg.packageDirectory, "render-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts = artifactEntries;
  manifest.requiredFiles = pkg.requiredFiles;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

// After encoding, rewrite the encoded-video claims in the package JSON so they are
// VERIFIED facts (true only when episode.webm actually exists at a real size) instead
// of the hardcoded `true` the artifact builder emits before encoding runs.
async function verifyEncodedOutputs(pkg: CartoonEpisodePackageBuild) {
  const webmPath = path.join(pkg.packageDirectory, "episode.webm");
  const webmExists = existsSync(webmPath);
  const webmBytes = webmExists ? (await stat(webmPath)).size : 0;
  const realWebm = webmExists && webmBytes > 32_768;

  await patchPackageJson(path.join(pkg.packageDirectory, "render-manifest.json"), (m) => {
    m.hasEncodedVideo = realWebm;
    if (m.encodedVideo && typeof m.encodedVideo === "object") {
      (m.encodedVideo as Record<string, unknown>).verified = realWebm;
      (m.encodedVideo as Record<string, unknown>).byteLength = webmBytes;
    }
  });
  await patchPackageJson(path.join(pkg.packageDirectory, "visual-acceptance.json"), (m) => {
    m.encodedVideoPresent = realWebm;
    const checks = m.checks;
    if (Array.isArray(checks)) {
      const check = checks.find((c) => (c as Record<string, unknown>)?.id === "real-encoded-video") as Record<string, unknown> | undefined;
      if (check) {
        check.passed = realWebm;
        check.evidence = { ...(check.evidence as Record<string, unknown>), byteLength: webmBytes, verified: realWebm };
      }
    }
  });
  await patchPackageJson(path.join(pkg.packageDirectory, "metadata.json"), (m) => {
    const boundary = m.outputBoundary as Record<string, unknown> | undefined;
    if (boundary) boundary.webmPresent = realWebm;
  });
  await patchPackageJson(path.join(pkg.packageDirectory, "prompt-animation-evidence.json"), (m) => {
    const renderOutput = m.renderOutput as Record<string, unknown> | undefined;
    if (renderOutput) renderOutput.encodedVideoPresent = realWebm;
  });
}

async function patchPackageJson(filePath: string, patch: (data: Record<string, unknown>) => void) {
  if (!existsSync(filePath)) return;
  const data = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  patch(data);
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function renderEpisodeMedia(pkg: CartoonEpisodePackageBuild) {
  const frameDirectory = path.join(pkg.packageDirectory, "frames");
  const imageTool = executable("sips") ?? executable("magick") ?? executable("convert");
  const ffmpeg = executable("ffmpeg");
  if (!imageTool) throw new Error("Cannot render cartoon episode frames: ImageMagick `magick` or `convert` is required.");
  if (!ffmpeg) throw new Error("Cannot encode cartoon episode: `ffmpeg` is required.");

  const sequenceSvgFiles = pkg.files
    .filter((file) => file.kind === "svg" && /^frames\/frame-\d+\.svg$/.test(file.path))
    .map((file) => file.path)
    .sort();

  for (const svgPath of sequenceSvgFiles) {
    const input = path.join(pkg.packageDirectory, svgPath);
    const output = input.replace(/\.svg$/, ".png");
    renderSvgToPng(imageTool, input, output);
  }

  const representativePairs = [
    ["frames/first.svg", "frames/first.png"],
    ["frames/dialogue.svg", "frames/dialogue.png"],
    ["frames/action.svg", "frames/action.png"],
    ["frames/final.svg", "frames/final.png"]
  ] as const;
  for (const [svgPath, pngPath] of representativePairs) {
    renderSvgToPng(imageTool, path.join(pkg.packageDirectory, svgPath), path.join(pkg.packageDirectory, pngPath));
  }

  await copyFile(path.join(pkg.packageDirectory, "frames", "action.png"), path.join(pkg.packageDirectory, "thumbnail.png"));
  encodeWebm(ffmpeg, frameDirectory, path.join(pkg.packageDirectory, "episode.webm"));
}

async function captureRouteThumbnail(pkg: CartoonEpisodePackageBuild) {
  const vite = viteExecutable();
  if (!vite) throw new Error("Cannot capture route thumbnail: Vite executable was not found.");
  const port = 4387;
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(vite, ["--host", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, BROWSER: "none" },
    stdio: "pipe"
  });
  let startupLog = "";
  server.stdout.on("data", (chunk) => {
    startupLog += String(chunk);
  });
  server.stderr.on("data", (chunk) => {
    startupLog += String(chunk);
  });
  try {
    await waitForServer(origin, server, () => startupLog);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      await page.goto(`${origin}/?capture=thumbnail`, { waitUntil: "networkidle" });
      await page.waitForSelector("canvas", { timeout: 10_000 });
      await page.waitForTimeout(500);
      await page.locator("canvas").first().screenshot({
        path: path.join(pkg.packageDirectory, "thumbnail.png")
      });
    } finally {
      await browser.close();
    }
  } finally {
    stopServer(server);
  }
}

function renderSvgToPng(command: string, input: string, output: string) {
  if (path.basename(command) === "sips") {
    execFileSync(command, ["-s", "format", "png", input, "--out", output], { stdio: "pipe" });
    return;
  }
  const args = path.basename(command) === "magick"
    ? [input, "-background", "none", "-alpha", "remove", "-alpha", "off", output]
    : [input, "-background", "none", "-alpha", "remove", "-alpha", "off", output];
  execFileSync(command, args, { stdio: "pipe" });
}

function encodeWebm(ffmpeg: string, frameDirectory: string, output: string) {
  execFileSync(ffmpeg, [
    "-y",
    "-framerate",
    "30",
    "-stream_loop",
    "59",
    "-i",
    path.join(frameDirectory, "frame-%04d.png"),
    "-t",
    "60",
    "-c:v",
    "libvpx-vp9",
    "-pix_fmt",
    "yuv420p",
    "-b:v",
    "0",
    "-crf",
    "34",
    output
  ], { stdio: "pipe" });
}

function executable(command: string): string | undefined {
  try {
    return execFileSync("which", [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function viteExecutable(): string | undefined {
  const local = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  return existsSync(local) ? local : executable("vite");
}

async function waitForServer(origin: string, server: ChildProcessWithoutNullStreams, log: () => string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before route thumbnail capture. Log:\n${log()}`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // Keep polling until Vite is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Vite route thumbnail capture. Log:\n${log()}`);
}

function stopServer(server: ChildProcessWithoutNullStreams) {
  if (server.exitCode === null) server.kill("SIGTERM");
}

async function verifyPackage(pkg: CartoonEpisodePackageBuild) {
  const missing = [];
  for (const requiredFile of pkg.requiredFiles) {
    const target = path.join(pkg.packageDirectory, requiredFile);
    if (!existsSync(target)) missing.push(requiredFile);
  }

  const hasWebm = existsSync(path.join(pkg.packageDirectory, "episode.webm"));
  const hasFallback = existsSync(path.join(pkg.packageDirectory, "episode.png-sequence-fallback.json"));
  if (!hasWebm && !hasFallback) missing.push("episode.webm or episode.png-sequence-fallback.json");

  const byteSizes = [];
  for (const requiredFile of pkg.requiredFiles) {
    const target = path.join(pkg.packageDirectory, requiredFile);
    if (!existsSync(target)) continue;
    const info = await stat(target);
    byteSizes.push({ path: requiredFile, byteSize: info.size });
    if (info.size <= 0) missing.push(`${requiredFile} is empty`);
  }

  const ok = missing.length === 0;
  console.log(JSON.stringify({
    ok,
    packageDirectory: pkg.packageDirectory,
    hasWebm,
    hasPngSequenceFallback: hasFallback,
    checkedFiles: byteSizes,
    missing
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
