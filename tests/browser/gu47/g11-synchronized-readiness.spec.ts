import { createHash } from "node:crypto";
import { performance as hostPerformance } from "node:perf_hooks";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import {
  BZ_BULLET_HOLES, BZ_FLOOR_DECAL_COUNT, BZ_HAZARD_DECALS, floorDecalKind
} from "../../../apps/showcase-bunker-zero/src/art/decals";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Remote CI only. Both milestone requests are registered before awaiting either
 * one, so a failed/slow 25s read cannot prevent an attempt at 60s. Each has a
 * five-second pre-deadline window; actual clock bounds decide whether it fits.
 *
 * The image is app.screenshot()'s synchronous drawing-buffer readback, not a
 * browser-compositor receipt, a texture-visibility proof, or real-GPU
 * performance. Its explicit render can itself delay the next sample.
 *
 * G11_SYNC_META is the short index. G11_SYNC_JSON and G11_SYNC_PNG are numbered
 * base64 chunks of the full metadata and the exact, lossless readback PNG.
 * Concatenate each series in order, decode it, and check its SHA-256 against
 * the index; no artifact egress or JPEG conversion is needed.
 */
const VARIANTS = [
  { name: "default", path: "/apps/showcase-bunker-zero/", slot: 0 },
  { name: "floor4", path: "/apps/showcase-bunker-zero/?floor=4", slot: 3 }
] as const;
const NOMINAL_MS = [25_000, 60_000] as const;
const EARLY_WINDOW_MS = 5_000;
const READY_TIMEOUT_MS = 420_000;
const NAVIGATION_TIMEOUT_MS = 120_000;
// Even a renderer task that never returns cannot keep the host test open forever.
const HOST_CAPTURE_TIMEOUT_MS = READY_TIMEOUT_MS + 60_000 + 120_000;
const CHUNK = 16_000;
const MAX_EVENTS = 1_000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };

// The ACR browser image copies tests/browser, not tests/unit. Keep these pure
// classifiers self-contained here; unit tests also assert their exact source
// parity with the independently importable helpers under tests/unit/gu47/g11.
interface G11TimingObservation {
  readonly nominalMs: number;
  readonly earlyWindowMs: number;
  readonly readyTimeOriginMs: number | null;
  readonly captureTimeOriginMs: number | null;
  readonly observerInstalledMs: number | null;
  readonly lastNotReadyMs: number | null;
  readonly readyObservedMs: number | null;
  readonly beforeStartMs: number | null;
  readonly beforeEndMs: number | null;
  readonly screenshotStartMs: number | null;
  readonly screenshotEndMs: number | null;
  readonly afterStartMs: number | null;
  readonly afterEndMs: number | null;
}
type G11AgeBounds = readonly [minimumMs: number, maximumMs: number];
interface G11TimingClassification {
  readonly status: "within-window" | "early" | "late" | "not-proven";
  readonly reasons: readonly string[];
  readonly targetWindowMs: readonly [number, number] | null;
  readonly readyUncertaintyMs: number | null;
  readonly beforeStartAgeMs: G11AgeBounds | null;
  readonly screenshotStartAgeMs: G11AgeBounds | null;
  readonly screenshotEndAgeMs: G11AgeBounds | null;
  readonly afterEndAgeMs: G11AgeBounds | null;
}

function classifyG11Timing(input: G11TimingObservation): G11TimingClassification {
  const empty = (reason: string): G11TimingClassification => ({
    status: "not-proven", reasons: [reason], targetWindowMs: null, readyUncertaintyMs: null,
    beforeStartAgeMs: null, screenshotStartAgeMs: null, screenshotEndAgeMs: null, afterEndAgeMs: null
  });
  if (!Number.isFinite(input.nominalMs) || input.nominalMs <= 0 ||
      !Number.isFinite(input.earlyWindowMs) || input.earlyWindowMs < 0 || input.earlyWindowMs > input.nominalMs) {
    return empty("invalid target window");
  }
  const clockValues = [
    input.readyTimeOriginMs, input.captureTimeOriginMs, input.observerInstalledMs, input.lastNotReadyMs,
    input.readyObservedMs, input.beforeStartMs, input.beforeEndMs, input.screenshotStartMs,
    input.screenshotEndMs, input.afterStartMs, input.afterEndMs
  ];
  if (clockValues.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    return empty("missing or invalid browser clock data");
  }
  if (input.readyTimeOriginMs !== input.captureTimeOriginMs) return empty("document timeOrigin changed");

  // The validation above establishes these as finite, non-negative numbers.
  const installed = input.observerInstalledMs as number;
  const notReady = input.lastNotReadyMs as number;
  const ready = input.readyObservedMs as number;
  const beforeStart = input.beforeStartMs as number;
  const beforeEnd = input.beforeEndMs as number;
  const screenshotStart = input.screenshotStartMs as number;
  const screenshotEnd = input.screenshotEndMs as number;
  const afterStart = input.afterStartMs as number;
  const afterEnd = input.afterEndMs as number;
  const ordered = [installed, notReady, ready, beforeStart, beforeEnd, screenshotStart, screenshotEnd, afterStart, afterEnd];
  if (ordered.some((value, index) => index > 0 && value < ordered[index - 1]!)) {
    return empty("browser timestamps are stale or out of order");
  }

  const bounds = (time: number): G11AgeBounds => [time - ready, time - notReady];
  const startAge = bounds(beforeStart);
  const endAge = bounds(afterEnd);
  const firstAllowed = input.nominalMs - input.earlyWindowMs;
  const common = {
    targetWindowMs: [firstAllowed, input.nominalMs] as const,
    readyUncertaintyMs: ready - notReady,
    beforeStartAgeMs: startAge,
    screenshotStartAgeMs: bounds(screenshotStart),
    screenshotEndAgeMs: bounds(screenshotEnd),
    afterEndAgeMs: endAge
  };
  if (endAge[0] > input.nominalMs) {
    return { ...common, status: "late", reasons: ["diagnostic bracket completed after the deadline"] };
  }
  if (startAge[1] < firstAllowed) {
    return { ...common, status: "early", reasons: ["diagnostic bracket began before the target window"] };
  }
  if (startAge[0] < firstAllowed || endAge[1] > input.nominalMs) {
    return { ...common, status: "not-proven", reasons: ["ready-time uncertainty or bracket crosses the target window"] };
  }
  return { ...common, status: "within-window", reasons: [] };
}

