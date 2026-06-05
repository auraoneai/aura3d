#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");

const targetUrl =
  process.env.AURA_CLASH_SCREENSHOT_URL ??
  "http://127.0.0.1:5173/playable/?capture=first-frame";
const outPng = resolve(
  appRoot,
  process.env.AURA_CLASH_SCREENSHOT_OUT ?? "launch-evidence/first-frame.png"
);
const outJson = resolve(
  appRoot,
  process.env.AURA_CLASH_SCREENSHOT_META_OUT ?? "launch-evidence/first-frame.json"
);
const viewport = {
  width: Number(process.env.AURA_CLASH_SCREENSHOT_WIDTH ?? 1440),
  height: Number(process.env.AURA_CLASH_SCREENSHOT_HEIGHT ?? 1200)
};

const timeoutMs = Number(process.env.AURA_CLASH_SCREENSHOT_TIMEOUT_MS ?? 30000);
const defaultSettleMs = Number(process.env.AURA_CLASH_SCREENSHOT_SETTLE_MS ?? 1200);
const compositionLimit = Number(process.env.AURA_CLASH_SCREENSHOT_COMPOSITION_LIMIT ?? 3);

const visualReviewContract = {
  version: "aura-clash-screenshot-review-v1",
  scope: "source-only screenshot metadata for later human visual review",
  humanApprovalRequired: true,
  evidenceRequirements: {
    requiredCaptureCount: 3,
    allRequiredCapturesMustBeNonblank: true,
    requiredCompositionIds: [
      "arena-establishing",
      "fighter-readability",
      "effects-hud-debug"
    ],
    requiredReviewAreaIds: [
      "debug-overlays",
      "readable-fighters",
      "effects",
      "hud",
      "stage-depth",
      "lighting-materials"
    ],
    humanApprovalBoundary: "Machine evidence can prove nonblank captures and declared review signals, but cannot approve visual quality."
  },
  notes: [
    "This contract records machine-readable page declarations and DOM evidence. It does not approve visual quality automatically.",
    "Canvas-only evidence should be declared by the route through window.__AURA_CLASH_VISUAL_REVIEW__ or #aura-clash-visual-review JSON."
  ],
  areas: [
    {
      id: "debug-overlays",
      label: "Debug overlays",
      requiredEvidence: [
        "debug overlay visible or explicitly declared",
        "hitbox, hurtbox, collider, camera, runtime, or frame diagnostic evidence"
      ],
      textSignals: [
        "debug",
        "overlay",
        "hitbox",
        "hurtbox",
        "collider",
        "runtime",
        "fps",
        "camera"
      ],
      selectors: [
        "[data-aura-debug]",
        "[data-debug-overlay]",
        "[data-testid*='debug' i]",
        "[data-testid*='hitbox' i]",
        "[data-testid*='collider' i]",
        ".debug-overlay",
        "[aria-label*='debug' i]"
      ]
    },
    {
      id: "readable-fighters",
      label: "Readable fighters",
      requiredEvidence: [
        "both fighters visible or explicitly declared",
        "fighter names, sides, poses, silhouettes, or bounds readable"
      ],
      textSignals: [
        "fighter",
        "player",
        "opponent",
        "rival",
        "health",
        "combo",
        "round"
      ],
      selectors: [
        "[data-fighter]",
        "[data-player]",
        "[data-opponent]",
        "[data-testid*='fighter' i]",
        "[data-testid*='player' i]",
        "[data-testid*='opponent' i]",
        "[aria-label*='fighter' i]",
        "[aria-label*='player' i]",
        "[aria-label*='opponent' i]"
      ]
    },
    {
      id: "effects",
      label: "Effects",
      requiredEvidence: [
        "combat effects, particles, impact flashes, bloom, trails, or shader effects visible or explicitly declared",
        "effect state named with non-empty intensity/count/timing details when available"
      ],
      textSignals: [
        "effect",
        "effects",
        "vfx",
        "particle",
        "impact",
        "spark",
        "trail",
        "bloom",
        "flash"
      ],
      selectors: [
        "[data-effect]",
        "[data-effects]",
        "[data-vfx]",
        "[data-particles]",
        "[data-testid*='effect' i]",
        "[data-testid*='vfx' i]",
        "[aria-label*='effect' i]"
      ]
    },
    {
      id: "hud",
      label: "HUD",
      requiredEvidence: [
        "health, timer, round, combo, or control HUD visible or explicitly declared",
        "HUD text readable in captured viewport"
      ],
      textSignals: [
        "hud",
        "health",
        "timer",
        "round",
        "combo",
        "super",
        "controls",
        "pause"
      ],
      selectors: [
        "[data-hud]",
        "[data-testid*='hud' i]",
        "[data-testid*='health' i]",
        "[data-testid*='timer' i]",
        "[role='status']",
        "[aria-label*='health' i]",
        "[aria-label*='timer' i]"
      ]
    },
    {
      id: "stage-depth",
      label: "Stage depth",
      requiredEvidence: [
        "foreground, midground, and background/depth cues visible or explicitly declared",
        "arena boundaries, parallax, floor grid, shadows, or city/stage layers named when available"
      ],
      textSignals: [
        "stage",
        "arena",
        "depth",
        "foreground",
        "midground",
        "background",
        "parallax",
        "floor",
        "shadows"
      ],
      selectors: [
        "[data-stage]",
        "[data-arena]",
        "[data-depth]",
        "[data-testid*='stage' i]",
        "[data-testid*='arena' i]",
        "[data-testid*='depth' i]",
        "[aria-label*='stage' i]",
        "[aria-label*='arena' i]"
      ]
    },
    {
      id: "lighting-materials",
      label: "Lighting and materials",
      requiredEvidence: [
        "key/fill/rim, bloom, shadows, reflections, emissive, metal, glass, cloth, or material contrast visible or explicitly declared",
        "lighting/material checks named with non-empty values when available"
      ],
      textSignals: [
        "lighting",
        "light",
        "material",
        "materials",
        "shadow",
        "reflection",
        "emissive",
        "metal",
        "glass",
        "rim",
        "bloom"
      ],
      selectors: [
        "[data-lighting]",
        "[data-material]",
        "[data-materials]",
        "[data-testid*='lighting' i]",
        "[data-testid*='material' i]",
        "[aria-label*='lighting' i]",
        "[aria-label*='material' i]"
      ]
    }
  ],
  compositionExpectations: [
    {
      id: "arena-establishing",
      label: "Arena establishing",
      required: true,
      nonblankRequired: true,
      mustShow: ["full stage composition", "stage depth", "lighting/material context"],
      reviewCriteria: [
        "foreground, combat lane, midground, and skyline/background are readable",
        "lighting and material context is visible without hiding the canvas",
        "capture is not a title-card-only or CSS fallback composition"
      ]
    },
    {
      id: "fighter-readability",
      label: "Fighter readability",
      required: true,
      nonblankRequired: true,
      mustShow: ["both fighters", "readable silhouettes/poses", "HUD relationship"],
      reviewCriteria: [
        "both Quaternius-derived fighter GLBs are visible and grounded",
        "fighter silhouettes and poses remain readable against the stage",
        "HUD placement does not cover critical fighter readability"
      ]
    },
    {
      id: "effects-hud-debug",
      label: "Effects, HUD, and debug",
      required: true,
      nonblankRequired: true,
      mustShow: ["combat effects", "HUD", "debug overlays"],
      reviewCriteria: [
        "impact/super effects are visible without washing out the scene",
        "HUD state remains legible during effect-heavy frames",
        "debug/proof overlays or declarations are visible enough for source-backed review"
      ]
    }
  ]
};

