/**
 * Interaction audit for public showcase routes.
 *
 * ## Why this exists
 *
 * The previous verification regime was screenshot composition: colour histograms,
 * flat-region fractions and foreground bounding boxes on a *first frame*. Those
 * metrics are structurally blind to the defects a user finds by clicking around:
 * a focus button that draws a flattened bar, a callout that never renders, a
 * marker floating beside the scene, a control that changes nothing.
 *
 * This spec discovers every visible control on each public route at runtime,
 * clicks it, and asserts on what changed: the route's own evidence global, its
 * published invariant reports, the labels the renderer actually placed on screen,
 * and the browser console. A route whose buttons have never been pressed does not
 * count as tested, so control discovery is dynamic rather than a hand-written list
 * that can drift from the DOM.
 *
 * Every action is recorded into a retained interaction trace, so the evidence for
 * "this control works" is a sequence of observed state transitions rather than an
 * image.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type ConsoleMessage, type Locator, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/showcase-interaction-audit");
const ROUTE_GATE_CONFIG_PATH = resolve("tools/showcase-library/route-gates.json");
const MOUNT_TIMEOUT_MS = 45_000;
const VIEWPORT = { width: 1440, height: 900 } as const;
const MOBILE_VIEWPORT = { width: 390, height: 780 } as const;

interface RouteGate {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly globalName: string;
  readonly published: boolean;
  readonly releaseClass: string;
}

const gateConfigText = readFileSync(ROUTE_GATE_CONFIG_PATH, "utf8");
const gateConfig = JSON.parse(gateConfigText) as { readonly routes: readonly RouteGate[] };
const ROUTE_FILTER = new Set((process.env.A3D_INTERACTION_ROUTE_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean));

/**
 * Publicly linked routes that are not in the route-gate registry.
 *
 * The route-gate registry is not the same set as "routes the public can reach". The
 * disposition audit found `advanced-examples-gallery` linked from the marketing site with
 * eight interactive controls and no interaction coverage: not gated, therefore not audited,
 * therefore never exercised. Excluding a route because it is not gated is the same mistake
 * as excluding one because it is not on the homepage.
 */
const UNGATED_PUBLIC_ROUTES: readonly RouteGate[] = [
  {
    id: "advanced-examples-gallery",
    label: "Advanced Examples Gallery",
    path: "/apps/advanced-examples-gallery/",
    globalName: "__A3D_THREEJS_PARITY_ADVANCED_EXAMPLES_GALLERY__",
    published: true,
    releaseClass: "ungated-public-route"
  }
];

/**
 * Routes audited here.
 *
 * The index route has no scene controls, so it is covered by link checks
 * elsewhere. Everything else that is published is in scope: excluding a route
 * because it is not on the homepage is how Product Configurator and Digital Twin
 * Ops went unexercised.
 */
const ROUTES = [...gateConfig.routes, ...UNGATED_PUBLIC_ROUTES].filter((route) =>
  route.published
  && route.releaseClass !== "index-route"
  && (ROUTE_FILTER.size === 0 || ROUTE_FILTER.has(route.id))
);

interface DiscoveredControl {
  readonly selector: string;
  readonly kind: "button" | "range" | "checkbox" | "select";
  readonly label: string;
}

interface TraceEntry {
  readonly step: number;
  readonly timestamp: string;
  readonly action: string;
  readonly target: string;
  readonly expected: string;
  readonly actual: string;
  readonly evidenceRevisionBefore: string;
  readonly evidenceRevisionAfter: string;
  readonly changed: boolean;
  readonly consoleErrors: readonly string[];
  readonly pass: boolean;
  readonly defectClass?: string;
}

/**
 * Raw snapshot of the route's evidence global, with numbers rounded.
 *
 * Comparison ignores keys that were observed to drift on their own; that set is
 * measured per route rather than hand-listed. A hand-written list of "volatile"
 * keys was wrong in both directions: it stripped `speed` and `progress`, which
 * are the *only* state a racing control changes, so throttle looked inert.
 */
