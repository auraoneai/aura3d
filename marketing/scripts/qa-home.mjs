#!/usr/bin/env node
/**
 * Independent QA harness for the Aura3D marketing homepage rewrite.
 *
 * Measures the MARKETING-10-10-PLAN acceptance criteria at multiple viewports,
 * exercises demo/search/copy/nav behavior, writes report.json + report.md and
 * exits non-zero only when a hard criterion fails.
 *
 * Requires the marketing dev server:
 *   pnpm --dir marketing dev
 *
 * Run:
 *   node marketing/scripts/qa-home.mjs
 *   node marketing/scripts/qa-home.mjs --url http://127.0.0.1:7782/ --out .local-evidence/marketing-10-10-qa
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));

let playwright;
let playwrightVersion = "unknown";
try {
  playwright = requireFromRepo("playwright");
  try {
    playwrightVersion = requireFromRepo("playwright/package.json").version;
  } catch {
    /* version is informational */
  }
} catch (error) {
  console.error(
    [
      "Playwright is not installed or could not be resolved.",
      `Looked from: ${repoRoot}`,
      "No packages were added by this script. Install the repo's existing dev tooling, then rerun.",
      String(error?.message ?? error)
    ].join("\n")
  );
  process.exit(3);
}

const { chromium } = playwright;

const DEFAULT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 800 }
];
const DEFAULT_URL = "http://127.0.0.1:7782/";
const DEFAULT_OUT = ".local-evidence/marketing-10-10-qa";
const EXPECTED_VERSION = "4.0.2";
const OLD_VERSION_RE = /\b4\.0\.[01]\b/g;
const INITIAL_TRANSFER_BUDGET = 1.5 * 1024 * 1024;
const SEARCH_QUERY = "deploy";
const TAP_MIN = 44;

const ENGINE_REQUEST_RE =
  /@aura3d[\/_-](?:engine|runtime|renderer)|(?:^|[\/_\-. ])(?:three|babylon)(?:\.module)?(?:\.min)?\.(?:m?js)|(?:^|[\/_\-. ])(?:webgl|webgpu)(?:[\/_\-. ]|$)|engine[-_.][\w-]+\.(?:m?js)|\.wasm(?:$|\?)/i;

function printHelp() {
  console.log(`Aura3D marketing homepage QA

Usage: node marketing/scripts/qa-home.mjs [options]

Options:
  --url <url>             Page to audit (default ${DEFAULT_URL})
  --out <dir>             Evidence directory (default ${DEFAULT_OUT})
  --viewports <list>      Comma-separated WxH list
                          (default 1440x900,1024x768,768x1024,390x844,360x800)
  --wait-for-server[=ms]  Poll for the dev server before auditing (default 30000ms)
  --help                  Show this help

Server:
  pnpm --dir marketing dev

Exit codes:
  0  all hard criteria passed
  1  one or more hard criteria failed
  2  server not reachable
  3  harness/setup error
`);
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    out: DEFAULT_OUT,
    viewports: null,
    waitForServer: false,
    waitMs: 30000,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const takeValue = (name) => {
      if (arg.includes("=")) return arg.slice(arg.indexOf("=") + 1);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${name} requires a value`);
      }
      i += 1;
      return value;
    };

    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--url" || arg.startsWith("--url=")) options.url = takeValue("--url");
    else if (arg === "--out" || arg.startsWith("--out=")) options.out = takeValue("--out");
    else if (arg === "--viewports" || arg.startsWith("--viewports=")) {
      options.viewports = takeValue("--viewports");
    } else if (arg === "--wait-for-server" || arg.startsWith("--wait-for-server=")) {
      options.waitForServer = true;
      if (arg.includes("=")) {
        const value = Number(arg.slice(arg.indexOf("=") + 1));
        if (!Number.isFinite(value) || value < 0) throw new Error("--wait-for-server value must be milliseconds");
        options.waitMs = value;
      } else if (argv[i + 1] && /^\d+$/.test(argv[i + 1])) {
        options.waitMs = Number(argv[i + 1]);
        i += 1;
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseViewports(value) {
  if (!value) return DEFAULT_VIEWPORTS.map((viewport) => ({ ...viewport }));
  const seen = new Set();
  const viewports = [];
  for (const token of String(value).split(/[,\s]+/).filter(Boolean)) {
    const match = token.match(/^(\d+)x(\d+)$/i);
    if (!match) throw new Error(`Invalid viewport "${token}". Use WIDTHxHEIGHT, e.g. 390x844.`);
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width < 200 || height < 200 || width > 5000 || height > 5000) {
      throw new Error(`Viewport out of range: ${token}`);
    }
    const key = `${width}x${height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    viewports.push({ width, height });
  }
  if (!viewports.length) throw new Error("No viewports supplied");
  return viewports;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeServer(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "cache-control": "no-cache" }
    });
    return { ok: true, status: response.status, error: null };
  } catch (error) {
    return { ok: false, status: null, error: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

function serverHelp(url) {
  return [
    `Marketing dev server is not reachable at ${url}.`,
    "Start it with:",
    "  pnpm --dir marketing dev",
    "Then rerun:",
    `  node marketing/scripts/qa-home.mjs --url ${url}`,
    "Exit code 2 (server unavailable); no checks were silently skipped."
  ].join("\n");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCommand(value) {
  let text = normalizeText(value)
    .replace(/^\$\s*/, "")
    .replace(/\s*(?:copy|copied)\s*$/i, "")
    .trim();
  const command = text.match(/(?:^|\s)((?:npx|npm|pnpm|yarn|bun)\s+.+)$/i);
  if (command) text = command[1].trim();
  return text.replace(/\s*(?:copy|copied)\s*$/i, "").trim();
}

function truncate(value, max = 240) {
  const text = normalizeText(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function markdownEscape(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function isEngineRequest(request) {
  const type = typeof request.resourceType === "function" ? request.resourceType() : request.resourceType;
  if (!["script", "fetch", "xhr", "websocket", "other"].includes(type)) return false;
  const url = typeof request.url === "function" ? request.url() : request.url;
  return ENGINE_REQUEST_RE.test(String(url ?? ""));
}

function createSession(page) {
  const session = {
    requests: [],
    responses: [],
    failedResponses: [],
    requestFailures: [],
    consoleErrors: [],
    pageErrors: [],
    initial: null
  };

  page.on("request", (request) => {
    session.requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      isNavigation: request.isNavigationRequest(),
      frameUrl: request.frame()?.url() ?? null
    });
  });

  page.on("response", (response) => {
    const headers = response.headers();
    const entry = {
      url: response.url(),
      status: response.status(),
      resourceType: response.request().resourceType(),
      contentLength: Number.parseInt(headers["content-length"] ?? "", 10) || 0,
      frameUrl: response.frame()?.url() ?? null
    };
    session.responses.push(entry);
    if (entry.status >= 400) session.failedResponses.push(entry);
  });

  page.on("requestfailed", (request) => {
    session.requestFailures.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText ?? "request failed"
    });
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    session.consoleErrors.push({
      text: truncate(message.text(), 600),
      url: location.url || null,
      line: location.lineNumber ?? null,
      column: location.columnNumber ?? null
    });
  });

  page.on("pageerror", (error) => {
    session.pageErrors.push({
      name: error.name,
      message: truncate(error.message, 600),
      stack: truncate(error.stack ?? "", 1200)
    });
  });

  return session;
}

function snapshotNetwork(session) {
  const engineRequests = session.requests.filter(isEngineRequest).map((request) => ({
    url: request.url,
    resourceType: request.resourceType,
    frameUrl: request.frameUrl
  }));
  const responseBytes = session.responses.reduce((sum, response) => sum + response.contentLength, 0);
  const byType = {};
  for (const request of session.requests) {
    byType[request.resourceType] = (byType[request.resourceType] ?? 0) + 1;
  }

  return {
    requestCount: session.requests.length,
    responseCount: session.responses.length,
    responseBytes,
    requestsByType: byType,
    engineRequests,
    failedResponses: session.failedResponses.slice(0, 80),
    failedResponseCount: session.failedResponses.length,
    requestFailures: session.requestFailures.slice(0, 80),
    requestFailureCount: session.requestFailures.length,
    consoleErrors: session.consoleErrors.slice(0, 40),
    consoleErrorCount: session.consoleErrors.length,
    pageErrors: session.pageErrors.slice(0, 20),
    pageErrorCount: session.pageErrors.length
  };
}

async function collectResourceTiming(page) {
  const frames = [];
  for (const frame of page.frames()) {
    const isMain = frame === page.mainFrame();
    try {
      const data = await frame.evaluate(() => {
        const resources = performance.getEntriesByType("resource").map((entry) => ({
          name: entry.name,
          initiatorType: entry.initiatorType,
          transferSize: entry.transferSize || 0,
          encodedBodySize: entry.encodedBodySize || 0,
          decodedBodySize: entry.decodedBodySize || 0
        }));
        const navigation = performance.getEntriesByType("navigation")[0];
        return {
          url: location.href,
          resources,
          navigation: navigation
            ? {
                transferSize: navigation.transferSize || 0,
                encodedBodySize: navigation.encodedBodySize || 0,
                decodedBodySize: navigation.decodedBodySize || 0
              }
            : null
        };
      });
      const resourceTransfer = data.resources.reduce(
        (sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0),
        0
      );
      const resourceEncoded = data.resources.reduce(
        (sum, entry) => sum + (entry.encodedBodySize || entry.transferSize || 0),
        0
      );
      const resourceDecoded = data.resources.reduce((sum, entry) => sum + entry.decodedBodySize, 0);
      const navigationBytes =
        (data.navigation?.transferSize || 0) || (data.navigation?.encodedBodySize || 0) || 0;
      frames.push({
        isMain,
        url: data.url,
        error: null,
        resourceCount: data.resources.length,
        resourceTransferBytes: resourceTransfer,
        resourceEncodedBytes: resourceEncoded,
        resourceDecodedBytes: resourceDecoded,
        navigationTransferBytes: navigationBytes,
        totalTransferBytes: resourceTransfer + navigationBytes,
        topResources: data.resources
          .slice()
          .sort((a, b) => (b.transferSize || b.encodedBodySize) - (a.transferSize || a.encodedBodySize))
          .slice(0, 8)
      });
    } catch (error) {
      frames.push({
        isMain,
        url: frame.url(),
        error: truncate(error?.message ?? error, 500),
        resourceCount: 0,
        resourceTransferBytes: 0,
        resourceEncodedBytes: 0,
        resourceDecodedBytes: 0,
        navigationTransferBytes: 0,
        totalTransferBytes: 0,
        topResources: []
      });
    }
  }

  return {
    frames,
    resourceCount: frames.reduce((sum, frame) => sum + frame.resourceCount, 0),
    transferBytes: frames.reduce((sum, frame) => sum + frame.totalTransferBytes, 0),
    encodedBytes: frames.reduce(
      (sum, frame) => sum + frame.resourceEncodedBytes + frame.navigationTransferBytes,
      0
    ),
    decodedBytes: frames.reduce(
      (sum, frame) => sum + frame.resourceDecodedBytes + frame.navigationTransferBytes,
      0
    ),
    frameErrors: frames.filter((frame) => frame.error).length
  };
}

async function evaluateSafe(page, fn, fallback) {
  try {
    return await page.evaluate(fn);
  } catch (error) {
    return { ...fallback, error: truncate(error?.message ?? error, 800) };
  }
}

async function launchBrowser() {
  const notes = [];
  try {
    const browser = await chromium.launch({
      headless: true,
      channel: "chrome",
      args: ["--disable-dev-shm-usage"]
    });
    notes.push("Launched system Chrome via Playwright channel 'chrome'.");
    return { browser, notes, launchMode: "chrome" };
  } catch (error) {
    notes.push(`System Chrome launch failed: ${truncate(error?.message ?? error, 500)}`);
  }

  try {
    const browser = await chromium.launch({ headless: true });
    notes.push("Fell back to Playwright's bundled Chromium.");
    return { browser, notes, launchMode: "bundled-chromium" };
  } catch (error) {
    notes.push(`Bundled Chromium launch failed: ${truncate(error?.message ?? error, 500)}`);
    throw new Error(`Unable to launch Chrome or bundled Chromium.\n${notes.join("\n")}`);
  }
}

async function revealPageContent(page) {
  try {
    await page.evaluate(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      const step = Math.max(200, Math.floor(innerHeight * 0.75));
      let y = 0;
      for (let index = 0; index < 48; index += 1) {
        const height = Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0);
        if (y > height) break;
        window.scrollTo(0, y);
        await wait(45);
        y += step;
      }
      window.scrollTo(0, Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0));
      await wait(140);
      window.scrollTo(0, 0);
      root.style.scrollBehavior = previousBehavior;
      await wait(140);
    });
    await page.waitForTimeout(250);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: truncate(error?.message ?? error, 500) };
  }
}

async function captureScreenshots(page, outDir, label) {
  const dir = path.join(outDir, "screenshots");
  ensureDir(dir);
  const viewportPath = path.join(dir, `${label}-viewport.png`);
  const fullPath = path.join(dir, `${label}-full.png`);
  const result = {
    viewport: null,
    full: null,
    errors: []
  };

  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.screenshot({
      path: viewportPath,
      fullPage: false,
      animations: "disabled",
      caret: "hide",
      timeout: 30000
    });
    result.viewport = {
      path: viewportPath,
      relative: `screenshots/${label}-viewport.png`,
      bytes: fs.statSync(viewportPath).size
    };
  } catch (error) {
    result.errors.push(`viewport screenshot: ${truncate(error?.message ?? error, 500)}`);
  }

  try {
    await page.screenshot({
      path: fullPath,
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      timeout: 60000
    });
    result.full = {
      path: fullPath,
      relative: `screenshots/${label}-full.png`,
      bytes: fs.statSync(fullPath).size
    };
  } catch (error) {
    result.errors.push(`full-page screenshot: ${truncate(error?.message ?? error, 500)}`);
  }

  return result;
}

function emptyMetrics(error) {
  const message = truncate(error, 800);
  return {
    fatalError: message,
    title: null,
    finalUrl: null,
    load: { ok: false, status: null, error: message, notes: [] },
    overflow: { error: message, innerWidth: null, scrollWidth: null, pageHeight: null, offenders: [] },
    nav: { error: message, found: false, primaryLinks: [], actionLinks: [], overlaps: [] },
    cards: { error: message, cardsFound: 0, clippedCount: 0, cards: [] },
    tapTargets: { error: message, total: 0, tooSmallCount: 0, tooSmall: [], min: null },
    fonts: { error: message, h1: [], h2: [], cardCopy: [], h1Min: null, h2Min: null, cardMin: null },
    a11y: {
      error: message,
      main: { existsExact: false, mainCount: 0, visible: false, id: null },
      skipLink: { exists: false },
      h1: { total: 0, visible: 0, elements: [] },
      images: { total: 0, missingAltCount: 0, missingAlt: [], emptyAltCount: 0, emptyAlt: [] },
      buttons: { total: 0, unnamedCount: 0, unnamed: [] },
      iframes: { total: 0, withSrcCount: 0, withSrc: [], missingTitleCount: 0, missingTitle: [] }
    },
    versions: {
      error: message,
      visibleOccurrences: [],
      violations: [],
      allowedOccurrences: [],
      jsonLd: { found: false, softwareVersions: [], parseErrors: [] }
    },
    network: {
      error: message,
      requestCount: 0,
      engineRequests: [],
      failedResponseCount: 0,
      requestFailureCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      consoleErrors: [],
      pageErrors: [],
      failedResponses: [],
      requestFailures: []
    },
    resourceTiming: { error: message, frames: [], resourceCount: 0, transferBytes: 0 }
  };
}

