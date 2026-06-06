import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page, type Request } from "@playwright/test";

export interface Aura3D106DeployedVisualProofReport {
  readonly schema: "aura3d109-deployed-visual-proof";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly targetUrls: readonly string[];
  readonly localReferenceUrl: string | null;
  readonly checks: readonly DeployedRouteProof[];
  readonly localReference: BrowserRouteProof | null;
  readonly blockers: readonly string[];
}

interface DeployedRouteProof {
  readonly url: string;
  readonly ok: boolean;
  readonly page: BrowserRouteProof | null;
  readonly parity: RouteParityProof | null;
  readonly blockers: readonly string[];
}

interface BrowserRouteProof {
  readonly url: string;
  readonly finalUrl: string;
  readonly httpStatus: number | null;
  readonly title: string;
  readonly screenshotPath: string;
  readonly screenshotBytes: number;
  readonly screenshotSha256: string;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly failedRequests: readonly string[];
  readonly resources: ResourceSummary;
  readonly canvas: CanvasProof;
  readonly proof: AuraClashArenaProof | null;
  readonly bodyTextSample: string;
}

interface RouteParityProof {
  readonly comparedAgainst: "local-reference" | "expected-current-contract";
  readonly ok: boolean;
  readonly releaseMatches: boolean;
  readonly appMatches: boolean;
  readonly proofVersionMatches: boolean;
  readonly routeMatches: boolean;
  readonly canvasProfileDelta: {
    readonly litPixels: number | null;
    readonly uniqueBuckets: number | null;
    readonly centerObjectPixels: number | null;
  };
  readonly blockers: readonly string[];
}

interface ResourceSummary {
  readonly js: readonly ResourceProbe[];
  readonly css: readonly ResourceProbe[];
  readonly models: readonly ResourceProbe[];
  readonly textures: readonly ResourceProbe[];
  readonly audio: readonly ResourceProbe[];
}

interface ResourceProbe {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly bytes: number;
}

interface CanvasProof {
  readonly present: boolean;
  readonly width: number;
  readonly height: number;
  readonly litPixels: number;
  readonly uniqueBuckets: number;
  readonly centerObjectPixels: number;
  readonly blank: boolean;
}

interface AuraClashArenaProof {
  readonly route?: unknown;
  readonly app?: unknown;
  readonly release?: unknown;
  readonly version?: unknown;
  readonly status?: unknown;
  readonly error?: unknown;
  readonly frame?: unknown;
  readonly totalHits?: unknown;
  readonly visibleFighterAsset?: unknown;
  readonly fighterAssets?: {
    readonly player?: { readonly id?: unknown; readonly url?: unknown; readonly hash?: unknown };
    readonly rival?: { readonly id?: unknown; readonly url?: unknown; readonly hash?: unknown };
    readonly distinct?: unknown;
    readonly releaseReady?: unknown;
  };
  readonly renderer?: { readonly drawCalls?: unknown };
  readonly player?: { readonly x?: unknown; readonly y?: unknown; readonly health?: unknown; readonly grounded?: unknown; readonly action?: unknown; readonly activeClip?: unknown };
  readonly rival?: { readonly x?: unknown; readonly y?: unknown; readonly health?: unknown; readonly grounded?: unknown; readonly action?: unknown; readonly activeClip?: unknown };
  readonly runtime?: {
    readonly frameLoop?: unknown;
    readonly input?: unknown;
    readonly deterministicCombat?: unknown;
    readonly hitWindows?: unknown;
    readonly hud?: unknown;
    readonly evidence?: unknown;
  };
  readonly controls?: {
    readonly lastInput?: unknown;
    readonly downSupported?: unknown;
    readonly specialRequiresMeter?: unknown;
    readonly koLocked?: unknown;
    readonly resetCount?: unknown;
  };
  readonly animation?: { readonly visibleSkinnedGlb?: unknown; readonly skinnedDrawItems?: unknown };
  readonly audio?: { readonly musicReady?: unknown; readonly sfxReady?: unknown; readonly enabled?: unknown };
}

const screenshotDir = "tests/reports/aura3d109/deployed-visual-proof";
const defaultOutPath = "tests/reports/aura3d109/deployed-visual-proof.json";
const defaultTargetUrls = [
  "https://aura3d.auraone.ai/playable",
  "https://aura3d.auraone.ai/apps/aura-clash",
  "https://aura3d.auraone.ai/showcase/aura-clash/playable/"
] as const;