const managedServer = await ensureScreenshotServer(targetUrl);
const { chromium } = await import("playwright");
const browser = await chromium.launch({
  headless: process.env.AURA_CLASH_SCREENSHOT_HEADLESS !== "0"
});

const pageErrors = [];
const failedRequests = [];
const consoleMessages = [];
const startedAt = new Date().toISOString();

try {
  const page = await browser.newPage({ viewport });
  attachPageDiagnostics(page);

  const primaryCapture = await captureSnapshot(page, {
    id: "first-frame",
    label: "First-frame screenshot",
    targetUrl,
    outPng,
    settleMs: defaultSettleMs,
    required: true
  });

  const declaredCompositions = await discoverCompositionTargets(page, targetUrl);
  const requestedCompositions = compositionTargetsFromEnv(targetUrl);
  const fallbackCompositions = defaultCompositionTargets(targetUrl);
  const compositionTargets = mergeCompositionTargets([
    ...requestedCompositions,
    ...declaredCompositions,
    ...fallbackCompositions
  ]).slice(0, Math.max(0, compositionLimit - 1));
  const compositionCaptures = [];

  for (const composition of compositionTargets) {
    const compositionPage = await browser.newPage({ viewport });
    attachPageDiagnostics(compositionPage);
    try {
      compositionCaptures.push(
        await captureSnapshot(compositionPage, {
          id: composition.id,
          label: composition.label,
          targetUrl: composition.url,
          outPng: composition.outPng ?? screenshotPathForComposition(outPng, composition.id),
          settleMs: composition.settleMs ?? defaultSettleMs,
          required: false,
          reviewIntent: composition.reviewIntent ?? null
        })
      );
    } finally {
      await compositionPage.close();
    }
  }

  const allCaptures = [primaryCapture, ...compositionCaptures];
  const primaryPageEvidence = primaryCapture.pageEvidence;
  const visualReviewEvidence = buildVisualReviewEvidence(
    visualReviewContract,
    allCaptures.map((capture) => capture.pageEvidence)
  );
  const compositionEvidence = buildCompositionEvidence({
    primaryCapture,
    compositionCaptures,
    declaredCompositions,
    requestedCompositions,
    fallbackCompositions,
    compositionLimit
  });
  const visualEvidenceGate = buildVisualEvidenceGate({
    allCaptures,
    visualReviewEvidence,
    compositionEvidence
  });

  const metadata = {
    ok:
      allCaptures.every((capture) => capture.ok) &&
      pageErrors.length === 0 &&
      visualEvidenceGate.machineChecksOk,
    generatedAt: new Date().toISOString(),
    startedAt,
    targetUrl,
    finalUrl: primaryCapture.finalUrl,
    status: primaryCapture.status,
    statusText: primaryCapture.statusText,
    viewport,
    screenshot: outPng,
    screenshotCount: allCaptures.length,
    compositionCount: allCaptures.length,
    screenshots: allCaptures.map((capture) => capture.screenshot),
    title: primaryPageEvidence.title,
    bodyBox: primaryPageEvidence.bodyBox,
    textSample: primaryPageEvidence.textSample,
    nonblank: primaryCapture.imageEvidence.nonblank,
    imageEvidence: primaryCapture.imageEvidence,
    visualReviewContract,
    visualReviewEvidence,
    compositionEvidence,
    visualEvidenceGate,
    captures: allCaptures.map((capture) => ({
      id: capture.id,
      label: capture.label,
      ok: capture.ok,
      required: capture.required,
      targetUrl: capture.targetUrl,
      finalUrl: capture.finalUrl,
      status: capture.status,
      statusText: capture.statusText,
      screenshot: capture.screenshot,
      imageEvidence: capture.imageEvidence,
      reviewIntent: capture.reviewIntent,
      pageEvidence: capture.pageEvidence
    })),
    pageErrors,
    failedRequests,
    consoleMessages
  };

  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(metadata, null, 2)}\n`);

  if (!metadata.ok) {
    console.error(`Aura Clash first-frame capture completed with errors.`);
    console.error(`Screenshot: ${outPng}`);
    console.error(`Metadata: ${outJson}`);
    process.exit(1);
  }

  console.log(`Aura Clash first-frame screenshot captured.`);
  console.log(`Screenshot: ${outPng}`);
  console.log(`Metadata: ${outJson}`);
} finally {
  await browser.close();
  await stopManagedServer(managedServer);
}

async function ensureScreenshotServer(url) {
  if (process.env.AURA_CLASH_SCREENSHOT_START_SERVER === "0" || !isLocalHttpUrl(url)) {
    return null;
  }

  if (await canReach(url)) {
    return null;
  }

  const command = process.env.AURA_CLASH_SCREENSHOT_SERVER_COMMAND ?? "npm";
  const args = process.env.AURA_CLASH_SCREENSHOT_SERVER_ARGS
    ? process.env.AURA_CLASH_SCREENSHOT_SERVER_ARGS.split(" ").filter(Boolean)
    : ["run", "dev"];
  const server = spawn(command, args, {
    cwd: appRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      BROWSER: "none"
    }
  });

  server.stdout.on("data", (chunk) => {
    if (process.env.AURA_CLASH_SCREENSHOT_SERVER_LOGS === "1") {
      process.stdout.write(chunk);
    }
  });
  server.stderr.on("data", (chunk) => {
    if (process.env.AURA_CLASH_SCREENSHOT_SERVER_LOGS === "1") {
      process.stderr.write(chunk);
    }
  });

  await waitForServer(url, Number(process.env.AURA_CLASH_SCREENSHOT_SERVER_TIMEOUT_MS ?? 30000));
  return server;
}

async function stopManagedServer(server) {
  if (!server || server.killed) return;
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (!server.killed) server.kill("SIGKILL");
      resolveStop();
    }, 3000);
    server.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    server.kill("SIGTERM");
  });
}

async function waitForServer(url, timeout) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeout) {
    try {
      if (await canReach(url)) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for screenshot server at ${url}${lastError ? `: ${lastError}` : ""}`);
}

