import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";

interface HostAttempt {
  readonly host: string;
  readonly status: "public-smoke-pass" | "protected" | "credential-blocked" | "not-run" | "failed";
  readonly url?: string;
  readonly httpStatus?: number;
  readonly detail: string;
  readonly evidence?: BrowserSmokeResult;
}

interface BrowserSmokeResult {
  readonly httpStatus: number;
  readonly title: string;
  readonly ready: boolean;
  readonly backend: string | null;
  readonly drawCalls: number | null;
  readonly diagnosticsVisible: boolean;
  readonly canvasBytes: number;
  readonly screenshotPath: string;
  readonly profile: {
    readonly litPixels: number;
    readonly uniqueBuckets: number;
    readonly centerObjectPixels: number;
  };
  readonly resources: {
    readonly js: readonly ResourceProbe[];
    readonly css: readonly ResourceProbe[];
    readonly models: readonly ResourceProbe[];
  };
}

interface ResourceProbe {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
}

const vercelPublicUrls = [
  "https://aura3d-vercel-smoke.vercel.app",
  "https://dist-gray-iota-68.vercel.app"
];
const vercelProtectedUrls = [
  "https://dist-veerone.vercel.app",
  "https://dist-gchahal1982-veerone.vercel.app",
  "https://dist-3n5lgxoky-veerone.vercel.app"
];

const attempts: HostAttempt[] = [];

for (const url of vercelProtectedUrls) {
  const status = await getHttpStatus(url);
  attempts.push({
    host: "vercel",
    status: status === 401 ? "protected" : status >= 200 && status < 400 ? "public-smoke-pass" : "failed",
    url,
    httpStatus: status,
    detail: status === 401
      ? "Vercel deployment exists but is blocked by deployment protection before Aura3D can render."
      : `Vercel protected-alias probe returned HTTP ${status}.`
  });
}

for (const url of vercelPublicUrls) {
  attempts.push(await runVercelSmoke(url));
}

attempts.push(await runCloudflarePagesSmoke());
attempts.push(netlifyAttempt());

const pass = ["vercel", "cloudflare-pages", "netlify"].every((host) =>
  attempts.some((attempt) => attempt.host === host && attempt.status === "public-smoke-pass")
);
const report = {
  schema: "aura3d-external-deployment-smoke-summary",
  generatedAt: new Date().toISOString(),
  pass,
  checks: [
    {
      id: "vercel-public-smoke",
      pass: attempts.some((attempt) => attempt.host === "vercel" && attempt.status === "public-smoke-pass"),
      detail: summarizeHost("vercel")
    },
    {
      id: "cloudflare-pages-public-smoke",
      pass: attempts.some((attempt) => attempt.host === "cloudflare-pages" && attempt.status === "public-smoke-pass"),
      detail: summarizeHost("cloudflare-pages")
    },
    {
      id: "netlify-public-smoke",
      pass: attempts.some((attempt) => attempt.host === "netlify" && attempt.status === "public-smoke-pass"),
      detail: summarizeHost("netlify")
    }
  ],
  attempts
};

mkdirSync(resolve("tests/reports"), { recursive: true });
writeFileSync("tests/reports/external-deployment-smoke.json", `${JSON.stringify(report, null, 2)}\n`);
writeMarkdown(report);

if (process.argv.includes("--strict") && !pass) {
  process.exitCode = 1;
}

async function runVercelSmoke(url: string): Promise<HostAttempt> {
  return runHostedSmoke("vercel", url, `tests/reports/external-deployment-smoke/${hostSlug(url)}.png`);
}

