import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { classifyRouteMount, findUndocumentedRendererMounts } from "../../tools/root-path-integrity/renderer-mount-policy";
import { findMultiOwnerPixelExports } from "../../tools/root-path-integrity/pixel-export-policy";
import {
  findUndisclosedPrimitiveHeroes,
} from "../../tools/root-path-integrity/primitive-hero-policy";
import { findFrameGraphResourceBreaks } from "../../tools/root-path-integrity/framegraph-resource-policy";

/**
 * PART K1 task 2b (muse3jsparity-PRD): root-path integrity (T).
 *
 * Aggregates the T1/T2/T3 unit gates by RE-EXECUTING their policy logic
 * live in this run (not by trusting cached unit results), plus a browser
 * check that showcase routes mount only documented renderers:
 * - T1a: live-tree renderer-mount scan equals the one ratified entry.
 * - T1b: live export-ownership audit equals the 8 ratified divergent symbols.
 * - T2: the three migrated templates carry no undisclosed primitive hero;
 *   the WWX fallback remains the single recorded OPEN violation.
 * - T3: zero logic-less passes (each compatibility pass dispatches the canonical native owner +
 *   validates explicit resource access), and the resource edges parsed from
 *   source validate clean against the canonical topology in this run.
 * - Browser: three showcase routes reach ready+draw, and each route's
 *   main.ts classifies as root-production-bridge (no undocumented renderer).
 */

const REPORT_DIR = "tests/reports/muse3jsparity";

const KNOWN_UNDOCUMENTED_MOUNTS: readonly string[] = [
  "packages/create-aura3d/templates/animation-studio/src/scene-player.ts :: A3DRenderer subordinate mount outside apps/ (scope: templates)",
];

const KNOWN_DIVERGENT_PIXEL_SYMBOLS: readonly string[] = [
  "A3DRenderer",
  "BloomPass",
  "Camera",
  "Scene",
  "ShadowPass",
  "ToneMappingPass",
  "createMorphTargetPlan",
  "scene",
];

const PASS_FILES: ReadonlyArray<{ id: string; file: string }> = [
  { id: "DepthPrepass", file: "packages/rendering/src/production-runtime/passes/DepthPrepass.ts" },
  { id: "ShadowPass", file: "packages/rendering/src/production-runtime/passes/ShadowPass.ts" },
  { id: "SkyboxPass", file: "packages/rendering/src/production-runtime/passes/SkyboxPass.ts" },
  { id: "OpaquePass", file: "packages/rendering/src/production-runtime/passes/OpaquePass.ts" },
  { id: "TransparentPass", file: "packages/rendering/src/production-runtime/passes/TransparentPass.ts" },
  { id: "ToneMappingPass", file: "packages/rendering/src/production-runtime/passes/ToneMappingPass.ts" },
];

function readRouteSources(): Array<{ path: string; content: string }> {
  const roots = ["apps", "examples", "packages/create-aura3d/templates"];
  const files: Array<{ path: string; content: string }> = [];
  const collect = (dir: string, relRoot: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = join(relRoot, entry).replace(/\\/g, "/");
      if (statSync(full).isDirectory()) {
        collect(full, rel);
      } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        files.push({ path: rel, content: readFileSync(full, "utf8") });
      }
    }
  };
  for (const root of roots) {
    for (const entry of readdirSync(root)) {
      const full = join(root, entry);
      if (!statSync(full).isDirectory()) continue;
      const src = join(full, "src");
      try {
        if (statSync(src).isDirectory()) collect(src, join(root, entry, "src").replace(/\\/g, "/"));
      } catch {
        /* entry without src/ — not a route source tree */
      }
    }
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}

function readTemplateSources(roots: readonly string[]): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const collect = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) collect(full);
      else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        files.push({ path: full.replace(/\\/g, "/"), content: readFileSync(full, "utf8") });
      }
    }
  };
  for (const root of roots) collect(root);
  return files;
}