async function canReach(url) {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
}

function isLocalHttpUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      ["127.0.0.1", "localhost", "0.0.0.0", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function attachPageDiagnostics(page) {
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? "unknown"
    });
  });

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({
        type: message.type(),
        text: message.text()
      });
    }
  });
}

async function captureSnapshot(
  page,
  { id, label, targetUrl, outPng, settleMs, required, reviewIntent = null }
) {
  const response = await page.goto(targetUrl, {
    waitUntil: "networkidle",
    timeout: timeoutMs
  });

  await page.waitForTimeout(settleMs);

  mkdirSync(dirname(outPng), { recursive: true });
  await page.screenshot({
    path: outPng,
    fullPage: true,
    animations: "disabled"
  });

  const pageEvidence = await collectPageEvidence(page, visualReviewContract);
  const imageEvidence = createImageEvidence(outPng);

  return {
    id,
    label,
    required,
    ok: Boolean(response?.ok()),
    targetUrl,
    finalUrl: page.url(),
    status: response?.status() ?? null,
    statusText: response?.statusText() ?? null,
    screenshot: outPng,
    imageEvidence,
    reviewIntent,
    pageEvidence
  };
}

function createImageEvidence(path) {
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sampleStride = Math.max(1, Math.floor(bytes.length / 4096));
  const histogram = new Map();
  let min = 255;
  let max = 0;
  let sum = 0;
  let sampled = 0;

  for (let index = 0; index < bytes.length; index += sampleStride) {
    const value = bytes[index];
    histogram.set(value, (histogram.get(value) ?? 0) + 1);
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    sampled += 1;
  }

  const uniqueByteValues = histogram.size;
  const mean = sampled > 0 ? sum / sampled : 0;
  const variance =
    sampled > 0
      ? Array.from(histogram.entries()).reduce((total, [value, count]) => {
          const diff = value - mean;
          return total + diff * diff * count;
        }, 0) / sampled
      : 0;
  const standardDeviation = Math.sqrt(variance);
  const nonblank =
    bytes.length > 2048 &&
    uniqueByteValues >= Number(process.env.AURA_CLASH_SCREENSHOT_MIN_UNIQUE_BYTES ?? 16) &&
    standardDeviation >= Number(process.env.AURA_CLASH_SCREENSHOT_MIN_STDDEV ?? 8);

  return {
    kind: "aura-clash-screenshot-image-evidence",
    path,
    byteLength: bytes.length,
    sha256,
    sampleStride,
    sampledBytes: sampled,
    uniqueByteValues,
    minByte: min,
    maxByte: max,
    meanByte: Number(mean.toFixed(3)),
    standardDeviation: Number(standardDeviation.toFixed(3)),
    nonblank
  };
}

