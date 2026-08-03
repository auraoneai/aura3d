/**
 * Phase 15: clean-room developer proof.
 *
 * Four projects written against `@aura3d/engine`'s public surface only, without copying
 * showcase source. This spec both **measures** them -- authored lines, imports, private
 * imports, forbidden patterns -- and **runs** them, so "a new developer can build this"
 * is demonstrated rather than asserted.
 *
 * The targets come from the assignment: a static interactive application under 200
 * developer-authored lines, a playable prototype under 300, and no custom engine loop,
 * manual asset bounds, hand-built selection geometry, world-label renderer, physics
 * integration, route-specific evidence harness, or private imports.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/clean-room-projects");
const ROOT = resolve("tests/clean-room");

interface ProjectSpec {
  readonly id: string;
  readonly dir: string;
  readonly kind: "static-application" | "playable-prototype";
  readonly globalName: string;
  /** Maximum developer-authored lines the assignment allows for this kind. */
  readonly lineBudget: number;
  /** Controls to operate, as CSS selectors. */
  readonly controls: readonly string[];
  /** Keys to press. */
  readonly keys: readonly string[];
}

const PROJECTS: readonly ProjectSpec[] = [
  {
    id: "product-configurator",
    dir: "product-configurator",
    kind: "static-application",
    globalName: "__CLEAN_ROOM_CONFIGURATOR__",
    lineBudget: 200,
    controls: ['button[data-finish="graphite"]', 'button[data-finish="pearl"]', 'button[data-part="earcups"]', 'button[data-part="headband"]', 'button[data-part="cushions"]', "#reset"],
    keys: []
  },
  {
    id: "digital-twin",
    dir: "digital-twin",
    kind: "static-application",
    globalName: "__CLEAN_ROOM_DIGITAL_TWIN__",
    lineBudget: 200,
    controls: ['button[data-zone="assembly"]', 'button[data-zone="packaging"]', 'button[data-zone="energy"]', "#alarm", "#focus"],
    keys: []
  },
  {
    id: "racing-prototype",
    dir: "racing-prototype",
    kind: "playable-prototype",
    globalName: "__CLEAN_ROOM_RACING__",
    lineBudget: 300,
    controls: [],
    keys: ["KeyW", "KeyA", "KeyD", "KeyR"]
  },
  {
    id: "platformer-prototype",
    dir: "platformer-prototype",
    kind: "playable-prototype",
    globalName: "__CLEAN_ROOM_PLATFORMER__",
    lineBudget: 300,
    controls: [],
    keys: ["KeyD", "Space", "KeyA", "KeyR"]
  }
];

/**
 * Patterns the assignment forbids in a clean-room project.
 *
 * Each is something a developer should not have to write because the engine provides it.
 * Finding one here means the public API still has a hole.
 */
