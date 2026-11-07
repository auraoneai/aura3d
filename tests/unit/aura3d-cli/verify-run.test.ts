import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";
import { BrowserUnavailableError, type RenderCapture, type VerifyBrowserDriver } from "../../../packages/aura3d-cli/src/verify/cdp.js";
import { VERIFY_CODE_TABLE, explainCode } from "../../../packages/aura3d-cli/src/verify/codes.js";
import { verifyCommand } from "../../../packages/aura3d-cli/src/verify/command.js";
import { analyzeFrame, compareFrames, decodePng, type RgbImage } from "../../../packages/aura3d-cli/src/verify/frame.js";
import { runVerify, type VerifyReport } from "../../../packages/aura3d-cli/src/verify/run.js";

// ---- PNG helpers (test-only encoder) --------------------------------------------------------------------------------
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
const W = 160, H = 96;
function image(fn: (x: number, y: number) => [number, number, number]): RgbImage {
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set(fn(x, y), (y * W + x) * 3);
  return { width: W, height: H, rgb };
}
const black = image(() => [0, 0, 0]);
const flat = image(() => [128, 136, 144]);
/** A drawn scene: shaded stripes and discs, many colours, texture in most blocks. */
const scene = (shift = 0) => image((x, y) => [(x * 5 + shift) & 255, (y * 7 + x * 3) & 255, ((x ^ y) * 9 + shift * 2) & 255]);
const dim = image((x, y) => [(x + y) % 24, (x * 2) % 24, (y * 2) % 24]);

describe("frame analysis", () => {
  test("PNG round trip and verdict flags", () => {
    expect(decodePng(encodePng(scene()))).toMatchObject({ width: W, height: H });
    expect(analyzeFrame(black)).toMatchObject({ black: true, drawn: false });
    expect(analyzeFrame(flat)).toMatchObject({ black: false, flat: true, drawn: false });
    expect(analyzeFrame(scene())).toMatchObject({ black: false, flat: false, empty: false, drawn: true });
    expect(analyzeFrame(dim)).toMatchObject({ dim: true });
  });

  test("agrees with the render gate's analyzeFrame (tools/release/render-gate/analysis.mjs)", async () => {
    const gate = (await import("../../../tools/release/render-gate/analysis.mjs")) as { analyzeFrame(image: RgbImage): Record<string, unknown> };
    for (const img of [black, flat, scene(), scene(40), dim]) {
      const ours = analyzeFrame(img), theirs = gate.analyzeFrame(img);
      for (const key of ["meanLuma", "lumaStddev", "p1Luma", "p99Luma", "gain", "distinctColors", "texturedBlockFraction", "drawn", "reasons"] as const) {
        expect(ours[key], key).toEqual(theirs[key]);
      }
    }
  });

  test("motion check", () => {
    expect(compareFrames(scene(), scene()).moved).toBe(false);
    expect(compareFrames(scene(), scene(60)).moved).toBe(true);
    expect(compareFrames(scene(), { ...scene(), width: W + 1 }).moved).toBe(true);
  });
});