async function collectPageEvidence(page, contract) {
  const bodyBox = await page.locator("body").boundingBox().catch(() => null);
  const title = await page.title().catch(() => "");
  const textSample = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "");

  const browserEvidence = await page.evaluate((reviewAreas) => {
    const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const bodyText = normalizeText(document.body?.innerText ?? "");
    const parsedJsonById = (id) => {
      const element = document.getElementById(id);
      if (!element?.textContent) return null;
      try {
        return JSON.parse(element.textContent);
      } catch (error) {
        return {
          parseError: error instanceof Error ? error.message : String(error)
        };
      }
    };
    const pageReviewDeclaration =
      window.__AURA_CLASH_VISUAL_REVIEW__ ??
      window.__AURA_VISUAL_REVIEW__ ??
      parsedJsonById("aura-clash-visual-review") ??
      parsedJsonById("aura-visual-review") ??
      null;
    const compositionDeclaration =
      window.__AURA_CLASH_SCREENSHOT_COMPOSITIONS__ ??
      window.__AURA_SCREENSHOT_COMPOSITIONS__ ??
      parsedJsonById("aura-clash-screenshot-compositions") ??
      parsedJsonById("aura-screenshot-compositions") ??
      null;
    const toElementEvidence = (element, selector) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0;

      return {
        selector,
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        role: element.getAttribute("role"),
        ariaLabel: element.getAttribute("aria-label"),
        testId: element.getAttribute("data-testid"),
        visible,
        text: normalizeText(element.textContent).slice(0, 180),
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    };
    const selectorMatches = (selectors) =>
      selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
          .slice(0, 8)
          .map((element) => toElementEvidence(element, selector))
      );
    const textMatches = (signals) =>
      signals.filter((signal) => bodyText.toLowerCase().includes(signal.toLowerCase()));
    const getDeclaredArea = (areaId) => {
      if (!pageReviewDeclaration || typeof pageReviewDeclaration !== "object") return null;
      const areas = pageReviewDeclaration.areas ?? pageReviewDeclaration.checks ?? pageReviewDeclaration;
      if (Array.isArray(areas)) {
        return areas.find((area) => area?.id === areaId || area?.area === areaId) ?? null;
      }
      if (areas && typeof areas === "object") {
        return areas[areaId] ?? null;
      }
      return null;
    };

    return {
      canvas: Array.from(document.querySelectorAll("canvas")).map((canvas, index) => {
        const rect = canvas.getBoundingClientRect();
        return {
          index,
          id: canvas.id || null,
          ariaLabel: canvas.getAttribute("aria-label"),
          testId: canvas.getAttribute("data-testid"),
          width: canvas.width,
          height: canvas.height,
          clientWidth: Math.round(rect.width),
          clientHeight: Math.round(rect.height),
          visible: rect.width > 0 && rect.height > 0
        };
      }),
      pageReviewDeclaration,
      compositionDeclaration,
      areas: reviewAreas.map((area) => {
        const matches = selectorMatches(area.selectors);
        const visibleMatches = matches.filter((match) => match.visible);
        const declared = getDeclaredArea(area.id);

        return {
          id: area.id,
          label: area.label,
          declared,
          selectorMatchCount: matches.length,
          visibleSelectorMatchCount: visibleMatches.length,
          selectorMatches: visibleMatches.slice(0, 10),
          textMatches: textMatches(area.textSignals),
          evidenceSources: {
            pageDeclaration: Boolean(declared),
            visibleDomSignal: visibleMatches.length > 0,
            textSignal: textMatches(area.textSignals).length > 0
          }
        };
      })
    };
  }, contract.areas);

  return {
    title,
    bodyBox,
    textSample: textSample.slice(0, 1200),
    ...browserEvidence
  };
}