export async function createAura3D106DeployedVisualProofReport(): Promise<Aura3D106DeployedVisualProofReport> {
  const targetUrls = readListOption("--url") ?? readEnvList("AURA_CLASH_DEPLOYED_URLS") ?? [...defaultTargetUrls];
  const localReferenceUrl = readOption("--local-url") ?? process.env.AURA_CLASH_LOCAL_URL ?? null;
  const browser = await chromium.launch();
  try {
    const localReference = localReferenceUrl
      ? await captureRoute(browser, localReferenceUrl, `${screenshotDir}/local-reference.png`)
      : null;
    const checks: DeployedRouteProof[] = [];
    for (const [index, url] of targetUrls.entries()) {
      const page = await captureRoute(browser, url, `${screenshotDir}/deployed-${index + 1}.png`).catch((error: unknown) => ({
        error: error instanceof Error ? error.message : String(error)
      }));
      if ("error" in page) {
        checks.push({
          url,
          ok: false,
          page: null,
          parity: null,
          blockers: [`route capture failed: ${page.error}`]
        });
        continue;
      }
      const blockers = validateRouteProof(page);
      const parity = compareRouteParity(page, localReference);
      checks.push({
        url,
        ok: blockers.length === 0 && parity.ok,
        page,
        parity,
        blockers: [...blockers, ...parity.blockers]
      });
    }
    const blockers = checks.flatMap((check) => check.blockers.map((blocker) => `${check.url}: ${blocker}`));
    return {
      schema: "aura3d109-deployed-visual-proof",
      ok: blockers.length === 0 && checks.length > 0,
      generatedAt: new Date().toISOString(),
      targetUrls,
      localReferenceUrl,
      checks,
      localReference,
      blockers
    };
  } finally {
    await browser.close();
  }
}