async function auditViewport(browser, url, viewport, origin, outDir, scope = null, attempt = 1) {
  const label = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    permissions: ["clipboard-read", "clipboard-write"],
    colorScheme: "light",
    locale: "en-US"
  });
  context.setDefaultTimeout(10000);
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  } catch {
    /* clipboard may still work; failure is reported at the copy check */
  }

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(35000);
  const session = createSession(page);
  let auditStarted = false;
  let navigationsDuringAudit = 0;
  page.on("framenavigated", (frame) => {
    if (auditStarted && frame === page.mainFrame()) navigationsDuringAudit += 1;
  });

  const loadNotes = [];
  if (attempt > 1) loadNotes.push("retried viewport after the page reloaded during the first audit");
  let gotoResponse = null;
  let gotoError = null;
  try {
    gotoResponse = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
  } catch (error) {
    gotoError = String(error?.message ?? error);
  }

  if (!gotoError) {
    try {
      await page.waitForLoadState("load", { timeout: 15000 });
    } catch (error) {
      loadNotes.push(`load state timeout: ${truncate(error?.message ?? error, 300)}`);
    }
    try {
      await page.waitForLoadState("networkidle", { timeout: 7000 });
    } catch (error) {
      loadNotes.push(`networkidle timeout: ${truncate(error?.message ?? error, 300)}`);
    }
    try {
      await page.evaluate(() =>
        Promise.race([
          document.fonts?.ready?.then(() => true) ?? true,
          new Promise((resolve) => setTimeout(() => resolve(false), 3000))
        ])
      );
    } catch {
      loadNotes.push("font readiness check failed");
    }
    await page.waitForTimeout(400);
  }

  auditStarted = true;
  const status = gotoResponse?.status() ?? null;
  const loadOk = !gotoError && status !== null && status < 400;

  let metrics;
  let screenshots = { viewport: null, full: null, errors: [] };
  let interactions = {};

  if (!loadOk) {
    metrics = emptyMetrics(gotoError || `HTTP ${status ?? "unknown"} while loading ${url}`);
    metrics.finalUrl = page.url();
    metrics.load = {
      ok: false,
      status,
      error: gotoError || `HTTP ${status}`,
      notes: loadNotes
    };
    try {
      screenshots = await captureScreenshots(page, outDir, label);
    } catch (error) {
      screenshots.errors.push(truncate(error?.message ?? error, 500));
    }
  } else {
    const title = await page.title().catch(() => null);
    const finalUrl = page.url();
    const resourceTiming = await collectResourceTiming(page);
    const initialNetwork = snapshotNetwork(session);

    // Scroll through once so IntersectionObserver reveal animations and lazy images
    // have run before layout, clipping, font, and screenshot measurements.
    const reveal = await revealPageContent(page);
    if (!reveal.ok) loadNotes.push(`reveal scroll failed: ${reveal.error}`);

    const overflow = await evaluateSafe(
      page,
      () => {
        const laidOut = (el) => {
          if (!(el instanceof Element)) return false;
          if (el.closest("[hidden]")) return false;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number.parseFloat(style.opacity) === 0
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const clippedByAncestor = (el) => {
          let node = el.parentElement;
          while (node && node !== document.body && node !== document.documentElement) {
            const style = getComputedStyle(node);
            if (["hidden", "clip", "auto", "scroll"].includes(style.overflowX)) return true;
            node = node.parentElement;
          }
          return false;
        };
        const describe = (el) => {
          const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70);
          return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
            el.className && typeof el.className === "string"
              ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
              : ""
          }${text ? ` "${text}"` : ""}`;
        };

        const innerWidth = window.innerWidth;
        const documentElement = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(documentElement.scrollWidth, body?.scrollWidth ?? 0);
        const pageHeight = Math.max(documentElement.scrollHeight, body?.scrollHeight ?? 0);
        const offenders = [...document.querySelectorAll("body *")]
          .filter((el) => laidOut(el) && !clippedByAncestor(el))
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter(({ rect }) => rect.right > innerWidth + 2 || rect.left < -2)
          .sort((a, b) => b.rect.right - a.rect.right)
          .slice(0, 10)
          .map(({ el, rect }) => ({
            element: describe(el),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width)
          }));

        return {
          innerWidth,
          clientWidth: documentElement.clientWidth,
          scrollWidth,
          bodyScrollWidth: body?.scrollWidth ?? null,
          pageHeight,
          overflowPx: Math.max(0, scrollWidth - innerWidth),
          offenders
        };
      },
      { error: "overflow audit failed", offenders: [] }
    );

    const nav = await evaluateSafe(
      page,
      () => {
        const laidOut = (el) => {
          if (!(el instanceof Element)) return false;
          if (el.closest("[hidden]")) return false;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number.parseFloat(style.opacity) === 0
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const rectOf = (el) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return {
            x: Math.round(rect.x * 10) / 10,
            y: Math.round(rect.y * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            bottom: Math.round(rect.bottom * 10) / 10
          };
        };
        const cssPath = (el) => {
          if (!(el instanceof Element)) return "";
          if (el.id) return `#${CSS.escape(el.id)}`;
          const parts = [];
          let node = el;
          while (node && node.nodeType === 1 && parts.length < 6) {
            if (node.id) {
              parts.unshift(`#${CSS.escape(node.id)}`);
              break;
            }
            let part = node.tagName.toLowerCase();
            const parent = node.parentElement;
            if (parent) {
              const sameTag = [...parent.children].filter((child) => child.tagName === node.tagName);
              if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
            }
            const classes = [...node.classList]
              .filter((name) => /^[a-zA-Z][\w-]*$/.test(name))
              .slice(0, 2);
            if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
            parts.unshift(part);
            node = parent;
            if (!node || node === document.documentElement) break;
          }
          return parts.join(" > ");
        };
        const accessibleName = (el) => {
          if (!(el instanceof Element)) return "";
          const aria = el.getAttribute("aria-label");
          if (aria?.trim()) return aria.trim();
          const labelledBy = el.getAttribute("aria-labelledby");
          if (labelledBy) {
            const value = labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            if (value) return value;
          }
          const imageAlt = el.querySelector("img[alt]")?.getAttribute("alt")?.trim();
          if (imageAlt) return imageAlt;
          const svgTitle = el.querySelector("svg title")?.textContent?.trim();
          if (svgTitle) return svgTitle;
          const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
          if (text) return text;
          return el.getAttribute("title")?.trim() ?? "";
        };
        const firstBy = (root, selectors) => {
          for (const selector of selectors) {
            const found = [...root.querySelectorAll(selector)].find(laidOut);
            if (found) return found;
          }
          return null;
        };
        const intersects = (a, b) => {
          const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return width > 2 && height > 2 ? { width, height } : null;
        };
        const describe = (el) => {
          if (!el) return "missing";
          const name = accessibleName(el);
          return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${
            el.className && typeof el.className === "string"
              ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}`
              : ""
          }${name ? ` "${name.slice(0, 60)}"` : ""}`;
        };

        const navs = [...document.querySelectorAll("nav, [role='navigation']")].filter(laidOut);
        let nav = navs[0] ?? null;
        if (!nav) {
          const header = [...document.querySelectorAll("header")].find(laidOut);
          if (header) nav = header;
        }
        if (!nav) {
          return {
            found: false,
            selector: null,
            primaryLinks: [],
            actionLinks: [],
            actionBoxes: [],
            hamburger: null,
            logo: null,
            overlaps: [],
            navOverflow: null
          };
        }

        const headerParent = nav.closest("header");
        const actionRoot = headerParent && headerParent.querySelector(".nav-actions, [data-nav-actions]") ? headerParent : nav;

        const logo =
          firstBy(nav, [".brand", "[data-logo]", "a[aria-label*='Aura3D' i]", "a[href='/']", "a[href='./']"]) ??
          firstBy(actionRoot, [".brand", "[data-logo]", "a[aria-label*='Aura3D' i]", "a[href='/']"]);

        const actionContainers = [
          ...new Set([
            ...nav.querySelectorAll(".nav-actions, [data-nav-actions], .nav-cta-group, .nav-actions-wrap"),
            ...(actionRoot !== nav
              ? actionRoot.querySelectorAll(".nav-actions, [data-nav-actions], .nav-cta-group, .nav-actions-wrap")
              : [])
          ])
        ].filter(laidOut);

        const hamCandidates = [
          ...new Set([
            ...nav.querySelectorAll("button, [role='button'], a, label"),
            ...(actionRoot !== nav ? actionRoot.querySelectorAll("button, [role='button'], a, label") : [])
          ])
        ].filter(laidOut);

        const hamburger =
          hamCandidates.find((el) => {
            const cls = `${typeof el.className === "string" ? el.className : ""} ${el.id}`.toLowerCase();
            const label = accessibleName(el).toLowerCase();
            const controls = (el.getAttribute("aria-controls") ?? "").toLowerCase();
            if (el.matches("[data-nav-toggle], [data-menu-toggle], [data-nav-open], .nav-toggle, .menu-toggle, .hamburger")) {
              return true;
            }
            if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
              if (/menu|navigation|drawer/.test(`${label} ${cls} ${controls}`)) return true;
            }
            return false;
          }) ?? null;

        const interactives = [...nav.querySelectorAll("a[href], button, [role='button'], [role='link']")].filter(laidOut);
        const actionInteractives = [...actionRoot.querySelectorAll("a[href], button, [role='button'], [role='link']")]
          .filter(laidOut)
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return actionContainers.some((container) => container.contains(el)) || rect.top < 180;
          });

        const actionPattern =
          /docs|get\s*started|github|npm|install|start\s*building|sign\s*in|log\s*in|contact|book|talk|repository|download/i;

        const actionEls = [...new Set([...actionInteractives, ...interactives])].filter((el) => {
          if (!el) return false;
          if (logo && (el === logo || logo.contains(el) || el.contains(logo))) return false;
          if (hamburger && (el === hamburger || hamburger.contains(el))) return false;
          if (actionContainers.some((container) => container.contains(el))) return true;
          return el.classList.contains("btn") || actionPattern.test(accessibleName(el));
        });

        const primaryLinks = interactives.filter(
          (el) =>
            el.tagName === "A" &&
            el !== logo &&
            !(logo && (logo.contains(el) || el.contains(logo))) &&
            !(hamburger && (hamburger.contains(el) || el === hamburger)) &&
            !actionEls.includes(el)
        );

        const actionBoxes = actionContainers.length ? actionContainers : actionEls;
        const overlaps = [];
        const seen = new Set();
        const addPair = (a, b, kind) => {
          if (!a || !b || a === b) return;
          if (a.contains(b) || b.contains(a)) return;
          const aRect = rectOf(a);
          const bRect = rectOf(b);
          const overlap = intersects(aRect, bRect);
          if (!overlap) return;
          const key = `${kind}:${cssPath(a)}:${cssPath(b)}`;
          if (seen.has(key)) return;
          seen.add(key);
          overlaps.push({
            kind,
            a: describe(a),
            b: describe(b),
            aSelector: cssPath(a),
            bSelector: cssPath(b),
            overlap: { width: Math.round(overlap.width), height: Math.round(overlap.height) },
            aRect,
            bRect
          });
        };

        for (const link of primaryLinks) {
          if (logo) addPair(link, logo, "nav-link/logo");
          for (const action of actionBoxes) addPair(link, action, "nav-link/actions");
          if (hamburger) addPair(link, hamburger, "nav-link/menu");
        }
        if (logo) {
          for (const action of actionBoxes) addPair(logo, action, "logo/actions");
          if (hamburger) addPair(logo, hamburger, "logo/menu");
        }
        if (hamburger) {
          for (const action of actionBoxes) addPair(hamburger, action, "menu/actions");
        }
        for (let i = 0; i < primaryLinks.length; i += 1) {
          for (let j = i + 1; j < primaryLinks.length; j += 1) {
            addPair(primaryLinks[i], primaryLinks[j], "nav-link/nav-link");
          }
        }

        return {
          found: true,
          selector: cssPath(nav),
          primaryLinks: primaryLinks.map((el) => ({
            text: accessibleName(el) || el.textContent?.trim() || "",
            href: el.getAttribute("href"),
            selector: cssPath(el),
            rect: rectOf(el)
          })),
          actionLinks: actionEls.map((el) => ({
            text: accessibleName(el) || el.textContent?.trim() || "",
            selector: cssPath(el),
            rect: rectOf(el)
          })),
          actionBoxes: actionBoxes.map((el) => ({ selector: cssPath(el), rect: rectOf(el) })),
          hamburger: hamburger
            ? {
                found: true,
                selector: cssPath(hamburger),
                label: accessibleName(hamburger) || "",
                tag: hamburger.tagName.toLowerCase(),
                expanded: hamburger.getAttribute("aria-expanded"),
                controls: hamburger.getAttribute("aria-controls"),
                rect: rectOf(hamburger)
              }
            : { found: false },
          logo: logo
            ? {
                selector: cssPath(logo),
                text: accessibleName(logo),
                rect: rectOf(logo)
              }
            : null,
          overlaps: overlaps.slice(0, 50),
          navOverflow: {
            scrollWidth: nav.scrollWidth,
            clientWidth: nav.clientWidth,
            overflowPx: Math.max(0, nav.scrollWidth - nav.clientWidth)
          }
        };
      },
      {
        error: "nav audit failed",
        found: false,
        primaryLinks: [],
        actionLinks: [],
        actionBoxes: [],
        hamburger: null,
        logo: null,
        overlaps: [],
        navOverflow: null
      }
    );

    const cards = await evaluateSafe(
      page,
      () => {
        const laidOut = (el) => {
          if (!(el instanceof Element)) return false;
          if (el.closest("[hidden]")) return false;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number.parseFloat(style.opacity) === 0
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const cssPath = (el) => {
          if (!(el instanceof Element)) return "";
          if (el.id) return `#${CSS.escape(el.id)}`;
          const parts = [];
          let node = el;
          while (node && node.nodeType === 1 && parts.length < 5) {
            if (node.id) {
              parts.unshift(`#${CSS.escape(node.id)}`);
              break;
            }
            let part = node.tagName.toLowerCase();
            const parent = node.parentElement;
            if (parent) {
              const sameTag = [...parent.children].filter((child) => child.tagName === node.tagName);
              if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
            }
            const classes = [...node.classList]
              .filter((name) => /^[a-zA-Z][\w-]*$/.test(name))
              .slice(0, 2);
            if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
            parts.unshift(part);
            node = parent;
            if (!node || node === document.documentElement) break;
          }
          return parts.join(" > ");
        };
        const textOf = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
        const rectOf = (el) => {
          const rect = el.getBoundingClientRect();
          return {
            x: Math.round(rect.x * 10) / 10,
            y: Math.round(rect.y * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            bottom: Math.round(rect.bottom * 10) / 10
          };
        };
        const cardSet = new Set();
        const cardSelectors = [
          "[data-showcase-card]",
          "[data-game-card]",
          ".showcase-card",
          ".showcase-tile",
          ".game-card",
          ".template-card",
          ".prompt-card",
          ".package-card",
          ".pillar",
          ".gallery .tile",
          ".gallery--showcase > *",
          ".visual-proof-grid > *",
          ".proof-card",
          "article[class*='showcase' i]",
          "article[class*='game' i]",
          "article[class*='proof' i]"
        ];
        for (const selector of cardSelectors) {
          for (const el of document.querySelectorAll(selector)) {
            if (laidOut(el) && textOf(el).length > 8) cardSet.add(el);
          }
        }

        const cards = [];
        for (const card of cardSet) {
          const cardRect = rectOf(card);
          let copy = null;
          for (const selector of [
            ".showcase-copy",
            ".game-card-copy",
            ".game-copy",
            ".card-copy",
            "[data-card-copy]",
            "[class*='__copy']",
            "[class*='copy']"
          ]) {
            const found = [...card.querySelectorAll(selector)].find(laidOut);
            if (found) {
              copy = found;
              break;
            }
          }
          if (!copy) {
            copy = [...card.children].find(
              (child) =>
                laidOut(child) &&
                child.querySelector("h2, h3, h4, p") &&
                !child.querySelector("iframe, img, video, canvas, picture")
            );
          }
          const copyEl = copy ?? card;
          const copyStyle = getComputedStyle(copyEl);
          const cardStyle = getComputedStyle(card);
          const copyRect = rectOf(copyEl);
          const copyScrollHeight = copyEl.scrollHeight;
          const copyClientHeight = copyEl.clientHeight;
          const copyOverflow = copyScrollHeight - copyClientHeight;
          const copyClips = /hidden|clip/i.test(copyStyle.overflowY);
          const cardClips = /hidden|clip/i.test(cardStyle.overflowY);
          const cardScrollHeight = card.scrollHeight;
          const cardClientHeight = card.clientHeight;

          const media =
            [...card.querySelectorAll("iframe, img, video, canvas, picture, picture source")].find(laidOut) ??
            [...card.querySelectorAll("[class*='poster'], [class*='preview'], [class*='stage'], [class*='media']")].find(laidOut) ??
            null;
          const title =
            [...card.querySelectorAll("h2, h3, h4, [class*='title'], [class*='name']")].find(
              (el) => laidOut(el) && textOf(el).length > 0
            ) ?? null;
          const description =
            [...card.querySelectorAll("p, [class*='desc'], [class*='lede'], [class*='blurb']")].find(
              (el) => laidOut(el) && textOf(el).length > 0
            ) ?? null;
          const actionCandidates = [...card.querySelectorAll("a[href], button, [role='link'], [role='button']")].filter(
            laidOut
          );
          const action =
            actionCandidates.find((el) => /play|open|view|try|demo|watch|explore/i.test(`${textOf(el)} ${el.getAttribute("aria-label") ?? ""}`)) ??
            (card.matches("a[href], [role='link']") ? card : null);
          const chips = [...card.querySelectorAll("[class*='chip'], [class*='tag'], [class*='kicker']")].filter(laidOut);
          const showcaseCard = card.matches(
            "[data-showcase-card], [data-game-card], .showcase-card, .showcase-tile, .game-card, .gallery .tile, .gallery--showcase > *, .proof-card, article[class*='showcase' i], article[class*='game' i], article[class*='proof' i]"
          );

          const textEls = [
            ...card.querySelectorAll("h2, h3, h4, p, li, a, button, [class*='chip'], [class*='tag'], [class*='kicker']")
          ].filter((el) => laidOut(el) && textOf(el).length > 0);

          const outside = [];
          for (const el of textEls) {
            const rect = el.getBoundingClientRect();
            const outsideCard =
              rect.bottom > cardRect.bottom + 2 ||
              rect.top < cardRect.top - 2 ||
              rect.right > cardRect.right + 2 ||
              rect.left < cardRect.left - 2;
            const outsideCopy =
              rect.bottom > copyRect.bottom + 2 ||
              rect.top < copyRect.top - 2 ||
              rect.right > copyRect.right + 2 ||
              rect.left < copyRect.left - 2;
            if (outsideCard || (copyClips && outsideCopy)) {
              outside.push({
                element: `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`,
                text: textOf(el).slice(0, 60),
                rect: {
                  top: Math.round(rect.top),
                  bottom: Math.round(rect.bottom),
                  left: Math.round(rect.left),
                  right: Math.round(rect.right)
                }
              });
            }
          }

          const clipped =
            copyOverflow > 1 ||
            outside.length > 0 ||
            (copy === null && cardClips && cardScrollHeight - cardClientHeight > 1);

          cards.push({
            selector: cssPath(card),
            title: truncateText(textOf(title) || textOf(card), 90),
            copyFound: Boolean(copy),
            copySelector: cssPath(copyEl),
            copyClientHeight,
            copyScrollHeight,
            copyOverflow,
            copyOverflowY: copyStyle.overflowY,
            cardClientHeight,
            cardScrollHeight,
            cardOverflow: cardScrollHeight - cardClientHeight,
            clipped,
            outside: outside.slice(0, 8),
            hasMedia: Boolean(media),
            hasTitle: Boolean(title),
            hasDescription: Boolean(description),
            hasAction: Boolean(action),
            chips: chips.length,
            showcaseCard
          });
        }

        function truncateText(value, max) {
          const text = String(value ?? "").replace(/\s+/g, " ").trim();
          return text.length > max ? `${text.slice(0, max - 1)}…` : text;
        }

        const showcaseCards = cards.filter((card) => card.showcaseCard);
        return {
          cardsFound: cards.length,
          showcaseCount: showcaseCards.length,
          clippedCount: cards.filter((card) => card.clipped).length,
          missingTitleCount: showcaseCards.filter((card) => !card.hasTitle).length,
          missingDescriptionCount: showcaseCards.filter((card) => !card.hasDescription).length,
          missingActionCount: showcaseCards.filter((card) => !card.hasAction).length,
          missingMediaCount: showcaseCards.filter((card) => !card.hasMedia).length,
          cards: cards.slice(0, 24)
        };
      },
      {
        error: "card audit failed",
        cardsFound: 0,
        clippedCount: 0,
        missingTitleCount: 0,
        missingDescriptionCount: 0,
        missingActionCount: 0,
        missingMediaCount: 0,
        cards: []
      }
    );

    const tapTargets = await evaluateSafe(
      page,
      () => {
        const laidOut = (el) => {
          if (!(el instanceof Element)) return false;
          if (el.closest("[hidden]")) return false;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number.parseFloat(style.opacity) === 0
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          if (["fixed", "sticky"].includes(style.position)) {
            const onScreen =
              rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
            if (!onScreen) return false;
          }
          return true;
        };
        const accessibleName = (el) => {
          if (!(el instanceof Element)) return "";
          const aria = el.getAttribute("aria-label");
          if (aria?.trim()) return aria.trim();
          const labelledBy = el.getAttribute("aria-labelledby");
          if (labelledBy) {
            const text = labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            if (text) return text;
          }
          if (el.tagName === "INPUT") return el.value?.trim() || el.getAttribute("placeholder")?.trim() || "";
          const imgAlt = el.querySelector("img[alt]")?.getAttribute("alt")?.trim();
          if (imgAlt) return imgAlt;
          return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        };
        const cssPath = (el) => {
          if (!(el instanceof Element)) return "";
          if (el.id) return `#${CSS.escape(el.id)}`;
          const parts = [];
          let node = el;
          while (node && node.nodeType === 1 && parts.length < 5) {
            if (node.id) {
              parts.unshift(`#${CSS.escape(node.id)}`);
              break;
            }
            let part = node.tagName.toLowerCase();
            const parent = node.parentElement;
            if (parent) {
              const sameTag = [...parent.children].filter((child) => child.tagName === node.tagName);
              if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
            }
            const classes = [...node.classList]
              .filter((name) => /^[a-zA-Z][\w-]*$/.test(name))
              .slice(0, 2);
            if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
            parts.unshift(part);
            node = parent;
            if (!node || node === document.documentElement) break;
          }
          return parts.join(" > ");
        };

        const candidates = [
          ...document.querySelectorAll(
            "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [role='link'], [role='tab'], [tabindex]:not([tabindex='-1'])"
          )
        ];

        let excludedInlineParagraphLinks = 0;
        const tooSmall = [];
        let total = 0;
        for (const el of candidates) {
          if (!laidOut(el)) continue;
          if (el.closest("[inert]")) continue;
          if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") continue;
          const name = accessibleName(el);
          const isSkip =
            el.matches(".skip-link, [data-skip-link]") ||
            (el.tagName === "A" && /skip/i.test(name) && /#main$/.test(el.getAttribute("href") ?? ""));
          if (isSkip) continue;
          if (el.tagName === "A" && el.closest("p")) {
            excludedInlineParagraphLinks += 1;
            continue;
          }
          const style = getComputedStyle(el);
          if (style.pointerEvents === "none") continue;
          const rect = el.getBoundingClientRect();
          total += 1;
          const width = Math.round(rect.width * 10) / 10;
          const height = Math.round(rect.height * 10) / 10;
          if (width < 43.5 || height < 43.5) {
            tooSmall.push({
              selector: cssPath(el),
              tag: el.tagName.toLowerCase(),
              label: name.slice(0, 90),
              width,
              height,
              href: el.getAttribute("href") ?? null
            });
          }
        }
        tooSmall.sort((a, b) => a.width * a.height - b.width * b.height);

        return {
          total,
          tooSmallCount: tooSmall.length,
          tooSmall: tooSmall.slice(0, 120),
          min: tooSmall[0]
            ? {
                width: tooSmall[0].width,
                height: tooSmall[0].height,
                label: tooSmall[0].label,
                selector: tooSmall[0].selector
              }
            : null,
          excludedInlineParagraphLinks
        };
      },
      { error: "tap target audit failed", total: 0, tooSmallCount: 0, tooSmall: [] }
    );

    const fonts = await evaluateSafe(
      page,
      () => {
        const laidOut = (el) => {
          if (!(el instanceof Element)) return false;
          if (el.closest("[hidden]")) return false;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number.parseFloat(style.opacity) === 0
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const textOf = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        const cssPath = (el) => {
          if (!(el instanceof Element)) return "";
          if (el.id) return `#${CSS.escape(el.id)}`;
          let node = el;
          let part = node.tagName.toLowerCase();
          const classes = [...node.classList].filter((name) => /^[a-zA-Z][\w-]*$/.test(name)).slice(0, 2);
          if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
          return part;
        };
        const sizeOf = (el) => Math.round(Number.parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
        const collect = (selector) =>
          [...document.querySelectorAll(selector)]
            .filter(laidOut)
            .map((el) => ({ selector: cssPath(el), text: textOf(el).slice(0, 70), size: sizeOf(el) }));

        const h1 = collect("h1");
        const h2 = collect("h2");
        const cardCopySet = new Set();
        for (const selector of [
          ".showcase-copy p",
          ".showcase-copy",
          ".game-card p",
          ".game-copy p",
          ".card-copy p",
          "[data-showcase-card] p",
          ".showcase-card p",
          "[class*='game-card'] p",
          "[class*='showcase-card'] p"
        ]) {
          for (const el of document.querySelectorAll(selector)) {
            if (laidOut(el)) cardCopySet.add(el);
          }
        }
        const cardCopy = [...cardCopySet].map((el) => ({
          selector: cssPath(el),
          text: textOf(el).slice(0, 70),
          size: sizeOf(el)
        }));
        const min = (items) => (items.length ? Math.min(...items.map((item) => item.size)) : null);

        return {
          h1,
          h2,
          cardCopy: cardCopy.slice(0, 30),
          h1Min: min(h1),
          h2Min: min(h2),
          cardMin: min(cardCopy)
        };
      },
      { error: "font audit failed", h1: [], h2: [], cardCopy: [], h1Min: null, h2Min: null, cardMin: null }
    );

    const a11y = await evaluateSafe(
      page,
      () => {
        const laidOut = (el) => {
          if (!(el instanceof Element)) return false;
          if (el.closest("[hidden]")) return false;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number.parseFloat(style.opacity) === 0
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const onScreen = (el) => {
          if (!laidOut(el)) return false;
          const rect = el.getBoundingClientRect();
          return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
        };
        const accessibleName = (el) => {
          if (!(el instanceof Element)) return "";
          const aria = el.getAttribute("aria-label");
          if (aria?.trim()) return aria.trim();
          const labelledBy = el.getAttribute("aria-labelledby");
          if (labelledBy) {
            const text = labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            if (text) return text;
          }
          if (el.tagName === "INPUT") return el.value?.trim() || el.getAttribute("placeholder")?.trim() || "";
          const imageAlt = el.querySelector("img[alt]")?.getAttribute("alt")?.trim();
          if (imageAlt) return imageAlt;
          const svgTitle = el.querySelector("svg title")?.textContent?.trim();
          if (svgTitle) return svgTitle;
          const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
          if (text) return text;
          return el.getAttribute("title")?.trim() ?? "";
        };
        const cssPath = (el) => {
          if (!(el instanceof Element)) return "";
          if (el.id) return `#${CSS.escape(el.id)}`;
          let node = el;
          let part = node.tagName.toLowerCase();
          const classes = [...node.classList].filter((name) => /^[a-zA-Z][\w-]*$/.test(name)).slice(0, 2);
          if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
          return part;
        };

        const mains = [...document.querySelectorAll("main")];
        const mainExact = mains.find((main) => main.id === "main") ?? null;

        const skipCandidates = [
          ...document.querySelectorAll("a[href='#main'], a[href$='#main'], .skip-link, [data-skip-link]")
        ];
        const skipLink =
          skipCandidates.find((el) => {
            const name = accessibleName(el);
            const className = typeof el.className === "string" ? el.className : "";
            return el.matches(".skip-link, [data-skip-link]") || /skip/i.test(name) || /skip/i.test(className);
          }) ?? null;

        const images = [...document.querySelectorAll("img")].filter((img) => img.getAttribute("src") || img.getAttribute("srcset") || img.getAttribute("data-src"));
        const missingAlt = images.filter((img) => !img.hasAttribute("alt"));
        const emptyAlt = images.filter((img) => {
          if (!img.hasAttribute("alt") || img.getAttribute("alt").trim() !== "") return false;
          if (img.closest("[aria-hidden='true']")) return false;
          const role = img.getAttribute("role");
          return role !== "presentation" && role !== "none";
        });

        const buttons = [...document.querySelectorAll("button, input[type='button'], input[type='submit'], [role='button']")].filter(
          laidOut
        );
        const unnamedButtons = buttons.filter((button) => !accessibleName(button));

        const iframes = [...document.querySelectorAll("iframe")];
        const missingTitle = iframes.filter((iframe) => !iframe.getAttribute("title")?.trim());
        const withSrc = iframes
          .filter((iframe) => {
            const attr = iframe.getAttribute("src");
            return Boolean(attr && attr.trim());
          })
          .map((iframe) => ({
            src: iframe.getAttribute("src"),
            resolvedSrc: iframe.src,
            route: iframe.dataset.route ?? null,
            title: iframe.getAttribute("title"),
            visibleOnScreen: onScreen(iframe),
            laidOut: laidOut(iframe),
            pointerEvents: getComputedStyle(iframe).pointerEvents,
            selector: cssPath(iframe)
          }));

        const h1s = [...document.querySelectorAll("h1")];

        return {
          main: {
            existsExact: Boolean(mainExact),
            mainCount: mains.length,
            visible: mainExact ? laidOut(mainExact) : false,
            id: mainExact?.id ?? mains[0]?.id ?? null,
            selector: mainExact ? cssPath(mainExact) : null
          },
          skipLink: {
            exists: Boolean(skipLink),
            href: skipLink?.getAttribute("href") ?? null,
            text: skipLink ? accessibleName(skipLink).slice(0, 90) : null,
            selector: skipLink ? cssPath(skipLink) : null,
            visibleAtLoad: skipLink ? onScreen(skipLink) : false
          },
          h1: {
            total: h1s.length,
            visible: h1s.filter(laidOut).length,
            elements: h1s.map((h1) => ({
              text: (h1.innerText || h1.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140),
              visible: laidOut(h1)
            }))
          },
          images: {
            total: images.length,
            missingAltCount: missingAlt.length,
            missingAlt: missingAlt.slice(0, 20).map((img) => ({
              src: (img.getAttribute("src") ?? "").slice(0, 160),
              selector: cssPath(img)
            })),
            emptyAltCount: emptyAlt.length,
            emptyAlt: emptyAlt.slice(0, 20).map((img) => ({
              src: (img.getAttribute("src") ?? "").slice(0, 160),
              selector: cssPath(img)
            }))
          },
          buttons: {
            total: buttons.length,
            unnamedCount: unnamedButtons.length,
            unnamed: unnamedButtons.slice(0, 20).map((button) => ({
              selector: cssPath(button),
              text: (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)
            }))
          },
          iframes: {
            total: iframes.length,
            withSrcCount: withSrc.length,
            withSrc,
            missingTitleCount: missingTitle.length,
            missingTitle: missingTitle.slice(0, 20).map((iframe) => ({
              selector: cssPath(iframe),
              src: iframe.getAttribute("src")
            }))
          }
        };
      },
      {
        error: "accessibility audit failed",
        main: { existsExact: false, mainCount: 0, visible: false, id: null },
        skipLink: { exists: false },
        h1: { total: 0, visible: 0, elements: [] },
        images: { total: 0, missingAltCount: 0, missingAlt: [], emptyAltCount: 0, emptyAlt: [] },
        buttons: { total: 0, unnamedCount: 0, unnamed: [] },
        iframes: { total: 0, withSrcCount: 0, withSrc: [], missingTitleCount: 0, missingTitle: [] }
      }
    );

    const versions = await evaluateSafe(
      page,
      () => {
        const cssPath = (el) => {
          if (!(el instanceof Element)) return "";
          if (el.id) return `#${CSS.escape(el.id)}`;
          let node = el;
          let part = node.tagName.toLowerCase();
          const classes = [...node.classList].filter((name) => /^[a-zA-Z][\w-]*$/.test(name)).slice(0, 2);
          if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
          return part;
        };
        const isVisible = (node) => {
          const parent = node.parentElement;
          if (!parent) return false;
          if (parent.closest("script, style, noscript, template")) return false;
          const style = getComputedStyle(parent);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number.parseFloat(style.opacity) === 0
          ) {
            return false;
          }
          const range = document.createRange();
          range.selectNodeContents(node);
          return [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
        };
        const allowedPattern = /history|benchmark|changelog|migration|legacy|compat|release(?:[-_]|\d|notes)/i;
        const allowedScope = (node) => {
          let current = node.parentElement;
          while (current && current !== document.body) {
            if (current instanceof Element) {
              const token = `${current.id} ${typeof current.className === "string" ? current.className : ""}`;
              if (allowedPattern.test(token)) {
                return {
                  selector: cssPath(current),
                  id: current.id || null,
                  className: typeof current.className === "string" ? current.className : null
                };
              }
            }
            current = current.parentElement;
          }
          return null;
        };

        const occurrences = [];
        const violations = [];
        const allowedOccurrences = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const text = node.nodeValue ?? "";
          if (!/4\.0\.[01]/.test(text)) continue;
          if (!isVisible(node)) continue;
          const scope = allowedScope(node);
          for (const match of text.matchAll(/4\.0\.[01]\b/g)) {
            const occurrence = {
              version: match[0],
              snippet: text.replace(/\s+/g, " ").trim().slice(0, 180),
              selector: cssPath(node.parentElement),
              allowed: Boolean(scope),
              scope
            };
            occurrences.push(occurrence);
            if (scope) allowedOccurrences.push(occurrence);
            else violations.push(occurrence);
            if (occurrences.length >= 200) break;
          }
          if (occurrences.length >= 200) break;
        }

        const scripts = [...document.querySelectorAll("script[type='application/ld+json']")];
        const parseErrors = [];
        const softwareVersions = [];
        const visit = (value, pointer) => {
          if (!value || typeof value !== "object") return;
          if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, `${pointer}[${index}]`));
            return;
          }
          for (const [key, child] of Object.entries(value)) {
            const childPointer = `${pointer}.${key}`;
            if (key === "softwareVersion" && (typeof child === "string" || typeof child === "number")) {
              softwareVersions.push({ value: String(child), pointer: childPointer });
            }
            visit(child, childPointer);
          }
        };
        scripts.forEach((script, index) => {
          try {
            const data = JSON.parse(script.textContent ?? "");
            visit(data, `$ld[${index}]`);
          } catch (error) {
            parseErrors.push({ index, error: String(error?.message ?? error).slice(0, 300) });
          }
        });

        return {
          visibleOccurrences: occurrences.slice(0, 120),
          violations: violations.slice(0, 120),
          allowedOccurrences: allowedOccurrences.slice(0, 40),
          jsonLd: {
            found: scripts.length > 0,
            scriptCount: scripts.length,
            softwareVersions,
            parseErrors
          }
        };
      },
      {
        error: "version audit failed",
        visibleOccurrences: [],
        violations: [],
        allowedOccurrences: [],
        jsonLd: { found: false, softwareVersions: [], parseErrors: [] }
      }
    );

    const network = {
      ...initialNetwork,
      error: null
    };

    screenshots = await captureScreenshots(page, outDir, label);

    const skipFocus = await testSkipLinkFocus(page);
    const docsInScope = scope?.docsWidths ? scope.docsWidths.has(viewport.width) : isDocsScope(viewport);
    const demoInScope = scope?.demoWidths ? scope.demoWidths.has(viewport.width) : isDemoScope(viewport);
    const docsSearch = docsInScope ? await testDocsSearch(page) : null;
    const copy = docsInScope ? await testCopy(page, context, origin) : null;
    const demo = demoInScope ? await testDemo(page, viewport, session) : null;
    const mobileNav = viewport.width <= 1100 ? await testMobileNav(page, viewport) : null;

    metrics = {
      fatalError: null,
      title,
      finalUrl,
      load: { ok: true, status, error: null, notes: loadNotes },
      overflow,
      nav,
      cards,
      tapTargets,
      fonts,
      a11y,
      versions,
      network,
      resourceTiming,
      postDemoResourceTiming: demo?.timingAfter ?? null,
      postDemoNetwork: demo?.networkAfter ?? null
    };
    interactions = { skipFocus, docsSearch, copy, demo, mobileNav };
  }

  const result = {
    label,
    viewport,
    screenshots,
    metrics,
    interactions
  };
  result.checks = buildChecks(result);
  await context.close();

  // Editing marketing/index.html in a running Vite dev server triggers a full
  // reload. Retry once so a concurrent edit cannot leave half-measured results.
  if (navigationsDuringAudit > 0 && loadOk && attempt < 2) {
    return auditViewport(browser, url, viewport, origin, outDir, scope, attempt + 1);
  }
  if (navigationsDuringAudit > 0) {
    result.metrics.load.notes.push(
      `page reloaded ${navigationsDuringAudit} time(s) during the audit (dev-server HMR); results may mix page versions`
    );
    result.metrics.pageReloadsDuringAudit = navigationsDuringAudit;
    result.checks = buildChecks(result);
  }
  return result;
}