async function discoverCompositionTargets(page, fallbackUrl) {
  const discovered = await page.evaluate(() => {
    const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const parsedJsonById = (id) => {
      const element = document.getElementById(id);
      if (!element?.textContent) return null;
      try {
        return JSON.parse(element.textContent);
      } catch {
        return null;
      }
    };
    const declarations =
      window.__AURA_CLASH_SCREENSHOT_COMPOSITIONS__ ??
      window.__AURA_SCREENSHOT_COMPOSITIONS__ ??
      parsedJsonById("aura-clash-screenshot-compositions") ??
      parsedJsonById("aura-screenshot-compositions") ??
      null;
    const declaredList = Array.isArray(declarations)
      ? declarations
      : Array.isArray(declarations?.compositions)
        ? declarations.compositions
        : [];
    const declaredTargets = declaredList.map((composition, index) => ({
      id: composition.id ?? composition.name ?? `declared-${index + 1}`,
      label: composition.label ?? composition.title ?? composition.id ?? `Declared composition ${index + 1}`,
      url: composition.url ?? composition.href ?? composition.path ?? null,
      settleMs: composition.settleMs ?? composition.waitMs ?? null,
      reviewIntent: composition.reviewIntent ?? composition.mustShow ?? composition.description ?? null,
      source: "page-declaration"
    }));
    const domTargets = Array.from(document.querySelectorAll("[data-aura-clash-composition]"))
      .map((element, index) => ({
        id:
          element.getAttribute("data-aura-clash-composition") ||
          element.getAttribute("data-composition-id") ||
          `dom-${index + 1}`,
        label:
          element.getAttribute("data-label") ||
          element.getAttribute("aria-label") ||
          normalizeText(element.textContent) ||
          `DOM composition ${index + 1}`,
        url:
          element.getAttribute("data-url") ||
          element.getAttribute("href") ||
          element.getAttribute("data-href"),
        settleMs: element.getAttribute("data-settle-ms"),
        reviewIntent:
          element.getAttribute("data-review-intent") ||
          element.getAttribute("data-must-show") ||
          null,
        source: "dom"
      }));

    return [...declaredTargets, ...domTargets].filter((composition) => composition.url);
  });

  return discovered.map((composition) => ({
    ...composition,
    url: new URL(composition.url, fallbackUrl).toString(),
    settleMs: composition.settleMs == null ? null : Number(composition.settleMs)
  }));
}

