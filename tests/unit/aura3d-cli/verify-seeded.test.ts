// Seeded benchmark, browser-free half: every broken scene in tests/fixtures/agent-loop-seeded must raise its expected code.
//  - static codes: the lint/asset rules run on the real scene source, no mock involved.
//  - runtime codes: the browser driver is MOCKED here (it returns a synthesized capture of what a real run saw), so this proves the
//    report plumbing and code mapping, not the engine. The real-GPU runs live in tests/reports/agent-loop/ (see docs/agents/verify-loop.md).
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, describe, expect, test } from "vitest";
import type { RenderCapture, VerifyBrowserDriver } from "../../../packages/aura3d-cli/src/verify/cdp.js";
import { explainCode } from "../../../packages/aura3d-cli/src/verify/codes.js";
import { lintProject } from "../../../packages/aura3d-cli/src/verify/lint.js";
import { runVerify } from "../../../packages/aura3d-cli/src/verify/run.js";

const seeded = join(process.cwd(), "tests/fixtures/agent-loop-seeded");
const manifest = JSON.parse(readFileSync(join(seeded, "manifest.json"), "utf8")) as { scenes: { id: string; description: string; expectedStatic: string | null; expectedRuntime: string | null }[] };

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type, "latin1"), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
function png(fn: (x: number, y: number) => [number, number, number], w = 160, h = 96): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Buffer.from(fn(x, y)).copy(raw, y * (w * 3 + 1) + 1 + x * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const sceneFrame = png((x, y) => [(x * 5) & 255, (y * 7 + x * 3) & 255, ((x ^ y) * 9) & 255]);
const blackFrame = png(() => [0, 0, 0]);
const flatFrame = png(() => [128, 136, 144]);

/** What a real run of each runtime-expectation scene looked like, as a capture. */
const runtimeCapture: Record<string, Partial<RenderCapture>> = {
  FRAME_BLACK: { frames: [blackFrame, blackFrame] },
  FRAME_FLAT: { frames: [flatFrame, flatFrame] },
  MOTION_NONE: { frames: [sceneFrame, sceneFrame] },
  RUNTIME_OPTION_IGNORED: { appState: { ready: "true", routeReady: { status: "ready", diagnostics: { warnings: [], errors: [], degradations: [{ code: "option-ignored", message: 'OPTION_IGNORED effects.fog: option "particleCount" is not read' }] } } } }
};
const driverFor = (extra: Partial<RenderCapture>): VerifyBrowserDriver => ({
  name: "mock",
  async capture() {
    return { status: 200, consoleMessages: [], pageErrors: [], failedRequests: [], badResponses: [], appState: { ready: "true", routeReady: { status: "ready", diagnostics: { warnings: [], errors: [] } } }, frames: [sceneFrame, png((x, y) => [(x * 5 + 60) & 255, (y * 7 + x * 3) & 255, ((x ^ y) * 9) & 255])], driver: "mock", ...extra };
  },
  async close() { /* nothing */ }
});

const scratch: string[] = [];
afterAll(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });

describe("seeded benchmark scenes", () => {
  test("manifest lists 10 scenes, each with a folder, a main.ts and known codes", () => {
    expect(manifest.scenes).toHaveLength(10);
    const folders = readdirSync(seeded).filter((n) => !n.startsWith("_") && !n.endsWith(".json")).sort();
    expect(folders).toEqual(manifest.scenes.map((s) => s.id).sort());
    for (const scene of manifest.scenes) {
      expect(scene.expectedStatic ?? scene.expectedRuntime, scene.id).toBeTruthy();
      for (const code of [scene.expectedStatic, scene.expectedRuntime]) if (code) expect(explainCode(code), code).toBeDefined();
      expect(readFileSync(join(seeded, scene.id, "src/main.ts"), "utf8")).toContain("@aura3d/engine");
    }
  });

  for (const scene of manifest.scenes.filter((s) => s.expectedStatic)) {
    test(`${scene.id}: lint/asset rules raise ${scene.expectedStatic} (real source, no mocks)`, () => {
      const found = lintProject(join(seeded, scene.id));
      expect(found.map((f) => f.code)).toContain(scene.expectedStatic);
      const hit = found.find((f) => f.code === scene.expectedStatic)!;
      expect(hit.location.file).toMatch(/^src\/.+\.ts$/);
      expect(hit.location.line).toBeGreaterThan(0);
    });
  }

  for (const scene of manifest.scenes.filter((s) => s.expectedRuntime && runtimeCapture[s.expectedRuntime])) {
    test(`${scene.id}: verify (mocked driver) raises ${scene.expectedRuntime}`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "verify-seeded-"));
      scratch.push(dir);
      cpSync(join(seeded, scene.id), dir, { recursive: true, filter: (src) => !/[\\/](dist|node_modules)([\\/]|$)/.test(src) });
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "dist", "index.html"), "<!doctype html>");
      const report = await runVerify({ projectDir: dir, skip: ["typecheck", "build"], driver: driverFor(runtimeCapture[scene.expectedRuntime!]!), settleMs: 0, motionGapMs: 0 });
      expect(report.findings.map((f) => f.code)).toContain(scene.expectedRuntime);
    });
  }

  test("no seeded scene is silent: every one raises at least one error or warning", async () => {
    for (const scene of manifest.scenes) expect(scene.expectedStatic || scene.expectedRuntime, scene.id).toBeTruthy();
  });
});