function isDocsScope(viewport) {
  return (
    viewport.width === 1440 ||
    viewport.width === 390 ||
    viewport.width === 360 ||
    viewport.width === 768
  );
}

function isDemoScope(viewport) {
  return viewport.width === 1440 || viewport.width === 390 || viewport.width === 360;
}

async function testSkipLinkFocus(page) {
  try {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    let presses = 0;
    let found = null;
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      presses += 1;
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof Element)) return null;
        const name = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        const isSkip =
          el.matches(".skip-link, [data-skip-link]") ||
          (el.tagName === "A" && /skip/i.test(name) && /#main$/.test(el.getAttribute("href") ?? ""));
        if (!isSkip) {
          return {
            isSkip: false,
            tag: el.tagName.toLowerCase(),
            text: name.slice(0, 80)
          };
        }
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          isSkip: true,
          tag: el.tagName.toLowerCase(),
          text: name.slice(0, 80),
          href: el.getAttribute("href"),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < innerHeight &&
            rect.left < innerWidth &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number.parseFloat(style.opacity) !== 0
        };
      });
      if (info?.isSkip) {
        found = info;
        break;
      }
    }
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    return {
      ok: Boolean(found),
      reachable: Boolean(found),
      presses,
      focused: found,
      visibleAfterFocus: Boolean(found?.visible),
      error: null
    };
  } catch (error) {
    return { ok: false, reachable: false, presses: 0, focused: null, visibleAfterFocus: false, error: truncate(error?.message ?? error, 600) };
  }
}