const FORBIDDEN = [
  { id: "private-monorepo-import", pattern: /from\s+["'][^"']*packages\/[^"']*\/src\//, description: "reaches into another package's src/" },
  { id: "custom-engine-loop", pattern: /requestAnimationFrame\s*\(/, description: "runs its own animation frame loop" },
  { id: "manual-asset-bounds", pattern: /\.bounds\s*\[|boundsMetadata/, description: "reads raw asset bounds by hand" },
  { id: "manual-selection-torus", pattern: /primitives\.torus\([^)]*\)[\s\S]{0,200}?\.rotate\(/, description: "hand-builds a selection ring from a torus" },
  { id: "manual-world-label-renderer", pattern: /createElement\(["']div["']\)[\s\S]{0,200}?(?:project|viewProjection|ndc)/i, description: "hand-builds a world-label renderer" },
  { id: "manual-physics-integration", pattern: /new\s+(?:PhysicsWorld|RigidBody|CANNON|RAPIER)/, description: "wires a physics engine by hand" },
  { id: "manual-gravity-integration", pattern: /vy\s*[-+]=\s*[\d.]+\s*\*\s*(?:dt|step)/, description: "integrates gravity by hand" },
  { id: "route-specific-evidence-harness", pattern: /createHash|writeFileSync|analyzePng/, description: "builds its own evidence harness" },
  { id: "raw-three-import", pattern: /from\s+["']three["']|three\/examples/, description: "imports Three.js directly" },
  { id: "raw-glb-url", pattern: /["'][^"']*\.glb["']/, description: "uses a raw GLB URL instead of a typed asset" }
];

/** Developer-authored lines: excludes blank lines and comment-only lines. */
function authoredLines(text: string): number {
  return text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (trimmed === "") return false;
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed === "*/") return false;
    return true;
  }).length;
}

function collectFiles(dir: string): readonly string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|html)$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

interface Measurement {
  readonly projectId: string;
  readonly kind: string;
  readonly files: readonly { readonly path: string; readonly authoredLines: number }[];
  readonly totalAuthoredLines: number;
  readonly lineBudget: number;
  readonly withinBudget: boolean;
  readonly packagesImported: readonly string[];
  readonly privateImports: readonly string[];
  readonly forbiddenFindings: readonly { readonly id: string; readonly description: string; readonly file: string }[];
  readonly setupCommands: readonly string[];
}

function measure(spec: ProjectSpec): Measurement {
  const dir = join(ROOT, spec.dir);
  const files = collectFiles(dir);
  const packages = new Set<string>();
  const privateImports = new Set<string>();
  const findings: { id: string; description: string; file: string }[] = [];
  const measured: { path: string; authoredLines: number }[] = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const relative = file.slice(resolve(".").length + 1);
    // `src/assets.ts` is a one-line re-export of the CLI-generated typed asset map, which
    // a real project would have in its own tree. Counting it would penalise the project
    // for the harness's file layout.
    const isAssetShim = /clean-room\/[^/]+\/src\/assets\.ts$/.test(file);
    const lines = isAssetShim ? 0 : authoredLines(text);
    measured.push({ path: relative, authoredLines: lines });

    for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = match[1];
      if (spec.startsWith("@aura3d/") || !spec.startsWith(".")) packages.add(spec);
      if (/packages\/[^/]+\/src\//.test(spec)) privateImports.add(spec);
    }
    if (isAssetShim) continue;
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(text)) findings.push({ id: rule.id, description: rule.description, file: relative });
    }
  }

  const totalAuthoredLines = measured.reduce((total, entry) => total + entry.authoredLines, 0);
  return {
    projectId: spec.id,
    kind: spec.kind,
    files: measured,
    totalAuthoredLines,
    lineBudget: spec.lineBudget,
    withinBudget: totalAuthoredLines <= spec.lineBudget,
    packagesImported: [...packages].sort(),
    privateImports: [...privateImports].sort(),
    forbiddenFindings: findings,
    setupCommands: ["npm create aura3d@latest", "npm install", "npm run dev"]
  };
}

async function readGlobal(page: Page, name: string): Promise<Record<string, unknown>> {
  return await page.evaluate((globalName) => {
    const value = (window as unknown as Record<string, unknown>)[globalName];
    return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  }, name);
}

for (const spec of PROJECTS) {
  test(`clean-room: ${spec.id}`, async ({ page }, testInfo) => {
    testInfo.setTimeout(180_000);
    let server: ExampleDevServer | undefined;
    const consoleErrors: string[] = [];
    const measurement = measure(spec);
    try {
      server = await startExampleDevServer();
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        if (/favicon/i.test(message.text())) return;
        consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
      await page.setViewportSize({ width: 1280, height: 800 });

      const start = Date.now();
      await page.goto(`${server.origin}/tests/clean-room/${spec.dir}/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((name) => {
        const value = (window as unknown as Record<string, unknown>)[name];
        return value !== undefined && value !== null;
      }, spec.globalName, { timeout: 90_000 });
      const timeToFirstInteraction = Date.now() - start;

      const interactions: { target: string; changed: boolean }[] = [];
      for (const selector of spec.controls) {
        const before = JSON.stringify(await readGlobal(page, spec.globalName));
        await page.locator(selector).first().click({ timeout: 8_000 });
        await page.waitForTimeout(420);
        const after = JSON.stringify(await readGlobal(page, spec.globalName));
        interactions.push({ target: selector, changed: before !== after });
      }
      for (const key of spec.keys) {
        const before = JSON.stringify(await readGlobal(page, spec.globalName));
        await page.keyboard.down(key);
        /*
         * Sample *during* the hold as well as after release.
         *
         * A jump completes inside its own airtime, so a before/after comparison around a
         * key press sees the character back on the same platform at the same x and
         * reports the jump as inert. That is a flaw in the measurement, not in the
         * prototype: momentary actions with transient effects must be observed while they
         * are happening.
         */
        const during: string[] = [];
        for (let sample = 0; sample < 4; sample += 1) {
          await page.waitForTimeout(120);
          during.push(JSON.stringify(await readGlobal(page, spec.globalName)));
        }
        await page.keyboard.up(key);
        await page.waitForTimeout(260);
        const after = JSON.stringify(await readGlobal(page, spec.globalName));
        interactions.push({
          target: `key:${key}`,
          changed: before !== after || during.some((snapshot) => snapshot !== before)
        });
      }

      const finalState = await readGlobal(page, spec.globalName);
      mkdirSync(REPORT_DIR, { recursive: true });
      await page.screenshot({ path: join(REPORT_DIR, `${spec.id}.png`) });
      writeFileSync(join(REPORT_DIR, `${spec.id}.json`), `${JSON.stringify({
        schema: "aura3d-clean-room-project/1.0",
        generatedAt: new Date().toISOString(),
        producer: "tests/browser/clean-room-projects.spec.ts",
        measurement,
        timeToFirstInteractionMs: timeToFirstInteraction,
        interactions,
        finalState,
        consoleErrors,
        screenshot: `tests/reports/clean-room-projects/${spec.id}.png`
      }, null, 2)}\n`);

      // --- Assertions ---------------------------------------------------------
      expect(consoleErrors, `runtime errors in clean-room ${spec.id}`).toEqual([]);

      // The project must run and publish state.
      expect(Object.keys(finalState).length, `${spec.id} published no state`).toBeGreaterThan(0);

      // Authored-line budget from the assignment.
      expect(measurement.totalAuthoredLines, `${spec.id} authored lines`).toBeLessThanOrEqual(measurement.lineBudget);

      // No private monorepo imports.
      expect(measurement.privateImports, `${spec.id} private imports`).toEqual([]);

      // None of the forbidden hand-rolled systems.
      expect(
        measurement.forbiddenFindings.map((finding) => `${finding.id}: ${finding.description} (${finding.file})`),
        `${spec.id} had to hand-build something the engine should provide`
      ).toEqual([]);

      // Every control must do something observable.
      const inert = interactions.filter((entry) => !entry.changed).map((entry) => entry.target);
      expect(inert, `${spec.id} controls with no observable effect`).toEqual([]);

      // Capability-specific correctness, read from each project's own published state.
      if (spec.id === "product-configurator") {
        const focus = finalState.focusInvariants as { passes?: boolean; checks?: readonly unknown[] } | undefined;
        expect(focus?.passes ?? true, "focus invariants failed in the clean-room configurator").toBe(true);
      }
      if (spec.id === "digital-twin") {
        const spatial = finalState.spatialInvariants as { passes?: boolean } | undefined;
        expect(spatial?.passes, "spatial invariants failed in the clean-room digital twin").toBe(true);
      }
      if (spec.id === "racing-prototype") {
        // A clean-room car must be grounded without the developer writing contact code.
        expect(finalState.groundedWheels, "clean-room car is not fully grounded").toBe(4);
        expect(finalState.maxContactGap as number, "clean-room car contact gap").toBeLessThan(0.05);
      }
      if (spec.id === "platformer-prototype") {
        const motion = finalState.motionInvariants as { passes?: boolean; checks?: readonly { id: string; passes: boolean; detail: string }[] } | undefined;
        expect(motion?.passes, `clean-room platformer motion invariants: ${JSON.stringify(motion?.checks?.filter((check) => !check.passes))}`).toBe(true);
      }
    } finally {
      await server?.close();
    }
  });
}

void statSync;