describe("explainer table", () => {
  test("every code has a cause and a fix, and every code the pipeline can raise is in the table", () => {
    for (const item of VERIFY_CODE_TABLE) { expect(item.cause.length, item.code).toBeGreaterThan(20); expect(item.fix.length, item.code).toBeGreaterThan(10); }
    expect(new Set(VERIFY_CODE_TABLE.map((c) => c.code)).size).toBe(VERIFY_CODE_TABLE.length);
    const src = (name: string) => readFileSync(new URL(`../../../packages/aura3d-cli/src/verify/${name}`, import.meta.url), "utf8");
    const raised = new Set<string>();
    for (const m of src("run.ts").matchAll(/makeFinding\(\s*(?:[^"(),]+\?\s*)?"([A-Z][A-Z0-9_]+)"/g)) raised.add(m[1]!);
    for (const m of src("run.ts").matchAll(/"((?:RUNTIME|FRAME|MOTION|RENDER|REQUEST|PAGE|CONSOLE|BROWSER|SERVE|BUILD|DEPLOY|TYPECHECK|ASSET)_[A-Z_]+)"/g)) raised.add(m[1]!);
    for (const m of src("lint.ts").matchAll(/"((?:LINT|ASSET)_[A-Z_]+)"/g)) raised.add(m[1]!);
    expect(raised.size).toBeGreaterThan(25);
    for (const code of raised) expect(explainCode(code), code).toBeDefined();
  });
  test("X_DEGRADED codes resolve to the generic entry, lookups are case-insensitive", () => {
    expect(explainCode("transmission_degraded")).toMatchObject({ code: "TRANSMISSION_DEGRADED", step: "render" });
    expect(explainCode("nope")).toBeUndefined();
  });
});

// ---- pipeline with a mocked browser driver -------------------------------------------------------------------------------
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "verify-run-"));
  dirs.push(dir);
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "dist", "index.html"), "<!doctype html><title>x</title>");
  for (const [path, text] of Object.entries(files)) { mkdirSync(join(dir, path, ".."), { recursive: true }); writeFileSync(join(dir, path), text); }
  return dir;
}
function mockDriver(overrides: Partial<RenderCapture> | (() => never)): VerifyBrowserDriver {
  return {
    name: "mock",
    async capture() {
      if (typeof overrides === "function") overrides();
      return {
        status: 200, consoleMessages: [], pageErrors: [], failedRequests: [], badResponses: [],
        appState: { ready: "true", routeReady: { status: "ready", diagnostics: { warnings: [], errors: [], backend: "webgl2", drawCalls: 4 } } },
        frames: [encodePng(scene()), encodePng(scene(60))], driver: "mock", ...(overrides as Partial<RenderCapture>)
      };
    },
    async close() { /* nothing to release */ }
  };
}
const SKIP = ["typecheck", "build"] as const;
const codesOf = (report: VerifyReport) => report.findings.map((f) => f.code);

