/**
 * PRD-15 T4.7 / §16.3 — lean-template fixture capture.
 *
 * Builds the two lane fixture scenes (`prd15-lean-product`, `prd15-lean-minigame`)
 * from the PACKED engine + lean tarballs — never path aliases — and captures
 * each at 1920×1080 and 390×844 via Playwright chromium. Diagnostics payloads
 * (`window.__AURA3D_*` evidence objects) are written next to the images per
 * §16.4's diagnostics-beside-image rule.
 *
 *   pnpm exec tsx --tsconfig tsconfig.base.json tools/lean-fixture-capture/index.ts [--out <dir>] [--keep-tmp]
 *
 * Expects `pnpm build:raw` to have run already (the tarballs ship dist/).
 */

import { execFileSync, execSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { packTarballAt, prepareConsumerCopy } from "../packed-consumer-check/index";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface FixtureScene {
  readonly id: string;
  readonly fixtureDir: string;
}

const SCENES: readonly FixtureScene[] = [
  { id: "prd15-lean-product", fixtureDir: "tests/qr/prd15/fixtures/lean-templates/product" },
  { id: "prd15-lean-minigame", fixtureDir: "tests/qr/prd15/fixtures/lean-templates/minigame" }
];

const VIEWPORTS: ReadonlyArray<{ readonly w: number; readonly h: number }> = [
  { w: 1920, h: 1080 },
  { w: 390, h: 844 }
];

type ViewportSize = { readonly width: number; readonly height: number };

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".hdr": "application/octet-stream",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream"
};

/** Minimal static server for a built vite dist directory. */
function serveStatic(root: string): Promise<{ readonly url: string; readonly server: Server }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
      let file = join(root, path === "/" ? "index.html" : path);
      if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      if (!existsSync(file) || statSync(file).isDirectory()) {
        // SPA-style fallback is unnecessary — the fixtures are single-page apps.
        res.writeHead(404).end(`not found: ${path}`);
        return;
      }
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        rejectPromise(new Error("no address"));
        return;
      }
      resolvePromise({ url: `http://127.0.0.1:${address.port}`, server });
    });
  });
}

function step(label: string, cwd: string, command: string, args: readonly string[]): void {
  try {
    execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: "pipe", timeout: 600_000 });
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? "";
    const stderr = (error as { stderr?: string }).stderr ?? "";
    throw new Error(`${label} failed in ${cwd}:\n${stdout.slice(-500)}${stderr.slice(-1500)}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outRoot = args.includes("--out")
    ? resolve(args[args.indexOf("--out") + 1]!)
    : join(REPO_ROOT, "docs/project/aura3d-quality-rebuild/evidence/prd15/captures/lean-fixtures");
  const keepTmp = args.includes("--keep-tmp");
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

  const tmp = mkdtempSync(join(tmpdir(), "a3d-lean-capture-"));
  console.log(`lean-fixture-capture: temp dir ${tmp}`);

  // 1. Pack engine + lean; prepare each fixture against the tarballs, install,
  //    typecheck and vite-build exactly as packed-consumer-check does.
  const engineTarball = packTarballAt(REPO_ROOT, tmp);
  const leanTarball = packTarballAt(join(REPO_ROOT, "packages/lean"), tmp);
  console.log(`tarballs: ${basename(engineTarball)}, ${basename(leanTarball)}`);

  const browser = await chromium.launch({
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
  });

  let failures = 0;
  for (const scene of SCENES.filter((s) => !only || s.id === only)) {
    const consumerDir = join(tmp, `consumer-${scene.id}`);
    const source = join(REPO_ROOT, scene.fixtureDir);
    const sceneOut = join(outRoot, scene.id);
    mkdirSync(sceneOut, { recursive: true });
    try {
      prepareConsumerCopy(source, consumerDir, engineTarball, { "@aura3d/lean": `file:${leanTarball}` });
      step("install", consumerDir, "pnpm", ["install", "--offline=false"]);
      if (existsSync(join(consumerDir, "tsconfig.json"))) {
        step("typecheck", consumerDir, "pnpm", ["exec", "tsc", "--noEmit"]);
      }
      step("vite build", consumerDir, "pnpm", ["exec", "vite", "build"]);
    } catch (error) {
      failures += 1;
      console.error(`BUILD-FAIL ${scene.id}: ${(error as Error).message}`);
      writeFileSync(join(sceneOut, "build-failed.txt"), String(error));
      continue;
    }

    const distDir = join(consumerDir, "dist");
    const { url, server } = await serveStatic(distDir);
    try {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h } as ViewportSize });
        const page = await context.newPage();
        try {
          await page.goto(url, { waitUntil: "load", timeout: 60_000 });
          await page.waitForSelector("[data-aura3d-ready='true']", { timeout: 60_000 });
          await page.waitForTimeout(1_500); // settle frames + environment apply
          const tag = `${viewport.w}x${viewport.h}`;
          await page.screenshot({ path: join(sceneOut, `${tag}.png`), animations: "disabled" });
          const diagnostics = await page.evaluate(() => {
            const keys = Object.keys(window).filter((k) => k.startsWith("__AURA3D"));
            const out: Record<string, unknown> = {};
            for (const key of keys) out[key] = (window as unknown as Record<string, unknown>)[key];
            return out;
          });
          writeFileSync(join(sceneOut, `${tag}.diagnostics.json`), JSON.stringify(diagnostics, null, 2));
          console.log(`CAPTURED ${scene.id} ${tag}`);
        } finally {
          await context.close();
        }
      }
    } finally {
      server.close();
    }
  }

  await browser.close();
  if (!keepTmp) execSync(`rm -rf "${tmp}"`);
  console.log(failures === 0 ? `lean-fixture-capture: all scenes captured → ${outRoot}` : `lean-fixture-capture: ${failures} build failures`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