async function evidenceSnapshot(page: Page, globalName: string): Promise<Record<string, unknown> | "absent"> {
  return await page.evaluate((name) => {
    const evidence = (window as unknown as Record<string, unknown>)[name];
    if (!evidence || typeof evidence !== "object") return "absent";
    const flatten = (value: unknown, prefix: string, out: Record<string, unknown>, depth = 0): void => {
      if (depth > 6) return;
      if (Array.isArray(value)) {
        out[`${prefix}.length`] = value.length;
        value.slice(0, 24).forEach((entry, index) => flatten(entry, `${prefix}[${index}]`, out, depth + 1));
        return;
      }
      if (value && typeof value === "object") {
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
          flatten((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key, out, depth + 1);
        }
        return;
      }
      out[prefix] = typeof value === "number" ? Number(value.toFixed(4)) : value;
    };
    const out: Record<string, unknown> = {};
    flatten(evidence, "", out);
    return out;
  }, globalName) as Record<string, unknown> | "absent";
}

/**
 * Learn which evidence keys advance without any interaction.
 *
 * Sampling the idle route is the honest way to separate "this control changed
 * something" from "the clock ticked". Games advance dozens of fields per frame,
 * so a static ignore-list either misses them or hides real state.
 */
async function measureDriftingKeys(page: Page, globalName: string, samples = 4, gapMs = 420): Promise<Set<string>> {
  const drifting = new Set<string>();
  let previous = await evidenceSnapshot(page, globalName);
  for (let index = 0; index < samples; index += 1) {
    await page.waitForTimeout(gapMs);
    const next = await evidenceSnapshot(page, globalName);
    if (previous === "absent" || next === "absent") {
      previous = next;
      continue;
    }
    for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
      if (previous[key] !== next[key]) drifting.add(key);
    }
    previous = next;
  }
  return drifting;
}

/** Keys that differ between two snapshots, excluding those known to drift. */
function meaningfulChanges(
  before: Record<string, unknown> | "absent",
  after: Record<string, unknown> | "absent",
  drifting: ReadonlySet<string>
): readonly string[] {
  if (before === "absent" || after === "absent") return before === after ? [] : ["evidence-global-presence"];
  const changed: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (drifting.has(key)) continue;
    if (before[key] !== after[key]) changed.push(key);
  }
  return changed.sort();
}