async function runHostedSmoke(host: HostAttempt["host"], url: string, screenshotPath: string): Promise<HostAttempt> {
  try {
    const smoke = await browserSmoke(url, screenshotPath);
    const modelMimesOk = smoke.resources.models.every((resource) =>
      /model\/gltf-binary|model\/gltf\+json|application\/octet-stream/i.test(resource.contentType)
    );
    const jsMimesOk = smoke.resources.js.every((resource) => /javascript|ecmascript|text\/plain/i.test(resource.contentType));
    const cssMimesOk = smoke.resources.css.every((resource) => /text\/css|text\/plain/i.test(resource.contentType));
    const visualPass = smoke.ready && smoke.canvasBytes > 1_000 && smoke.profile.litPixels > 2_000 && smoke.profile.uniqueBuckets > 24;
    const mimePass = modelMimesOk && jsMimesOk && cssMimesOk;
    const hostLabel = host === "cloudflare-pages" ? "Cloudflare Pages" : host === "netlify" ? "Netlify" : "Vercel";
    return {
      host,
      status: visualPass && mimePass ? "public-smoke-pass" : "failed",
      url,
      httpStatus: smoke.httpStatus,
      detail: visualPass && mimePass
        ? `Public ${hostLabel} route rendered Aura3D canvas with ${smoke.profile.litPixels} lit sample pixels and ${smoke.profile.uniqueBuckets} color buckets.`
        : `Public ${hostLabel} route failed visual or MIME checks: visualPass=${visualPass}, mimePass=${mimePass}.`,
      evidence: smoke
    };
  } catch (error) {
    return {
      host,
      status: "failed",
      url,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function browserSmoke(url: string, screenshotPath: string): Promise<BrowserSmokeResult> {
  mkdirSync(resolve("tests/reports/external-deployment-smoke"), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const httpStatus = response?.status() ?? 0;
    await page.waitForSelector("canvas", { timeout: 15_000 });
    const ready = await page.locator("body").getAttribute("data-aura3d-ready", { timeout: 15_000 }).then((value) => value === "true").catch(() => false);
    const canvas = page.locator("canvas").first();
    const diagnosticsVisible = await page.getByText("Aura3D diagnostics").isVisible().catch(() => false);
    const profile = await canvas.evaluate((element) => {
      const target = element as HTMLCanvasElement;
      const gl = target.getContext("webgl2", { preserveDrawingBuffer: true }) ?? target.getContext("webgl", { preserveDrawingBuffer: true });
      if (!gl) return { litPixels: 0, uniqueBuckets: 0, centerObjectPixels: 0 };
      const pixels = new Uint8Array(target.width * target.height * 4);
      gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const buckets = new Set<string>();
      let litPixels = 0;
      let centerObjectPixels = 0;
      for (let y = 0; y < target.height; y += 4) {
        for (let x = 0; x < target.width; x += 4) {
          const offset = (y * target.width + x) * 4;
          const r = pixels[offset] ?? 0;
          const g = pixels[offset + 1] ?? 0;
          const b = pixels[offset + 2] ?? 0;
          const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
          if (luminance > 35) {
            litPixels += 1;
            buckets.add(`${r >> 5}-${g >> 5}-${b >> 5}`);
            if (x > target.width * 0.25 && x < target.width * 0.75 && y > target.height * 0.24 && y < target.height * 0.76) {
              centerObjectPixels += 1;
            }
          }
        }
      }
      return { litPixels, uniqueBuckets: buckets.size, centerObjectPixels };
    });
    const screenshot = await canvas.screenshot();
    writeFileSync(screenshotPath, screenshot);
    const resources = await collectResources(page);
    const diagnosticsText = diagnosticsVisible ? await page.getByText(/backend:|draw calls:/).allTextContents().catch(() => []) : [];
    return {
      httpStatus,
      title: await page.title(),
      ready,
      backend: parseDiagnostics(diagnosticsText, "backend"),
      drawCalls: Number(parseDiagnostics(diagnosticsText, "draw calls")) || null,
      diagnosticsVisible,
      canvasBytes: screenshot.byteLength,
      screenshotPath,
      profile,
      resources
    };
  } finally {
    await browser.close();
  }
}

async function collectResources(page: Page): Promise<BrowserSmokeResult["resources"]> {
  const urls = await page.evaluate(() =>
    performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\.(js|css|glb|gltf)(?:$|\?)/i.test(name))
  );
  const uniqueUrls = [...new Set(urls)];
  const probes = await Promise.all(uniqueUrls.map((url) => page.evaluate(async (resourceUrl) => {
    const response = await fetch(resourceUrl, { method: "GET" });
    return {
      url: resourceUrl,
      status: response.status,
      contentType: response.headers.get("content-type") ?? ""
    };
  }, url)));
  return {
    js: probes.filter((probe) => /\.js(?:$|\?)/i.test(probe.url)),
    css: probes.filter((probe) => /\.css(?:$|\?)/i.test(probe.url)),
    models: probes.filter((probe) => /\.(glb|gltf)(?:$|\?)/i.test(probe.url))
  };
}

function parseDiagnostics(textParts: readonly string[], key: string): string | null {
  const text = textParts.join("\n");
  const match = new RegExp(`${key}:\\s*([^\\n]+)`, "i").exec(text);
  return match?.[1]?.trim() ?? null;
}

async function getHttpStatus(url: string): Promise<number> {
  try {
    const response = await fetch(url, { redirect: "follow" });
    return response.status;
  } catch {
    return 0;
  }
}

async function runCloudflarePagesSmoke(): Promise<HostAttempt> {
  const hasToken = Boolean(process.env.CLOUDFLARE_API_TOKEN);
  const hasAccount = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);
  if (!hasToken || !hasAccount) {
    return {
      host: "cloudflare-pages",
      status: "credential-blocked",
      detail: "Missing CLOUDFLARE_API_TOKEN and/or CLOUDFLARE_ACCOUNT_ID; no secret values were inspected or recorded."
    };
  }

  try {
    const projectName = process.env.CLOUDFLARE_PAGES_PROJECT?.trim() || "aura3d-product-context-smoke";
    const branch = process.env.CLOUDFLARE_PAGES_BRANCH?.trim() || "main";
    const deployDir = prepareCloudflareDeployDir();
    const output = deployCloudflarePages(deployDir, projectName, branch);
    const candidateUrls = [...new Set([`https://${projectName}.pages.dev`, ...parseCloudflarePagesUrls(output)])];
    if (candidateUrls.length === 0) {
      return {
        host: "cloudflare-pages",
        status: "failed",
        detail: `Cloudflare Pages deploy completed, but no pages.dev URL was found in Wrangler output: ${summarizeCommandOutput(output)}`
      };
    }
    let firstFailure: HostAttempt | undefined;
    for (const url of candidateUrls) {
      const attempt = await runHostedSmoke("cloudflare-pages", url, `tests/reports/external-deployment-smoke/${hostSlug(url)}.png`);
      if (attempt.status === "public-smoke-pass") return attempt;
      firstFailure ??= attempt;
    }
    return firstFailure ?? {
      host: "cloudflare-pages",
      status: "failed",
      detail: `Cloudflare Pages deploy completed, but no candidate URL could be smoked: ${candidateUrls.join(", ")}`
    };
  } catch (error) {
    return {
      host: "cloudflare-pages",
      status: "failed",
      detail: `Cloudflare Pages deployment failed: ${summarizeCommandError(error)}`
    };
  }
}

function netlifyAttempt(): HostAttempt {
  const hasToken = Boolean(process.env.NETLIFY_AUTH_TOKEN);
  const hasSite = Boolean(process.env.NETLIFY_SITE_ID);
  return {
    host: "netlify",
    status: hasToken && hasSite ? "not-run" : "credential-blocked",
    detail: hasToken && hasSite
      ? "Netlify credentials are present, but this audit runner does not yet deploy the site automatically."
      : "Missing NETLIFY_AUTH_TOKEN and/or NETLIFY_SITE_ID; no secret values were inspected or recorded."
  };
}

function summarizeHost(host: string): string {
  return attempts
    .filter((attempt) => attempt.host === host)
    .map((attempt) => `${attempt.status}${attempt.url ? ` ${attempt.url}` : ""}: ${attempt.detail}`)
    .join(" | ");
}

function prepareCloudflareDeployDir(): string {
  const cleanInstallApp = resolve("tests/reports/package-clean-install-workspace/templates/product-viewer/demo");
  if (!existsSync(resolve(cleanInstallApp, "node_modules"))) {
    throw new Error("product-viewer clean-install app is missing node_modules; run pnpm check:clean-install before Cloudflare deployment smoke.");
  }
  const buildApp = resolve("tests/reports/external-deployment-smoke/cloudflare-build-app");
  const target = resolve("tests/reports/external-deployment-smoke/cloudflare-dist");
  rmSync(buildApp, { recursive: true, force: true });
  rmSync(target, { recursive: true, force: true });
  mkdirSync(buildApp, { recursive: true });

  for (const file of ["index.html", "package.json", "tsconfig.json"]) {
    copyFileSync(resolve(cleanInstallApp, file), resolve(buildApp, file));
  }
  symlinkSync(resolve(cleanInstallApp, "node_modules"), resolve(buildApp, "node_modules"), "dir");
  cpSync(resolve("packages/create-aura3d/templates/product-viewer/src"), resolve(buildApp, "src"), { recursive: true });
  cpSync(resolve("packages/create-aura3d/templates/product-viewer/public"), resolve(buildApp, "public"), { recursive: true });

  execFileSync("npm", ["run", "build"], {
    cwd: buildApp,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024
  });

  cpSync(resolve(buildApp, "dist"), target, { recursive: true });
  rmSync(resolve(target, ".vercel"), { recursive: true, force: true });
  rmSync(resolve(target, ".gitignore"), { force: true });
  return target;
}

function deployCloudflarePages(deployDir: string, projectName: string, branch: string): string {
  try {
    return execWrangler(["pages", "deploy", deployDir, "--project-name", projectName, "--branch", branch, "--commit-dirty=true"]);
  } catch (error) {
    const output = summarizeCommandError(error).toLowerCase();
    if (!output.includes("not found") && !output.includes("does not exist") && !output.includes("create a project")) {
      throw error;
    }
    ensureCloudflarePagesProject(projectName, branch);
    return execWrangler(["pages", "deploy", deployDir, "--project-name", projectName, "--branch", branch, "--commit-dirty=true"]);
  }
}

function ensureCloudflarePagesProject(projectName: string, branch: string): void {
  try {
    execWrangler(["pages", "project", "create", projectName, "--production-branch", branch]);
  } catch (error) {
    const output = summarizeCommandError(error).toLowerCase();
    if (!output.includes("already exists") && !output.includes("project exists")) {
      throw error;
    }
  }
}

function execWrangler(args: readonly string[]): string {
  return execFileSync("pnpm", ["dlx", "wrangler@latest", ...args], {
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024
  });
}

function parseCloudflarePagesUrls(output: string): string[] {
  return output.match(/https:\/\/[^\s]+\.pages\.dev/gi) ?? [];
}

function summarizeCommandOutput(output: string): string {
  return output
    .replace(/cfat_[A-Za-z0-9_-]+/g, "[redacted-cloudflare-token]")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8)
    .join(" ")
    .slice(0, 1000);
}

