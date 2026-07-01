import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = resolve(root, "tests/reports/aura3d-recovery-baseline");
const origin = process.env.A3D_RECOVERY_ORIGIN || "http://127.0.0.1:5174";

const routes = [
  { id: "showcase-index", path: "/apps/showcase-index/", globalName: "__AURA3D_SHOWCASE_INDEX__" },
  { id: "showcase-product-configurator", path: "/apps/showcase-product-configurator/", globalName: "__AURA3D_SHOWCASE_PRODUCT_CONFIGURATOR__" },
  { id: "showcase-material-asset-inspector", path: "/apps/showcase-material-asset-inspector/", globalName: "__AURA3D_SHOWCASE_MATERIAL_ASSET_INSPECTOR__" },
  { id: "showcase-data-galaxy", path: "/apps/showcase-data-galaxy/", globalName: "__AURA3D_SHOWCASE_DATA_GALAXY__" },
  { id: "showcase-smart-city-control", path: "/apps/showcase-smart-city-control/", globalName: "__AURA3D_SHOWCASE_SMART_CITY_CONTROL__" },
  { id: "showcase-cinematic-architecture", path: "/apps/showcase-cinematic-architecture/", globalName: "__AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__" },
  { id: "showcase-digital-twin-ops", path: "/apps/showcase-digital-twin-ops/", globalName: "__AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__" },
  { id: "showcase-webgpu-particle-lab", path: "/apps/showcase-webgpu-particle-lab/", globalName: "__AURA3D_SHOWCASE_WEBGPU_PARTICLE_LAB__" },
  { id: "showcase-blockfall-reactor", path: "/apps/showcase-blockfall-reactor/", globalName: "__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__" },
  { id: "showcase-skyline-runner", path: "/apps/showcase-skyline-runner/", globalName: "__AURA3D_SHOWCASE_SKYLINE_RUNNER__" },
  { id: "showcase-turbo-drift-circuit", path: "/apps/showcase-turbo-drift-circuit/", globalName: "__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__" }
];

const gameInputs = {
  "showcase-blockfall-reactor": ["ArrowLeft", "ArrowRight", "KeyQ", "KeyE", "Space", "KeyC"],
  "showcase-skyline-runner": ["ArrowRight", "Space", "ArrowRight", "ShiftLeft", "ArrowDown"],
  "showcase-turbo-drift-circuit": ["ArrowUp", "ArrowRight", "ArrowUp", "Space", "ShiftLeft"]
};

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce"
});

const reports = [];

for (const route of routes) {
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const responseErrors = [];
  const url = `${origin}${route.path}`;

  page.on("console", (message) => {
    const type = message.type();
    if (type === "error" || type === "warning") {
      consoleMessages.push({ type, text: message.text() });
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) {
      responseErrors.push({ url: response.url(), status });
    }
  });

  let responseStatus = 0;
  let responseOk = false;
  let evidence = undefined;
  let routeHealth = undefined;
  let firstScreenshot = "";
  let afterScreenshot = "";
  let interactionScreenshot = "";

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    responseStatus = response?.status() ?? 0;
    responseOk = Boolean(response?.ok());

    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(1_200);
    evidence = await readGlobalEvidence(page, route.globalName);
    routeHealth = await readRouteHealth(page, `${origin}${route.path}route-health.json`);

    firstScreenshot = screenshotPath(route.id, "first-load");
    await page.screenshot({ path: firstScreenshot, fullPage: false, scale: "css" });

    await page.waitForTimeout(1_500);
    evidence = await readGlobalEvidence(page, route.globalName) ?? evidence;
    afterScreenshot = screenshotPath(route.id, "after-2700ms");
    await page.screenshot({ path: afterScreenshot, fullPage: false, scale: "css" });

    const inputs = gameInputs[route.id];
    if (inputs) {
      await page.locator("body").click({ position: { x: 32, y: 32 } }).catch(() => undefined);
      for (const key of inputs) {
        await page.keyboard.down(key);
        await page.waitForTimeout(180);
        await page.keyboard.up(key);
        await page.waitForTimeout(120);
      }
      await page.waitForTimeout(900);
      evidence = await readGlobalEvidence(page, route.globalName) ?? evidence;
      interactionScreenshot = screenshotPath(route.id, "after-input");
      await page.screenshot({ path: interactionScreenshot, fullPage: false, scale: "css" });
    }
  } catch (error) {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  }

  const canvasInfo = await readCanvasInfo(page).catch(() => []);
  const diagnostics = evidence?.diagnostics ?? evidence?.capabilityState ?? evidence?.runtimeEvidence;
  const typedAssetReferences = uniqueStrings([
    ...extractTypedAssetReferences(evidence),
    ...extractTypedAssetReferences(routeHealth)
  ]);

  const report = {
    schema: "aura3d-recovery-baseline-route/1.0",
    generatedAt: new Date().toISOString(),
    origin,
    route: route.id,
    url,
    responseStatus,
    responseOk,
    screenshots: {
      firstLoad: relativeReportPath(firstScreenshot),
      after2700ms: relativeReportPath(afterScreenshot),
      afterInput: interactionScreenshot ? relativeReportPath(interactionScreenshot) : undefined
    },
    consoleMessages,
    pageErrors,
    responseErrors,
    evidenceSummary: summarizeEvidence(evidence),
    routeHealthSummary: summarizeEvidence(routeHealth),
    runtimeDiagnostics: diagnostics ?? null,
    sceneEvidence: evidence?.auraSceneEvidence ?? evidence?.diagnostics?.auraScene ?? evidence?.diagnostics?.scene ?? evidence?.runtimeEvidence ?? null,
    typedAssetReferences,
    frameCount: firstNumber(evidence, ["frameCount", "frame", "runtime.frame", "performance.frames"]),
    rendererBackend: firstString(evidence, ["diagnostics.backend", "capabilityState.backend", "backend"]),
    drawCalls: firstNumber(evidence, ["diagnostics.drawCalls", "drawCalls", "performance.drawCalls"]),
    materialCount: firstNumber(evidence, ["asset.materialCount", "materialCount", "diagnostics.materialCount"]),
    textureCount: firstNumber(evidence, ["asset.textureCount", "textureCount", "diagnostics.textureCount"]),
    canvasInfo
  };

  const routeReportPath = resolve(outputDir, `${route.id}.json`);
  writeFileSync(routeReportPath, `${JSON.stringify(report, null, 2)}\n`);
  reports.push(report);
  await page.close();
}