interface G11NamedTexture {
  readonly name: string;
  readonly slots: readonly string[];
}
interface G11TextureRowRef {
  readonly index: number;
  readonly nodeName: unknown;
  readonly levelName: unknown;
  readonly status: unknown;
  readonly pixelBacked: unknown;
  readonly slots: unknown;
  readonly warnings: unknown;
  readonly stage: unknown;
  readonly pendingMs: unknown;
}
interface G11TextureCheck {
  readonly issues: readonly string[];
  readonly pending: readonly G11TextureRowRef[];
  readonly fallback: readonly G11TextureRowRef[];
  readonly invalid: readonly G11TextureRowRef[];
  readonly unverified: readonly G11TextureRowRef[];
  readonly pixelBacked: readonly G11TextureRowRef[];
  readonly required: readonly {
    readonly name: string;
    readonly slots: readonly string[];
    readonly observed: readonly G11TextureRowRef[];
    readonly verified: boolean;
  }[];
}

function checkG11TextureRows(rows: unknown, required: readonly G11NamedTexture[]): G11TextureCheck {
  const pending: G11TextureRowRef[] = [];
  const fallback: G11TextureRowRef[] = [];
  const invalid: G11TextureRowRef[] = [];
  const unverified: G11TextureRowRef[] = [];
  const pixelBacked: G11TextureRowRef[] = [];
  const refs: G11TextureRowRef[] = [];
  const issues: string[] = [];
  if (!Array.isArray(rows) || rows.length === 0) issues.push("mounted texture rows are missing or empty");
  for (const [index, value] of (Array.isArray(rows) ? rows : []).entries()) {
    const row = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
    const ref: G11TextureRowRef = {
      index, nodeName: row.nodeName, levelName: row.levelName, status: row.status, pixelBacked: row.pixelBacked,
      slots: row.slots, warnings: row.warnings, stage: row.stage, pendingMs: row.pendingMs
    };
    refs.push(ref);
    const slotsValid = Array.isArray(row.slots) && row.slots.every((slot) => typeof slot === "string" && slot.length > 0);
    const warningsValid = Array.isArray(row.warnings) && row.warnings.every((warning) => typeof warning === "string");
    const statusValid = row.status === "none" || row.status === "pending" || row.status === "fallback" || row.status === "textured";
    const fieldsValid = typeof row.nodeName === "string" && row.nodeName.length > 0 &&
      typeof row.levelName === "string" && row.levelName.length > 0 &&
      typeof row.pixelBacked === "boolean" && slotsValid && warningsValid && statusValid &&
      (row.stage === undefined || typeof row.stage === "string") &&
      (row.pendingMs === undefined || (typeof row.pendingMs === "number" && Number.isFinite(row.pendingMs) && row.pendingMs >= 0));
    if (!fieldsValid || (row.status === "none" && (row.pixelBacked !== false || !slotsValid || (row.slots as unknown[]).length !== 0))) {
      invalid.push(ref);
    }
    if (row.status === "pending") pending.push(ref);
    if (row.status === "fallback") fallback.push(ref);
    if (row.status === "textured") {
      if (row.pixelBacked === true) pixelBacked.push(ref);
      // The renderer marker means a textured material was swapped in; it is
      // not an independent receipt that this texture was sampled on screen.
      const suspectWarning = warningsValid && (row.warnings as string[]).some((warning) =>
        /fallback|fail(?:ed|ure)?|unavailable|invalid|missing|unverified|not.{0,30}pixel/i.test(warning));
      if (row.pixelBacked !== true || !slotsValid || (row.slots as unknown[]).length === 0 || suspectWarning) unverified.push(ref);
    }
  }
  const describe = (list: readonly G11TextureRowRef[]): string => list
    .map((row) => `${row.index}:${String(row.nodeName)}/${String(row.levelName)}=${String(row.status)}`).join(", ");
  if (pending.length) issues.push(`pending texture rows: ${describe(pending)}`);
  if (fallback.length) issues.push(`fallback texture rows: ${describe(fallback)}`);
  if (invalid.length) issues.push(`invalid texture rows: ${describe(invalid)}`);
  if (unverified.length) issues.push(`unverified textured rows: ${describe(unverified)}`);

  const checked = required.map(({ name, slots }) => {
    const observed = refs.filter((row) => row.nodeName === name);
    const verifiedRows = observed.filter((row) =>
      row.status === "textured" && row.pixelBacked === true && Array.isArray(row.slots) &&
      slots.every((slot) => (row.slots as unknown[]).includes(slot)) &&
      !invalid.includes(row) && !unverified.includes(row));
    const verified = verifiedRows.length === 1;
    if (!verified) issues.push(`required texture ${name} [${slots.join(", ")}] not verified: ${describe(observed) || "missing"}`);
    return { name, slots, observed, verified };
  });
  return { issues, pending, fallback, invalid, unverified, pixelBacked, required: checked };
}

