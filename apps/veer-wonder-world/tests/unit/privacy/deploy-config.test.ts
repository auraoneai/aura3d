/// <reference types="node" />
// The unlisted preview deploy (DEPLOYMENT.md sections 1-5): tools/deploy-preview.sh, deploy/vercel.json,
// deploy/vercelignore, tools/deploy-build.sh and tools/check-dist.mjs.
//
// - Every response carries noindex. Hashed assets are immutable, the page revalidates, and nothing rewrites to
//   index.html.
// - The deploy host lints the content before the build and checks the built dist after it.
// - The upload holds only the workspace, the shared fonts and HDRIs, and the app.
// - The preview is named without the child's name.
// - The site's own upload leaves the app out.
// - check-dist fails a build with a source map, without noindex, or with the child's name in a text file.
//
// As in no-child-data.test.ts, the child's name is not written here: it is the prefix of the app's working folder
// name (`<name>-wonder-world`).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const repoRoot = resolve(appRoot, "..", "..");
const appFolder = basename(appRoot);
const read = (path: string): string => readFileSync(join(appRoot, path), "utf8");

const WORKING_SUFFIX = "-wonder-world";
const childName = appFolder.endsWith(WORKING_SUFFIX) ? appFolder.slice(0, -WORKING_SUFFIX.length) : "";
/** The bare name or the working folder form, as tests/browser/wonder-world-build.spec.ts scans the build. */
const childNamePattern = new RegExp(`(?<![a-z0-9])${childName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i");

interface HeaderRule {
  readonly source: string;
  readonly headers: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}
interface VercelConfig {
  readonly buildCommand?: string;
  readonly installCommand?: string;
  readonly outputDirectory?: string;
  readonly headers?: readonly HeaderRule[];
  readonly rewrites?: readonly unknown[];
  readonly redirects?: readonly unknown[];
  readonly routes?: readonly unknown[];
}
const config = JSON.parse(read("deploy/vercel.json")) as VercelConfig;

function header(source: string, key: string): string | undefined {
  const rule = config.headers?.find((candidate) => candidate.source === source);
  return rule?.headers.find((entry) => entry.key.toLowerCase() === key.toLowerCase())?.value;
}

describe("preview deploy config (deploy/vercel.json)", () => {
  it("sends noindex with every response and keeps the page out of search", () => {
    expect(header("/(.*)", "X-Robots-Tag")).toMatch(/\bnoindex\b/);
    expect(read("index.html")).toMatch(/<meta\s+name="robots"\s+content="noindex"/);
  });

  it("caches the hashed assets for a year and makes the page revalidate (DEPLOYMENT.md section 4)", () => {
    expect(header("/assets/(.*)", "Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(header("/", "Cache-Control")).toBe("no-cache");
    expect(header("/index.html", "Cache-Control")).toBe("no-cache");
    expect(header("/(fonts|hdri)/(.*)", "Cache-Control")).toBe("public, max-age=86400");
  });

  it("serves the built files as they are: no rewrite, redirect or SPA fallback", () => {
    expect(config.rewrites ?? []).toEqual([]);
    expect(config.redirects ?? []).toEqual([]);
    expect(config.routes ?? []).toEqual([]);
    expect(config.outputDirectory).toBe(`apps/${appFolder}/dist`);
    expect(config.installCommand).toBe("pnpm install --frozen-lockfile");
  });

  it("builds on the deploy host: content lint first, then Vite, the dist check and the static check-deploy", () => {
    expect(config.buildCommand).toBe(`bash apps/${appFolder}/tools/deploy-build.sh`);
    const steps = read("tools/deploy-build.sh")
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
    const at = (needle: string): number => steps.findIndex((line) => line.includes(needle));
    const order = [at("validate-wonder-world-content.mjs"), at("vite build"), at("check-dist.mjs"), at("check-deploy")];
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("keeps the deploy host's VITE_ variables out of the build, since the engine inlines import.meta.env whole", () => {
    // The first deploy after the custom domain inlined VITE_VERCEL_PROJECT_PRODUCTION_URL, which carries the name.
    const script = read("tools/deploy-build.sh");
    const unset = script.indexOf('case "$name" in VITE_*) unset "$name" ;; esac');
    expect(unset).toBeGreaterThan(-1);
    expect(unset).toBeLessThan(script.indexOf("vite build"));
  });
});

describe("preview upload (deploy/vercelignore)", () => {
  const rules = read("deploy/vercelignore")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

  it("leaves out everything at the root first, then lets back only what the install and the build read", () => {
    expect(rules[0]).toBe("/*");
    for (const kept of [
      "!/package.json",
      "!/pnpm-lock.yaml",
      "!/pnpm-workspace.yaml",
      "!/patches",
      "!/packages",
      "!/vite.config.ts",
      "!/vite.aliases.generated.ts",
      "!/tools/naming-taxonomy",
      "!/tests/browser/installed-package-resolve.ts",
      "!/public/fonts",
      "!/public/hdri",
      `!/apps/${appFolder}`
    ]) {
      expect(rules, kept).toContain(kept);
    }
    expect(rules).toContain(`/apps/${appFolder}/tests`);
    expect(rules).toContain("/public/*");
    expect(rules.some((rule) => rule.includes("aura-assets") || rule.includes("evidence"))).toBe(false);
  });

  it("ends no rule in a slash: the Vercel CLI tests a directory by its path without one", () => {
    // The first deploy, with "!/packages/" and the like, uploaded 12 root files and nothing under any directory.
    expect(rules.filter((rule) => rule.endsWith("/"))).toEqual([]);
  });

  it("imports nothing the upload leaves out: the root Vite config reads only the files let back", () => {
    const rootConfig = readFileSync(join(repoRoot, "vite.config.ts"), "utf8");
    const localImports = [...rootConfig.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map((match) => match[1] ?? "");
    expect(localImports.sort()).toEqual([
      "./tests/browser/installed-package-resolve",
      "./tools/naming-taxonomy/contextualAliases",
      "./vite.aliases.generated"
    ]);
  });

  it("keeps the app out of the site's own upload", () => {
    expect(readFileSync(join(repoRoot, ".vercelignore"), "utf8").split("\n")).toContain(`/apps/${appFolder}/`);
  });
});

describe("preview address (tools/deploy-preview.sh)", () => {
  const script = read("tools/deploy-preview.sh");
  const project = /^PROJECT="([^"]+)"$/m.exec(script)?.[1] ?? "";

  it("names the project and its address without the child's name", () => {
    expect(childName).not.toBe("");
    expect(project).toBe("aura3d-wonder-world");
    expect(childNamePattern.test(project)).toBe(false);
    expect(read("DEPLOYMENT.md")).toContain(`https://${project}.vercel.app`);
    // The per-deployment hosts carry the team's slug; only the project address is ever written down.
    const hosts = [...`${script}\n${read("DEPLOYMENT.md")}`.matchAll(/([a-z0-9-]+\.vercel\.app)/g)].map((match) => match[1]);
    expect(new Set(hosts)).toEqual(new Set([`${project}.vercel.app`]));
  });

  it("names the Vercel team by ID and deploys only the commit's own deploy files", () => {
    expect(script).toMatch(/^TEAM="team_[A-Za-z0-9]+"$/m);
    expect(script).toContain('GIT_LFS_SKIP_SMUDGE=1 git -C "$REPO_ROOT" worktree add --detach');
    expect(script).toContain('cp "$DEPLOY_DIR/vercel.json" "$WORK/src/vercel.json"');
    expect(script).toContain('cp "$DEPLOY_DIR/vercelignore" "$WORK/src/.vercelignore"');
    expect(script).toMatch(/trap cleanup EXIT INT TERM/);
  });
});