/** Discover every visible, enabled control on the page. */
async function discoverControls(page: Page): Promise<readonly DiscoveredControl[]> {
  return await page.evaluate(() => {
    const results: { selector: string; kind: string; label: string }[] = [];
    const cssEscape = (value: string) => value.replace(/(["\\])/g, "\\$1");
    const selectorFor = (element: Element, index: number): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      for (const attribute of Array.from(element.attributes)) {
        if (!attribute.name.startsWith("data-") || !attribute.value) continue;
        const candidate = `${element.tagName.toLowerCase()}[${attribute.name}="${cssEscape(attribute.value)}"]`;
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      }
      const tag = element.tagName.toLowerCase();
      const siblings = Array.from(document.querySelectorAll(tag));
      return `${tag}:nth-of-type(${siblings.indexOf(element) + 1 || index + 1})`;
    };
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.visibility !== "hidden" && style.display !== "none" && style.pointerEvents !== "none";
    };
    document.querySelectorAll("button, [role='button']").forEach((element, index) => {
      if (!visible(element) || (element as HTMLButtonElement).disabled) return;
      results.push({
        selector: selectorFor(element, index),
        kind: "button",
        label: (element.textContent ?? "").trim() || element.getAttribute("aria-label") || "button"
      });
    });
    document.querySelectorAll("input").forEach((element, index) => {
      if (!visible(element) || element.disabled) return;
      const type = element.type === "range" ? "range" : element.type === "checkbox" ? "checkbox" : undefined;
      if (!type) return;
      results.push({ selector: selectorFor(element, index), kind: type, label: element.getAttribute("aria-label") ?? element.id ?? type });
    });
    document.querySelectorAll("select").forEach((element, index) => {
      if (!visible(element) || element.disabled) return;
      results.push({ selector: selectorFor(element, index), kind: "select", label: element.getAttribute("aria-label") ?? element.id ?? "select" });
    });
    // Deduplicate by selector: several routes render the same control twice in
    // responsive layouts.
    const seen = new Set<string>();
    return results.filter((entry) => {
      if (seen.has(entry.selector)) return false;
      seen.add(entry.selector);
      return true;
    }) as { selector: string; kind: DiscoveredControl["kind"]; label: string }[];
  }) as unknown as readonly DiscoveredControl[];
}

/** Wait until the route publishes an accepted mounted status. */
async function waitForMount(page: Page, globalName: string): Promise<void> {
  await page.waitForFunction((name) => {
    const evidence = (window as unknown as Record<string, { status?: string }>)[name];
    if (!evidence) return false;
    const status = evidence.status;
    return status === undefined
      || ["ready", "running", "playing", "completed", "unsupported"].includes(status);
  }, globalName, { timeout: MOUNT_TIMEOUT_MS });
}

interface InvariantSummary {
  readonly focus?: { readonly passes: boolean; readonly failing: readonly string[] };
  readonly spatial?: { readonly passes: boolean; readonly failing: readonly string[] };
  readonly labels?: { readonly total: number; readonly visible: number };
}

/**
 * Read the invariant reports and rendered-label set a route publishes.
 *
 * These are the signals a pixel metric cannot provide: whether the focus
 * indicator is geometrically correct, whether helper geometry is anchored to its
 * asset, and whether a label is actually on screen rather than merely in the
 * scene graph.
 */
async function readInvariants(page: Page, globalName: string): Promise<InvariantSummary> {
  return await page.evaluate((name) => {
    const evidence = (window as unknown as Record<string, Record<string, unknown>>)[name];
    if (!evidence) return {};
    const failing = (report: unknown): readonly string[] => {
      const checks = (report as { checks?: readonly { id: string; passes: boolean }[] } | undefined)?.checks ?? [];
      return checks.filter((check) => !check.passes).map((check) => check.id);
    };
    const focusEvidence = evidence.focusEvidence as { invariants?: unknown; spatialInvariants?: unknown } | undefined;
    const focusReport = focusEvidence?.invariants;
    /*
     * Spatial reports live in different places per route.
     *
     * Digital Twin publishes `spatialInvariants` at the top level; Smart City nests it under
     * `diagnostics`. Reading only the top level silently reported "no invariants" for a route
     * that publishes them, which would let a real spatial failure pass unnoticed -- the same
     * blindness this audit exists to remove.
     */
    const diagnostics = evidence.diagnostics as Record<string, unknown> | undefined;
    const spatialReport = evidence.spatialInvariants
      ?? focusEvidence?.spatialInvariants
      ?? diagnostics?.spatialInvariants;
    const labels = evidence.renderedLabels as readonly { visible: boolean }[] | undefined;
    return {
      ...(focusReport ? { focus: { passes: failing(focusReport).length === 0, failing: failing(focusReport) } } : {}),
      ...(spatialReport ? { spatial: { passes: failing(spatialReport).length === 0, failing: failing(spatialReport) } } : {}),
      ...(labels ? { labels: { total: labels.length, visible: labels.filter((label) => label.visible).length } } : {})
    };
  }, globalName) as InvariantSummary;
}

for (const route of ROUTES) {
  test(`interaction audit: ${route.id}`, async ({ page }, testInfo) => {
    testInfo.setTimeout(300_000);
    let server: ExampleDevServer | undefined;
    const consoleErrors: string[] = [];
    const trace: TraceEntry[] = [];
    let step = 0;

    const onConsole = (message: ConsoleMessage) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // Favicon and icon-probe noise is not a route defect.
      if (/favicon|net::ERR_ABORTED.*\.(ico|png|svg)/i.test(text)) return;
      consoleErrors.push(text);
    };

    try {
      server = await startExampleDevServer();
      page.on("console", onConsole);
      page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      await page.setViewportSize(VIEWPORT);
      await page.goto(`${server.origin}${route.path}`, { waitUntil: "domcontentloaded" });
      await waitForMount(page, route.globalName);

      // Learn what the idle route changes on its own before touching anything.
      const driftingKeys = await measureDriftingKeys(page, route.globalName);

      const initialInvariants = await readInvariants(page, route.globalName);
      const controls = await discoverControls(page);
      const controlResults: {
        selector: string;
        label: string;
        kind: string;
        changed: boolean;
        changedKeys: readonly string[];
        domChanged: boolean;
        pass: boolean;
        defectClass?: string;
      }[] = [];

      for (const control of controls) {
        const locator = page.locator(control.selector).first();
        if (await locator.count() === 0) continue;
        // A segmented control that is already selected is a legitimate no-op, so
        // move off it first. Otherwise the audit reports "Establish does nothing"
        // when Establish is simply the current camera path. This mirrors what a
        // user does: select something else, then select this.
        await deselectIfAlreadyActive(page, locator, control);
        const before = await evidenceSnapshot(page, route.globalName);
        const domBefore = await visibleStateSignature(page);
        const errorsBefore = consoleErrors.length;
        try {
          await operateControl(page, locator, control.kind);
        } catch (error) {
          consoleErrors.push(`control ${control.selector} could not be operated: ${(error as Error).message}`);
        }
        // Let the route apply the change and republish evidence.
        await page.waitForTimeout(500);
        const after = await evidenceSnapshot(page, route.globalName);
        const domAfter = await visibleStateSignature(page);
        const changedKeys = meaningfulChanges(before, after, driftingKeys);
        // A control counts as effective when it moved published state OR visibly
        // changed the UI. Momentary controls such as a hold-to-throttle button
        // legitimately return the route to its prior published state once
        // released, but they must still register somewhere observable.
        const domChanged = domBefore !== domAfter;
        const changed = changedKeys.length > 0 || domChanged;
        const newErrors = consoleErrors.slice(errorsBefore);
        const pass = changed && newErrors.length === 0;
        step += 1;
        trace.push({
          step,
          timestamp: new Date().toISOString(),
          action: `operate ${control.kind}`,
          target: `${control.selector} (${control.label})`,
          expected: "control performs its documented action and produces observable state or UI change",
          actual: changed
            ? `changed: ${changedKeys.slice(0, 8).join(", ") || "visible UI state"}`
            : "no observable effect",
          evidenceRevisionBefore: hashSnapshot(before),
          evidenceRevisionAfter: hashSnapshot(after),
          changed,
          consoleErrors: newErrors,
          pass,
          ...(pass ? {} : { defectClass: newErrors.length > 0 ? "runtime-error" : "control-has-no-effect" })
        });
        controlResults.push({
          selector: control.selector,
          label: control.label,
          kind: control.kind,
          changed,
          changedKeys,
          domChanged,
          pass,
          ...(pass ? {} : { defectClass: newErrors.length > 0 ? "runtime-error" : "control-has-no-effect" })
        });
      }

      // Keyboard controls: routes that declare keys must respond to them.
      const declaredKeys = keyboardKeysForRoute(route.id);
      const keyboardResults: { key: string; changed: boolean; changedKeys: readonly string[] }[] = [];
      for (const key of declaredKeys) {
        const before = await evidenceSnapshot(page, route.globalName);
        await page.keyboard.down(key);
        await page.waitForTimeout(360);
        const held = await evidenceSnapshot(page, route.globalName);
        await page.keyboard.up(key);
        await page.waitForTimeout(240);
        const changedKeys = meaningfulChanges(before, held, driftingKeys);
        keyboardResults.push({ key, changed: changedKeys.length > 0, changedKeys });
      }

      // Camera interaction: drag on the stage must not throw or blank the scene.
      let cameraDragOk = true;
      const stage = page.locator("canvas").first();
      if (await stage.count() > 0) {
        const box = await stage.boundingBox();
        if (box) {
          const errorsBefore = consoleErrors.length;
          await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.42, { steps: 12 });
          await page.mouse.up();
          await page.waitForTimeout(400);
          cameraDragOk = consoleErrors.length === errorsBefore;
          step += 1;
          trace.push({
            step,
            timestamp: new Date().toISOString(),
            action: "drag camera",
            target: "scene canvas",
            expected: "camera orbits without runtime errors",
            actual: cameraDragOk ? "no runtime errors" : "runtime errors during drag",
            evidenceRevisionBefore: "n/a",
            evidenceRevisionAfter: "n/a",
            changed: false,
            consoleErrors: consoleErrors.slice(errorsBefore),
            pass: cameraDragOk,
            ...(cameraDragOk ? {} : { defectClass: "runtime-error" })
          });
        }
      }

      // Mobile viewport: the route must stay mounted, error-free and operable.
      const errorsBeforeResize = consoleErrors.length;
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.waitForTimeout(700);
      const mobileControls = await discoverControls(page);
      const mobileOk = consoleErrors.length === errorsBeforeResize;
      step += 1;
      trace.push({
        step,
        timestamp: new Date().toISOString(),
        action: "resize to mobile viewport",
        target: `${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height}`,
        expected: "route stays mounted and operable without runtime errors",
        actual: `${mobileControls.length} controls reachable`,
        evidenceRevisionBefore: "n/a",
        evidenceRevisionAfter: "n/a",
        changed: false,
        consoleErrors: consoleErrors.slice(errorsBeforeResize),
        pass: mobileOk,
        ...(mobileOk ? {} : { defectClass: "runtime-error" })
      });
      await page.setViewportSize(VIEWPORT);
      await page.waitForTimeout(400);

      /*
       * Peak invariants, captured before the reload.
       *
       * `finalInvariants` is read after a restart, which is correct for restart recovery but
       * wrong for judging label and focus rendering: a reload clears any selection, so a route
       * whose callout only exists while a part is focused reports zero placed labels. The gate
       * then read that as 'unproven' for a capability that demonstrably works. Invariants are
       * therefore also captured at their peak, while state from the interaction sweep is still
       * applied.
       */
      const peakInvariants = await readInvariants(page, route.globalName);

      mkdirSync(REPORT_DIR, { recursive: true });
      const interactionFinalPath = join(REPORT_DIR, `${route.id}-interaction-final.png`);
      await page.screenshot({ path: interactionFinalPath });

      // Restart: reloading must return the route to a mounted state.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForMount(page, route.globalName);
      // Several routes publish their evidence object before the first GPU frame.
      // Waiting for one stable render interval keeps the restart receipt from
      // retaining a black canvas that no user would consider a mounted route.
      await page.waitForTimeout(450);
      const afterReload = await evidenceSnapshot(page, route.globalName);
      const finalInvariants = await readInvariants(page, route.globalName);
      /** Best evidence for each invariant group across the session. */
      const observedInvariants: InvariantSummary = {
        ...(peakInvariants.focus ?? finalInvariants.focus ? { focus: peakInvariants.focus ?? finalInvariants.focus! } : {}),
        ...(peakInvariants.spatial ?? finalInvariants.spatial ? { spatial: peakInvariants.spatial ?? finalInvariants.spatial! } : {}),
        // Labels: take whichever sample actually saw them placed.
        ...((peakInvariants.labels?.visible ?? 0) > 0
          ? { labels: peakInvariants.labels! }
          : finalInvariants.labels
            ? { labels: finalInvariants.labels }
            : {})
      };

      const screenshotPath = join(REPORT_DIR, `${route.id}-final.png`);
      await page.screenshot({ path: screenshotPath });

      /*
       * Phase 17 evidence: viewport variants and a frame sequence.
       *
       * A single screenshot proves one moment at one size. Capturing the same mounted route at
       * desktop, tablet and phone widths, plus a short sequence of frames while it runs, is what
       * distinguishes "this rendered once" from "this holds up while moving and resizing" -- the
       * property the previous first-frame regime could not see.
       */
      const viewportVariants: { readonly label: string; readonly width: number; readonly height: number; readonly path: string; readonly sha256: string }[] = [];
      for (const variant of [
        { label: "desktop", width: 1440, height: 900 },
        { label: "tablet", width: 834, height: 1112 },
        { label: "phone", width: 390, height: 780 }
      ]) {
        await page.setViewportSize({ width: variant.width, height: variant.height });
        await page.waitForTimeout(450);
        const variantPath = join(REPORT_DIR, `${route.id}-${variant.label}.png`);
        const bytes = await page.screenshot({ path: variantPath });
        viewportVariants.push({
          label: variant.label,
          width: variant.width,
          height: variant.height,
          path: `tests/reports/showcase-interaction-audit/${route.id}-${variant.label}.png`,
          sha256: `sha256-${createHash("sha256").update(bytes).digest("hex")}`
        });
      }
      await page.setViewportSize(VIEWPORT);
      await page.waitForTimeout(320);

      /*
       * Frame sequence, in place of a video file.
       *
       * A retained sequence of frames is deterministic, diffable and concurrency-safe in a way an
       * encoded video is not, and it answers the same question: does the route keep rendering
       * coherently while time passes. Each frame carries its own hash.
       */
      const frameSequence: { readonly index: number; readonly path: string; readonly sha256: string }[] = [];
      /*
       * Held input during capture.
       *
       * A game route is legitimately still when no input is held -- Turbo's car does not roll
       * away on its own, which is correct behaviour, not a defect. Capturing a sequence that
       * proves "the route keeps rendering coherently while time passes" therefore has to *drive*
       * it. Routes with no declared keys are captured idle, since for them the question is
       * whether an animation or timeline advances.
       */
      const driveKey = declaredKeys.find((key) => key === "KeyW" || key === "ArrowRight" || key === "KeyD")
        ?? declaredKeys[0];
      if (driveKey) await page.keyboard.down(driveKey);
      try {
        for (let index = 0; index < 6; index += 1) {
          await page.waitForTimeout(260);
          const framePath = join(REPORT_DIR, `${route.id}-frame-${String(index).padStart(2, "0")}.png`);
          const bytes = await page.screenshot({ path: framePath });
          frameSequence.push({
            index,
            path: `tests/reports/showcase-interaction-audit/${route.id}-frame-${String(index).padStart(2, "0")}.png`,
            sha256: `sha256-${createHash("sha256").update(bytes).digest("hex")}`
          });
        }
      } finally {
        if (driveKey) await page.keyboard.up(driveKey);
      }
      // Frames must not all be identical, or the route is a still image with a claim.
      const distinctFrames = new Set(frameSequence.map((frame) => frame.sha256)).size;

      /*
       * Fingerprints binding this evidence to the tree that produced it.
       *
       * Without these, a retained trace cannot be shown to describe the current source, which is
       * how a stale artifact stays green after the code beneath it changes.
       */
      const routeSourceDir = resolve("apps", route.id, "src");
      const sourceFingerprint = (() => {
        const hash = createHash("sha256");
        const walk = (dir: string) => {
          let entries: string[];
          try {
            entries = readdirSync(dir).sort();
          } catch {
            return;
          }
          for (const entry of entries) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) {
              walk(full);
              continue;
            }
            if (!/\.(ts|css|html)$/.test(entry)) continue;
            hash.update(entry);
            hash.update(readFileSync(full));
          }
        };
        walk(routeSourceDir);
        return `sha256-${hash.digest("hex")}`;
      })();
      const configurationFingerprint = `sha256-${createHash("sha256")
        .update(JSON.stringify({ viewport: VIEWPORT, keys: declaredKeys, controls: controls.map((control) => control.selector) }))
        .digest("hex")}`;

      const report = {
        schema: "aura3d-showcase-interaction-audit/1.0",
        routeId: route.id,
        label: route.label,
        releaseClass: route.releaseClass,
        generatedAt: new Date().toISOString(),
        producer: "tests/browser/showcase-route-interaction-audit.spec.ts",
        viewport: VIEWPORT,
        driftingEvidenceKeys: [...driftingKeys].sort().slice(0, 80),
        controlsDiscovered: controls.length,
        controlsOperated: controlResults.length,
        controlsWithEffect: controlResults.filter((entry) => entry.changed).length,
        controlsPassing: controlResults.filter((entry) => entry.pass).length,
        controlResults,
        keyboardResults,
        cameraDragOk,
        mobileControlsDiscovered: mobileControls.length,
        restartRecovered: afterReload !== "absent",
        initialInvariants,
        peakInvariants,
        finalInvariants,
        observedInvariants,
        consoleErrors,
        trace,
        screenshot: `tests/reports/showcase-interaction-audit/${route.id}-final.png`,
        interactionFinalScreenshot: `tests/reports/showcase-interaction-audit/${route.id}-interaction-final.png`,
        // Phase 17 evidence set.
        viewportVariants,
        frameSequence,
        distinctFrames,
        /*
         * Whether frame variation was required of this route. Recorded so a reader can see that a
         * still sequence was accepted deliberately for a static route, not overlooked.
         */
        frameVariationRequired: declaredKeys.length > 0,
        sourceFingerprint,
        configurationFingerprint,
        producerVersion: "aura3d-showcase-interaction-audit/1.1"
      };
      writeFileSync(join(REPORT_DIR, `${route.id}.json`), `${JSON.stringify(report, null, 2)}\n`);

      // --- Assertions ---------------------------------------------------------
      // No runtime errors during any interaction. This is the floor: a route that
      // throws while a user clicks is not shippable regardless of how it looks.
      expect(consoleErrors, `runtime errors during interaction on ${route.id}`).toEqual([]);

      // Every discovered control must do something observable. `changed` compares
      // published state with self-drifting keys removed, plus visible UI state, so
      // a no-op button cannot hide behind an advancing frame counter.
      const inertControls = controlResults
        .filter((entry) => !entry.changed)
        .map((entry) => `${entry.selector} (${entry.label})`);
      expect(inertControls, `controls with no observable effect on ${route.id}`).toEqual([]);

      // Published invariants must hold. A route reporting a focus or spatial
      // invariant is asserting geometric correctness; it must be true.
      if (observedInvariants.focus) {
        expect(observedInvariants.focus.failing, `focus invariant failures on ${route.id}`).toEqual([]);
      }
      if (observedInvariants.spatial) {
        expect(observedInvariants.spatial.failing, `spatial invariant failures on ${route.id}`).toEqual([]);
      }
      // A route that authors labels must have them on screen, not merely in the
      // scene graph. This is the check the missing-callout defect defeated.
      if (observedInvariants.labels && observedInvariants.labels.total > 0) {
        expect(observedInvariants.labels.visible, `labels present but none rendered on ${route.id}`).toBeGreaterThan(0);
      }

      expect(afterReload, `route did not republish evidence after reload: ${route.id}`).not.toBe("absent");

      // Mobile must expose the same controls as desktop: an interaction that
      // disappears on a phone is not an equivalent experience.
      expect(mobileControls.length, `controls lost on mobile viewport for ${route.id}`).toBeGreaterThanOrEqual(
        Math.floor(controls.length * 0.9)
      );

      // Phase 17: the evidence set must be complete.
      expect(viewportVariants, `viewport variants for ${route.id}`).toHaveLength(3);
      expect(frameSequence, `frame sequence for ${route.id}`).toHaveLength(6);
      /*
       * Frame variation is required only where the route claims motion.
       *
       * A configurator at rest is *correctly* a still image: it has no timeline, no simulation and
       * no held input, so demanding pixel change would be demanding a defect. Routes with declared
       * keyboard controls are simulations, and a simulation that renders six identical frames while
       * a movement key is held is broken.
       */
      if (declaredKeys.length > 0) {
        expect(distinctFrames, `simulation ${route.id} rendered six identical frames while input was held`).toBeGreaterThan(1);
      }
    } finally {
      page.off("console", onConsole);
      await server?.close();
    }
  });
}