type ReadySnapshot = {
  timeOriginMs: number;
  observerInstalledMs: number;
  lastNotReadyMs: number | null;
  readyObservedMs: number | null;
  readyOldValue: string | null;
  readyTransitions: number;
  changesAfterReady: number;
  bodyReplacements: number;
  currentValue: string | null;
  sameBody: boolean;
  bodyConnected: boolean;
};
type ReadyLatch = {
  ready: Promise<void>;
  flush(): void;
  snapshot(): ReadySnapshot;
};
type TextureRow = {
  nodeName?: unknown; levelName?: unknown; status?: unknown; slots?: unknown; pixelBacked?: unknown;
  warnings?: unknown; stage?: unknown; pendingMs?: unknown;
};
type Diagnostics = {
  backend?: unknown; drawCalls?: unknown; warnings?: unknown; errors?: unknown;
  renderer?: { warnings?: unknown; runtime?: { mounted?: unknown; backend?: unknown; warnings?: unknown; texturedMaterials?: TextureRow[] } };
};
type NodeHandle = {
  visible?: unknown;
  snapshot?: () => { material?: { texture?: unknown; normal?: unknown } };
};
type LiveApp = {
  nodes?: { has?: (id: string) => boolean; get?: (id: string) => NodeHandle | undefined };
  diagnostics?: () => Diagnostics;
  screenshot?: () => { mimeType?: unknown; dataUrl?: unknown; width?: unknown; height?: unknown };
  deviceLost?: () => boolean;
};
type WindowWithProbe = typeof window & {
  __GU47_G11_SYNC_READY__?: ReadyLatch;
  __AURA3D_LIVE_APPS__?: { all?: () => LiveApp[] };
  __gameEvidence?: { mode?: unknown; floor?: unknown; look?: { variant?: unknown } };
};

function isG11ReadySnapshotValid(state: {
  currentValue: string | null; sameBody: boolean; bodyConnected: boolean;
  readyTransitions: number; changesAfterReady: number; bodyReplacements: number; timeOriginMs: number;
}, timeOriginMs: number): boolean {
  return state.currentValue === "true" && state.sameBody && state.bodyConnected &&
    state.readyTransitions === 1 && state.changesAfterReady === 0 && state.bodyReplacements === 0 &&
    state.timeOriginMs === timeOriginMs;
}

/**
 * Installed before route code. A heartbeat bounds the last point at which the
 * body was not ready; a MutationObserver latches the actual transition when
 * delivered. Delivery is only an upper bound on assignment time.
 */