async function getSearchState(page, inputSelector, query) {
  return page.evaluate(
    ({ inputSelector: selector, query: currentQuery }) => {
      const laidOut = (el) => {
        if (!(el instanceof Element)) return false;
        if (el.closest("[hidden]")) return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        const style = getComputedStyle(el);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          Number.parseFloat(style.opacity) === 0
        ) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const cssPath = (el) => {
        if (!(el instanceof Element)) return "";
        if (el.id) return `#${CSS.escape(el.id)}`;
        let part = el.tagName.toLowerCase();
        const classes = [...el.classList].filter((name) => /^[a-zA-Z][\w-]*$/.test(name)).slice(0, 2);
        if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
        return part;
      };
      const input = document.querySelector(selector);
      if (!input) return { error: "input not found" };
      const resultsSelector =
        "[data-docs-search-results], .docs-search-results, .search-results, [role='listbox'], [data-search-results]";
      // Walk up from the input's parent: closest("[class*='search']") would match the
      // input itself (e.g. class="search-input") and never reach the results list.
      let scope = null;
      let container = null;
      for (let node = input.parentElement; node && node !== document.documentElement; node = node.parentElement) {
        const candidate = node.querySelector(resultsSelector);
        if (candidate && !candidate.contains(input)) {
          scope = node;
          container = candidate;
          break;
        }
      }
      if (!scope) {
        scope =
          input.closest("[data-docs-search], .docs-search, form") ??
          input.parentElement?.parentElement ??
          input.parentElement;
        container = scope?.querySelector(resultsSelector) ?? null;
      }
      let resultEls = [];
      if (container) {
        resultEls = [...container.querySelectorAll("a[href], [role='option'], [data-search-result]")];
      } else {
        resultEls = [...(scope?.querySelectorAll("a[href]") ?? [])].filter(
          (el) =>
            el.hasAttribute("data-search-terms") ||
            el.hasAttribute("data-search-item") ||
            /result/i.test(typeof el.className === "string" ? el.className : "")
        );
      }
      const unique = [...new Set(resultEls)];
      const visible = unique.filter(laidOut);
      const containerStyle = container ? getComputedStyle(container) : null;
      const containerHidden =
        !container ||
        container.hasAttribute("hidden") ||
        container.getAttribute("aria-hidden") === "true" ||
        !containerStyle ||
        containerStyle.display === "none" ||
        containerStyle.visibility === "hidden";
      const results = visible.map((el) => ({
        text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
        terms: el.getAttribute("data-search-terms") ?? "",
        href: el.getAttribute("href")
      }));
      const matching = results.every((result) =>
        `${result.text} ${result.terms}`.toLowerCase().includes(String(currentQuery).toLowerCase())
      );

      const statusCandidates = [
        ...(scope?.querySelectorAll("[role='status'], [aria-live]") ?? []),
        ...document.querySelectorAll("[data-search-status], [data-docs-search-status], [role='status'], [aria-live]")
      ];
      const statuses = statusCandidates
        .filter((el, index, list) => list.indexOf(el) === index)
        .map((el) => {
          const style = getComputedStyle(el);
          return {
            selector: cssPath(el),
            text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
            ariaLive: el.getAttribute("aria-live"),
            role: el.getAttribute("role"),
            display: style.display,
            visibility: style.visibility
          };
        })
        .filter(
          (status) =>
            (status.ariaLive === "polite" || status.ariaLive === "assertive" || status.role === "status") &&
            status.display !== "none" &&
            status.visibility !== "hidden"
        );
      const countStatus = statuses.find((status) => /\d/.test(status.text)) ?? null;

      return {
        error: null,
        query: currentQuery,
        inputValue: input.value,
        totalDom: unique.length,
        visibleCount: visible.length,
        results,
        matching,
        containerHidden,
        statuses,
        countStatus
      };
    },
    { inputSelector, query }
  );
}

async function testDocsSearch(page) {
  try {
    const input = await page.evaluate(() => {
      const laidOut = (el) => {
        if (!(el instanceof Element)) return false;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const cssPath = (el) => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        let part = el.tagName.toLowerCase();
        const classes = [...el.classList].filter((name) => /^[a-zA-Z][\w-]*$/.test(name)).slice(0, 2);
        if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
        return part;
      };
      const candidates = [
        ...document.querySelectorAll(
          "[data-docs-search-input], input[type='search'], input[placeholder*='search' i], input[aria-label*='search' i]"
        )
      ].filter(laidOut);
      const el = candidates[0] ?? null;
      return el
        ? {
            selector: cssPath(el),
            placeholder: el.getAttribute("placeholder"),
            ariaLabel: el.getAttribute("aria-label")
          }
        : null;
    });
    if (!input) {
      return {
        ok: false,
        error: "No visible docs search input found",
        filterPass: false,
        livePass: false,
        clearPass: false,
        before: null,
        after: null,
        afterClear: null
      };
    }

    const locator = page.locator(input.selector).first();
    await locator.scrollIntoViewIfNeeded();
    const before = await getSearchState(page, input.selector, "");
    await locator.fill(SEARCH_QUERY);
    await page.waitForTimeout(350);
    const after = await getSearchState(page, input.selector, SEARCH_QUERY);
    const filterPass = Boolean(
      after &&
        after.visibleCount > 0 &&
        after.matching &&
        (before.visibleCount === 0 || after.visibleCount < before.visibleCount)
    );

    await locator.fill("");
    await page.waitForTimeout(300);
    const afterClear = await getSearchState(page, input.selector, "");
    // Filtering must have produced visible results, and clearing must leave none
    // visible (an aria/data flag alone is not enough).
    const clearPass = Boolean(after && after.visibleCount > 0 && afterClear && afterClear.visibleCount === 0);

    return {
      ok: filterPass && clearPass,
      error: null,
      input,
      query: SEARCH_QUERY,
      before,
      after,
      afterClear,
      filterPass,
      livePass: Boolean(after?.countStatus),
      clearPass
    };
  } catch (error) {
    return {
      ok: false,
      error: truncate(error?.message ?? error, 700),
      filterPass: false,
      livePass: false,
      clearPass: false
    };
  }
}