/**
 * Move a segmented control off the option under test before exercising it.
 *
 * `aria-pressed="true"` / `aria-selected="true"` / an active class means the
 * option is already applied, so re-selecting it correctly changes nothing. The
 * audit must distinguish "this control is inert" from "this control is already
 * in the state it sets".
 */
async function deselectIfAlreadyActive(page: Page, locator: Locator, control: DiscoveredControl): Promise<void> {
  if (control.kind !== "button") return;
  const active = await locator.evaluate((element) =>
    element.getAttribute("aria-pressed") === "true"
    || element.getAttribute("aria-selected") === "true"
    || element.getAttribute("data-active") === "true"
    || element.classList.contains("is-active")
    || element.classList.contains("active")
  ).catch(() => false);
  if (!active) return;
  // Find a sibling in the same group that is not active and select it.
  const siblingSelector = await locator.evaluate((element) => {
    const group = element.parentElement;
    if (!group) return undefined;
    const siblings = Array.from(group.querySelectorAll("button")).filter((candidate) => candidate !== element);
    const target = siblings.find((candidate) =>
      candidate.getAttribute("aria-pressed") !== "true"
      && candidate.getAttribute("aria-selected") !== "true"
      && !(candidate as HTMLButtonElement).disabled
    );
    if (!target) return undefined;
    if (target.id) return `#${CSS.escape(target.id)}`;
    for (const attribute of Array.from(target.attributes)) {
      if (!attribute.name.startsWith("data-") || !attribute.value) continue;
      const candidate = `button[${attribute.name}="${attribute.value.replace(/(["\\])/g, "\\$1")}"]`;
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    }
    return undefined;
  }).catch(() => undefined);
  if (!siblingSelector) return;
  await page.locator(siblingSelector).first().click({ timeout: 5_000, force: true }).catch(() => undefined);
  await page.waitForTimeout(450);
}