describe("dist check (tools/check-dist.mjs)", () => {
  const PAGE = '<!doctype html><html><head><meta name="robots" content="noindex" /></head><body></body></html>';

  function checkDist(files: Readonly<Record<string, string>>): { status: number | null; out: string } {
    const dist = mkdtempSync(join(tmpdir(), "wonder-dist-"));
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dist, path)), { recursive: true });
        writeFileSync(join(dist, path), text);
      }
      const run = spawnSync(process.execPath, [join(appRoot, "tools", "check-dist.mjs"), dist], { encoding: "utf8" });
      return { status: run.status, out: `${run.stdout}${run.stderr}` };
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  }

  it("passes a clean build", () => {
    const run = checkDist({ "index.html": PAGE, "assets/app.js": "export const ok = 1;" });
    expect(run.out).toContain("check-dist: OK");
    expect(run.status).toBe(0);
  });

  it("fails a build with a source map", () => {
    const run = checkDist({ "index.html": PAGE, "assets/app.js": "1", "assets/app.js.map": "{}" });
    expect(run.status).toBe(1);
    expect(run.out).toContain("source map");
  });

  it("fails a page without its noindex meta tag", () => {
    const run = checkDist({ "index.html": "<!doctype html><title>x</title>", "assets/app.js": "1" });
    expect(run.status).toBe(1);
    expect(run.out).toContain("noindex");
  });

  it("fails a text file with the child's name, bare or as the working folder, and does not print the name", () => {
    for (const text of [`const greeting = "Hi ${childName}!";`, `const path = "apps/${appFolder}/src";`]) {
      const run = checkDist({ "index.html": PAGE, "assets/app.js": text });
      expect(run.status).toBe(1);
      expect(run.out).toContain("the child's name appears 1 time(s) in assets/app.js");
      expect(childNamePattern.test(run.out)).toBe(false);
    }
  });

  it("fails a build that inlined the deploy host's variables", () => {
    const run = checkDist({ "index.html": PAGE, "assets/app.js": 'const env={MODE:"production",VITE_VERCEL_URL:"x"};' });
    expect(run.status).toBe(1);
    expect(run.out).toContain("deploy-host variables inlined in assets/app.js: VITE_VERCEL_URL");
  });

  it("is the check the deploy build runs", () => {
    expect(existsSync(join(appRoot, "tools", "check-dist.mjs"))).toBe(true);
    expect(read("tools/deploy-build.sh")).toContain('node "$APP_DIR/tools/check-dist.mjs"');
  });
});