function compositionTargetsFromEnv(fallbackUrl) {
  const raw = process.env.AURA_CLASH_SCREENSHOT_COMPOSITIONS;
  if (!raw) return [];

  const parsed = parseCompositionEnv(raw);
  return parsed
    .map((composition, index) =>
      typeof composition === "string"
        ? {
            id: `env-${index + 1}`,
            label: `Environment composition ${index + 1}`,
            url: composition,
            source: "environment"
          }
        : {
            id: composition.id ?? composition.name ?? `env-${index + 1}`,
            label: composition.label ?? composition.title ?? composition.id ?? `Environment composition ${index + 1}`,
            url: composition.url ?? composition.href ?? composition.path,
            outPng: composition.outPng ?? composition.out ?? null,
            settleMs: composition.settleMs ?? composition.waitMs ?? null,
            reviewIntent: composition.reviewIntent ?? composition.mustShow ?? composition.description ?? null,
            source: "environment"
          }
    )
    .filter((composition) => composition.url)
    .map((composition) => ({
      ...composition,
      url: new URL(composition.url, fallbackUrl).toString(),
      outPng: composition.outPng ? resolve(appRoot, composition.outPng) : null,
      settleMs: composition.settleMs == null ? null : Number(composition.settleMs)
    }));
}

function defaultCompositionTargets(fallbackUrl) {
  return [
    {
      id: "fighter-readability",
      label: "Fighter readability composition",
      url: new URL("?capture=match-start", fallbackUrl).toString(),
      settleMs: defaultSettleMs,
      reviewIntent:
        "Both typed fighter GLBs grounded on the combat lane with readable HUD and stage depth.",
      source: "capture-script-default"
    },
    {
      id: "effects-hud-debug",
      label: "Effects, HUD, and debug composition",
      url: new URL("?capture=combat-impact", fallbackUrl).toString(),
      settleMs: defaultSettleMs,
      reviewIntent:
        "Combat-impact frame with VFX, HUD state, debug evidence, and readable silhouettes.",
      source: "capture-script-default"
    }
  ];
}