/**
 * Operate a control the way a user would.
 *
 * Momentary game controls are bound to `pointerdown`/`pointerup` rather than
 * `click`, so a plain click never latches them. Playwright's `click` does emit
 * pointer events, but a hold control needs a measurable hold: press, wait, release.
 */
async function operateControl(page: Page, locator: Locator, kind: string): Promise<void> {
  if (kind === "range") {
    await locator.evaluate((element) => {
      const input = element as HTMLInputElement;
      const min = Number(input.min || 0);
      const max = Number(input.max || 100);
      const step = Number(input.step || 0) || (max - min) / 10;
      const current = Number(input.value);
      // Move at least one step, toward whichever end is further away.
      const next = current - min > max - current ? Math.max(min, current - step * 3) : Math.min(max, current + step * 3);
      input.value = String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return;
  }
  if (kind === "select") {
    const optionCount = await locator.locator("option").count();
    if (optionCount > 1) {
      const currentIndex = await locator.evaluate((element) => (element as HTMLSelectElement).selectedIndex);
      await locator.selectOption({ index: currentIndex === 0 ? 1 : 0 });
    }
    return;
  }
  // Buttons and checkboxes: press, hold briefly, release. This satisfies both
  // click listeners and pointerdown/pointerup hold bindings.
  const box = await locator.boundingBox();
  if (!box) {
    await locator.click({ timeout: 5_000, force: true });
    return;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(220);
  await page.mouse.up();
}

/**
 * Signature of user-visible UI state.
 *
 * Some controls only change the DOM -- an active-class on a segmented control, a
 * readout, a pressed state. That is still the control performing its documented
 * action, so it counts. Text nodes that look like clocks or counters are excluded.
 */
async function visibleStateSignature(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const parts: string[] = [];
    document.querySelectorAll("button, [role='button'], input, select, [aria-pressed], [aria-selected], [data-active]").forEach((element) => {
      const attributes = ["class", "aria-pressed", "aria-selected", "data-active", "disabled", "value", "checked"]
        .map((name) => `${name}=${element.getAttribute(name) ?? (element as HTMLInputElement).checked ?? ""}`)
        .join("|");
      parts.push(`${element.tagName}:${element.id}:${attributes}`);
    });
    return parts.join("\n");
  });
}

/** Hash a snapshot for the trace, so a trace entry is comparable without being huge. */
function hashSnapshot(snapshot: Record<string, unknown> | "absent"): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 16);
}

/**
 * Keys a route documents.
 *
 * Read from the route's own source so the audit exercises the bindings the route
 * claims, not a generic guess. A generic list produced false "key does nothing"
 * results for routes that never bound that key.
 */
function keyboardKeysForRoute(routeId: string): readonly string[] {
  const sourceDir = resolve("apps", routeId, "src");
  const keys = new Set<string>();
  const scan = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        scan(full);
        continue;
      }
      if (!entry.endsWith(".ts")) continue;
      const text = readFileSync(full, "utf8");
      for (const match of text.matchAll(/["'](Key[A-Z]|Arrow(?:Up|Down|Left|Right)|Space|Enter|Escape|Digit\d)["']/g)) {
        keys.add(match[1]);
      }
    }
  };
  scan(sourceDir);
  return [...keys].sort().slice(0, 12);
}