describe("runVerify with a mocked driver", () => {
  test("healthy project: ok, steps pass, schema fields present, frame and motion measured", async () => {
    const dir = project({ "src/main.ts": `async function main() { const app = createAuraApp("#app", {}); await app.ready(); } void main();` });
    const report = await runVerify({ projectDir: dir, skip: [...SKIP], driver: mockDriver({}), settleMs: 0, motionGapMs: 0 });
    expect(report).toMatchObject({ schema: "aura3d.verify/1", ok: true, counts: { error: 0 } });
    expect(report.steps.map((s) => [s.id, s.status])).toEqual([["typecheck", "skipped"], ["assets", "pass"], ["lint", "pass"], ["build", "skipped"], ["serve", "pass"], ["render", "pass"], ["inspect", "pass"]]);
    expect(report.render).toMatchObject({ driver: "mock", backend: "webgl2", drawCalls: 4, frame: { drawn: true }, motion: { moved: true } });
  });

  test("black frames raise FRAME_BLACK with a fix; identical drawn frames raise MOTION_NONE", async () => {
    const dir = project({ "src/main.ts": `export {};` });
    const blackReport = await runVerify({ projectDir: dir, skip: [...SKIP], driver: mockDriver({ frames: [encodePng(black), encodePng(black)] }), settleMs: 0, motionGapMs: 0 });
    expect(codesOf(blackReport)).toContain("FRAME_BLACK");
    expect(blackReport.ok).toBe(false);
    expect(blackReport.findings.find((f) => f.code === "FRAME_BLACK")).toMatchObject({ severity: "error", step: "inspect", cause: expect.stringContaining("no bright pixels"), fix: expect.stringContaining("lights.directional") });
    const still = await runVerify({ projectDir: dir, skip: [...SKIP], driver: mockDriver({ frames: [encodePng(scene()), encodePng(scene())] }), settleMs: 0, motionGapMs: 0 });
    expect(codesOf(still)).toEqual(["MOTION_NONE"]);
    expect(still.ok).toBe(true); // a static scene is a warning, not a failure
    const flatReport = await runVerify({ projectDir: dir, skip: [...SKIP], driver: mockDriver({ frames: [encodePng(flat), encodePng(flat)] }), settleMs: 0, motionGapMs: 0 });
    expect(codesOf(flatReport)).toContain("FRAME_FLAT");
  });

  test("mount failure, degraded features, runtime option-ignored, console and request errors", async () => {
    const dir = project({ "src/main.ts": `export {};` });
    const report = await runVerify({
      projectDir: dir, skip: [...SKIP], settleMs: 0, motionGapMs: 0,
      driver: mockDriver({
        consoleMessages: [
          { level: "error", text: "[aura3d] RENDERER_MOUNT_FAILED: No WebGL2. Nothing will draw." },
          { level: "warning", text: "TRANSMISSION_DEGRADED glass: draws without transmission" },
          { level: "error", text: "Failed to load resource: the server responded with a status of 404 (Not Found)" },
          { level: "error", text: "boom from app code" }
        ],
        pageErrors: ["TypeError: x is undefined"],
        badResponses: ["404 /models/robot.glb", "404 /favicon.ico"],
        appState: { ready: "error", routeReady: { status: "error", diagnostics: { warnings: ["Scene has no lights. Suggested fix: add lights.studio()."], errors: ["[aura3d] RENDERER_MOUNT_FAILED: No WebGL2. Nothing will draw."], degradations: [{ code: "option-ignored", message: 'OPTION_IGNORED effects.fog: option "particleCount" is not read', nodeId: "fog" }] } } }
      })
    });
    const codes = codesOf(report);
    expect(codes).toEqual(expect.arrayContaining(["RENDERER_MOUNT_FAILED", "TRANSMISSION_DEGRADED", "RUNTIME_OPTION_IGNORED", "RUNTIME_NO_LIGHTS", "CONSOLE_ERROR", "PAGE_EXCEPTION", "REQUEST_FAILED"]));
    expect(codes.filter((c) => c === "RENDERER_MOUNT_FAILED")).toHaveLength(1);
    expect(report.findings.filter((f) => f.code === "REQUEST_FAILED")).toHaveLength(1); // favicon ignored
    expect(report.findings.filter((f) => f.code === "CONSOLE_ERROR").map((f) => f.message)).toEqual(["boom from app code"]);
    expect(report.render?.degradeCodes).toEqual(["TRANSMISSION_DEGRADED"]);
  });

  test("never-ready, unreachable browser and navigation failures", async () => {
    const dir = project({ "src/main.ts": `export {};` });
    const never = await runVerify({ projectDir: dir, skip: [...SKIP], settleMs: 0, motionGapMs: 0, driver: mockDriver({ appState: { page: { visibility: "visible", canvases: 1, canvasSize: "960x540" }, routeReady: null }, frames: [encodePng(black), encodePng(black)] }) });
    expect(codesOf(never)).toEqual(expect.arrayContaining(["RENDER_NEVER_READY", "FRAME_BLACK"]));
    const noChrome = await runVerify({ projectDir: dir, skip: [...SKIP], driver: mockDriver(() => { throw new BrowserUnavailableError("No Chrome found."); }) });
    expect(codesOf(noChrome)).toEqual(["BROWSER_UNAVAILABLE"]);
    const notFound = await runVerify({ projectDir: dir, skip: [...SKIP], driver: mockDriver({ status: 404 }) });
    expect(codesOf(notFound)).toEqual(["RENDER_NAVIGATION_FAILED"]);
  });

  test("missing dist raises SERVE_FAILED; --skip render,inspect needs no browser", async () => {
    const dir = project({ "src/main.ts": `export {};` });
    rmSync(join(dir, "dist"), { recursive: true });
    const report = await runVerify({ projectDir: dir, skip: [...SKIP], driver: mockDriver({}) });
    expect(codesOf(report)).toEqual(["SERVE_FAILED"]);
    const noBrowser = await runVerify({ projectDir: dir, skip: [...SKIP, "render", "inspect"] });
    expect(noBrowser.steps.find((s) => s.id === "serve")?.detail).toMatch(/no browser/);
    expect(noBrowser.ok).toBe(true);
  });

  test("typecheck and build run through the command seam and report findings with locations", async () => {
    const dir = project({ "src/main.ts": `export {};`, "tsconfig.json": "{}", "package.json": JSON.stringify({ scripts: { build: "vite build" } }) });
    const calls: string[] = [];
    const report = await runVerify({
      projectDir: dir, skip: ["render", "inspect"],
      runCommand: (command, args) => {
        calls.push([command, ...args].join(" "));
        if (command === "npm") return { status: 1, output: "error during build: boom\nsecond line" };
        return { status: 2, output: "src/main.ts(3,7): error TS2304: Cannot find name 'foo'.\nsrc/other.ts(1,1): error TS2322: Type 'string' is not assignable to type 'number'." };
      }
    });
    expect(calls.some((c) => c.includes("tsc") && c.includes("--noEmit"))).toBe(true);
    expect(calls).toContain("npm run build");
    const ts = report.findings.filter((f) => f.code === "TYPECHECK_ERROR");
    expect(ts[0]).toMatchObject({ location: { file: "src/main.ts", line: 3, column: 7 }, evidence: { tsCode: "TS2304" } });
    expect(ts).toHaveLength(2);
    expect(report.findings.find((f) => f.code === "BUILD_FAILED")?.evidence).toMatchObject({ outputTail: expect.stringContaining("boom") });
    expect(report.steps.find((s) => s.id === "typecheck")?.status).toBe("fail");
  });

  test("lint findings carry file:line and the report is plain JSON", async () => {
    const dir = project({ "src/main.ts": `const x = 1;\neffects.fog({ density: 0.1, particleCount: 3 });` });
    const report = await runVerify({ projectDir: dir, skip: [...SKIP, "render", "inspect"] });
    expect(report.findings[0]).toMatchObject({ code: "LINT_EFFECT_OPTION_IGNORED", severity: "warning", step: "lint", location: { file: "src/main.ts", line: 2 } });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});

describe("verify command", () => {
  const io = (cwd: string) => { const out: string[] = [], err: string[] = []; return { out, err, io: { cwd, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) } }; };
  test("--explain prints cause and fix; unknown codes exit 2; --list-codes is JSON", async () => {
    const a = io(process.cwd());
    expect(await verifyCommand(["--explain", "frame_black"], a.io)).toBe(0);
    expect(a.out.join("\n")).toMatch(/FRAME_BLACK[\s\S]*Cause:[\s\S]*Fix:/);
    const json = io(process.cwd());
    expect(await verifyCommand(["--explain", "FRAME_BLACK", "--json"], json.io)).toBe(0);
    expect(JSON.parse(json.out[0]!)).toMatchObject({ code: "FRAME_BLACK", severity: "error" });
    const bad = io(process.cwd());
    expect(await verifyCommand(["--explain", "NOPE"], bad.io)).toBe(2);
    const list = io(process.cwd());
    expect(await verifyCommand(["--list-codes"], list.io)).toBe(0);
    expect(JSON.parse(list.out[0]!).length).toBe(VERIFY_CODE_TABLE.length);
  });

  test("--json emits one report, --out writes it, exit code follows ok", async () => {
    const dir = project({ "src/main.ts": `export {};` });
    const run = io(dir);
    const code = await verifyCommand(["--skip", "typecheck,build", "--json", "--out", "out/report.json"], run.io, { driver: mockDriver({ frames: [encodePng(black), encodePng(black)] }) });
    expect(code).toBe(1);
    expect(run.out).toHaveLength(1);
    const printed = JSON.parse(run.out[0]!) as VerifyReport;
    expect(printed.schema).toBe("aura3d.verify/1");
    expect(JSON.parse(readFileSync(join(dir, "out/report.json"), "utf8"))).toEqual(printed);
    const bad = io(dir);
    expect(await verifyCommand(["--skip", "nonsense"], bad.io)).toBe(2);
  });
});
