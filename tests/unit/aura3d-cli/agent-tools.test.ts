// N6 agent tools: `aura3d info`, `examples`, `validate`, `render`. All offline; render uses a mocked browser driver.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";
import { colorStringProblem, CSS_COLOR_NAMES } from "../../../packages/aura3d-cli/src/agent-tools/color.js";
import { examplesCommand, loadExampleIndex, locateExampleSources, parseRecipeBook, searchExamples } from "../../../packages/aura3d-cli/src/agent-tools/examples.js";
import { buildInfoReport, closeNames, describeExport, infoCommand, locateEngine } from "../../../packages/aura3d-cli/src/agent-tools/info.js";
import { colorMetrics, renderCommand, runRender, subjectMetrics } from "../../../packages/aura3d-cli/src/agent-tools/render.js";
import { runValidate, validateCommand } from "../../../packages/aura3d-cli/src/agent-tools/validate.js";
import { cliCommandFor } from "../../../packages/aura3d-cli/src/contracts/commands.js";
import type { RenderCapture, VerifyBrowserDriver } from "../../../packages/aura3d-cli/src/verify/cdp.js";
import { explainCode } from "../../../packages/aura3d-cli/src/verify/codes.js";
import type { RgbImage } from "../../../packages/aura3d-cli/src/verify/frame.js";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-tools-"));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) { mkdirSync(join(dir, path, ".."), { recursive: true }); writeFileSync(join(dir, path), text); }
  return dir;
}
function io(cwd: string) {
  const out: string[] = [], err: string[] = [];
  return { cwd, out, err, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) };
}

/** A tiny installed `@aura3d/engine` so info/validate run against real declarations without a build. */
const FAKE_ENGINE_DTS = `
export interface PbrOptions { readonly color?: string; readonly metallic?: number; readonly roughness?: number }
export interface MaterialSpec { readonly kind: string }
export declare const material: { readonly pbr: (options?: PbrOptions) => MaterialSpec; readonly glass: (options?: PbrOptions) => MaterialSpec };
export declare const lights: { readonly directional: (options?: { readonly position?: readonly [number, number, number]; readonly intensity?: number }) => unknown };
export declare function createAuraApp(target: string, options: { readonly scene: unknown }): { ready(): Promise<void> };
export declare function scene(options?: { readonly background?: string }): { add(node: unknown): ReturnType<typeof scene>; camera(c: unknown): ReturnType<typeof scene> };
export declare class AnimationController { play(clip: string): void }
export declare const LIMITS: { readonly maxLights: number };
export declare const NAMES: readonly string[];
/** @deprecated use material.pbr */
export declare function legacyMaterial(): MaterialSpec;
`;
const engineFiles = (version = "5.2.0"): Record<string, string> => ({
  "node_modules/@aura3d/engine/package.json": JSON.stringify({ name: "@aura3d/engine", version, type: "module", exports: { ".": { types: "./index.d.ts", import: "./index.js" } } }),
  "node_modules/@aura3d/engine/index.d.ts": FAKE_ENGINE_DTS
});