function installReadyObserver(): void {
  const w = window as WindowWithProbe;
  const timeOriginMs = performance.timeOrigin;
  const observerInstalledMs = performance.now();
  let lastNotReadyMs: number | null = document.body?.getAttribute("data-aura3d-ready") === "true" ? null : observerInstalledMs;
  let readyObservedMs: number | null = null;
  let readyBody: Element | null = null;
  let readyOldValue: string | null = null;
  let readyTransitions = 0;
  let changesAfterReady = 0;
  let bodyReplacements = 0;
  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
  let heartbeat = 0;

  // Kept inside the init script because Playwright serializes it into the page.
  function classifyG11ReadyMutation(oldValue: string | null, newValue: string | null, observedReady: boolean, isCurrentBody: boolean) {
    const changed = oldValue !== newValue;
    return { invalidates: observedReady && changed, becameReady: isCurrentBody && changed && newValue === "true" };
  }

  const processBodyRecords = (records: MutationRecord[]): void => {
    if (!readyBody) return;
    for (const record of records) {
      if (Array.from(record.removedNodes).some((node) => node === readyBody || node.contains(readyBody))) bodyReplacements += 1;
    }
  };
  const bodyObserver = new MutationObserver(processBodyRecords);
  const processRecords = (records: MutationRecord[]): void => {
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i]!;
      if (record.type !== "attributes" || record.attributeName !== "data-aura3d-ready") continue;
      const body = record.target;
      if (body !== document.body && body !== readyBody) continue;
      // MutationRecord carries oldValue only. A subsequent record's oldValue is
      // this mutation's newValue; otherwise read the final attribute value.
      const next = records.slice(i + 1).find((candidate) =>
        candidate.target === body && candidate.attributeName === "data-aura3d-ready");
      const value = next ? next.oldValue : (body as Element).getAttribute("data-aura3d-ready");
      const mutation = classifyG11ReadyMutation(record.oldValue, value, readyObservedMs !== null, body === document.body);
      if (mutation.invalidates) changesAfterReady += 1;
      if (mutation.becameReady) {
        readyTransitions += 1;
        if (readyObservedMs === null) {
          readyObservedMs = performance.now();
          readyOldValue = record.oldValue;
          readyBody = body as Element;
          // Watch direct removal/replacement, including an old body later reinserted.
          bodyObserver.observe(document, { childList: true });
          if (readyBody.parentNode) bodyObserver.observe(readyBody.parentNode, { childList: true });
          window.clearInterval(heartbeat);
          resolveReady();
        }
      }
    }
  };
  const observer = new MutationObserver(processRecords);
  observer.observe(document, { attributes: true, attributeOldValue: true, attributeFilter: ["data-aura3d-ready"], subtree: true });
  heartbeat = window.setInterval(() => {
    if (readyObservedMs === null && document.body?.getAttribute("data-aura3d-ready") !== "true") lastNotReadyMs = performance.now();
  }, 100);
  w.__GU47_G11_SYNC_READY__ = {
    ready,
    flush: () => { processRecords(observer.takeRecords()); processBodyRecords(bodyObserver.takeRecords()); },
    snapshot: () => ({
      timeOriginMs, observerInstalledMs, lastNotReadyMs, readyObservedMs, readyOldValue, readyTransitions, changesAfterReady, bodyReplacements,
      currentValue: document.body?.getAttribute("data-aura3d-ready") ?? null,
      sameBody: readyBody !== null && document.body === readyBody,
      bodyConnected: readyBody?.isConnected === true
    })
  };
}