function summarizeCommandError(error: unknown): string {
  if (error && typeof error === "object") {
    const parts = [
      bufferLikeToString((error as { stdout?: unknown }).stdout),
      bufferLikeToString((error as { stderr?: unknown }).stderr),
      error instanceof Error ? error.message : ""
    ].filter(Boolean);
    return summarizeCommandOutput(parts.join("\n"));
  }
  return summarizeCommandOutput(String(error));
}

function bufferLikeToString(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "string") return value;
  return "";
}

function hostSlug(url: string): string {
  return new URL(url).hostname.replace(/[^a-z0-9-]+/gi, "-");
}

function writeMarkdown(currentReport: typeof report): void {
  const lines = [
    "# External Deployment Results",
    "",
    `Generated: ${currentReport.generatedAt}`,
    "",
    "This document records real external deployment smoke evidence for Round 13",
    "of `UnifiedPRD.md`. Local static preview remains covered by",
    "`tests/reports/package-clean-install.json`; this file records public-host",
    "evidence only.",
    "",
    "## Summary",
    "",
    "| Host | Status | Evidence | Result |",
    "|---|---|---|---|",
    ...currentReport.attempts.map((attempt) => `| ${attempt.host} | ${attempt.status} | ${attempt.url ? `\`${attempt.url}\`` : "environment check"} | ${escapeTable(attempt.detail)} |`),
    "",
    "## Public Host Smoke Detail",
    "",
    ...currentReport.attempts
      .filter((attempt) => attempt.status === "public-smoke-pass" && attempt.evidence)
      .flatMap((attempt) => [
        `- Host: ${attempt.host}`,
        `- URL: \`${attempt.url}\``,
        `- Ready: ${attempt.evidence!.ready}`,
        `- Backend: ${attempt.evidence!.backend ?? "unknown"}`,
        `- Draw calls: ${attempt.evidence!.drawCalls ?? "unknown"}`,
        `- Canvas screenshot bytes: ${attempt.evidence!.canvasBytes}`,
        `- Pixel profile: lit=${attempt.evidence!.profile.litPixels}, center=${attempt.evidence!.profile.centerObjectPixels}, buckets=${attempt.evidence!.profile.uniqueBuckets}`,
        `- Model resources: ${attempt.evidence!.resources.models.map((resource) => `${resource.status} ${resource.contentType} ${resource.url}`).join("; ") || "none"}`,
        `- Diagnostics overlay visible: ${attempt.evidence!.diagnosticsVisible}. This is acceptable for deployment smoke evidence only; polished public demos should decide explicitly whether diagnostics are shown.`,
        `- Local screenshot evidence: \`${attempt.evidence!.screenshotPath}\``,
        ""
      ]),
    "## Current Verdict",
    "",
    deploymentVerdict(currentReport),
    "",
    "## Next Action",
    "",
    deploymentNextAction(currentReport),
    ""
  ];
  writeFileSync("tests/reports/external-deployment-results.md", `${lines.join("\n")}\n`);
}

function deploymentVerdict(currentReport: typeof report): string {
  if (currentReport.pass) return "External deployment smoke is complete across Vercel, Cloudflare Pages, and Netlify.";
  const passed = ["vercel", "cloudflare-pages", "netlify"].filter((host) =>
    currentReport.attempts.some((attempt) => attempt.host === host && attempt.status === "public-smoke-pass")
  );
  const missing = ["vercel", "cloudflare-pages", "netlify"].filter((host) => !passed.includes(host));
  return `External deployment smoke is not complete. Passing public hosts: ${passed.join(", ") || "none"}. Remaining hosts: ${missing.join(", ")}.`;
}

function deploymentNextAction(currentReport: typeof report): string {
  const missing = ["vercel", "cloudflare-pages", "netlify"].filter((host) =>
    !currentReport.attempts.some((attempt) => attempt.host === host && attempt.status === "public-smoke-pass")
  );
  if (missing.length === 0) return "Keep all public host smoke URLs green on release candidates.";
  return `Provide credentials or project targets for ${missing.join(", ")}, then run the same build/deploy/HTTP/canvas/screenshot/MIME checks for those hosts.`;
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