describe("colour check (engine C-06 grammar)", () => {
  test("accepts every form the engine parser accepts", () => {
    for (const ok of ["#fff", "#ffff", "#a1b2c3", "#a1b2c3d4", "rgb(10, 20, 30)", "rgba(10 20 30 / 50%)", "hsl(210 40% 12%)", "hsla(210deg, 40%, 12%, 0.5)", "hsl(0.5turn 10% 10%)", "oklch(0.7 0.1 200)", "transparent", "RebeccaPurple", " navy "]) {
      expect(colorStringProblem(ok), ok).toBeUndefined();
    }
  });
  test("rejects what the engine throws COLOR_INVALID for, with a specific reason", () => {
    expect(colorStringProblem("#12345")).toMatch(/5 digits/);
    expect(colorStringProblem("#ggg")).toMatch(/not a hex colour/);
    expect(colorStringProblem("hsl(210, 40%)")).toMatch(/needs 3 values/);
    expect(colorStringProblem("rgb(a, b, c)")).toMatch(/not a number/);
    expect(colorStringProblem("lab(50% 20 30)")).toMatch(/lab\(\)" is not a supported colour function/);
    expect(colorStringProblem("light blue")).toMatch(/write "lightblue"/);
    expect(colorStringProblem("blurple")).toMatch(/not a hex value/);
  });
  test("named colour list matches the engine parser's table", () => {
    // invariant: the CLI colour checker must accept exactly the names the engine's NAMED_COLORS table parses, or `aura3d validate` passes colours the engine rejects
    const src = readFileSync(new URL("../../../packages/engine/src/agent-api/color.ts", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("const NAMED_COLORS"), src.indexOf("};", src.indexOf("const NAMED_COLORS")));
    const engineNames = [...block.matchAll(/([a-z]+):\s*0x/g)].map((m) => m[1]!);
    expect(engineNames.length).toBe(148);
    expect([...CSS_COLOR_NAMES].sort()).toEqual(engineNames.sort());
  });
});

describe("aura3d examples", () => {
  const book = [
    "# Recipes", "", "## 1. Rotating PBR cube with orbit control", "", "```ts", "import { primitives } from \"@aura3d/engine\";", "primitives.box({});", "```", "",
    "## Procedural scenes", "", "### 2. Water with a custom GLSL material", "", "- Goal: Animated ocean waves with fresnel.", "", "```ts", "material.custom({ glsl: {} });", "```", "Notes about the shader.", "",
    "## Type traps", "No code here."
  ].join("\n");
  test("parses numbered recipes at ## and ### with their first code block and Goal line", () => {
    const entries = parseRecipeBook(book);
    expect(entries.map((e) => e.id)).toEqual(["recipe-1-rotating-pbr-cube-with-orbit-control", "recipe-2-water-with-a-custom-glsl-material"]);
    expect(entries[1]).toMatchObject({ kind: "recipe", summary: "Animated ocean waves with fresnel.", code: "material.custom({ glsl: {} });" });
    expect(searchExamples(entries, "ocean waves shader")[0]!.entry.id).toMatch(/^recipe-2/);
    expect(searchExamples(entries, "zzz unrelated")).toEqual([]);
  });

  test("the shipped index (CLI recipe book + create-aura3d templates) finds the right scene offline", () => {
    const sources = locateExampleSources(process.cwd());
    expect(sources.recipeBook).toBeDefined();
    expect(sources.templatesDir).toBeDefined();
    const entries = loadExampleIndex(sources);
    expect(entries.filter((e) => e.kind === "recipe").length).toBeGreaterThanOrEqual(16);
    expect(entries.some((e) => e.id === "template-product-viewer")).toBe(true);
    expect(searchExamples(entries, "gold metal product on a pedestal")[0]!.entry.id).toMatch(/^recipe-11-/);
    expect(searchExamples(entries, "campfire particles smoke")[0]!.entry.id).toMatch(/^recipe-14-/);
    expect(searchExamples(entries, "racing game")[0]!.entry.id).toBe("template-racing-starter");
  });

  test("command: query prints the top hit's source; --list; --id --write refuses to overwrite without --force", async () => {
    const dir = project({ "package.json": "{}" });
    const q = io(dir);
    expect(await examplesCommand(["skinned", "character", "crossfade"], q)).toBe(0);
    expect(q.out.join("\n")).toMatch(/recipe-3-[\s\S]*```ts[\s\S]*createAuraApp/);
    const list = io(dir);
    expect(await examplesCommand(["--list", "--json"], list)).toBe(0);
    expect(JSON.parse(list.out[0]!).count).toBeGreaterThan(20);
    const w = io(dir);
    expect(await examplesCommand(["--id", "recipe-1-", "--write", "src/main.ts"], w)).toBe(0);
    expect(readFileSync(join(dir, "src/main.ts"), "utf8")).toContain("createAuraApp");
    const again = io(dir);
    expect(await examplesCommand(["--id", "recipe-1-", "--write", "src/main.ts"], again)).toBe(1);
    expect(again.err.join("")).toMatch(/--force/);
    expect(await examplesCommand([], io(dir))).toBe(2);
  });
});

describe("aura3d info", () => {
  test("reads versions and the API surface from the installed declarations", () => {
    const dir = project({ ...engineFiles(), "package.json": JSON.stringify({ dependencies: { "@aura3d/engine": "^5.2.0", "@aura3d/react": "^5.2.0" } }) });
    const report = buildInfoReport(dir);
    expect(report.ok).toBe(true);
    expect(report.engine).toMatchObject({ version: "5.2.0", source: "installed", functions: expect.arrayContaining(["createAuraApp", "scene"]), classes: ["AnimationController"], deprecated: ["legacyMaterial"] });
    expect(report.engine!.namespaces).toEqual([{ name: "lights", members: ["directional"] }, { name: "material", members: ["glass", "pbr"] }]);
    expect(report.engine!.functions).not.toContain("legacyMaterial");
    expect(report.packages.find((p) => p.name === "@aura3d/react")).toEqual({ name: "@aura3d/react", declared: "^5.2.0" });
    expect(report.warnings.join(" ")).toMatch(/@aura3d\/react is declared .* not installed/);
  });

  test("--name: members, option keys of a builder, and suggestions for a guessed name", async () => {
    const dir = project(engineFiles());
    const located = locateEngine(dir);
    if ("error" in located) throw new Error(located.error);
    expect(describeExport(located.entry, "material")).toMatchObject({ kind: "namespace", members: [{ name: "glass" }, { name: "pbr" }] });
    expect(describeExport(located.entry, "material.pbr")).toMatchObject({ kind: "function", options: [{ name: "color" }, { name: "metallic" }, { name: "roughness" }] });
    expect(describeExport(located.entry, "material.glassy")).toMatchObject({ error: expect.stringContaining("no member"), suggestions: ["glass"] });
    expect(describeExport(located.entry, "createAuraAp")).toMatchObject({ suggestions: ["createAuraApp"] });
    const out = io(dir);
    expect(await infoCommand(["--name", "material.pbr", "--json"], out)).toBe(0);
    expect(JSON.parse(out.out[0]!)).toMatchObject({ ok: true, version: "5.2.0", name: "material.pbr" });
    expect(closeNames("ligt", ["light", "lights", "material"])).toEqual(["light", "lights"]);
  });

  test("no engine installed: not ok, says how to install", async () => {
    const dir = project({ "package.json": "{}" });
    const out = io(dir);
    expect(await infoCommand(["--json"], out)).toBe(1);
    expect(JSON.parse(out.out[0]!).warnings.join(" ")).toMatch(/npm install @aura3d\/engine/);
  });
});

describe("aura3d validate", () => {
  const BAD = `import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";
const app = createAuraApp("#app", {
  scene: scene({ background: "hsl(210 40% 12%)" })
    .add(primitives.sphere({ name: "ball", size: 0.6, material: material.pbr({ color: "#12345", metallic: 0.9 }) }))
    .add(primitives.box({ name: "crate", size: 0.5, material: material.pbr({ color: "light blue", colors: ["#fff", "nope"] }) }))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: \`hsl(\${120}, 40%, 30%)\` }) }).scale([20, 1, 20]))
    .camera(camera.orbit({ position: [0, 4, 12], target: [0, 0, 0] }))
});
void app.ready();
`;
  const GOOD = `import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";
const app = createAuraApp("#app", {
  scene: scene({ background: "#20242c" })
    .add(environments.neutral({ background: false }))
    .add(lights.directional({ position: [3, 4, 2], intensity: 2 }))
    .add(primitives.sphere({ name: "ball", material: material.pbr({ color: "gold", metallic: 1 }) }).scale(1.5))
    .camera(camera.orbit({ position: [0, 1, 3.2], target: [0, 0, 0] }))
});
void app.ready();
`;
  test("colours, framing, lighting and reflective-material findings (static, no types)", () => {
    const dir = project({ "package.json": "{}", "src/main.ts": BAD });
    const report = runValidate({ projectDir: dir, types: false });
    const codes = report.findings.map((f) => f.code);
    expect(codes.filter((c) => c === "VALIDATE_COLOR_INVALID")).toHaveLength(3); // #12345, "light blue", "nope"; hsl() forms pass
    expect(codes).toEqual(expect.arrayContaining(["VALIDATE_SUBJECT_SMALL", "VALIDATE_NO_LIGHTING", "VALIDATE_REFLECTIVE_NO_ENVIRONMENT"]));
    expect(report.ok).toBe(false);
    expect(report.findings.find((f) => f.code === "VALIDATE_COLOR_INVALID")).toMatchObject({ severity: "error", location: { file: "src/main.ts", line: 4 } });
    for (const f of report.findings) expect(explainCode(f.code), f.code).toBeDefined();
    // A model whose size the source does not state makes the framing estimate unknowable, so no framing finding.
    const unknownSize = BAD.replace('.add(primitives.box(', '.add(model(assets.robot)).add(primitives.box(').replace("import { camera,", "import { model, camera,");
    expect(runValidate({ projectDir: project({ "package.json": "{}", "src/main.ts": unknownSize }), types: false }).findings.map((f) => f.code)).not.toContain("VALIDATE_SUBJECT_SMALL");
    const clean = runValidate({ projectDir: project({ "package.json": "{}", "src/main.ts": GOOD }), types: false });
    expect(clean.findings.map((f) => f.code)).toEqual([]);
    expect(clean.ok).toBe(true);
  });

  test("colour keys in app data outside engine calls are not judged unless plainly a colour (no false errors on games)", () => {
    const src = `import { looks, material, materialFactory } from "@aura3d/engine";
export const ui = { style: { color: "var(--fg)", background: "linear-gradient(150deg,#2b3350,#1a2032)" }, label: { color: "inherit" } };
export const parts = [{ id: "head", color: "skin" }, { id: "torso", color: "giDark" }];
export const direction = { environment: { preset: "neutral", background: "sky" } };
export const slots = { baseColor: \`\${"fox"}_baseColor\`, emissive: "" };
export const graph = materialFactory.node({ outputs: { color: "tint" } });
export const look = looks.preset("studio", { background: "look" });
export const bad = { tint: { color: "#12345" }, legacy: { color: "0xff0000" }, spaced: { color: "light blue" }, lab: { color: "lab(50% 20 30)" } };
export const strict = material.pbr({ color: "skin" });
`;
    const report = runValidate({ projectDir: project({ "package.json": "{}", "src/data.ts": src }), types: false });
    const colours = report.findings.filter((f) => f.code === "VALIDATE_COLOR_INVALID");
    expect(colours.map((f) => f.location!.line)).toEqual([8, 8, 8, 8, 9]);
    expect(colours.find((f) => /0xff0000/.test(f.message))!.message).toMatch(/pass the number 0xff0000/);
  });

  test("unknown options, members and exports come from the TypeScript checker against the installed engine", () => {
    const src = `import { createAuraApp, lights, material, scene, notAnExport } from "@aura3d/engine";
createAuraApp("#app", { scene: scene({ background: "#000" }).add(lights.directional({ intensity: 2, shadowBias: 1 })).add(material.glassy({})) });
void notAnExport;
`;
    const dir = project({ ...engineFiles(), "package.json": "{}", "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, module: "ESNext", moduleResolution: "Bundler", target: "ES2022", noEmit: true, types: [] }, include: ["src"] }), "src/main.ts": src });
    const report = runValidate({ projectDir: dir });
    expect(report.typeCheck).toBe("ran");
    const codes = report.findings.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["VALIDATE_UNKNOWN_EXPORT", "VALIDATE_UNKNOWN_OPTION", "VALIDATE_UNKNOWN_MEMBER"]));
    expect(report.findings.find((f) => f.code === "VALIDATE_UNKNOWN_MEMBER")!.message).toMatch(/glassy[\s\S]*glass/);
    const missing = runValidate({ projectDir: project({ "package.json": "{}", "src/main.ts": src }) });
    expect(missing.typeCheck).toBe("unavailable");
    expect(missing.findings.map((f) => f.code)).toContain("VALIDATE_TYPES_UNAVAILABLE");
  });

  test("command: a single file arg, --json, --strict and exit codes", async () => {
    const dir = project({ "package.json": "{}", "src/main.ts": GOOD, "src/other.ts": BAD });
    const one = io(dir);
    expect(await validateCommand(["src/main.ts", "--no-types", "--json"], one)).toBe(0);
    expect(JSON.parse(one.out[0]!)).toMatchObject({ ok: true, files: ["src/main.ts"] });
    const all = io(dir);
    expect(await validateCommand(["--no-types"], all)).toBe(1);
    expect(all.out[0]).toMatch(/VALIDATE_COLOR_INVALID src\/other.ts:4/);
    const warnOnly = project({ "package.json": "{}", "src/main.ts": GOOD.replace(/\.add\(environments[^\n]*\n/, "") });
    expect(await validateCommand(["--no-types"], io(warnOnly))).toBe(0);
    expect(await validateCommand(["--no-types", "--strict"], io(warnOnly))).toBe(1);
    expect(await validateCommand(["missing.ts"], io(dir))).toBe(2);
  });

  test("module-level await on app.ready() is an error (a default vite build deadlocks: black page), also for a named file outside src/", async () => {
    const tla = GOOD.replace("void app.ready();", "await app.ready();");
    const report = runValidate({ projectDir: project({ "package.json": "{}", "src/main.ts": tla }), types: false });
    expect(report.findings.find((f) => f.code === "LINT_TOP_LEVEL_AWAIT_READY")).toMatchObject({ severity: "error", location: { file: "src/main.ts", line: 9 } });
    expect(report.ok).toBe(false);
    const dir = project({ "package.json": "{}", "src/main.ts": GOOD, "examples/demo/main.ts": tla });
    const named = io(dir);
    expect(await validateCommand(["examples/demo/main.ts", "--no-types"], named)).toBe(1);
    expect(named.out[0]).toMatch(/LINT_TOP_LEVEL_AWAIT_READY examples\/demo\/main.ts:9/);
    expect(runValidate({ projectDir: project({ "package.json": "{}", "src/main.ts": GOOD.replace("void app.ready();", "void app.ready().then(() => {});") }), types: false }).ok).toBe(true);
  });
});

// ---- render ------------------------------------------------------------------------------------------------------------
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, "latin1"), len = Buffer.alloc(4), c = Buffer.alloc(4);
  len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function encodePng({ width, height, rgb }: RgbImage): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const W = 320, H = 192;
function image(fn: (x: number, y: number) => [number, number, number]): RgbImage {
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set(fn(x, y), (y * W + x) * 3);
  return { width: W, height: H, rgb };
}
/** A textured, saturated subject in a box on a flat dark background. */
const subjectIn = (x0: number, y0: number, x1: number, y1: number) => image((x, y) => (x >= x0 && x < x1 && y >= y0 && y < y1 ? [200 - ((x * 7) & 63), 80 + ((y * 5) & 63), 40 + (((x ^ y) * 3) & 63)] : [20, 22, 26]));
const big = subjectIn(80, 30, 240, 170);
const tiny = subjectIn(146, 84, 176, 114);
/** Bright, nearly colourless, low contrast: the washed-out look. */
const grey = image((x, y) => { const v = 150 + (((x * 3) ^ (y * 5)) & 95); return [v, Math.min(255, v + ((x >> 3) & 7)), v - ((y >> 3) & 7)]; });
const sky = image((x, y) => [40 + y, 90 + y / 2, 200 - x / 4]);

function mockDriver(frame: RgbImage, extra: Partial<RenderCapture> = {}): VerifyBrowserDriver {
  return {
    name: "mock",
    async capture() {
      return { status: 200, consoleMessages: [], pageErrors: [], failedRequests: [], badResponses: [], appState: { ready: "true", routeReady: { status: "ready", diagnostics: { warnings: [], errors: [], backend: "webgl2", drawCalls: 7 } } }, frames: [encodePng(frame), encodePng(frame)], driver: "mock", ...extra };
    },
    async close() { /* nothing */ }
  };
}

describe("aura3d render", () => {
  test("colour and subject metrics", () => {
    const m = colorMetrics(big);
    expect(m.meanSaturation).toBeGreaterThan(0.3);
    expect(colorMetrics(grey).meanSaturation).toBeLessThan(0.06);
    const s = subjectMetrics(big).subject!;
    expect(s.heightFraction).toBeGreaterThan(0.65);
    expect(s.fill).toBeGreaterThan(0.3);
    expect(s.bbox.x).toBeCloseTo(0.25, 1);
    expect(subjectMetrics(tiny).subject).toMatchObject({ fill: expect.any(Number), heightFraction: expect.any(Number) });
    expect(subjectMetrics(tiny).subject!.fill).toBeLessThan(0.03);
    expect(subjectMetrics(sky)).toMatchObject({ subject: null, note: expect.stringContaining("no small set of background colours") });
  });

  test("writes the screenshot, reports diagnostics, flags a tiny subject and a washed-out frame; --no-build skips the build", async () => {
    const dir = project({ "package.json": JSON.stringify({ scripts: { build: "vite build" } }), "dist/index.html": "<!doctype html>" });
    let builds = 0;
    const runCommand = () => { builds++; return { status: 0, output: "" }; };
    const report = await runRender({ projectDir: dir, driver: mockDriver(big), runCommand, settleMs: 0 });
    expect(builds).toBe(1);
    expect(report).toMatchObject({ schema: "aura3d.render/1", ok: true, backend: "webgl2", drawCalls: 7, frame: { drawn: true }, subject: { heightFraction: expect.any(Number) } });
    expect(existsSync(report.screenshot!)).toBe(true);
    expect(report.screenshot).toBe(join(dir, ".aura3d", "render.png"));
    expect(report.codes).toEqual(["MOTION_NONE"]);

    const small = await runRender({ projectDir: dir, build: false, driver: mockDriver(tiny), runCommand, settleMs: 0 });
    expect(builds).toBe(1);
    expect(small.codes).toContain("RENDER_SUBJECT_SMALL");
    const washed = await runRender({ projectDir: dir, build: false, driver: mockDriver(grey), runCommand, settleMs: 0 });
    expect(washed.codes).toContain("RENDER_WASHED_OUT");
    for (const code of [...small.codes, ...washed.codes]) expect(explainCode(code), code).toBeDefined();
  });

  test("a multi-page dist without a root index.html serves the requested route's page", async () => {
    const dir = project({ "package.json": "{}", "dist/scene-a/index.html": "<!doctype html>" });
    const seen: string[] = [];
    const driver = mockDriver(big);
    const report = await runRender({ projectDir: dir, build: false, route: "/scene-a/index.html", settleMs: 0, driver: { ...driver, capture: (url, o) => { seen.push(url); return driver.capture(url, o); } } });
    expect(report.steps.find((s) => s.id === "serve")?.status).toBe("pass");
    expect(seen[0]).toMatch(/\/scene-a\/index\.html$/);
  });

  test("errors surface in `errors` and fail the exit code; --url renders an external page without serving dist", async () => {
    const dir = project({ "package.json": "{}" });
    const seen: string[] = [];
    const driver = mockDriver(big, { consoleMessages: [{ level: "error", text: "boom" }], pageErrors: ["TypeError: x"] });
    const wrapped: VerifyBrowserDriver = { ...driver, capture: (url, o) => { seen.push(url); return driver.capture(url, o); } };
    const out = io(dir);
    expect(await renderCommand(["--url", "http://127.0.0.1:5199/", "--json", "--out", "shot.png"], out, { driver: wrapped })).toBe(1);
    const report = JSON.parse(out.out[0]!);
    expect(seen).toEqual(["http://127.0.0.1:5199/"]);
    expect(report.errors).toEqual(expect.arrayContaining(["CONSOLE_ERROR: boom", "PAGE_EXCEPTION: TypeError: x"]));
    expect(report.codes.slice(0, 2).sort()).toEqual(["CONSOLE_ERROR", "PAGE_EXCEPTION"]);
    expect(existsSync(join(dir, "shot.png"))).toBe(true);
    expect(await renderCommand(["--url", "ftp://x"], io(dir))).toBe(2);
  });
});

describe("registration", () => {
  test("info, examples, validate and render are registered CLI commands", async () => {
    await import("../../../packages/aura3d-cli/src/commands/registry.js");
    for (const name of ["info", "examples", "validate", "render"]) expect(cliCommandFor(name)?.owner, name).toBe("agent-tools");
  });
});