/** Serialized by Playwright; the two diagnostics and screenshot are synchronous in one page task. */
async function captureInPage(input: { nominalMs: number; earlyWindowMs: number; readyTimeoutMs: number; slot: number }) {
  const w = window as WindowWithProbe;
  const latch = w.__GU47_G11_SYNC_READY__;
  const evaluateStartedMs = performance.now();
  if (!latch) return { error: "ready observer not installed", evaluateStartedMs, timeOriginMs: performance.timeOrigin };
  const gotReady = await new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => resolve(false), input.readyTimeoutMs);
    void latch.ready.then(() => { window.clearTimeout(timer); resolve(true); });
  });
  latch.flush();
  const readyAtSchedule = latch.snapshot();
  if (!gotReady || readyAtSchedule.readyObservedMs === null) {
    return { error: "body ready transition not observed within the bounded wait", evaluateStartedMs, timeOriginMs: performance.timeOrigin, readyAtSchedule };
  }

  const dueMs = readyAtSchedule.readyObservedMs + input.nominalMs - input.earlyWindowMs;
  const scheduledAtMs = performance.now();
  await new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, dueMs - performance.now())));
  const taskStartedMs = performance.now();
  latch.flush();
  const readyBefore = latch.snapshot();
  let app: LiveApp | undefined;
  let registryCount: number | null = null;
  let matchingAppCount: number | null = null;
  let selectionError: string | null = null;
  try {
    const apps = w.__AURA3D_LIVE_APPS__?.all?.();
    if (!Array.isArray(apps)) throw new Error("live app registry unavailable");
    registryCount = apps.length;
    const matches = apps.filter((candidate) => candidate.nodes?.has?.(`f${input.slot}-s-floor`) === true);
    matchingAppCount = matches.length;
    if (matches.length !== 1) throw new Error(`expected one matching Bunker app, found ${matches.length}`);
    app = matches[0];
  } catch (error) {
    selectionError = String(error);
  }
  const surfaces: Record<string, { exists: boolean; visible: unknown; textureRef: boolean | null; normalRef: boolean | null; error: string | null }> = {};
  for (const key of ["walls", "accent", "floor", "ceil", "columns"]) {
    try {
      const node = app?.nodes?.get?.(`f${input.slot}-s-${key}`);
      const material = node?.snapshot?.().material;
      surfaces[key] = {
        exists: Boolean(node), visible: node?.visible ?? null,
        textureRef: node ? Boolean(material?.texture) : null, normalRef: node ? Boolean(material?.normal) : null, error: null
      };
    } catch (error) {
      surfaces[key] = { exists: false, visible: null, textureRef: null, normalRef: null, error: String(error) };
    }
  }
  // The route beacon is context only: unlike these snapshots it is updated at 4 Hz.
  const beacon = w.__gameEvidence ? {
    mode: w.__gameEvidence.mode ?? null, floor: w.__gameEvidence.floor ?? null,
    variant: w.__gameEvidence.look?.variant ?? null
  } : null;

  const readDiagnostics = () => {
    const startedMs = performance.now();
    let report: {
      error: string | null; backend: unknown; drawCalls: unknown; deviceLost: unknown;
      mounted: unknown; runtimeBackend: unknown; warnings: { app: unknown; renderer: unknown; runtime: unknown };
      errors: unknown; rows: unknown;
    };
    try {
      if (typeof app?.diagnostics !== "function") throw new Error("app.diagnostics unavailable");
      const diagnostics = app.diagnostics();
      const runtime = diagnostics?.renderer?.runtime;
      report = {
        error: null, backend: diagnostics?.backend ?? null, drawCalls: diagnostics?.drawCalls ?? null,
        deviceLost: typeof app.deviceLost === "function" ? app.deviceLost() : null,
        mounted: runtime?.mounted ?? null, runtimeBackend: runtime?.backend ?? null,
        warnings: structuredClone({
          app: diagnostics?.warnings ?? null, renderer: diagnostics?.renderer?.warnings ?? null, runtime: runtime?.warnings ?? null
        }),
        errors: structuredClone(diagnostics?.errors ?? null),
        rows: structuredClone(runtime?.texturedMaterials ?? null)
      };
    } catch (error) {
      report = {
        error: String(error), backend: null, drawCalls: null, deviceLost: null, mounted: null, runtimeBackend: null,
        warnings: { app: null, renderer: null, runtime: null }, errors: null, rows: null
      };
    }
    return { ...report, startedMs, completedMs: performance.now() };
  };

  // No await, compositor screenshot, or unrelated sampling between these calls.
  const before = readDiagnostics();
  const screenshotStartMs = performance.now();
  let shot: ReturnType<NonNullable<LiveApp["screenshot"]>> | null = null;
  let screenshotError: string | null = null;
  try {
    if (typeof app?.screenshot !== "function") throw new Error("app.screenshot unavailable");
    shot = app.screenshot();
  } catch (error) {
    screenshotError = String(error);
  }
  const screenshotEndMs = performance.now();
  const after = readDiagnostics();

  latch.flush();
  const readyAfter = latch.snapshot();
  return {
    error: null, evaluateStartedMs, timeOriginMs: performance.timeOrigin,
    dueMs, scheduledAtMs, taskStartedMs, taskCompletedMs: performance.now(),
    readyAtSchedule, readyBefore, readyAfter, registryCount, matchingAppCount, selectionError, surfaces,
    url: location.href, beacon,
    before, screenshot: { startedMs: screenshotStartMs, completedMs: screenshotEndMs, error: screenshotError, shot }, after
  };
}

type BrowserCapture = Awaited<ReturnType<typeof captureInPage>>;
type HostClock = {
  timeOriginMs: number;
  requestKind: "page.evaluate registration" | "not-requested";
  requestedEpochMs: number | null;
  requestedMonotonicMs: number | null;
  completedEpochMs: number;
  completedMonotonicMs: number;
};
type Attempt = {
  nominalMs: number;
  host: HostClock;
  browser: BrowserCapture | null;
  error: string | null;
};

/** A host timeout bounds even an evaluation stuck inside a synchronous render. */
async function requestCapture(page: Page, nominalMs: number, slot: number): Promise<Attempt> {
  const requestedEpochMs = Date.now();
  const requestedMonotonicMs = hostPerformance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let browser: BrowserCapture | null = null;
  let error: string | null = null;
  try {
    browser = await Promise.race([
      page.evaluate(captureInPage, { nominalMs, earlyWindowMs: EARLY_WINDOW_MS, readyTimeoutMs: READY_TIMEOUT_MS, slot }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`host capture timeout after ${HOST_CAPTURE_TIMEOUT_MS}ms`)), HOST_CAPTURE_TIMEOUT_MS);
      })
    ]);
  } catch (cause) {
    error = String(cause);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return {
    nominalMs, browser, error,
    host: {
      timeOriginMs: hostPerformance.timeOrigin, requestKind: "page.evaluate registration", requestedEpochMs, requestedMonotonicMs,
      completedEpochMs: Date.now(), completedMonotonicMs: hostPerformance.now()
    }
  };
}