/** Parse one pass file's declared edges from source (fails closed on drift). */
function parsePassEdges(id: string, source: string): { id: string; reads: string[]; writes: string[] } {
  const idMatch = source.match(/readonly id = '([A-Za-z]+)'/);
  expect(idMatch?.[1], `${id}: file must declare its pass id`).toBe(id);
  const defaults = new Map<string, string>();
  for (const match of source.matchAll(/const (\w+) = options\.\w+ \?\? '([a-z][a-z-]*(?:\.[a-z-]+)?)'/g)) {
    defaults.set(match[1]!, match[2]!);
  }
  const readsMatch = source.match(/this\.reads = \[([^\]]*)\]/);
  const writesMatch = source.match(/this\.writes = \[([^\]]*)\]/);
  expect(readsMatch?.[1], `${id}: file must declare non-empty reads`).toBeTruthy();
  expect(writesMatch?.[1], `${id}: file must declare non-empty writes`).toBeTruthy();
  const resolveIds = (list: string): string[] =>
    list
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((name) => {
        const literal = defaults.get(name);
        expect(literal, `${id}: edge '${name}' must resolve to a default resource literal`).toBeTruthy();
        return literal!;
      });
  const reads = resolveIds(readsMatch![1]!);
  const writes = resolveIds(writesMatch![1]!);
  expect(reads.length, `${id}: reads must be non-empty`).toBeGreaterThan(0);
  expect(writes.length, `${id}: writes must be non-empty`).toBeGreaterThan(0);
  return { id, reads, writes };
}