function parseCompositionEnv(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
}

function mergeCompositionTargets(compositions) {
  const seen = new Set([targetUrl]);
  const merged = [];

  for (const composition of compositions) {
    const id = safeCompositionId(composition.id);
    const url = composition.url;
    const key = `${id}:${url}`;
    if (!url || seen.has(key) || seen.has(url)) continue;
    seen.add(key);
    seen.add(url);
    merged.push({
      ...composition,
      id,
      label: composition.label ?? id
    });
  }

  return merged;
}

function screenshotPathForComposition(primaryPath, id) {
  const safeId = safeCompositionId(id);
  const fileName = primaryPath.endsWith(".png")
    ? primaryPath.replace(/\.png$/u, `.${safeId}.png`)
    : `${primaryPath}.${safeId}.png`;
  return fileName;
}

function safeCompositionId(id) {
  return String(id ?? "composition")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 64) || "composition";
}

function buildVisualReviewEvidence(contract, pageEvidenceList) {
  const areaEvidence = contract.areas.map((area) => {
    const captures = pageEvidenceList.map((pageEvidence) =>
      pageEvidence.areas.find((candidate) => candidate.id === area.id)
    );
    const hasPageDeclaration = captures.some((capture) => capture?.evidenceSources.pageDeclaration);
    const hasVisibleDomSignal = captures.some((capture) => capture?.evidenceSources.visibleDomSignal);
    const hasTextSignal = captures.some((capture) => capture?.evidenceSources.textSignal);
    const status = hasPageDeclaration || hasVisibleDomSignal ? "pass" : hasTextSignal ? "needs-review" : "missing";

    return {
      id: area.id,
      label: area.label,
      status,
      hasPageDeclaration,
      hasVisibleDomSignal,
      hasTextSignal,
      requiredEvidence: area.requiredEvidence,
      captures: captures.filter(Boolean)
    };
  });

  return {
    ok: areaEvidence.every((area) => area.status === "pass"),
    statusCounts: areaEvidence.reduce(
      (counts, area) => {
        counts[area.status] += 1;
        return counts;
      },
      { pass: 0, "needs-review": 0, missing: 0 }
    ),
    areas: areaEvidence,
    humanApprovalRequired: contract.humanApprovalRequired
  };
}