export function writeAura3D106DeployedVisualProofReport(root: string, report: Aura3D106DeployedVisualProofReport, outPath = defaultOutPath): void {
  const absolute = join(root, outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

async function captureRoute(browser: Awaited<ReturnType<typeof chromium.launch>>, url: string, screenshotPath: string): Promise<BrowserRouteProof> {
  mkdirSync(dirname(screenshotPath), { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const responseByUrl = new Map<string, { status: number; contentType: string }>();
  const page = await context.newPage();
  try {
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request: Request) => {
      failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? "failed"}`);
    });
    page.on("response", (response) => {
      responseByUrl.set(response.url(), {
        status: response.status(),
        contentType: response.headers()["content-type"] ?? ""
      });
    });

    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForFunction(() => Boolean((window as Window & { __AURA_CLASH_ARENA_PROOF__?: unknown }).__AURA_CLASH_ARENA_PROOF__), null, {
      timeout: 30_000
    }).catch(() => undefined);
    await page.locator(".aca").focus().catch(() => undefined);
    await hold(page, "KeyD", 420);
    await hold(page, "Space", 80);
    await hold(page, "KeyS", 180);
    await page.waitForFunction(() => {
      const proof = (window as Window & { __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaProof }).__AURA_CLASH_ARENA_PROOF__;
      return proof?.player?.grounded === true;
    }, null, { timeout: 3_000 }).catch(() => undefined);
    await hold(page, "KeyQ", 140);
    await hold(page, "KeyJ", 220);
    await page.waitForTimeout(180);
    await hold(page, "KeyK", 240);
    await hold(page, "KeyL", 160);
    await page.waitForTimeout(700);

    const screenshot = await page.screenshot({ fullPage: true });
    writeFileSync(screenshotPath, screenshot);
    const proof = await page.evaluate(() => (window as Window & { __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaProof }).__AURA_CLASH_ARENA_PROOF__ ?? null);
    const canvas = await profileCanvas(page);
    const resources = await collectResources(page, responseByUrl);
    const bodyTextSample = ((await page.locator("body").textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);

    return {
      url,
      finalUrl: page.url(),
      httpStatus: response?.status() ?? null,
      title: await page.title().catch(() => ""),
      screenshotPath,
      screenshotBytes: screenshot.byteLength,
      screenshotSha256: createHash("sha256").update(screenshot).digest("hex"),
      consoleErrors,
      pageErrors,
      failedRequests,
      resources,
      canvas,
      proof,
      bodyTextSample
    };
  } finally {
    await context.close();
  }
}

function validateRouteProof(page: BrowserRouteProof): string[] {
  const blockers: string[] = [];
  if (page.httpStatus !== 200) blockers.push(`page returned HTTP ${String(page.httpStatus)}, expected 200.`);
  if (page.consoleErrors.length > 0) blockers.push(`console errors present: ${page.consoleErrors.slice(0, 4).join(" | ")}`);
  if (page.pageErrors.length > 0) blockers.push(`page errors present: ${page.pageErrors.slice(0, 4).join(" | ")}`);
  if (page.failedRequests.length > 0) blockers.push(`failed requests present: ${page.failedRequests.slice(0, 6).join(" | ")}`);
  if (!page.canvas.present) blockers.push("canvas is missing.");
  if (page.canvas.blank) blockers.push(`canvas appears blank: litPixels=${page.canvas.litPixels}, uniqueBuckets=${page.canvas.uniqueBuckets}.`);
  if (page.resources.js.length === 0) blockers.push("no JavaScript chunk resources were observed.");
  if (page.resources.css.length === 0) blockers.push("no CSS resources were observed.");
  if (page.resources.models.length === 0) blockers.push("no GLB/glTF resources were observed.");
  for (const [kind, probes] of Object.entries(page.resources) as [keyof ResourceSummary, readonly ResourceProbe[]][]) {
    const failed = probes.filter((probe) => probe.status !== 200);
    if (failed.length > 0) blockers.push(`${kind} resources did not all return 200: ${failed.map((probe) => `${probe.status} ${probe.url}`).join(" | ")}`);
  }
  if (!page.proof) {
    blockers.push("window.__AURA_CLASH_ARENA_PROOF__ is missing.");
  } else {
    if (page.proof.app !== "Aura Clash Arena") blockers.push(`proof app mismatch: ${String(page.proof.app)}.`);
    if (page.proof.release !== "1.0.9") blockers.push(`proof release mismatch: ${String(page.proof.release)}.`);
    if (page.proof.status !== "running") blockers.push(`proof status is ${String(page.proof.status)}, expected running after control smoke.`);
    if (page.proof.error !== null) blockers.push(`proof error is not null: ${String(page.proof.error)}.`);
    if (numberValue(page.proof.frame) <= 0) blockers.push("proof frame did not advance.");
    if (page.proof.runtime?.frameLoop !== true) blockers.push("proof.runtime.frameLoop is not true.");
    if (page.proof.runtime?.input !== true) blockers.push("proof.runtime.input is not true.");
    if (page.proof.runtime?.deterministicCombat !== true) blockers.push("proof.runtime.deterministicCombat is not true.");
    if (page.proof.runtime?.evidence !== true) blockers.push("proof.runtime.evidence is not true.");
    if (page.proof.animation?.visibleSkinnedGlb !== true) blockers.push("proof.animation.visibleSkinnedGlb is not true.");
    if (numberValue(page.proof.animation?.skinnedDrawItems) <= 0) blockers.push("proof.animation.skinnedDrawItems did not prove visible GLB fighters.");
    if (page.proof.fighterAssets?.player?.id !== "auraClashPlayerRig") blockers.push(`proof.fighterAssets.player.id is ${String(page.proof.fighterAssets?.player?.id)}, expected auraClashPlayerRig.`);
    if (page.proof.fighterAssets?.rival?.id !== "auraClashRivalRig") blockers.push(`proof.fighterAssets.rival.id is ${String(page.proof.fighterAssets?.rival?.id)}, expected auraClashRivalRig.`);
    if (page.proof.fighterAssets?.distinct !== true) blockers.push("proof.fighterAssets.distinct is not true.");
    if (page.proof.fighterAssets?.releaseReady !== true) blockers.push("proof.fighterAssets.releaseReady is not true.");
    if (page.proof.visibleFighterAsset === "/aura-assets/auraClashTrainingMannequin.d8672924.glb") {
      blockers.push("proof still exposes retired auraClashTrainingMannequin as the visible fighter asset.");
    }
    if (page.proof.controls?.downSupported !== true) blockers.push("proof.controls.downSupported is not true.");
    if (page.proof.controls?.specialRequiresMeter !== true) blockers.push("proof.controls.specialRequiresMeter is not true.");
    if (page.proof.audio?.musicReady !== true || page.proof.audio?.sfxReady !== true) blockers.push("proof.audio does not show music and SFX readiness.");
    const playerMoved = Math.abs(numberValue(page.proof.player?.x)) > 0.05 || page.proof.controls?.lastInput !== "idle";
    if (!playerMoved) blockers.push("control smoke did not change player state or last input.");
  }
  if (/Aura Clash V\d|game-v\d|debug cube|primitive fighter/i.test(page.bodyTextSample)) {
    blockers.push("deployed body text exposes stale version/debug/procedural wording.");
  }
  if (/auraClashTrainingMannequin|same-model|training mannequin/i.test(page.bodyTextSample)) {
    blockers.push("deployed body text still references the retired same-model training mannequin proof.");
  }
  const modelUrls = page.resources.models.map((probe) => probe.url).join("\n");
  if (!modelUrls.includes("auraClashPlayerRig")) blockers.push("deployed GLB resources do not include auraClashPlayerRig.");
  if (!modelUrls.includes("auraClashRivalRig")) blockers.push("deployed GLB resources do not include auraClashRivalRig.");
  if (modelUrls.includes("auraClashTrainingMannequin")) blockers.push("deployed GLB resources still include the retired auraClashTrainingMannequin.");
  return blockers;
}

function compareRouteParity(page: BrowserRouteProof, localReference: BrowserRouteProof | null): RouteParityProof {
  const blockers: string[] = [];
  const releaseMatches = page.proof?.release === "1.0.9";
  const appMatches = page.proof?.app === "Aura Clash Arena";
  const proofVersionMatches = typeof page.proof?.version === "string" && page.proof.version.includes("aura-clash-arena");
  const routeMatches =
    page.proof?.route === "/playable/" ||
    page.finalUrl.includes("/playable") ||
    page.finalUrl.includes("/apps/aura-clash") ||
    page.finalUrl.includes("/showcase/aura-clash/playable");
  if (!releaseMatches) blockers.push("deployed proof does not match current release 1.0.9.");
  if (!appMatches) blockers.push("deployed proof does not match Aura Clash Arena app contract.");
  if (!proofVersionMatches) blockers.push("deployed proof does not expose the current Aura Clash Arena proof version.");
  if (!routeMatches) blockers.push("deployed proof/final URL does not match a supported Aura Clash route.");

  let canvasProfileDelta: RouteParityProof["canvasProfileDelta"] = {
    litPixels: null,
    uniqueBuckets: null,
    centerObjectPixels: null
  };
  if (localReference) {
    canvasProfileDelta = {
      litPixels: Math.abs(page.canvas.litPixels - localReference.canvas.litPixels),
      uniqueBuckets: Math.abs(page.canvas.uniqueBuckets - localReference.canvas.uniqueBuckets),
      centerObjectPixels: Math.abs(page.canvas.centerObjectPixels - localReference.canvas.centerObjectPixels)
    };
    if (localReference.proof?.version !== page.proof?.version) blockers.push("deployed proof version does not match local reference proof version.");
    if (localReference.proof?.release !== page.proof?.release) blockers.push("deployed release does not match local reference release.");
    const uniqueBucketDelta = canvasProfileDelta.uniqueBuckets;
    if (typeof uniqueBucketDelta === "number" && uniqueBucketDelta > 32) {
      blockers.push(`deployed screenshot color profile differs from local reference by ${uniqueBucketDelta} buckets.`);
    }
  }

  return {
    comparedAgainst: localReference ? "local-reference" : "expected-current-contract",
    ok: blockers.length === 0,
    releaseMatches,
    appMatches,
    proofVersionMatches,
    routeMatches,
    canvasProfileDelta,
    blockers
  };
}

async function profileCanvas(page: Page): Promise<CanvasProof> {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox().catch(() => null);
  if (!box || box.width <= 0 || box.height <= 0) {
    return { present: false, width: 0, height: 0, litPixels: 0, uniqueBuckets: 0, centerObjectPixels: 0, blank: true };
  }
  const png = await canvas.screenshot().catch(() => null);
  if (!png) {
    return { present: true, width: Math.round(box.width), height: Math.round(box.height), litPixels: 0, uniqueBuckets: 0, centerObjectPixels: 0, blank: true };
  }
  const decoded = decodePngRgba(png);
  return profileRgbaPixels(decoded.width, decoded.height, decoded.rgba);
}

function profileRgbaPixels(width: number, height: number, pixels: Uint8Array): CanvasProof {
  const buckets = new Set<string>();
  let litPixels = 0;
  let centerObjectPixels = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 120));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4;
      const r = pixels[offset] ?? 0;
      const g = pixels[offset + 1] ?? 0;
      const b = pixels[offset + 2] ?? 0;
      const a = pixels[offset + 3] ?? 255;
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (a > 12 && luminance > 18) {
        litPixels += 1;
        buckets.add(`${r >> 4}-${g >> 4}-${b >> 4}`);
        if (x > width * 0.18 && x < width * 0.82 && y > height * 0.16 && y < height * 0.86) {
          centerObjectPixels += 1;
        }
      }
    }
  }
  return {
    present: true,
    width,
    height,
    litPixels,
    uniqueBuckets: buckets.size,
    centerObjectPixels,
    blank: litPixels < 500 || buckets.size < 8 || centerObjectPixels < 140
  };
}

function decodePngRgba(buffer: Buffer): { readonly width: number; readonly height: number; readonly rgba: Uint8Array } {
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("Canvas screenshot is not a PNG.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const chunks: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9] ?? 6;
      if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`Unsupported PNG format bitDepth=${String(bitDepth)} colorType=${String(colorType)}.`);
      }
    } else if (type === "IDAT") {
      chunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(chunks));
  const rgba = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  let read = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[read++];
    current.set(raw.subarray(read, read + stride));
    read += stride;
    unfilterScanline(current, previous, channels, filter ?? 0);
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      rgba[target] = current[source] ?? 0;
      rgba[target + 1] = current[source + 1] ?? 0;
      rgba[target + 2] = current[source + 2] ?? 0;
      rgba[target + 3] = channels === 4 ? current[source + 3] ?? 255 : 255;
    }
    previous.set(current);
  }
  return { width, height, rgba };
}

function unfilterScanline(current: Uint8Array, previous: Uint8Array, bytesPerPixel: number, filter: number): void {
  for (let index = 0; index < current.length; index += 1) {
    const left = index >= bytesPerPixel ? current[index - bytesPerPixel] ?? 0 : 0;
    const up = previous[index] ?? 0;
    const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0;
    if (filter === 1) current[index] = (current[index]! + left) & 255;
    else if (filter === 2) current[index] = (current[index]! + up) & 255;
    else if (filter === 3) current[index] = (current[index]! + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) current[index] = (current[index]! + paeth(left, up, upperLeft)) & 255;
  }
}

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

async function collectResources(page: Page, responseByUrl: ReadonlyMap<string, { status: number; contentType: string }>): Promise<ResourceSummary> {
  const urls = await page.evaluate(() => {
    const entries = performance.getEntriesByType("resource").map((entry) => entry.name);
    const domUrls = Array.from(document.querySelectorAll("script[src],link[href],img[src],source[src],audio[src],video[src]"))
      .map((element) => element.getAttribute("src") ?? element.getAttribute("href") ?? "")
      .map((value) => value ? new URL(value, document.baseURI).toString() : "")
      .filter(Boolean);
    return [...new Set([...entries, ...domUrls])].filter((name) => /\.(js|css|glb|gltf|png|jpe?g|webp|avif|ktx2|basis|mp3|wav|ogg|m4a)(?:$|\?)/i.test(name));
  });
  const probes = await Promise.all(urls.map((url) => probeResource(page, url, responseByUrl)));
  return {
    js: probes.filter((probe) => /\.js(?:$|\?)/i.test(probe.url)),
    css: probes.filter((probe) => /\.css(?:$|\?)/i.test(probe.url)),
    models: probes.filter((probe) => /\.(glb|gltf)(?:$|\?)/i.test(probe.url)),
    textures: probes.filter((probe) => /\.(png|jpe?g|webp|avif|ktx2|basis)(?:$|\?)/i.test(probe.url)),
    audio: probes.filter((probe) => /\.(mp3|wav|ogg|m4a)(?:$|\?)/i.test(probe.url))
  };
}

async function probeResource(page: Page, url: string, responseByUrl: ReadonlyMap<string, { status: number; contentType: string }>): Promise<ResourceProbe> {
  const existing = responseByUrl.get(url);
  try {
    const result = await page.evaluate(async (resourceUrl) => {
      const response = await fetch(resourceUrl, { method: "GET", cache: "no-store" });
      const bytes = await response.arrayBuffer();
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        bytes: bytes.byteLength
      };
    }, url);
    return { url, ...result };
  } catch {
    return {
      url,
      status: existing?.status ?? 0,
      contentType: existing?.contentType ?? "",
      bytes: 0
    };
  }
}

async function hold(page: Page, code: string, ms: number): Promise<void> {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readListOption(name: string): string[] | undefined {
  const value = readOption(name);
  return value ? splitList(value) : undefined;
}

function readEnvList(name: string): string[] | undefined {
  const value = process.env[name];
  return value ? splitList(value) : undefined;
}

function splitList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.cwd();
  const report = await createAura3D106DeployedVisualProofReport();
  writeAura3D106DeployedVisualProofReport(root, report, readOption("--out") ?? defaultOutPath);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