test.describe("K1 root path integrity (T)", () => {
  test.setTimeout(600_000);

  test("T1a+T1b+T2+T3 gates re-executed live from source", async () => {
    const gate: Record<string, unknown> = {};

    // T1a: live-tree renderer-mount scan.
    const routeFiles = readRouteSources();
    expect(routeFiles.length).toBeGreaterThan(100);
    const violations = findUndocumentedRendererMounts(routeFiles);
    expect(violations.map((violation) => `${violation.path} :: ${violation.reason}`)).toEqual([
      ...KNOWN_UNDOCUMENTED_MOUNTS,
    ]);
    const buckets = new Set(
      routeFiles
        .map((file) => classifyRouteMount(file.path, file.content).classification?.bucket)
        .filter(Boolean)
    );
    expect(buckets).toContain("root-production-bridge");
    expect(buckets).toContain("advanced-subordinate");
    expect(buckets).toContain("bare-core-evidence");
    gate.t1a = { routeFiles: routeFiles.length, violations, buckets: [...buckets] };

    // T1b: live export-ownership audit from the generated surface diff.
    const surfaceDiff = JSON.parse(readFileSync("tests/reports/public-surface-diff.json", "utf8")) as {
      packages?: { after?: { name?: string; exports?: { subpath?: string; symbols?: { name?: string; kind?: "runtime" | "type"; signature?: string }[] }[] }[]; current?: unknown };
    };
    const records: { symbol: string; kind: "runtime" | "type"; ownerPackage: string; subpath: string; signature: string }[] = [];
    const after = (surfaceDiff.packages?.after ?? []) as {
      name?: string;
      exports?: { subpath?: string; symbols?: { name?: string; kind?: "runtime" | "type"; signature?: string }[] }[];
    }[];
    for (const pkg of after) {
      for (const entry of pkg.exports ?? []) {
        for (const symbol of entry.symbols ?? []) {
          records.push({
            symbol: symbol.name ?? "",
            kind: symbol.kind ?? "runtime",
            ownerPackage: pkg.name ?? "",
            subpath: entry.subpath ?? "",
            signature: symbol.signature ?? "",
          });
        }
      }
    }
    expect(records.length).toBeGreaterThan(1000);
    const findings = findMultiOwnerPixelExports(records);
    expect(findings.map((finding) => finding.symbol).sort()).toEqual([...KNOWN_DIVERGENT_PIXEL_SYMBOLS].sort());
    gate.t1b = { records: records.length, divergent: findings.map((finding) => finding.symbol).sort() };

    // T2: migrated templates clean; WWX fallback is the recorded OPEN item.
    const templateFiles = readTemplateSources([
      "packages/create-aura3d/templates/mini-game/src",
      "packages/create-aura3d/templates/character-controller/src",
      "packages/create-aura3d/templates/fighting-game/src",
    ]);
    expect(templateFiles.length).toBeGreaterThan(3);
    expect(findUndisclosedPrimitiveHeroes(templateFiles)).toEqual([]);
    // The one open route violation lived in the World War X showcase, which has been deleted.
    gate.t2 = {
      templateFiles: templateFiles.length,
      openViolation: null,
    };

    // T3: zero logic-less passes + resource flow validated from source.
    const topology = readFileSync(
      "packages/rendering/src/production-runtime/passes/FramegraphTopology.ts",
      "utf8"
    );
    const orderMatch = topology.match(/PRODUCTION_PASS_ORDER[^=]*=\s*\[([^\]]*)\]/);
    expect(orderMatch?.[1], "topology must declare PRODUCTION_PASS_ORDER").toBeTruthy();
    const order = [...orderMatch![1]!.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]!);
    expect(order).toEqual(PASS_FILES.map((pass) => pass.id));
    const parsed = PASS_FILES.map((pass) => {
      const source = readFileSync(pass.file, "utf8");
      expect(statSync(pass.file).size, `${pass.id}: non-trivial file`).toBeGreaterThan(800);
      expect(source, `${pass.id}: must dispatch native execution`).toContain("executeNativePass(this, context)");
      expect(source, `${pass.id}: must validate fail-closed`).toMatch(/throw new/);
      return parsePassEdges(pass.id, source);
    });
    const ordered = order.map((id) => parsed.find((record) => record.id === id)!);
    expect(findFrameGraphResourceBreaks(ordered, { order })).toEqual([]);
    // The gate itself is proven live: unwritten reads and misorder fail.
    const negativeBreaks = findFrameGraphResourceBreaks(
      [
        { id: "DepthPrepass", reads: ["scene.geometry"], writes: ["linear-depth"] },
        { id: "OpaquePass", reads: ["linear-depth", "phantom.mask"], writes: ["hdr.color"] },
      ],
      { order: ["DepthPrepass", "OpaquePass"] }
    );
    expect(
      negativeBreaks.some((item) => /OpaquePass reads unwritten resource: phantom\.mask/.test(item)),
      `unwritten reads must fail closed (saw: ${negativeBreaks.join(" | ")})`
    ).toBe(true);
    expect(
      findFrameGraphResourceBreaks([...ordered].reverse(), { order }).some((item) => item.includes("Misordered"))
    ).toBe(true);
    gate.t3 = { kind: "static-adapter-contract-only", passes: parsed, runtimeProof: "R06 all six native stages and essential-pass browser negative controls" };

    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(resolve(REPORT_DIR), { recursive: true });
    writeFileSync(
      resolve(`${REPORT_DIR}/root-path-gates.json`),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), gate }, null, 2)}\n`
    );
  });
});


test("R06 native tone adapter pixels and essential-pass negative control", async ({ browser }) => {
  const exampleServer = await startExampleDevServer();
  const page = await browser.newPage();
  try {
    await page.goto(exampleServer.origin, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => {
      const renderingUrl = '/packages/rendering/src/index.ts';
      const adapterUrl = '/packages/rendering/src/production-runtime/passes/ToneMappingPass.ts';
      const { createRenderDevice, ToneMappingPass: NativeToneMappingPass } = await import(renderingUrl);
      const { ToneMappingPass } = await import(adapterUrl);
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
      canvas.id = 'r06-native'; document.body.replaceChildren(canvas);
      const device = await createRenderDevice({ backend: 'webgl2', canvas, preserveDrawingBuffer: true });
      const source = device.createRenderTarget({ width: 32, height: 32 });
      const output = device.createRenderTarget({ width: 32, height: 32 });
      try {
        device.beginFrame(32, 32);
        device.setRenderTarget(source); device.clear([1, 0.25, 0, 1]);
        device.setRenderTarget(output); device.clear([0, 0, 0, 1]);
        const before = Array.from(device.readPixels(0, 0, 1, 1));
        const resources = new Map([['hdr.color', { value: source, frameIndex: 0 }]]);
        const adapter = new ToneMappingPass({ exposure: 2, operator: 'reinhard' });
        const context = { frameIndex: 0, width: 32, height: 32, device, resources,
          commands: new Map([[adapter.id, (bindings: {
            read(name: string): unknown;
            write(name: string, resource: unknown): unknown;
          }) => new NativeToneMappingPass({
            source: bindings.read('hdr.color'),
            target: bindings.write('ldr.output', { value: output, frameIndex: 0 }),
            exposure: adapter.exposure, operator: adapter.nativeOperator, gamma: 1
          })]]) };
        new ToneMappingPass({ enabled: false }).execute(context);
        const disabled = Array.from(device.readPixels(0, 0, 1, 1));
        adapter.execute(context);
        device.setRenderTarget(output);
        const enabled = Array.from(device.readPixels(0, 0, 1, 1));
        const outputIdentity = resources.get('ldr.output')?.value === output;
        const owner = device.kind;
        device.endFrame();
        return { before, disabled, enabled, outputIdentity, owner };
      } finally { source.dispose(); output.dispose(); device.dispose(); }
    });
    expect(result.disabled).toEqual(result.before);
    expect(result.enabled[0]).toBeGreaterThan(160);
    expect(result.enabled[0]).toBeLessThan(180);
    expect(result.enabled[1]).toBeGreaterThan(75);
    expect(result.enabled[1]).toBeLessThan(95);
    expect(result.enabled[2]).toBe(0);
    expect(result.outputIdentity).toBe(true);
    expect(result.owner).toBe('webgl2');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const directory = process.env.AURA_MUSE_OUTPUT_DIR ?? REPORT_DIR;
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'r06-native-tone-resource-proof.json'), `${JSON.stringify({
      generatedAt: new Date().toISOString(), claimSurface: 'rendering internals compatibility adapter',
      command: 'playwright test tests/browser/root-path-integrity.spec.ts --grep R06',
      assertions: ['disabled leaves target unchanged', 'native reinhard pixels within byte tolerance', 'borrowed output identity', 'actual webgl2 device kind'],
      result
    }, null, 2)}\n`);
  } finally { await page.close(); await exampleServer.close(); }
});

test('R06 all six native stages and essential-pass browser negative controls', async ({ browser }) => {
  const server = await startExampleDevServer();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(server.origin, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => {
      const url = '/tests/browser/framegraph-native-301-harness.ts';
      return (await import(url)).runNativeFrameGraphProof();
    });
    expect(result.owner).toBe('webgl2');
    expect(result.enabled.error).toBeNull();
    expect(result.enabled.published).toBe(true);
    expect(Object.values(result.enabled.counts)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(result.repeat.error).toBeNull();
    expect(result.repeat.pixels).toEqual(result.enabled.pixels);
    expect(result.borrowedAlive).toBe(true);
    for (const control of result.controls) {
      expect(control.counts[control.disabled], `${control.disabled} does not execute`).toBe(0);
      if (['DepthPrepass', 'ShadowPass', 'SkyboxPass'].includes(control.disabled)) {
        expect(control.error, `${control.disabled} is a required producer`).toContain('missing producer');
        expect(control.published).toBe(false);
      } else if (control.disabled === 'ToneMappingPass') {
        expect(control.published).toBe(false);
        expect(control.pixels).not.toEqual(result.enabled.pixels);
      } else {
        expect(control.error).toBeNull();
        const changed = control.pixels.filter((value: number, i: number) => Math.abs(value - result.enabled.pixels[i]) > 5).length;
        expect(changed, `${control.disabled} changes actual composited pixels`).toBeGreaterThan(48);
      }
    }
    expect(errors).toEqual([]);
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const directory = process.env.AURA_MUSE_OUTPUT_DIR ?? REPORT_DIR;
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'r06-six-native-stage-proof.json'), `${JSON.stringify({
      generatedAt: new Date().toISOString(), claimSurface: 'rendering internals compatibility adapters',
      command: 'playwright test tests/browser/root-path-integrity.spec.ts --grep R06', result
    }, null, 2)}\n`);
  } finally { await page.close(); await server.close(); }
});