function buildCompositionEvidence({
  primaryCapture,
  compositionCaptures,
  declaredCompositions,
  requestedCompositions,
  fallbackCompositions,
  compositionLimit
}) {
  const captures = [primaryCapture, ...compositionCaptures];
  const optionalAvailableCount = declaredCompositions.length + requestedCompositions.length;
  const fallbackAvailableCount = fallbackCompositions.length;
  const requiredCaptureCount = visualReviewContract.evidenceRequirements.requiredCaptureCount;
  const requiredCompositionIds = visualReviewContract.evidenceRequirements.requiredCompositionIds;
  const expectationById = new Map(
    visualReviewContract.compositionExpectations.map((expectation) => [expectation.id, expectation])
  );
  const capturedRoles = captures.map((capture, index) =>
    expectationById.get(capture.id)?.id ??
    visualReviewContract.compositionExpectations[index]?.id ??
    (index === 0 ? "first-frame" : "additional-composition")
  );
  const missingCompositionIds = requiredCompositionIds.filter((id) => !capturedRoles.includes(id));
  const allRequiredCapturesNonblank =
    captures.length >= requiredCaptureCount &&
    captures.slice(0, requiredCaptureCount).every((capture) => capture.imageEvidence.nonblank);

  return {
    expectedCount: requiredCaptureCount,
    configuredCompositionLimit: compositionLimit,
    requiredCompositionIds,
    capturedRoles,
    missingCompositionIds,
    capturedCount: captures.length,
    nonblankCaptureCount: captures.filter((capture) => capture.imageEvidence.nonblank).length,
    allRequiredCapturesNonblank,
    optionalAvailableCount,
    fallbackAvailableCount,
    availableCompositionCount: optionalAvailableCount + fallbackAvailableCount,
    captureLimitAllowsRequiredCount: compositionLimit >= requiredCaptureCount,
    allAvailableCompositionsCaptured:
      compositionCaptures.length >= Math.min(requiredCaptureCount - 1, optionalAvailableCount + fallbackAvailableCount),
    threeCompositionEvidenceAvailable:
      captures.length >= requiredCaptureCount &&
      missingCompositionIds.length === 0 &&
      allRequiredCapturesNonblank,
    expectations: visualReviewContract.compositionExpectations,
    captures: captures.map((capture, index) => ({
      id: capture.id,
      label: capture.label,
      role:
        expectationById.get(capture.id)?.id ??
        visualReviewContract.compositionExpectations[index]?.id ??
        (index === 0 ? "first-frame" : "additional-composition"),
      ok: capture.ok,
      required: capture.required,
      nonblank: capture.imageEvidence.nonblank,
      screenshot: capture.screenshot,
      targetUrl: capture.targetUrl,
      finalUrl: capture.finalUrl,
      reviewIntent: capture.reviewIntent
    })),
    declaredCompositions,
    requestedCompositions,
    fallbackCompositions
  };
}

function buildVisualEvidenceGate({ allCaptures, visualReviewEvidence, compositionEvidence }) {
  const requiredCaptureCount = visualReviewContract.evidenceRequirements.requiredCaptureCount;
  const checks = [
    {
      id: "http-status",
      label: "All required captures returned successful HTTP status",
      ok: allCaptures.every((capture) => capture.ok)
    },
    {
      id: "nonblank-captures",
      label: "All required captures are nonblank",
      ok:
        allCaptures.length >= requiredCaptureCount &&
        allCaptures.slice(0, requiredCaptureCount).every((capture) => capture.imageEvidence.nonblank)
    },
    {
      id: "review-area-evidence",
      label: "Required visual review areas have declarations or visible DOM evidence",
      ok: visualReviewEvidence.ok
    },
    {
      id: "three-composition-evidence",
      label: "Three screenshot compositions are captured and nonblank",
      ok: compositionEvidence.threeCompositionEvidenceAvailable
    }
  ];

  return {
    kind: "aura-clash-visual-evidence-gate",
    machineChecksOk: checks.every((check) => check.ok),
    checks,
    requiredCaptureCount,
    requiredCompositionIds: visualReviewContract.evidenceRequirements.requiredCompositionIds,
    requiredReviewAreaIds: visualReviewContract.evidenceRequirements.requiredReviewAreaIds,
    humanApprovalRequired: visualReviewContract.humanApprovalRequired,
    humanApprovalCapturedByThisScript: false,
    approvalBoundary:
      "This gate can fail or pass machine evidence requirements, but it never marks human visual approval complete."
  };
}