function namesForSlot(slot: number, hasColumns: boolean): G11NamedTexture[] {
  return [
    ...["walls", "accent", "floor", "ceil", ...(hasColumns ? ["columns"] : [])]
      .map((key) => ({ name: `f${slot} ${key}`, slots: ["baseColor", "normal"] })),
    ...Array.from({ length: BZ_FLOOR_DECAL_COUNT }, (_, i) => ({ name: `bunker floor ${floorDecalKind(i)} ${i}`, slots: ["baseColor"] })),
    ...Array.from({ length: BZ_HAZARD_DECALS }, (_, i) => ({ name: `bunker hazard stripe ${i}`, slots: ["baseColor"] })),
    ...Array.from({ length: BZ_BULLET_HOLES }, (_, i) => ({ name: `bunker bullet hole ${i}`, slots: ["baseColor"] }))
  ];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Within a single browser task, a changed texture row cannot be treated as a stable bracket. */
function textureSignature(rows: unknown): string | null {
  if (!Array.isArray(rows)) return null;
  return JSON.stringify(rows.map((value) => {
    if (value === null || typeof value !== "object") return value;
    const row = value as TextureRow;
    return [row.nodeName, row.levelName, row.status, row.pixelBacked, row.slots];
  }).map((value) => JSON.stringify(value)).sort());
}

function decodePng(shot: { mimeType?: unknown; dataUrl?: unknown } | null | undefined): { png: Buffer | null; error: string | null } {
  if (shot?.mimeType !== "image/png" || typeof shot.dataUrl !== "string" || !shot.dataUrl.startsWith("data:image/png;base64,")) {
    return { png: null, error: "screenshot is not a PNG data URL" };
  }
  const encoded = shot.dataUrl.slice("data:image/png;base64,".length);
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return { png: null, error: "invalid PNG base64" };
  const png = Buffer.from(encoded, "base64");
  if (png.toString("base64") !== encoded || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { png: null, error: "invalid PNG bytes" };
  }
  return { png, error: null };
}

/** Same blank-frame criteria as game-luma-stats.ts; applied to the logged PNG, never a second screenshot. */
async function pngStats(png: Buffer): Promise<{ width: number; height: number; p5: number; p95: number; blank: boolean; nontransparentPixels: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4 || info.width <= 0 || info.height <= 0 || data.length !== info.width * info.height * 4) {
    throw new Error("PNG pixels or dimensions are invalid");
  }
  const histogram = new Uint32Array(256);
  let nontransparentPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = Math.round(0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!);
    histogram[luma]! += 1;
    if (data[i + 3]! > 0) nontransparentPixels += 1;
  }
  const count = info.width * info.height;
  const percentile = (fraction: number): number => {
    let cumulative = 0;
    for (let i = 0; i < 256; i += 1) {
      cumulative += histogram[i]!;
      if (cumulative >= fraction * count) return i;
    }
    return 255;
  };
  const p5 = percentile(0.05), p95 = percentile(0.95);
  return { width: info.width, height: info.height, p5, p95, blank: p95 <= 8 || p95 - p5 <= 1 || nontransparentPixels === 0, nontransparentPixels };
}

