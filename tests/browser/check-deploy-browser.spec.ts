import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { runBrowserDeployCheck } from "../../packages/aura3d-cli/src/deploy-browser-check";

/**
 * `aura3d check-deploy --browser` against a real headless Chromium. Remote only (tools/remote-acr/run.sh): local browsers are not
 * allowed on the dev Mac. The temp projects live under /repo so Playwright resolves from /repo/node_modules, the way it does in a
 * user project that has `playwright` or `@playwright/test` installed.
 */
const ROOT = process.env.CHECK_DEPLOY_ROOT ?? "/repo";
const work = mkdtempSync(join(ROOT, "tmp-check-deploy-"));

function project(name: string, files: Record<string, string>): { project: string; dist: string } {
  const projectDir = join(work, name);
  const dist = join(projectDir, "dist");
  for (const [file, body] of Object.entries(files)) {
    const path = join(dist, file);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name, private: true }));
  // The static half of check-deploy needs a valid (empty) asset manifest and typed module.
  writeFileSync(join(projectDir, "aura.assets.json"), JSON.stringify({ schema: "aura3d.assets/1.0", assetBasePath: "/aura-assets/", outputDir: "public/aura-assets", typegen: "src/aura-assets.ts", assets: [] }));
  mkdirSync(join(projectDir, "src"), { recursive: true });
  writeFileSync(join(projectDir, "src", "aura-assets.ts"), "export const assets = {} as const;\n");
  return { project: projectDir, dist };
}

const CLEAN = { "index.html": `<!doctype html><html><body><h1>ok</h1><script src="/app.js"></script></body></html>`, "app.js": `document.body.dataset.aura3dReady = "true";` };
const BROKEN = {
  "index.html": `<!doctype html><html><body><h1>broken</h1><img src="/gone.png"><script src="/missing.js"></script><script>console.error("shader compile failed");</script></body></html>`
};
const BOOT_ERROR = { "index.html": `<!doctype html><html><body><script>document.body.dataset.aura3dError = "ASSET_HASH_MISMATCH";</script></body></html>` };
const MULTI = { ...CLEAN, "play/index.html": `<!doctype html><html><body><script>throw new Error("play route crashed");</script></body></html>` };

test.afterAll(() => rmSync(work, { recursive: true, force: true }));

test("a clean site passes with a real browser", async () => {
  const { dist } = project("clean", CLEAN);
  const result = await runBrowserDeployCheck({ distDir: dist, projectDir: ROOT, settleMs: 500 });
  console.log(`CHECK_DEPLOY clean ok=${result.ok} failures=${result.failures.length} routes=${result.routes.length}`);
  expect(result.failures).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.routes[0]?.status).toBe(200);
});

test("a broken site fails on the missing script, the missing image and the console error", async () => {
  const { dist } = project("broken", BROKEN);
  const result = await runBrowserDeployCheck({ distDir: dist, projectDir: ROOT, settleMs: 500 });
  console.log(`CHECK_DEPLOY broken ok=${result.ok} failures=${JSON.stringify(result.failures)}`);
  expect(result.ok).toBe(false);
  const text = result.failures.join("\n");
  expect(text).toContain("HTTP 404 /missing.js");
  expect(text).toContain("HTTP 404 /gone.png");
  expect(text).toContain("logged a console error: shader compile failed");
});

test("an app boot error reported on <body> fails the check", async () => {
  const { dist } = project("boot", BOOT_ERROR);
  const result = await runBrowserDeployCheck({ distDir: dist, projectDir: ROOT, settleMs: 500 });
  expect(result.ok).toBe(false);
  expect(result.failures.join("\n")).toContain("ASSET_HASH_MISMATCH");
});

test("each route is checked and an uncaught error on one route fails the site", async () => {
  const { dist } = project("multi", MULTI);
  const result = await runBrowserDeployCheck({ distDir: dist, projectDir: ROOT, routes: ["/", "/play/"], settleMs: 500 });
  console.log(`CHECK_DEPLOY multi ok=${result.ok} failures=${JSON.stringify(result.failures)}`);
  expect(result.routes).toHaveLength(2);
  expect(result.ok).toBe(false);
  expect(result.failures.join("\n")).toContain("Route /play/ threw an uncaught error: play route crashed");
  expect(result.failures.join("\n")).not.toContain("Route / ");
});

function runCli(cwd: string, args: string[]) {
  const run = spawnSync(join(ROOT, "node_modules/.bin/tsx"), ["--tsconfig", join(ROOT, "tsconfig.base.json"), join(ROOT, "packages/aura3d-cli/src/cli.ts"), ...args], { cwd, encoding: "utf8", timeout: 120_000 });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
}

test("the CLI exits 0 on a clean site and 1 on a broken one, and says what failed", async () => {
  const clean = project("cli-clean", CLEAN);
  const ok = runCli(clean.project, ["check-deploy", "--dist", "dist", "--browser", "--browser-settle", "500"]);
  console.log(`CHECK_DEPLOY cli-clean status=${ok.status}`);
  expect(ok.status).toBe(0);
  expect(ok.out).toContain("Browser pass: 1 route(s) loaded");

  const broken = project("cli-broken", BROKEN);
  const bad = runCli(broken.project, ["check-deploy", "--dist", "dist", "--browser", "--browser-settle", "500"]);
  console.log(`CHECK_DEPLOY cli-broken status=${bad.status}`);
  expect(bad.status).toBe(1);
  expect(bad.out).toContain("HTTP 404 /missing.js");
  expect(bad.out).toContain("shader compile failed");

  const staticOnly = runCli(broken.project, ["check-deploy", "--dist", "dist"]);
  expect(staticOnly.status).toBe(0);
  expect(staticOnly.out).not.toContain("Browser pass");
});
