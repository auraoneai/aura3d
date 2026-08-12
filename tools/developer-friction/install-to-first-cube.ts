/**
 * §B.2 release-rehearsal measurement: clean install to a verified rendered cube.
 *
 * Every sample runs in a fresh project outside the checkout with an isolated npm user config.
 * Cold samples also receive a fresh npm cache; warm samples share only a deliberately primed npm
 * cache and still use fresh project directories. Aura3D installs the actual packed release
 * candidate, while Three.js installs its pinned public registry package. Both use the same Vite
 * version, canvas, camera, cube, browser, timing boundary, and non-blank pixel assertion.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { chromium } from "@playwright/test";

type Engine = "aura3d" | "threejs";
type CacheState = "cold" | "warm";

interface Timeline {
  installStartedAt: string;
  installCompletedAt: string;
  projectCreationCompletedAt: string;
  buildCompletedAt: string;
  devServerReadyAt: string;
  firstVerifiedFrameAt: string;
}

interface Sample {
  readonly engine: Engine;
  readonly cacheState: CacheState;
  readonly sample: number;
  readonly timeline: Timeline;
  readonly installMs: number;
  readonly projectCreationMs: number;
  readonly buildMs: number;
  readonly devServerReadyMs: number;
  readonly browserToVerifiedFrameMs: number;
  readonly installToFirstCubeMs: number;
  readonly verifiedChangedPixels: number;
  readonly cacheDirectoryWasFresh: boolean;
  readonly projectDirectoryWasFresh: true;
}

const repoRoot = resolve(import.meta.dirname, "..", "..");
const outputPath = join(repoRoot, "tests/reports/install-to-first-cube.json");
const profileRoot = mkdtempSync(join(tmpdir(), "aura3d-install-friction-"));
const tarballDirectory = join(profileRoot, "release-candidate");
const samples: Sample[] = [];
const sampleCount = 3;
const viteVersion = "7.3.2";
const threeVersion = "0.185.1";

mkdirSync(tarballDirectory, { recursive: true });
const auraTarballs = packReleaseCandidate();
const warmCaches: Record<Engine, string> = {
  aura3d: join(profileRoot, "cache-warm-aura3d"),
  threejs: join(profileRoot, "cache-warm-threejs")
};

try {
  for (const engine of ["aura3d", "threejs"] as const) primeWarmCache(engine, warmCaches[engine]);

  for (const cacheState of ["cold", "warm"] as const) {
    for (let sample = 1; sample <= sampleCount; sample += 1) {
      const order: readonly Engine[] = sample % 2 === 0 ? ["threejs", "aura3d"] : ["aura3d", "threejs"];
      for (const engine of order) samples.push(await measure(engine, cacheState, sample));
    }
  }

  const browser = await chromium.launch();
  const browserVersion = browser.version();
  await browser.close();
  const report = {
    schema: "aura3d-install-to-first-cube/1.0",
    generatedAt: new Date().toISOString(),
    pass: samples.every((sample) => sample.verifiedChangedPixels > 1_000),
    measurement:
      "Wall-clock time from npm install start through fresh project creation, production build, " +
      "Vite readiness, and a browser-verified non-blank rendered cube.",
    methodology: {
      releaseCandidate:
        "actual pnpm-packed @aura3d/lean 2.0.0 tarball plus its complete local Aura dependency closure from the measured commit",
      comparison: `three@${threeVersion} from the public npm registry`,
      commonTooling: `vite@${viteVersion}`,
      samplesPerEnginePerState: sampleCount,
      cold: "fresh project, fresh npm cache, and fresh empty npm user config for every sample",
      warm: "fresh project and empty npm user config; npm cache deliberately primed once per engine before measured samples",
      browserBoundary: "Vite ready to first frame whose WebGL pixels differ from the background by more than 1,000 pixels",
      canvas: { width: 960, height: 600 },
      identicalCameraAndContent: true,
      monorepoResolutionDisabled: true
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      npm: commandVersion("npm"),
      pnpm: commandVersion("pnpm"),
      browser: { name: "chromium", version: browserVersion },
      cpu: commandOutput("sysctl", ["-n", "machdep.cpu.brand_string"]) || "unavailable",
      commit: commandOutput("git", ["rev-parse", "HEAD"], repoRoot),
      npmRegistry: "https://registry.npmjs.org/"
    },
    artifacts: {
      aura3d: {
        version: "2.0.0",
        source: "release-candidate-tarballs",
        entry: "@aura3d/lean",
        packages: Object.entries(auraTarballs).map(([name, path]) => ({
          name,
          file: basename(path),
          sha256: sha256(path)
        }))
      },
      threejs: { version: threeVersion, source: "npm-registry" }
    },
    samples,
    summary: Object.fromEntries(
      (["cold", "warm"] as const).map((state) => [
        state,
        Object.fromEntries(
          (["aura3d", "threejs"] as const).map((engine) => {
            const values = samples
              .filter((sample) => sample.engine === engine && sample.cacheState === state)
              .map((sample) => sample.installToFirstCubeMs);
            return [engine, statistics(values)];
          })
        )
      ])
    )
  };
  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ pass: report.pass, summary: report.summary, outputPath }, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  rmSync(profileRoot, { recursive: true, force: true });
}

function packReleaseCandidate(): Readonly<Record<string, string>> {
  const packageDirectories: Readonly<Record<string, string>> = {
    "@aura3d/lean": "packages/lean",
    "@aura3d/assets": "packages/assets",
    "@aura3d/animation": "packages/animation",
    "@aura3d/rendering": "packages/rendering",
    "@aura3d/scene": "packages/scene",
    "@aura3d/core": "packages/core",
    "@aura3d/math": "packages/math"
  };
  return Object.fromEntries(
    Object.entries(packageDirectories).map(([name, directory]) => {
      const result = spawnSync("pnpm", ["pack", "--pack-destination", tarballDirectory], {
        cwd: resolve(repoRoot, directory),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      if (result.status !== 0) throw new Error(`Unable to pack ${name}: ${result.stderr}`);
      const filename = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      if (!filename) throw new Error(`pnpm pack did not return a filename for ${name}.`);
      return [name, resolve(tarballDirectory, filename)] as const;
    })
  );
}

function primeWarmCache(engine: Engine, cache: string): void {
  const project = createProfile(engine, `prime-${engine}`, cache);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], project.directory, project.environment);
}

async function measure(engine: Engine, cacheState: CacheState, sample: number): Promise<Sample> {
  const cache = cacheState === "warm"
    ? warmCaches[engine]
    : join(profileRoot, `cache-cold-${engine}-${sample}`);
  const profile = createProfile(engine, `${cacheState}-${engine}-${sample}`, cache);
  const timeline: Partial<Timeline> = {};
  const installStarted = performance.now();
  timeline.installStartedAt = new Date().toISOString();
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], profile.directory, profile.environment);
  const installCompleted = performance.now();
  timeline.installCompletedAt = new Date().toISOString();

  const projectStarted = performance.now();
  writeProjectFiles(engine, profile.directory);
  const projectCompleted = performance.now();
  timeline.projectCreationCompletedAt = new Date().toISOString();

  const buildStarted = performance.now();
  run("npm", ["run", "build"], profile.directory, profile.environment);
  const buildCompleted = performance.now();
  timeline.buildCompletedAt = new Date().toISOString();

  const port = 46_000 + samples.length;
  const serverStarted = performance.now();
  const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: profile.directory,
    env: profile.environment,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  let verifiedChangedPixels = 0;
  let browserStarted = 0;
  let firstFrame = 0;
  try {
    await waitForServer(`http://127.0.0.1:${port}`, server);
    const serverReady = performance.now();
    timeline.devServerReadyAt = new Date().toISOString();
    browserStarted = performance.now();
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.body.dataset.firstCubeReady === "true");
      verifiedChangedPixels = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (!(canvas instanceof HTMLCanvasElement)) return 0;
        const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true }) ?? canvas.getContext("webgl", { preserveDrawingBuffer: true });
        if (!gl) return 0;
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const background = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0];
        let changed = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const difference = Math.abs((pixels[index] ?? 0) - background[0]!) +
            Math.abs((pixels[index + 1] ?? 0) - background[1]!) +
            Math.abs((pixels[index + 2] ?? 0) - background[2]!);
          if (difference > 24 && (pixels[index + 3] ?? 0) > 0) changed += 1;
        }
        return changed;
      });
      if (verifiedChangedPixels <= 1_000) throw new Error(`${engine} rendered only ${verifiedChangedPixels} changed pixels.`);
      firstFrame = performance.now();
      timeline.firstVerifiedFrameAt = new Date().toISOString();
    } finally {
      await browser.close();
    }
    return {
      engine,
      cacheState,
      sample,
      timeline: timeline as Timeline,
      installMs: rounded(installCompleted - installStarted),
      projectCreationMs: rounded(projectCompleted - projectStarted),
      buildMs: rounded(buildCompleted - buildStarted),
      devServerReadyMs: rounded(serverReady - serverStarted),
      browserToVerifiedFrameMs: rounded(firstFrame - browserStarted),
      installToFirstCubeMs: rounded(firstFrame - installStarted),
      verifiedChangedPixels,
      cacheDirectoryWasFresh: cacheState === "cold",
      projectDirectoryWasFresh: true
    };
  } finally {
    stopServer(server);
  }
}

function createProfile(engine: Engine, id: string, cache: string): { readonly directory: string; readonly environment: NodeJS.ProcessEnv } {
  const directory = join(profileRoot, "projects", id);
  const userConfig = join(profileRoot, "npm-user-configs", `${id}.npmrc`);
  mkdirSync(directory, { recursive: true });
  mkdirSync(resolve(userConfig, ".."), { recursive: true });
  writeFileSync(userConfig, "registry=https://registry.npmjs.org/\n");
  writeFileSync(join(directory, "package.json"), `${JSON.stringify({
    name: `aura3d-friction-${id}`,
    private: true,
    type: "module",
    scripts: { build: "vite build", dev: "vite" },
    dependencies: engine === "aura3d"
      ? {
          ...Object.fromEntries(Object.entries(auraTarballs).map(([name, path]) => [name, `file:${path}`])),
          vite: viteVersion
        }
      : { three: threeVersion, vite: viteVersion }
  }, null, 2)}\n`);
  return {
    directory,
    environment: {
      ...process.env,
      npm_config_cache: cache,
      npm_config_userconfig: userConfig,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false"
    }
  };
}

function writeProjectFiles(engine: Engine, directory: string): void {
  writeFileSync(join(directory, "index.html"), `<!doctype html><html><body><canvas width="960" height="600"></canvas><script type="module" src="/src.js"></script></body></html>`);
  writeFileSync(join(directory, "src.js"), engine === "aura3d" ? auraSource() : threeSource());
}

function auraSource(): string {
  return `import { camera, createAuraApp, material, primitives, scene } from "@aura3d/lean";
const canvas = document.querySelector("canvas");
const app = createAuraApp(canvas, { autoStart: false, scene: scene().background("#0b0f16").camera(camera.perspective({ position: [2.4, 1.8, 3.2], target: [0, 0, 0], fov: 45 })).add(primitives.box({ material: material.pbr({ color: "#c8d3e0", roughness: 0.4 }) })) });
await app.ready();
document.body.dataset.firstCubeReady = "true";
`;
}

function threeSource(): string {
  return `import * as THREE from "three";
const canvas = document.querySelector("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(960, 600, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0f16");
const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
camera.position.set(2.4, 1.8, 3.2);
camera.lookAt(0, 0, 0);
scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#c8d3e0", roughness: 0.4 })));
scene.add(new THREE.DirectionalLight(0xffffff, 2.5));
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
renderer.render(scene, camera);
document.body.dataset.firstCubeReady = "true";
`;
}

function run(command: string, args: readonly string[], cwd: string, environment: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, [...args], { cwd, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
}

async function waitForServer(url: string, server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited before becoming ready (${server.exitCode}).`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

function stopServer(server: ChildProcess): void {
  if (!server.pid || server.exitCode !== null) return;
  try {
    if (process.platform === "win32") server.kill("SIGTERM");
    else process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

function statistics(values: readonly number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    sampleCount: values.length,
    samplesMs: values,
    medianMs: rounded(ordered[Math.floor(ordered.length / 2)]!),
    medianMinutes: rounded(ordered[Math.floor(ordered.length / 2)]! / 60_000, 4),
    meanMs: rounded(mean),
    varianceMs2: rounded(variance),
    standardDeviationMs: rounded(Math.sqrt(variance)),
    minMs: rounded(ordered[0]!),
    maxMs: rounded(ordered.at(-1)!)
  };
}

function rounded(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function commandVersion(command: string): string {
  return commandOutput(command, ["--version"]);
}

function commandOutput(command: string, args: readonly string[], cwd = repoRoot): string {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 ? result.stdout.trim() : "";
}