async function findCopyTarget(page) {
  return page.evaluate(() => {
    const laidOut = (el) => {
      if (!(el instanceof Element)) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const name = (el) =>
      (el.getAttribute("aria-label") || el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const cssPath = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      let part = el.tagName.toLowerCase();
      const classes = [...el.classList].filter((cls) => /^[a-zA-Z][\w-]*$/.test(cls)).slice(0, 2);
      if (classes.length) part += classes.map((cls) => `.${CSS.escape(cls)}`).join("");
      return part;
    };
    const hero = document.querySelector("[data-hero], .hero, header.hero");
    const buttons = [...document.querySelectorAll("button, [role='button']")].filter(laidOut);
    const scored = buttons
      .map((button) => {
        const label = name(button).toLowerCase();
        let score = 0;
        if (button.id === "copyBtn") score += 100;
        if (button.matches("[data-copy-command], [data-copy-install], [data-install-copy]")) score += 80;
        if (hero && hero.contains(button)) score += 30;
        if (/^copy( install| command)?$/i.test(label) || /copy/i.test(label)) score += 20;
        if (button.closest(".install, .install-bar, [data-install], .command-bar, .hero-install")) score += 25;
        return { button, label, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.button ?? null;
    if (!best) return null;

    // Start from the parent so a button class like "install-copy" cannot match the
    // [class*='install'] bar selector and become its own command container.
    const bar =
      best.parentElement?.closest(
        "[data-install], .install, .install-bar, .command-bar, .hero-install, .copy-command, .hero-cta, [class*='install']"
      ) ?? best.parentElement;
    const commandSelector =
      "[data-install-command], [data-command], .install-cmd, .install-code, .command-text, code, pre, .cmd";
    let command = "";
    // Walk up only until a command element is found; this handles markup where the
    // Copy button and the visible command are siblings in a small install bar.
    let node = best.parentElement;
    for (let depth = 0; node && node !== document.documentElement && depth < 6; depth += 1) {
      const candidate = node.querySelector(commandSelector);
      if (candidate && !candidate.contains(best)) {
        command = candidate.innerText || candidate.textContent || "";
        break;
      }
      if (node.matches("[data-install], .install, .install-bar, .command-bar, .hero-install, .home-hero-copy")) break;
      node = node.parentElement;
    }
    if (!command && bar) {
      const clone = bar.cloneNode(true);
      clone.querySelectorAll("button, [role='button'], svg").forEach((el) => el.remove());
      command = clone.innerText || clone.textContent || "";
    }
    const normalize = (value) =>
      String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/^\$\s*/, "")
        .replace(/\s*(?:copy|copied)\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    return {
      selector: cssPath(best),
      label: name(best).slice(0, 100),
      command: normalize(command),
      rawCommand: (command || "").replace(/\s+/g, " ").trim().slice(0, 300)
    };
  });
}

async function testCopy(page, context, origin) {
  let target = null;
  try {
    target = await findCopyTarget(page);
    if (!target) {
      return {
        ok: false,
        error: "No visible Copy button found",
        displayed: null,
        copied: null,
        matches: false
      };
    }
    const locator = page.locator(target.selector).first();
    await page.bringToFront();
    await locator.scrollIntoViewIfNeeded();
    await locator.click({ timeout: 5000 });
    await page.waitForTimeout(400);

    const readClipboard = () =>
      page.evaluate(async () => {
        try {
          if (!navigator.clipboard?.readText) {
            return { ok: false, error: "navigator.clipboard.readText unavailable" };
          }
          const text = await navigator.clipboard.readText();
          return { ok: true, text };
        } catch (error) {
          return { ok: false, error: String(error?.message ?? error) };
        }
      });

    let read = await readClipboard();
    if (!read.ok) {
      try {
        await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      } catch {
        /* reported below */
      }
      await page.waitForTimeout(150);
      read = await readClipboard();
    }

    const displayed = normalizeCommand(target.command);
    const copied = read.ok ? normalizeCommand(read.text) : null;
    const matches = Boolean(read.ok && displayed && copied === displayed);
    return {
      ok: matches,
      error: read.ok ? null : read.error,
      target,
      displayed,
      copied,
      matches,
      readError: read.ok ? null : read.error
    };
  } catch (error) {
    return {
      ok: false,
      error: truncate(error?.message ?? error, 700),
      target,
      displayed: target?.command ?? null,
      copied: null,
      matches: false
    };
  }
}

async function findStage(page) {
  return page.evaluate(() => {
    const laidOut = (el) => {
      if (!(el instanceof Element)) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const cssPath = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 5) {
        if (node.id) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
        let part = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (parent) {
          const sameTag = [...parent.children].filter((child) => child.tagName === node.tagName);
          if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
        }
        const classes = [...node.classList].filter((cls) => /^[a-zA-Z][\w-]*$/.test(cls)).slice(0, 2);
        if (classes.length) part += classes.map((cls) => `.${CSS.escape(cls)}`).join("");
        parts.unshift(part);
        node = parent;
        if (!node || node === document.documentElement) break;
      }
      return parts.join(" > ");
    };
    const selectors = [
      "[data-demo][data-demo-kind='hero']",
      "[data-demo-stage]",
      "[data-demo]",
      ".home-stage",
      ".demo-stage",
      ".stage-poster",
      ".home-hero-media",
      "[data-hero-stage]",
      ".hero-stage",
      ".hero-media",
      ".hero-right",
      ".hero [class*='poster']",
      ".hero [class*='stage']",
      ".hero video",
      ".hero iframe",
      "[data-demo-surface]",
      ".showreel",
      "[data-hero]",
      ".hero"
    ];
    for (const selector of selectors) {
      const el = [...document.querySelectorAll(selector)].find(laidOut);
      if (el) {
        const rect = el.getBoundingClientRect();
        return {
          selector: cssPath(el),
          tag: el.tagName.toLowerCase(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top)
        };
      }
    }
    return null;
  });
}

async function wheelOverStage(page, stageSelector, delta = 600) {
  const stage = page.locator(stageSelector).first();
  await stage.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(200);
  let box = await stage.boundingBox().catch(() => null);
  const viewport = page.viewportSize();
  if (!box || !viewport) return { ok: false, error: "stage has no bounding box" };
  let left = Math.max(box.x, 0);
  let right = Math.min(box.x + box.width, viewport.width);
  let top = Math.max(box.y, 0);
  let bottom = Math.min(box.y + box.height, viewport.height);
  if (right - left < 10 || bottom - top < 10) {
    await stage.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" })).catch(() => {});
    await page.waitForTimeout(200);
    box = await stage.boundingBox().catch(() => null);
    if (!box) return { ok: false, error: "stage has no bounding box after scroll" };
    left = Math.max(box.x, 0);
    right = Math.min(box.x + box.width, viewport.width);
    top = Math.max(box.y, 0);
    bottom = Math.min(box.y + box.height, viewport.height);
  }
  const x = Math.min(Math.max((left + right) / 2, 2), viewport.width - 3);
  const y = Math.min(Math.max((top + bottom) / 2, 2), viewport.height - 3);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.scrollY);
  return {
    ok: after - before >= 20,
    before,
    after,
    delta: after - before,
    mouse: { x: Math.round(x), y: Math.round(y) },
    stage: stageSelector,
    error: null
  };
}

async function findPlayControl(page) {
  return page.evaluate(() => {
    const laidOut = (el) => {
      if (!(el instanceof Element)) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const name = (el) =>
      (el.getAttribute("aria-label") || el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const cssPath = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      let part = el.tagName.toLowerCase();
      const classes = [...el.classList].filter((cls) => /^[a-zA-Z][\w-]*$/.test(cls)).slice(0, 2);
      if (classes.length) part += classes.map((cls) => `.${CSS.escape(cls)}`).join("");
      return part;
    };
    const controls = [...document.querySelectorAll("button, a[href], [role='button'], [role='link']")].filter(laidOut);
    const scored = controls
      .map((el) => {
        const label = name(el).toLowerCase();
        const cls = `${typeof el.className === "string" ? el.className : ""} ${el.id}`.toLowerCase();
        const href = el.getAttribute("href") ?? "";
        const hasDemoHook = /demo|play-live|playlive|showreel/.test(cls);
        let score = 0;
        if (el.matches("[data-demo-play], [data-play-live], [data-demo-trigger], [data-play-demo]")) score += 200;
        if (/play\s*live/.test(label)) score += 120;
        else if (/play\s*(demo|now|scene)/.test(label)) score += 70;
        else if (el.tagName === "BUTTON" && /^play\b/.test(label)) score += 30;
        if (hasDemoHook) score += 50;
        if (el.tagName === "A" && !/^#|^javascript:/i.test(href) && !hasDemoHook) score = 0;
        return { el, label, score, href };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    const chosen = scored[0] ?? null;
    return {
      control: chosen
        ? {
            selector: cssPath(chosen.el),
            label: chosen.label.slice(0, 100),
            tag: chosen.el.tagName.toLowerCase(),
            href: chosen.href || null,
            score: chosen.score
          }
        : null,
      candidates: controls
        .filter((el) => /play/i.test(name(el)))
        .slice(0, 12)
        .map((el) => ({
          selector: cssPath(el),
          label: name(el).slice(0, 90),
          tag: el.tagName.toLowerCase(),
          href: el.getAttribute("href") ?? null
        }))
    };
  });
}

async function collectIframes(page) {
  return page.evaluate(() => {
    const laidOut = (el) => {
      if (!(el instanceof Element)) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const onScreen = (el) => {
      if (!laidOut(el)) return false;
      const rect = el.getBoundingClientRect();
      return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    };
    return [...document.querySelectorAll("iframe")].map((iframe) => {
      const src = iframe.getAttribute("src");
      const resolved = iframe.src;
      const route = iframe.dataset.route ?? null;
      const style = getComputedStyle(iframe);
      return {
        src,
        resolvedSrc: resolved,
        route,
        title: iframe.getAttribute("title"),
        visibleOnScreen: onScreen(iframe),
        laidOut: laidOut(iframe),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        rect: (() => {
          const rect = iframe.getBoundingClientRect();
          return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        })()
      };
    });
  });
}

async function findCloseControl(page) {
  return page.evaluate(() => {
    const laidOut = (el) => {
      if (!(el instanceof Element)) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const name = (el) =>
      (el.getAttribute("aria-label") || el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const cssPath = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      let part = el.tagName.toLowerCase();
      const classes = [...el.classList].filter((cls) => /^[a-zA-Z][\w-]*$/.test(cls)).slice(0, 2);
      if (classes.length) part += classes.map((cls) => `.${CSS.escape(cls)}`).join("");
      return part;
    };
    const controls = [...document.querySelectorAll("button, a[href], [role='button']")]
      .filter(laidOut)
      .filter((el) => !el.closest("nav"));
    const scored = controls
      .map((el) => {
        const label = name(el).toLowerCase();
        const cls = `${typeof el.className === "string" ? el.className : ""} ${el.id}`.toLowerCase();
        let score = 0;
        if (el.matches("[data-demo-close], [data-close-demo], #demoClose, .demo-close")) score += 200;
        if (/close\s*(demo|live|scene)/.test(label)) score += 120;
        else if (/back\s*to\s*(page|site)|exit\s*demo|stop\s*demo/.test(label)) score += 90;
        else if (/^close$|^×$|^x$/i.test(label) || /close/.test(cls)) score += 40;
        if (el.tagName === "A" && !/^#|^javascript:/i.test(el.getAttribute("href") ?? "")) score = 0;
        return { el, label, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    const chosen = scored[0] ?? null;
    return chosen
      ? {
          selector: cssPath(chosen.el),
          label: chosen.label.slice(0, 100),
          tag: chosen.el.tagName.toLowerCase(),
          score: chosen.score
        }
      : null;
  });
}

async function testDemo(page, viewport, session) {
  const result = {
    ok: false,
    stage: null,
    scroll: null,
    playControl: null,
    iframeBefore: null,
    iframeAfter: null,
    closeControl: null,
    closed: null,
    scrollAfter: null,
    timingAfter: null,
    networkAfter: null,
    errors: []
  };

  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    const stage = await findStage(page);
    result.stage = stage;
    if (!stage) {
      result.errors.push("No visible hero poster/stage found");
      return result;
    }

    result.scroll = await wheelOverStage(page, stage.selector, 600);
    if (!result.scroll.ok) result.errors.push(`Wheel over stage did not scroll: ${JSON.stringify(result.scroll)}`);

    const play = await findPlayControl(page);
    result.playControl = play.control;
    result.playCandidates = play.candidates;
    if (!play.control) {
      result.errors.push("No Play live control found");
      return result;
    }

    const before = await collectIframes(page);
    result.iframeBefore = before.filter((iframe) => iframe.src && iframe.visibleOnScreen);

    const playLocator = page.locator(play.control.selector).first();
    await playLocator.scrollIntoViewIfNeeded().catch(() => {});
    await playLocator.click({ timeout: 6000 });
    const deadline = Date.now() + 6000;
    let iframes = [];
    while (Date.now() < deadline) {
      iframes = await collectIframes(page);
      const routeIframe = iframes.find(
        (iframe) =>
          iframe.src &&
          iframe.visibleOnScreen &&
          (iframe.route || /\/apps\//i.test(iframe.src) || !/^about:blank/i.test(iframe.src))
      );
      if (routeIframe) break;
      await page.waitForTimeout(250);
    }
    result.iframeAfter = iframes;
    const routeIframe =
      iframes.find(
        (iframe) =>
          iframe.src &&
          iframe.visibleOnScreen &&
          (iframe.route || /\/apps\//i.test(iframe.src) || !/^about:blank/i.test(iframe.src))
      ) ?? null;
    result.routeIframe = routeIframe;

    result.timingAfter = await collectResourceTiming(page);
    result.networkAfter = snapshotNetwork(session);
    await page.waitForTimeout(300);

    // Some implementations deliberately require a second "Click to interact"
    // before the iframe accepts pointer input. Record it, but the hard pass
    // above still follows the plan: pointer-events must be auto after Play.
    const stageLocator = page.locator(stage.selector).first();
    let armLocator = stageLocator.locator("[data-demo-arm]").first();
    if ((await armLocator.count()) === 0 || !(await armLocator.isVisible().catch(() => false))) {
      armLocator = stageLocator.locator("button").filter({ hasText: /interact/i }).first();
    }
    try {
      if ((await armLocator.count()) > 0 && (await armLocator.isVisible())) {
        result.arm = {
          label: truncate((await armLocator.innerText().catch(() => "")) || "Click to interact", 80)
        };
        await armLocator.click({ timeout: 4000 });
        await page.waitForTimeout(450);
        const afterArm = await collectIframes(page);
        result.iframesAfterArm = afterArm;
        const interactiveIframe =
          afterArm.find(
            (iframe) =>
              iframe.src &&
              iframe.visibleOnScreen &&
              (iframe.route || /\/apps\//i.test(iframe.src) || !/^about:blank/i.test(iframe.src))
          ) ?? null;
        result.pointerEventsAfterArm = interactiveIframe?.pointerEvents ?? null;
        result.interactiveIframe = interactiveIframe;
      }
    } catch (error) {
      result.errors.push(`interaction arm: ${truncate(error?.message ?? error, 300)}`);
    }

    const close = await findCloseControl(page);
    result.closeControl = close;
    if (close) {
      await page.locator(close.selector).first().click({ timeout: 5000 });
      await page.waitForTimeout(600);
    } else {
      result.errors.push("No Close demo control found");
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
    }

    const afterClose = await collectIframes(page);
    const visibleRouteAfter = afterClose.filter(
      (iframe) =>
        iframe.src &&
        iframe.visibleOnScreen &&
        (iframe.route || /\/apps\//i.test(iframe.src) || !/^about:blank/i.test(iframe.src))
    );
    result.closed = {
      visibleRouteIframes: visibleRouteAfter,
      closeControlFound: Boolean(close),
      pass: Boolean(close) && visibleRouteAfter.length === 0
    };

    const stage2 = (await findStage(page)) ?? stage;
    result.stageAfter = stage2;
    result.scrollAfter = await wheelOverStage(page, stage2.selector, 600).catch((error) => ({
      ok: false,
      error: truncate(error?.message ?? error, 500)
    }));

    result.ok =
      Boolean(result.scroll?.ok) &&
      Boolean(routeIframe && routeIframe.pointerEvents === "auto") &&
      Boolean(result.closed?.pass) &&
      Boolean(result.scrollAfter?.ok);

    if (routeIframe && routeIframe.pointerEvents !== "auto") {
      result.errors.push(`Demo iframe pointer-events is ${routeIframe.pointerEvents}, expected auto`);
    }
    if (!routeIframe) result.errors.push("No visible iframe with a route src appeared after Play");
    if (!result.scrollAfter?.ok) result.errors.push("Page did not scroll after closing the demo");
    return result;
  } catch (error) {
    result.errors.push(truncate(error?.message ?? error, 800));
    return result;
  }
}

async function testMobileNav(page, viewport) {
  const result = {
    ok: false,
    trigger: null,
    drawer: null,
    focus: null,
    closed: null,
    errors: []
  };

  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    const trigger = await page.evaluate(() => {
      const laidOut = (el) => {
        if (!(el instanceof Element)) return false;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const name = (el) =>
        (el.getAttribute("aria-label") || el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      const cssPath = (el) => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        let part = el.tagName.toLowerCase();
        const classes = [...el.classList].filter((cls) => /^[a-zA-Z][\w-]*$/.test(cls)).slice(0, 2);
        if (classes.length) part += classes.map((cls) => `.${CSS.escape(cls)}`).join("");
        return part;
      };
      const nav = [...document.querySelectorAll("nav, [role='navigation']")].find(laidOut) ?? document.querySelector("header");
      const root = nav?.closest("header") ?? nav ?? document;
      const candidates = [...root.querySelectorAll("button, [role='button'], a, label")].filter(laidOut);
      const el =
        candidates.find((candidate) => {
          const label = name(candidate).toLowerCase();
          const cls = `${typeof candidate.className === "string" ? candidate.className : ""} ${candidate.id}`.toLowerCase();
          const controls = (candidate.getAttribute("aria-controls") ?? "").toLowerCase();
          if (candidate.matches("[data-nav-toggle], [data-menu-toggle], [data-nav-open], .nav-toggle, .menu-toggle, .hamburger")) {
            return true;
          }
          if (candidate.tagName === "BUTTON" || candidate.getAttribute("role") === "button") {
            return /menu|navigation|drawer/.test(`${label} ${cls} ${controls}`);
          }
          return false;
        }) ?? null;
      if (!el) return null;
      return {
        selector: cssPath(el),
        label: name(el).slice(0, 100),
        expanded: el.getAttribute("aria-expanded"),
        controls: el.getAttribute("aria-controls"),
        tag: el.tagName.toLowerCase()
      };
    });
    result.trigger = trigger;
    if (!trigger) {
      result.errors.push("No hamburger/menu trigger found at this width");
      return result;
    }

    await page.locator(trigger.selector).first().click({ timeout: 5000 });
    await page.waitForTimeout(450);

    const open = await page.evaluate(
      ({ triggerSelector }) => {
        const laidOut = (el) => {
          if (!(el instanceof Element)) return false;
          if (el.closest("[hidden]")) return false;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number.parseFloat(style.opacity) === 0
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const onScreen = (el) => {
          if (!laidOut(el)) return false;
          const rect = el.getBoundingClientRect();
          return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
        };
        const name = (el) =>
          (el.getAttribute("aria-label") || el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        const cssPath = (el) => {
          if (el.id) return `#${CSS.escape(el.id)}`;
          const parts = [];
          let node = el;
          while (node && node.nodeType === 1 && parts.length < 5) {
            if (node.id) {
              parts.unshift(`#${CSS.escape(node.id)}`);
              break;
            }
            let part = node.tagName.toLowerCase();
            const parent = node.parentElement;
            if (parent) {
              const sameTag = [...parent.children].filter((child) => child.tagName === node.tagName);
              if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
            }
            const classes = [...node.classList].filter((cls) => /^[a-zA-Z][\w-]*$/.test(cls)).slice(0, 2);
            if (classes.length) part += classes.map((cls) => `.${CSS.escape(cls)}`).join("");
            parts.unshift(part);
            node = parent;
            if (!node || node === document.documentElement) break;
          }
          return parts.join(" > ");
        };
        const trigger = document.querySelector(triggerSelector);
        const controlsId = trigger?.getAttribute("aria-controls");
        const candidates = [];
        if (controlsId) {
          const controlled = document.getElementById(controlsId);
          if (controlled) candidates.push(controlled);
        }
        for (const selector of [
          "#mobile-nav",
          "#nav-drawer",
          "#site-menu",
          "#mobile-menu",
          ".nav-drawer",
          ".mobile-nav",
          ".menu-drawer",
          ".mobile-menu",
          ".nav-menu-panel",
          ".nav-sheet",
          "[data-nav-drawer]",
          "[data-mobile-nav]",
          "[data-nav-panel]",
          "[data-mobile-menu]",
          "[data-menu-panel]",
          "[role='dialog']",
          "[role='menu']",
          "[class*='drawer' i]",
          "[class*='mobile' i][class*='menu' i]",
          "[id*='drawer' i]",
          "[id*='menu' i]"
        ]) {
          for (const el of document.querySelectorAll(selector)) {
            if (!candidates.includes(el)) candidates.push(el);
          }
        }
        const visibleDrawers = candidates
          .filter((el) => onScreen(el) && el !== trigger && !el.contains(trigger))
          .sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return br.width * br.height - ar.width * ar.height;
          });
        const drawer = visibleDrawers[0] ?? null;
        const links = drawer
          ? [...drawer.querySelectorAll("a[href], button, [role='link'], [role='button']")]
              .filter(onScreen)
              .map((el) => ({
                text: name(el).slice(0, 80),
                href: el.getAttribute("href"),
                tag: el.tagName.toLowerCase(),
                selector: cssPath(el)
              }))
          : [];
        const active = document.activeElement;
        const focusInDrawer = Boolean(
          drawer && active && active !== trigger && (active === drawer || drawer.contains(active))
        );
        const bodyStyle = getComputedStyle(document.body);
        const htmlStyle = getComputedStyle(document.documentElement);
        return {
          trigger: trigger
            ? {
                expanded: trigger.getAttribute("aria-expanded"),
                controls: trigger.getAttribute("aria-controls")
              }
            : null,
          drawer: drawer
            ? {
                selector: cssPath(drawer),
                rect: (() => {
                  const rect = drawer.getBoundingClientRect();
                  return {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                  };
                })(),
                visible: true,
                ariaHidden: drawer.getAttribute("aria-hidden"),
                hiddenAttr: drawer.hasAttribute("hidden")
              }
            : null,
          drawerCount: candidates.filter(onScreen).length,
          links,
          focus: {
            selector: active ? cssPath(active) : null,
            label: active ? name(active).slice(0, 100) : null,
            tag: active?.tagName?.toLowerCase() ?? null,
            inDrawer: focusInDrawer,
            isTrigger: active === trigger
          },
          bodyLocked:
            bodyStyle.overflowY === "hidden" ||
            bodyStyle.overflow === "hidden" ||
            htmlStyle.overflowY === "hidden" ||
            htmlStyle.overflow === "hidden"
        };
      },
      { triggerSelector: trigger.selector }
    );
    result.drawer = open.drawer;
    result.links = open.links;
    result.focus = open.focus;
    result.bodyLocked = open.bodyLocked;
    result.expandedAfterOpen = open.trigger?.expanded ?? null;
    result.drawerCount = open.drawerCount;

    if (!open.drawer) result.errors.push("Drawer did not become visible after clicking the menu trigger");
    if (open.trigger?.expanded !== "true") {
      result.errors.push(`aria-expanded is ${JSON.stringify(open.trigger?.expanded)}, expected "true"`);
    }
    if (!open.focus?.inDrawer) {
      result.errors.push(`Focus did not move into the drawer (active: ${open.focus?.selector ?? "none"})`);
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    const closed = await page.evaluate(
      ({ triggerSelector, drawerSelector }) => {
        const laidOut = (el) => {
          if (!(el instanceof Element)) return false;
          if (el.closest("[hidden]")) return false;
          const style = getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number.parseFloat(style.opacity) === 0
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const onScreen = (el) => {
          if (!laidOut(el)) return false;
          const rect = el.getBoundingClientRect();
          return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
        };
        const trigger = document.querySelector(triggerSelector);
        const drawer = drawerSelector ? document.querySelector(drawerSelector) : null;
        return {
          expanded: trigger?.getAttribute("aria-expanded") ?? null,
          drawerExists: Boolean(drawer),
          drawerVisible: Boolean(drawer && onScreen(drawer)),
          drawerHiddenAttr: Boolean(drawer?.hasAttribute("hidden")),
          drawerAriaHidden: drawer?.getAttribute("aria-hidden") ?? null,
          bodyOverflow: getComputedStyle(document.body).overflow,
          bodyOverflowY: getComputedStyle(document.body).overflowY,
          focusSelector: document.activeElement instanceof Element ? document.activeElement.tagName.toLowerCase() : null
        };
      },
      {
        triggerSelector: trigger.selector,
        drawerSelector: open.drawer?.selector ?? null
      }
    );
    result.closed = {
      ...closed,
      pass: closed.expanded !== "true" && !closed.drawerVisible
    };
    result.ok =
      Boolean(open.drawer) &&
      result.expandedAfterOpen === "true" &&
      Boolean(open.focus?.inDrawer) &&
      Boolean(result.closed.pass);

    if (!result.closed.pass) {
      result.errors.push(
        `Drawer not closed after Escape (expanded=${JSON.stringify(closed.expanded)}, visible=${closed.drawerVisible})`
      );
    }
    return result;
  } catch (error) {
    result.errors.push(truncate(error?.message ?? error, 800));
    return result;
  }
}

function check(id, title, severity, pass, measured, details) {
  return {
    id,
    title,
    severity,
    pass: Boolean(pass),
    measured: truncate(measured, 500),
    ...(details ? { details } : {})
  };
}

function buildChecks(result) {
  const { viewport, metrics, interactions, label } = result;
  const checks = [];
  const m = metrics;

  if (!m) {
    checks.push(check("page-load", "Page loads successfully", "hard", false, "No metrics collected", { viewport: label }));
    return checks;
  }

  checks.push(
    check(
      "page-load",
      "Page loads successfully (HTTP < 400)",
      "hard",
      m.load.ok,
      m.load.ok ? `HTTP ${m.load.status}; ${m.finalUrl}` : `HTTP ${m.load.status ?? "n/a"}; ${m.load.error}`,
      { loadNotes: m.load.notes }
    )
  );

  if (m.fatalError) {
    checks.push(check("evidence", "Screenshots captured", "advisory", Boolean(result.screenshots?.full), "Page failed to load", result.screenshots));
    return checks;
  }

  const overflow = m.overflow;
  checks.push(
    check(
      "overflow",
      "No horizontal overflow",
      "hard",
      !overflow.error && overflow.scrollWidth <= overflow.innerWidth + 1,
      overflow.error
        ? `audit error: ${overflow.error}`
        : `scrollWidth ${overflow.scrollWidth} vs innerWidth ${overflow.innerWidth} (${overflow.overflowPx}px over)`,
      { offenders: overflow.offenders, clientWidth: overflow.clientWidth }
    )
  );

  const heightBudget = viewport.width >= 1024 ? 11000 : 18000;
  checks.push(
    check(
      "page-height",
      "Page height within plan budget",
      "advisory",
      Number(m.overflow.pageHeight) <= heightBudget,
      `${m.overflow.pageHeight ?? "?"}px (${heightBudget}px ${viewport.width >= 1024 ? "desktop" : "mobile"} budget)`,
      { budgetPx: heightBudget }
    )
  );

  const wantHamburger = viewport.width <= 1100;
  const primaryCount = m.nav.primaryLinks?.length ?? 0;
  const hamburger = m.nav.hamburger?.found ? m.nav.hamburger : null;
  const navPass =
    m.nav.found &&
    (wantHamburger ? Boolean(hamburger) : primaryCount >= 4);
  checks.push(
    check(
      "nav-presence",
      wantHamburger
        ? "Mobile/tablet nav has a hamburger trigger"
        : "Desktop nav exposes primary links",
      "hard",
      navPass,
      m.nav.error
        ? `audit error: ${m.nav.error}`
        : `${primaryCount} visible primary link(s); hamburger ${
            hamburger ? `present (aria-expanded=${JSON.stringify(hamburger.expanded)})` : "absent"
          }; width ${viewport.width}${wantHamburger ? " requires hamburger" : " requires >=4 links"}`,
      { primaryLinks: m.nav.primaryLinks, hamburger: m.nav.hamburger }
    )
  );

  const overlaps = m.nav.overlaps ?? [];
  checks.push(
    check(
      "nav-overlap",
      "No nav/logo/action overlap",
      "hard",
      m.nav.found && overlaps.length === 0,
      m.nav.found
        ? `${overlaps.length} overlapping pair(s)${
            overlaps.length ? `: ${overlaps.slice(0, 3).map((pair) => `${pair.a} x ${pair.b}`).join("; ")}` : ""
          }`
        : `nav not found (${m.nav.error ?? "no nav element"})`,
      { overlaps }
    )
  );

  const navOverflow = m.nav.navOverflow;
  checks.push(
    check(
      "nav-overflow",
      "Nav does not clip its own content",
      "advisory",
      Boolean(navOverflow && navOverflow.overflowPx <= 1),
      navOverflow ? `nav scrollWidth ${navOverflow.scrollWidth} vs clientWidth ${navOverflow.clientWidth}` : "nav not found",
      navOverflow
    )
  );

  checks.push(
    check(
      "showcase-copy",
      "Gallery/showcase card copy is not clipped",
      "hard",
      m.cards.cardsFound > 0 && m.cards.clippedCount === 0,
      m.cards.error
        ? `audit error: ${m.cards.error}`
        : `${m.cards.cardsFound} card(s); ${m.cards.clippedCount} clipped`,
      {
        cards: m.cards.cards?.filter((card) => card.clipped) ?? [],
        missingCopy: m.cards.cards?.filter((card) => !card.copyFound) ?? []
      }
    )
  );

  checks.push(
    check(
      "showcase-content",
      "Showcase cards expose media/title/description/action",
      "advisory",
      (m.cards.showcaseCount ?? 0) > 0 &&
        m.cards.missingMediaCount === 0 &&
        m.cards.missingTitleCount === 0 &&
        m.cards.missingDescriptionCount === 0 &&
        m.cards.missingActionCount === 0,
      `${m.cards.showcaseCount ?? 0} showcase card(s) of ${m.cards.cardsFound}; missing media=${m.cards.missingMediaCount}, title=${m.cards.missingTitleCount}, description=${m.cards.missingDescriptionCount}, action=${m.cards.missingActionCount}`,
      { cards: m.cards.cards }
    )
  );

  const tap = m.tapTargets;
  checks.push(
    check(
      "tap-targets",
      "Interactive tap targets are at least 44x44",
      "hard",
      !tap.error && tap.tooSmallCount === 0,
      tap.error
        ? `audit error: ${tap.error}`
        : `${tap.tooSmallCount} of ${tap.total} target(s) <44x44${
            tap.min ? `; smallest ${tap.min.width}x${tap.min.height} (${tap.min.selector})` : ""
          }; ${tap.excludedInlineParagraphLinks ?? 0} inline paragraph link(s) excluded`,
      { targets: tap.tooSmall, min: tap.min }
    )
  );

  const fonts = m.fonts;
  const fontMax = (items) => (items?.length ? Math.max(...items.map((item) => item.size)) : null);
  const h1Max = fontMax(fonts.h1);
  const h2Max = fontMax(fonts.h2);
  const cardMax = fontMax(fonts.cardCopy);
  const smallestCard = (fonts.cardCopy ?? []).reduce(
    (smallest, item) => (!smallest || item.size < smallest.size ? item : smallest),
    null
  );
  checks.push(
    check(
      "type-scale",
      "H1/H2/card type scale meets plan targets",
      "advisory",
      Boolean(
        fonts.h1Min >= 36 &&
          h1Max <= 56 &&
          fonts.h2Min >= 28 &&
          h2Max <= 36 &&
          fonts.cardMin >= 14 &&
          cardMax <= 15
      ),
      `H1 ${fonts.h1Min ?? "?"}px (target 36-56), H2 ${fonts.h2Min ?? "?"}px (target 28-36), card ${
        fonts.cardMin ?? "?"
      }px (target 14-15)${smallestCard ? `; smallest ${smallestCard.selector} "${smallestCard.text.slice(0, 40)}"` : ""}`,
      { h1: fonts.h1, h2: fonts.h2, cardCopy: fonts.cardCopy, h1Max, h2Max, cardMax }
    )
  );

  const iframeSrc = m.a11y.iframes?.withSrc ?? [];
  checks.push(
    check(
      "preclick-iframes",
      "No iframe has a src before user interaction",
      "hard",
      iframeSrc.length === 0,
      `${iframeSrc.length} iframe(s) with src before any demo click${
        iframeSrc.length ? `: ${iframeSrc.slice(0, 3).map((iframe) => iframe.src).join("; ")}` : ""
      }`,
      { iframes: iframeSrc }
    )
  );

  checks.push(
    check(
      "preclick-engine",
      "No WebGL/engine bundle request before user interaction",
      "hard",
      m.network.engineRequests.length === 0,
      `${m.network.engineRequests.length} engine/WebGL request(s) before click${
        m.network.engineRequests.length
          ? `: ${m.network.engineRequests.slice(0, 4).map((request) => request.url).join("; ")}`
          : ""
      }`,
      { requests: m.network.engineRequests }
    )
  );

  const consoleCount = (m.network.consoleErrorCount ?? 0) + (m.network.pageErrorCount ?? 0);
  checks.push(
    check(
      "console-errors",
      "Zero console/page errors on initial load",
      "hard",
      consoleCount === 0,
      `${m.network.consoleErrorCount ?? 0} console error(s), ${m.network.pageErrorCount ?? 0} page error(s)`,
      { consoleErrors: m.network.consoleErrors, pageErrors: m.network.pageErrors }
    )
  );

  const failedCount = (m.network.failedResponseCount ?? 0) + (m.network.requestFailureCount ?? 0);
  checks.push(
    check(
      "failed-requests",
      "Zero failed requests (HTTP >=400 or network failure) on initial load",
      "hard",
      failedCount === 0,
      `${m.network.failedResponseCount ?? 0} response(s) >=400, ${m.network.requestFailureCount ?? 0} network failure(s)`,
      { failedResponses: m.network.failedResponses, requestFailures: m.network.requestFailures }
    )
  );

  checks.push(
    check(
      "main-landmark",
      "<main id=\"main\"> landmark exists",
      "hard",
      Boolean(m.a11y.main?.existsExact && m.a11y.main?.visible),
      m.a11y.error
        ? `audit error: ${m.a11y.error}`
        : m.a11y.main?.existsExact
          ? `main#main ${m.a11y.main.visible ? "visible" : "not visible"}`
          : `main#main missing (${m.a11y.main?.mainCount ?? 0} main element(s))`,
      m.a11y.main
    )
  );

  const skip = m.a11y.skipLink;
  const skipFocus = interactions.skipFocus;
  const skipPass =
    Boolean(skip?.exists) &&
    String(skip?.href ?? "").endsWith("#main") &&
    Boolean(skipFocus?.reachable) &&
    Boolean(skipFocus?.visibleAfterFocus);
  checks.push(
    check(
      "skip-link",
      "Skip link exists and is keyboard-reachable",
      "hard",
      skipPass,
      skip?.exists
        ? `href=${skip.href}; focus reachable=${skipFocus?.reachable ?? false} after ${skipFocus?.presses ?? "?"} Tab(s), visible=${skipFocus?.visibleAfterFocus ?? false}`
        : "No skip link found",
      { skipLink: skip, focus: skipFocus }
    )
  );

  checks.push(
    check(
      "single-h1",
      "Exactly one H1",
      "hard",
      m.a11y.h1?.total === 1,
      `${m.a11y.h1?.total ?? 0} H1 element(s) (${m.a11y.h1?.visible ?? 0} visible)`,
      m.a11y.h1?.elements
    )
  );

  checks.push(
    check(
      "image-alt",
      "Images have alt attributes",
      "hard",
      (m.a11y.images?.missingAltCount ?? 0) === 0,
      `${m.a11y.images?.missingAltCount ?? 0} image(s) missing alt of ${m.a11y.images?.total ?? 0}`,
      { missingAlt: m.a11y.images?.missingAlt }
    )
  );

  checks.push(
    check(
      "image-alt-empty",
      "Non-decorative images have non-empty alt text",
      "advisory",
      (m.a11y.images?.emptyAltCount ?? 0) === 0,
      `${m.a11y.images?.emptyAltCount ?? 0} image(s) with empty alt and no aria-hidden/presentation role`,
      { emptyAlt: m.a11y.images?.emptyAlt }
    )
  );

  checks.push(
    check(
      "button-names",
      "Buttons have accessible names",
      "hard",
      (m.a11y.buttons?.unnamedCount ?? 0) === 0,
      `${m.a11y.buttons?.unnamedCount ?? 0} unnamed of ${m.a11y.buttons?.total ?? 0} visible button(s)`,
      { unnamed: m.a11y.buttons?.unnamed }
    )
  );

  checks.push(
    check(
      "iframe-titles",
      "Iframes have title attributes",
      "hard",
      (m.a11y.iframes?.missingTitleCount ?? 0) === 0,
      `${m.a11y.iframes?.missingTitleCount ?? 0} iframe(s) missing title of ${m.a11y.iframes?.total ?? 0}`,
      { missingTitle: m.a11y.iframes?.missingTitle }
    )
  );

  const violations = m.versions?.violations ?? [];
  checks.push(
    check(
      "version-text",
      "No stale visible 4.0.0/4.0.1 text outside history/benchmark sections",
      "hard",
      violations.length === 0,
      `${violations.length} stale visible occurrence(s)${
        violations.length ? `: ${violations.slice(0, 4).map((item) => item.version).join(", ")}` : ""
      }`,
      {
        violations,
        allowed: m.versions?.allowedOccurrences ?? []
      }
    )
  );

  const jsonLd = m.versions?.jsonLd;
  const schemaOk =
    Boolean(jsonLd?.found) &&
    (jsonLd?.parseErrors?.length ?? 0) === 0 &&
    (jsonLd?.softwareVersions?.length ?? 0) > 0 &&
    jsonLd.softwareVersions.every((entry) => entry.value === EXPECTED_VERSION);
  checks.push(
    check(
      "version-schema",
      `JSON-LD softwareVersion is ${EXPECTED_VERSION}`,
      "hard",
      schemaOk,
      jsonLd?.found
        ? `softwareVersion=${jsonLd.softwareVersions.map((entry) => entry.value).join(", ") || "missing"}${
            jsonLd.parseErrors?.length ? `; ${jsonLd.parseErrors.length} parse error(s)` : ""
          }`
        : "No application/ld+json script found",
      jsonLd
    )
  );

  const timing = m.resourceTiming;
  checks.push(
    check(
      "initial-transfer",
      "Initial transfer stays under 1.5 MB (dev-server advisory)",
      "advisory",
      Boolean(timing && timing.transferBytes < INITIAL_TRANSFER_BUDGET),
      timing?.error
        ? `audit error: ${timing.error}`
        : `${formatBytes(timing?.transferBytes)} across ${timing?.resourceCount ?? 0} resource(s) in ${
            timing?.frames?.length ?? 0
          } frame(s); budget 1.5 MB`,
      timing
    )
  );

  checks.push(
    check(
      "evidence-screenshots",
      "Viewport and full-page screenshots captured",
      "advisory",
      Boolean(result.screenshots?.viewport && result.screenshots?.full),
      result.screenshots?.errors?.length ? result.screenshots.errors.join("; ") : "both captured",
      result.screenshots
    )
  );

  if (interactions.docsSearch) {
    const search = interactions.docsSearch;
    const before = search.before?.visibleCount ?? null;
    const after = search.after?.visibleCount ?? null;
    checks.push(
      check(
        "docs-search-filter",
        "Docs search filters results when typing",
        "hard",
        Boolean(search.filterPass),
        search.error
          ? `error: ${search.error}`
          : `${before} -> ${after} visible result(s) of ${search.after?.totalDom ?? "?"} for "${SEARCH_QUERY}"`,
        search
      )
    );
    checks.push(
      check(
        "docs-search-live",
        "Docs search announces a result count via aria-live",
        "hard",
        Boolean(search.livePass),
        search.after?.countStatus
          ? `status "${search.after.countStatus.text}" via ${search.after.countStatus.selector}`
          : "No aria-live/status element with a numeric count after typing",
        { statuses: search.after?.statuses ?? [] }
      )
    );
    checks.push(
      check(
        "docs-search-clear",
        "Docs search results hide after clearing",
        "hard",
        Boolean(search.clearPass),
        search.afterClear
          ? `after clear: ${search.afterClear.visibleCount} visible result(s); container hidden=${search.afterClear.containerHidden}`
          : "no post-clear state",
        search.afterClear
      )
    );
  }

  if (interactions.copy) {
    const copy = interactions.copy;
    checks.push(
      check(
        "copy-command",
        "Hero Copy copies the visible install command exactly",
        "hard",
        Boolean(copy.matches),
        copy.matches
          ? `copied "${truncate(copy.copied, 160)}"`
          : copy.error
            ? `clipboard/read error: ${copy.error}; displayed "${truncate(copy.displayed, 160)}"`
            : `copied "${truncate(copy.copied, 160)}" != displayed "${truncate(copy.displayed, 160)}"`,
        copy
      )
    );
  }

  if (interactions.demo) {
    const demo = interactions.demo;
    checks.push(
      check(
        "demo-scroll-poster",
        "Wheel over hero poster scrolls the page",
        "hard",
        Boolean(demo.scroll?.ok),
        demo.scroll
          ? `${demo.scroll.stage ?? demo.stage?.selector ?? "stage"}: scrollY ${demo.scroll.before} -> ${demo.scroll.after} (Δ${demo.scroll.delta})`
          : `stage ${demo.stage?.selector ?? "not found"}; no wheel result`,
        { stage: demo.stage, scroll: demo.scroll }
      )
    );
    const routeIframe = demo.routeIframe;
    checks.push(
      check(
        "demo-play",
        "Play live reveals a route iframe with pointer-events auto",
        "hard",
        Boolean(routeIframe && routeIframe.pointerEvents === "auto" && routeIframe.visibleOnScreen),
        demo.playControl
          ? routeIframe
            ? `iframe src="${truncate(routeIframe.src, 150)}" visible=${routeIframe.visibleOnScreen} pointer-events=${routeIframe.pointerEvents}${
                demo.arm
                  ? `; after "${demo.arm.label}" click pointer-events=${demo.pointerEventsAfterArm ?? "unknown"}`
                  : ""
              }`
            : "Play clicked but no visible route iframe appeared"
          : "No Play live control found",
        {
          playControl: demo.playControl,
          candidates: demo.playCandidates,
          iframes: demo.iframeAfter,
          interactionArm: demo.arm,
          pointerEventsAfterArm: demo.pointerEventsAfterArm
        }
      )
    );
    checks.push(
      check(
        "demo-close",
        "Close demo removes or hides the route iframe",
        "hard",
        Boolean(demo.closed?.pass),
        demo.closeControl
          ? `close control "${demo.closeControl.label}" clicked; visible route iframes after=${demo.closed?.visibleRouteIframes?.length ?? "?"}`
          : `No Close demo control found${demo.closed ? `; visible route iframes after Escape=${demo.closed.visibleRouteIframes?.length ?? "?"}` : ""}`,
        { closeControl: demo.closeControl, closed: demo.closed }
      )
    );
    checks.push(
      check(
        "demo-scroll-after-close",
        "Page still scrolls after closing the demo",
        "hard",
        Boolean(demo.scrollAfter?.ok),
        demo.scrollAfter
          ? `${demo.stageAfter?.selector ?? "stage"}: scrollY ${demo.scrollAfter.before} -> ${demo.scrollAfter.after} (Δ${demo.scrollAfter.delta})`
          : "no post-close wheel result",
        demo.scrollAfter
      )
    );
  }

  if (interactions.mobileNav) {
    const nav = interactions.mobileNav;
    const openPass =
      Boolean(nav.drawer) &&
      nav.expandedAfterOpen === "true" &&
      (nav.links?.filter((link) => link.href).length ?? 0) >= 4;
    checks.push(
      check(
        "mobile-nav-open",
        "Mobile drawer opens, is visible, and exposes >=4 links",
        "hard",
        openPass,
        nav.trigger
          ? `aria-expanded=${JSON.stringify(nav.expandedAfterOpen)} after click; drawer ${
              nav.drawer ? "visible" : "missing"
            }; ${nav.links?.filter((link) => link.href).length ?? 0} link(s)`
          : "No hamburger trigger found",
        nav
      )
    );
    checks.push(
      check(
        "mobile-nav-focus",
        "Focus moves into the mobile drawer when opened",
        "hard",
        Boolean(nav.focus?.inDrawer),
        nav.focus
          ? `active=${nav.focus.selector ?? "none"} (${nav.focus.label ?? ""}); inside drawer=${nav.focus.inDrawer}`
          : "no focus result",
        nav.focus
      )
    );
    checks.push(
      check(
        "mobile-nav-escape",
        "Escape closes the mobile drawer",
        "hard",
        Boolean(nav.closed?.pass),
        nav.closed
          ? `after Escape: aria-expanded=${JSON.stringify(nav.closed.expanded)}; drawer visible=${nav.closed.drawerVisible}`
          : "no closed state",
        nav.closed
      )
    );
  }

  return checks;
}

function renderReport(report) {
  const lines = [];
  const hardFailures = report.checks.filter((entry) => entry.severity === "hard" && !entry.pass);
  const advisoryFailures = report.checks.filter((entry) => entry.severity === "advisory" && !entry.pass);

  lines.push("# Aura3D marketing homepage QA");
  lines.push("");
  lines.push(`- URL: ${report.meta.url}`);
  lines.push(`- Generated: ${report.meta.generatedAt}`);
  lines.push(`- Duration: ${(report.meta.durationMs / 1000).toFixed(1)}s`);
  lines.push(`- Browser: ${report.environment.browser?.version ?? "unknown"} (${report.environment.browser?.launchMode ?? "unknown"})`);
  lines.push(`- Viewports: ${report.meta.viewports.map((viewport) => `${viewport.width}x${viewport.height}`).join(", ")}`);
  lines.push(`- Command: \`${report.meta.command}\``);
  lines.push(`- Evidence: \`${report.meta.outDir}\``);
  lines.push("");
  lines.push(
    `**Result: ${report.summary.result}** — ${hardFailures.length} hard failure(s), ${advisoryFailures.length} advisory warning(s). Exit code ${report.summary.exitCode}.`
  );
  lines.push("");
  lines.push("Hard checks must pass for a release. Advisory checks are plan targets measured on the dev server; they do not change the exit code.");
  lines.push("");

  if (hardFailures.length) {
    lines.push("## Hard failures");
    lines.push("");
    lines.push("| Viewport | Criterion | Measured |");
    lines.push("|---|---|---|");
    for (const failure of hardFailures.slice(0, 60)) {
      lines.push(
        `| ${failure.viewport} | ${markdownEscape(failure.title)} | ${markdownEscape(truncate(failure.measured, 260))} |`
      );
    }
    if (hardFailures.length > 60) lines.push(`| … | ${hardFailures.length - 60} more | see per-viewport tables |`);
    lines.push("");
  } else {
    lines.push("## Hard failures");
    lines.push("");
    lines.push("None.");
    lines.push("");
  }

  if (advisoryFailures.length) {
    lines.push("## Advisory warnings");
    lines.push("");
    lines.push("| Viewport | Criterion | Measured |");
    lines.push("|---|---|---|");
    for (const failure of advisoryFailures.slice(0, 40)) {
      lines.push(
        `| ${failure.viewport} | ${markdownEscape(failure.title)} | ${markdownEscape(truncate(failure.measured, 220))} |`
      );
    }
    lines.push("");
  }

  lines.push("## Performance baseline (Resource Timing, before any demo click)");
  lines.push("");
  lines.push("| Viewport | Transfer | Resources | Frames | Engine requests | After first demo | Page height |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const viewport of report.viewports) {
    const timing = viewport.metrics.resourceTiming;
    const demo = viewport.interactions.demo;
    const after = demo?.timingAfter;
    lines.push(
      `| ${viewport.label} | ${timing?.error ? "error" : formatBytes(timing?.transferBytes)} | ${
        timing?.resourceCount ?? "?"
      } | ${timing?.frames?.length ?? "?"} | ${viewport.metrics.network?.engineRequests?.length ?? "?"} | ${
        after ? formatBytes(after.transferBytes) : "n/a"
      } | ${viewport.metrics.overflow?.pageHeight ?? "?"}px |`
    );
  }
  lines.push("");
  lines.push("The demo column is the same frame-aware Resource Timing sum captured after the first Play click (optional post-intent baseline).");
  lines.push("");

  lines.push("## Viewport results");
  for (const viewport of report.viewports) {
    lines.push("");
    lines.push(`### ${viewport.label}`);
    lines.push("");
    const shots = viewport.screenshots ?? {};
    const shotLinks = [];
    if (shots.viewport?.relative) shotLinks.push(`[viewport](${shots.viewport.relative})`);
    if (shots.full?.relative) shotLinks.push(`[full page](${shots.full.relative})`);
    lines.push(`Screenshots: ${shotLinks.length ? shotLinks.join(" · ") : "none captured"}`);
    lines.push("");
    lines.push("| Severity | Criterion | Result | Measured |");
    lines.push("|---|---|---|---|");
    for (const entry of viewport.checks) {
      lines.push(
        `| ${entry.severity} | ${markdownEscape(entry.title)} | ${entry.pass ? "PASS" : "FAIL"} | ${markdownEscape(
          truncate(entry.measured, 300)
        )} |`
      );
    }
    lines.push("");
    lines.push("#### Evidence details");
    lines.push("");
    const m = viewport.metrics;
    const details = [];
    if (m.nav?.overlaps?.length) {
      details.push(
        `Nav overlaps: ${m.nav.overlaps
          .slice(0, 8)
          .map((pair) => `${pair.kind} (${pair.a} × ${pair.b}, ${pair.overlap.width}x${pair.overlap.height}px)`)
          .join("; ")}`
      );
    }
    if (m.cards?.cards?.some((card) => card.clipped)) {
      details.push(
        `Clipped cards: ${m.cards.cards
          .filter((card) => card.clipped)
          .slice(0, 8)
          .map(
            (card) =>
              `${card.title || card.selector} (copy ${card.copyClientHeight}/${card.copyScrollHeight}px${
                card.outside?.length ? `, ${card.outside.length} outside element(s)` : ""
              })`
          )
          .join("; ")}`
      );
    }
    if (m.tapTargets?.tooSmall?.length) {
      details.push(
        `Tap targets <44x44 (first 15 of ${m.tapTargets.tooSmallCount}): ${m.tapTargets.tooSmall
          .slice(0, 15)
          .map((target) => `${target.selector} ${target.width}x${target.height} "${target.label}"`)
          .join("; ")}`
      );
    }
    if (m.versions?.violations?.length) {
      details.push(
        `Stale version text (first 10 of ${m.versions.violations.length}): ${m.versions.violations
          .slice(0, 10)
          .map((item) => `${item.version} in ${item.selector}`)
          .join("; ")}`
      );
    }
    if (m.versions?.allowedOccurrences?.length) {
      details.push(
        `Allowed history/benchmark version text: ${m.versions.allowedOccurrences
          .slice(0, 8)
          .map((item) => `${item.version} in ${item.scope?.selector ?? item.selector}`)
          .join("; ")}`
      );
    }
    if (m.network?.consoleErrors?.length || m.network?.pageErrors?.length) {
      details.push(
        `Console errors: ${[...(m.network.consoleErrors ?? []), ...(m.network.pageErrors ?? [])]
          .slice(0, 6)
          .map((error) => JSON.stringify(error.text ?? error.message ?? error))
          .join("; ")}`
      );
    }
    if (m.network?.failedResponses?.length || m.network?.requestFailures?.length) {
      details.push(
        `Failed requests: ${[
          ...(m.network.failedResponses ?? []).map((response) => `HTTP ${response.status} ${response.url}`),
          ...(m.network.requestFailures ?? []).map((failure) => `${failure.failure} ${failure.url}`)
        ]
          .slice(0, 8)
          .join("; ")}`
      );
    }
    if (m.network?.engineRequests?.length) {
      details.push(`Engine/WebGL requests: ${m.network.engineRequests.slice(0, 6).map((request) => request.url).join("; ")}`);
    }
    if (m.a11y?.iframes?.withSrc?.length) {
      details.push(
        `Iframes with src before click: ${m.a11y.iframes.withSrc
          .slice(0, 6)
          .map((iframe) => `${iframe.src}${iframe.pointerEvents ? ` (${iframe.pointerEvents})` : ""}`)
          .join("; ")}`
      );
    }
    if (m.overflow?.offenders?.length) {
      details.push(
        `Overflow offenders (possible cause): ${m.overflow.offenders
          .slice(0, 6)
          .map((offender) => `${offender.element} right=${offender.right}`)
          .join("; ")}`
      );
    }
    if (viewport.interactions?.demo) {
      const demo = viewport.interactions.demo;
      details.push(
        `Demo: stage=${demo.stage?.selector ?? "missing"}; play=${
          demo.playControl?.label ?? "missing"
        }; route iframe=${demo.routeIframe?.src ?? "none"}; pointer-events=${
          demo.routeIframe?.pointerEvents ?? "n/a"
        }; close=${demo.closeControl?.label ?? "missing"}; closed=${demo.closed?.pass ?? false}`
      );
      if (demo.errors?.length) details.push(`Demo errors: ${demo.errors.join("; ")}`);
    }
    if (viewport.interactions?.mobileNav) {
      const nav = viewport.interactions.mobileNav;
      details.push(
        `Mobile nav: trigger=${nav.trigger?.selector ?? "missing"}; drawer=${nav.drawer?.selector ?? "missing"}; links=${
          nav.links?.length ?? 0
        }; focus=${nav.focus?.selector ?? "none"}; bodyLocked=${nav.bodyLocked ?? "?"}`
      );
      if (nav.errors?.length) details.push(`Mobile nav errors: ${nav.errors.join("; ")}`);
    }
    if (viewport.interactions?.docsSearch) {
      const search = viewport.interactions.docsSearch;
      if (search.after?.statuses?.length) {
        details.push(
          `Search status candidates: ${search.after.statuses
            .map((status) => `${status.ariaLive ?? status.role}: "${status.text}"`)
            .join("; ")}`
        );
      }
    }
    if (viewport.interactions?.copy) {
      const copy = viewport.interactions.copy;
      details.push(`Copy: displayed="${truncate(copy.displayed, 140)}" copied="${truncate(copy.copied, 140)}"`);
    }
    if (!details.length) details.push("No additional failure details.");
    for (const detail of details) lines.push(`- ${detail}`);
    lines.push("");
  }

  lines.push("## Method and limits");
  lines.push("");
  lines.push("- Each viewport uses a fresh Chrome context (system Chrome via Playwright channel `chrome`), full-page and viewport screenshots, and DOM geometry from `getBoundingClientRect`/`scrollHeight` rather than selector presence.");
  lines.push("- Demo scroll tests dispatch a real Playwright mouse wheel over the measured hero stage; Play/Close assertions wait for a real route iframe and inspect computed `pointer-events`.");
  lines.push("- Docs search, copy, demo, and mobile nav assertions are executed on desktop/mobile scopes as marked in the tables; each failure names the missing selector, observed value, or thrown error.");
  lines.push("- Resource Timing is summed across all same-origin frames before any Play click. Cross-origin frame timings can be unavailable; failures/errors are reported, not hidden.");
  lines.push("- The dev server serves unbundled modules, so transfer-size and page-height checks are advisory; functional, layout, a11y, and version checks are hard.");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n`);
    printHelp();
    process.exit(3);
  }

  if (options.help) {
    printHelp();
    return;
  }

  let viewports;
  try {
    viewports = parseViewports(options.viewports);
  } catch (error) {
    console.error(`${error.message}\n`);
    printHelp();
    process.exit(3);
  }

  const startedAt = Date.now();
  const outDir = path.resolve(process.cwd(), options.out);
  const origin = new URL(options.url).origin;
  ensureDir(outDir);
  // Exercise docs/copy/demo on the widest and the widest mobile viewport so
  // custom --viewports still covers both interaction scopes.
  const widths = viewports.map((viewport) => viewport.width);
  const widestWidth = Math.max(...widths);
  const mobileWidths = widths.filter((width) => width <= 480).sort((a, b) => b - a);
  const interactionWidths = new Set([widestWidth, mobileWidths[0] ?? Math.min(...widths)]);
  const interactionScope = {
    docsWidths: interactionWidths,
    demoWidths: interactionWidths
  };

  let probe = await probeServer(options.url);
  if (!probe.ok && options.waitForServer) {
    const deadline = Date.now() + options.waitMs;
    process.stderr.write(`Waiting up to ${options.waitMs}ms for ${options.url}...\n`);
    while (!probe.ok && Date.now() < deadline) {
      await sleep(500);
      probe = await probeServer(options.url);
    }
  }
  if (!probe.ok) {
    console.error(serverHelp(options.url));
    process.exit(2);
  }

  let launch;
  try {
    launch = await launchBrowser();
  } catch (error) {
    console.error(String(error?.message ?? error));
    process.exit(3);
  }

  const report = {
    schemaVersion: 1,
    meta: {
      tool: "marketing/scripts/qa-home.mjs",
      generatedAt: new Date().toISOString(),
      durationMs: 0,
      url: options.url,
      outDir,
      command: `node ${process.argv.slice(1).map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`,
      nodeVersion: process.version,
      playwrightVersion,
      viewports,
      options: {
        waitForServer: options.waitForServer,
        waitMs: options.waitMs
      }
    },
    environment: {
      server: probe,
      browser: {
        version: launch.browser.version(),
        launchMode: launch.launchMode,
        notes: launch.notes
      }
    },
    summary: null,
    viewports: [],
    checks: []
  };

  try {
    for (const viewport of viewports) {
      process.stdout.write(`Auditing ${viewport.width}x${viewport.height}...\n`);
      let result;
      try {
        result = await auditViewport(launch.browser, options.url, viewport, origin, outDir, interactionScope);
      } catch (error) {
        const message = truncate(error?.stack ?? error?.message ?? error, 1200);
        result = {
          label: `${viewport.width}x${viewport.height}`,
          viewport,
          screenshots: { viewport: null, full: null, errors: [message] },
          metrics: emptyMetrics(message),
          interactions: {},
          checks: []
        };
        result.checks = buildChecks(result);
      }
      report.viewports.push(result);
      const hardFailureCount = result.checks.filter((entry) => entry.severity === "hard" && !entry.pass).length;
      process.stdout.write(
        `  ${hardFailureCount ? `FAIL (${hardFailureCount} hard)` : "PASS"}; evidence ${
          result.screenshots?.full?.relative ?? "none"
        }\n`
      );
    }

    report.checks = report.viewports.flatMap((viewport) =>
      viewport.checks.map((entry) => ({ ...entry, viewport: viewport.label }))
    );
    const hard = report.checks.filter((entry) => entry.severity === "hard");
    const hardFailures = hard.filter((entry) => !entry.pass);
    const advisoryFailures = report.checks.filter((entry) => entry.severity === "advisory" && !entry.pass);
    report.summary = {
      result: hardFailures.length ? "FAIL" : "PASS",
      exitCode: hardFailures.length ? 1 : 0,
      hardCheckCount: hard.length,
      hardFailureCount: hardFailures.length,
      advisoryFailureCount: advisoryFailures.length,
      checksTotal: report.checks.length,
      hardFailures,
      advisoryFailures
    };
    report.meta.durationMs = Date.now() - startedAt;

    const jsonPath = path.join(outDir, "report.json");
    const mdPath = path.join(outDir, "report.md");
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(mdPath, `${renderReport(report)}\n`);

    console.log("");
    console.log(`Result: ${report.summary.result}`);
    console.log(`Hard failures: ${hardFailures.length}`);
    console.log(`Advisory warnings: ${advisoryFailures.length}`);
    console.log(`Report: ${mdPath}`);
    console.log(`JSON:   ${jsonPath}`);
    process.exitCode = report.summary.exitCode;
  } finally {
    await launch.browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(3);
});