function emitChunks(kind: "JSON" | "PNG", variant: string, nominalMs: number, bytes: Buffer): number {
  const encoded = bytes.toString("base64");
  const count = Math.ceil(encoded.length / CHUNK);
  for (let i = 0; i < count; i += 1) {
    log(`G11_SYNC_${kind} ${variant} ${nominalMs} ${i + 1}/${count} ${encoded.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  }
  return count;
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
type HostEvent = { type: string; text: string; receivedEpochMs: number; receivedMonotonicMs: number };

async function reportAttempt(
  attempt: Attempt, variant: (typeof VARIANTS)[number], events: readonly HostEvent[], droppedEvents: number
): Promise<string[]> {
  const issues: string[] = [];
  const capture = attempt.browser;
  if (attempt.error) issues.push(`host request failed: ${attempt.error}`);
  if (!capture) issues.push("browser capture missing");
  if (capture?.error) issues.push(`browser capture failed: ${capture.error}`);
  if (droppedEvents) issues.push(`host event buffer overflowed (${droppedEvents} events)`);
  const pageErrors = events.filter((event) => event.type === "pageerror");
  if (pageErrors.length) issues.push(`page errors: ${pageErrors.map((event) => event.text).join("; ")}`);

  const complete = capture && "before" in capture && capture.before && capture.after && capture.screenshot ? capture : null;
  const ready = complete?.readyBefore;
  const timing = classifyG11Timing({
    nominalMs: attempt.nominalMs, earlyWindowMs: EARLY_WINDOW_MS,
    readyTimeOriginMs: ready?.timeOriginMs ?? null, captureTimeOriginMs: complete?.timeOriginMs ?? null,
    observerInstalledMs: ready?.observerInstalledMs ?? null, lastNotReadyMs: ready?.lastNotReadyMs ?? null,
    readyObservedMs: ready?.readyObservedMs ?? null, beforeStartMs: complete?.before.startedMs ?? null,
    beforeEndMs: complete?.before.completedMs ?? null, screenshotStartMs: complete?.screenshot.startedMs ?? null,
    screenshotEndMs: complete?.screenshot.completedMs ?? null, afterStartMs: complete?.after.startedMs ?? null,
    afterEndMs: complete?.after.completedMs ?? null
  });
  if (timing.status !== "within-window") issues.push(`timing ${timing.status}: ${timing.reasons.join("; ")}`);

  let beforeTextures: ReturnType<typeof checkG11TextureRows> | null = null;
  let afterTextures: ReturnType<typeof checkG11TextureRows> | null = null;
  let textureRowsStable: boolean | null = null;
  if (complete) {
    if (complete.selectionError || complete.matchingAppCount !== 1) issues.push(`live app selection: ${complete.selectionError ?? "ambiguous"}`);
    for (const phase of ["readyBefore", "readyAfter"] as const) {
      const state = complete[phase];
      if (!isG11ReadySnapshotValid(state, complete.timeOriginMs)) {
        issues.push(`${phase}: missing, changed, or stale body-ready transition`);
      }
    }
    try {
      const actual = new URL(complete.url);
      const expected = new URL(variant.path, actual.origin);
      if (actual.pathname !== expected.pathname || actual.search !== expected.search) issues.push(`wrong route: ${complete.url}`);
    } catch {
      issues.push("route URL unavailable or invalid");
    }
    for (const key of ["walls", "accent", "floor", "ceil"]) {
      const surface = complete.surfaces[key];
      if (!surface || surface.error || !surface.exists || surface.visible !== true || !surface.textureRef || !surface.normalRef) {
        issues.push(`active ${key} surface missing, hidden, or lacking texture/normal references`);
      }
    }
    const columns = complete.surfaces.columns;
    if (columns?.error || (columns?.exists && (columns.visible !== true || !columns.textureRef || !columns.normalRef))) {
      issues.push("active columns surface is hidden or lacks texture/normal references");
    }
    const required = namesForSlot(variant.slot, columns?.exists === true);
    beforeTextures = checkG11TextureRows(complete.before.rows, required);
    afterTextures = checkG11TextureRows(complete.after.rows, required);
    issues.push(...beforeTextures.issues.map((issue) => `before: ${issue}`), ...afterTextures.issues.map((issue) => `after: ${issue}`));
    const beforeSignature = textureSignature(complete.before.rows), afterSignature = textureSignature(complete.after.rows);
    textureRowsStable = beforeSignature !== null && afterSignature !== null && beforeSignature === afterSignature;
    if (!textureRowsStable) issues.push("texture diagnostics changed or were missing across the synchronous readback bracket");

    for (const phase of ["before", "after"] as const) {
      const diag = complete[phase];
      if (diag.error || diag.backend !== "webgl2" || diag.mounted !== true || diag.runtimeBackend !== "production-runtime" ||
          typeof diag.drawCalls !== "number" || !Number.isFinite(diag.drawCalls) || diag.drawCalls <= 0 || diag.deviceLost !== false) {
        issues.push(`${phase}: mounted renderer, draw count, or device state unavailable/invalid`);
      }
      if (!isStringArray(diag.errors) || diag.errors.length > 0) issues.push(`${phase}: diagnostic errors missing or nonempty`);
      for (const [source, warnings] of Object.entries(diag.warnings)) {
        if (!isStringArray(warnings)) {
          issues.push(`${phase}: ${source} warnings missing or invalid`);
        } else if (warnings.some((warning) => /SCREENSHOT_DURING_ASYNC_FRAME|async frame.{0,30}(?:in flight|pending)/i.test(warning))) {
          issues.push(`${phase}: busy-frame warning means screenshot/diagnostics may be stale`);
        }
      }
    }
    if (complete.screenshot.error) issues.push(`screenshot failed: ${complete.screenshot.error}`);
  }

  const shot = complete?.screenshot.shot;
  const decoded = decodePng(shot);
  if (decoded.error) issues.push(decoded.error);
  let pixels: Awaited<ReturnType<typeof pngStats>> | null = null;
  if (decoded.png) {
    try {
      pixels = await pngStats(decoded.png);
      if (shot?.width !== pixels.width || shot?.height !== pixels.height) issues.push("PNG dimensions disagree with screenshot metadata");
      if (pixels.blank) issues.push("synchronous drawing-buffer frame is blank");
    } catch (error) {
      issues.push(`PNG pixel verification failed: ${String(error)}`);
    }
  }

  // The data URL is emitted only as exact PNG chunks, not duplicated in JSON.
  const browserMetadata = complete ? {
    ...complete,
    screenshot: {
      ...complete.screenshot,
      shot: complete.screenshot.shot ? {
        mimeType: complete.screenshot.shot.mimeType,
        width: complete.screenshot.shot.width, height: complete.screenshot.shot.height
      } : null
    }
  } : capture;
  const metadata = {
    variant: variant.name, nominalMs: attempt.nominalMs, method: "synchronous drawing-buffer readback",
    limitations: [
      "not a browser compositor receipt or real-GPU performance measurement",
      "pixelBacked reports a material swap, not per-texture visibility or a GPU-upload receipt",
      "MutationObserver delivery bounds the assignment; host and browser clocks are not assumed synchronized",
      "host request timestamps record early page.evaluate registration, not the timer's execution time",
      "screenshot start/end bound the synchronous render plus PNG encoding, not isolated GPU render time",
      "renderer diagnostics can be cached during an async frame; a busy-frame warning makes this bracket not-proven",
      "the explicit diagnostic render may delay later observations; the 4 Hz game beacon is contextual only"
    ],
    outcome: issues.length ? "not-proven" : "bounded-diagnostic-observed",
    compositorPresentation: "not-proven", perTextureFrameVisibility: "not-proven",
    timing, host: attempt.host, hostError: attempt.error, browser: browserMetadata,
    beforeTextures, afterTextures, textureRowsStable, pngStats: pixels, issues,
    hostEvents: events, droppedHostEvents: droppedEvents
  };
  const json = Buffer.from(JSON.stringify(metadata));
  const pngParts = decoded.png ? Math.ceil(decoded.png.toString("base64").length / CHUNK) : 0;
  log(`G11_SYNC_META ${JSON.stringify({
    variant: variant.name, nominalMs: attempt.nominalMs, outcome: metadata.outcome, timing,
    host: attempt.host, issueCount: issues.length, firstIssues: issues.slice(0, 8).map((issue) => issue.slice(0, 300)),
    jsonBytes: json.length, jsonSha256: sha256(json), jsonParts: Math.ceil(json.toString("base64").length / CHUNK),
    pngBytes: decoded.png?.length ?? 0, pngSha256: decoded.png ? sha256(decoded.png) : null, pngParts
  })}`);
  emitChunks("JSON", variant.name, attempt.nominalMs, json);
  if (decoded.png) emitChunks("PNG", variant.name, attempt.nominalMs, decoded.png);
  return issues;
}

test.describe("G11 synchronized Bunker readiness (remote CI only)", () => {
  // Per test: bounded navigation + bounded dual requests + host decoding/logging.
  test.setTimeout(840_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    if (process.platform === "darwin" || !process.env.CI) throw new Error("Run this browser spec on a remote CI runner, never locally.");
    server = await startExampleDevServer();
  });
  test.afterAll(async () => { await server?.close(); });

  for (const variant of VARIANTS) {
    test(`${variant.name}: 25s and 60s drawing-buffer diagnostics`, async ({ page }) => {
      const events: HostEvent[] = [];
      let droppedEvents = 0;
      const addEvent = (type: string, text: string): void => {
        if (events.length >= MAX_EVENTS) { droppedEvents += 1; return; }
        events.push({ type, text, receivedEpochMs: Date.now(), receivedMonotonicMs: hostPerformance.now() });
      };
      page.on("pageerror", (error) => addEvent("pageerror", error.message));
      page.on("console", (message) => {
        if (message.type() === "warning" || message.type() === "error") addEvent(`console-${message.type()}`, message.text());
      });
      let attempts: Attempt[];
      try {
        await page.addInitScript(installReadyObserver);
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto(`${server.origin}${variant.path}`, { waitUntil: "commit", timeout: NAVIGATION_TIMEOUT_MS });
        // Register both before awaiting either; each capture returns its own real timestamps.
        attempts = await Promise.all(NOMINAL_MS.map((nominalMs) => requestCapture(page, nominalMs, variant.slot)));
      } catch (error) {
        const nowEpochMs = Date.now(), nowMonotonicMs = hostPerformance.now();
        attempts = NOMINAL_MS.map((nominalMs) => ({
          nominalMs, browser: null, error: `navigation/setup failed: ${String(error)}`,
          host: {
            timeOriginMs: hostPerformance.timeOrigin, requestKind: "not-requested",
            requestedEpochMs: null, completedEpochMs: nowEpochMs,
            requestedMonotonicMs: null, completedMonotonicMs: nowMonotonicMs
          }
        }));
      }
      const failures: string[] = [];
      for (const attempt of attempts) {
        try {
          const issues = await reportAttempt(attempt, variant, events, droppedEvents);
          failures.push(...issues.map((issue) => `${variant.name} nominal ${attempt.nominalMs}ms: ${issue}`));
        } catch (error) {
          failures.push(`${variant.name} nominal ${attempt.nominalMs}ms: report failed: ${String(error)}`);
        }
      }
      // Both attempts and their logs precede this assertion; never turn failure into a passing probe.
      expect(failures, `${variant.name}: bounded diagnostic failures`).toEqual([]);
    });
  }
});