await browser.close();

const summary = {
  schema: "aura3d-recovery-baseline-summary/1.0",
  generatedAt: new Date().toISOString(),
  origin,
  outputDir: relativeReportPath(outputDir),
  routeCount: reports.length,
  routes: reports.map((report) => ({
    route: report.route,
    url: report.url,
    responseOk: report.responseOk,
    screenshots: report.screenshots,
    consoleErrorCount: report.consoleMessages.filter((message) => message.type === "error").length,
    pageErrorCount: report.pageErrors.length,
    responseErrorCount: report.responseErrors.length,
    rendererBackend: report.rendererBackend,
    drawCalls: report.drawCalls,
    materialCount: report.materialCount,
    textureCount: report.textureCount,
    frameCount: report.frameCount,
    typedAssetReferences: report.typedAssetReferences
  }))
};

writeFileSync(resolve(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Aura3D recovery baseline captured: ${relativeReportPath(resolve(outputDir, "summary.json"))}`);

function screenshotPath(routeId, label) {
  return resolve(outputDir, `${routeId}-${label}.png`);
}

function relativeReportPath(path) {
  return path ? path.replace(`${root}/`, "") : "";
}

async function readGlobalEvidence(page, globalName) {
  return await page.evaluate((name) => {
    return globalThis[name];
  }, globalName).catch(() => undefined);
}

async function readRouteHealth(page, routeHealthUrl) {
  return await page.evaluate(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return { status: response.status, ok: false };
    return await response.json();
  }, routeHealthUrl).catch(() => undefined);
}

async function readCanvasInfo(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("canvas")).map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return {
        width: canvas.width,
        height: canvas.height,
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height),
        visible: rect.width > 0 && rect.height > 0
      };
    });
  });
}

function summarizeEvidence(value) {
  if (!value || typeof value !== "object") return null;
  return {
    status: value.status,
    appId: value.appId,
    frameCount: value.frameCount,
    systems: value.systems,
    claimBoundary: value.claimBoundary,
    keys: Object.keys(value).sort()
  };
}

function extractTypedAssetReferences(value) {
  const matches = [];
  const visit = (input) => {
    if (typeof input === "string") {
      const found = input.match(/\b(?:assets\.)?showcase[A-Za-z0-9_]+\b/g);
      if (found) matches.push(...found.map((item) => item.replace(/^assets\./, "")));
      return;
    }
    if (Array.isArray(input)) {
      for (const item of input) visit(item);
      return;
    }
    if (input && typeof input === "object") {
      for (const item of Object.values(input)) visit(item);
    }
  };
  visit(value);
  return matches;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function firstString(value, paths) {
  for (const path of paths) {
    const result = readPath(value, path);
    if (typeof result === "string" && result) return result;
  }
  return undefined;
}

function firstNumber(value, paths) {
  for (const path of paths) {
    const result = readPath(value, path);
    if (typeof result === "number" && Number.isFinite(result)) return result;
    if (typeof result === "string" && result.trim() !== "" && Number.isFinite(Number(result))) return Number(result);
  }
  return undefined;
}

function readPath(value, path) {
  let current = value;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}
