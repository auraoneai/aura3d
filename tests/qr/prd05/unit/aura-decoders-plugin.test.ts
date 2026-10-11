/**
 * 05-PKG — auraDecodersPlugin copies vendor/{basis,draco,meshopt} into
 * `<root>/<outDir>/aura-decoders/` on a build's closeBundle and serves the
 * same tree under `/aura-decoders/` in dev with correct MIME types.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { auraDecodersPlugin, auraDecodersVendorRoot } from "../../../../packages/assets/src/vite/auraDecoders";

interface PluginShape {
  configResolved: (c: { command?: "build" | "serve"; root?: string; build?: { outDir?: string } }) => void;
  closeBundle: () => Promise<void>;
  configureServer: (s: { middlewares: { use: (fn: Handler) => void } }) => void;
}
interface MockRes { statusCode: number; headers: Map<string, string>; body: unknown; setHeader: (k: string, v: string) => void; end: (b?: unknown) => void }
type Handler = (req: { url?: string }, res: MockRes, next: () => void) => void;

function mockRes(): MockRes {
  return { statusCode: 0, headers: new Map(), body: null, setHeader(k, v) { this.headers.set(k, v); }, end(b) { this.body = b ?? null; } };
}

function devHandler(): Handler {
  const plugin = auraDecodersPlugin() as unknown as PluginShape;
  let handler: Handler | undefined;
  plugin.configureServer({ middlewares: { use(fn) { handler = fn; } } });
  if (!handler) throw new Error("configureServer registered no middleware");
  return handler;
}

function request(url: string): { res: MockRes; calledNext: boolean } {
  const res = mockRes();
  let calledNext = false;
  devHandler()({ url }, res, () => { calledNext = true; });
  return { res, calledNext };
}

describe("auraDecodersPlugin", () => {
  it("build closeBundle copies vendor/{basis,draco,meshopt} → <root>/<outDir>/aura-decoders", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "aura-decoders-"));
    try {
      const plugin = auraDecodersPlugin() as unknown as PluginShape;
      plugin.configResolved({ command: "build", root, build: { outDir: "dist" } });
      await plugin.closeBundle();
      const out = path.join(root, "dist", "aura-decoders");
      for (const file of ["basis/basis_transcoder.js", "basis/basis_transcoder.wasm", "draco/draco_decoder.js", "draco/draco_decoder.wasm", "meshopt/meshopt_decoder.mjs"]) {
        expect(existsSync(path.join(out, file)), `missing ${file}`).toBe(true);
      }
      expect(readFileSync(path.join(out, "basis/basis_transcoder.wasm")).subarray(0, 4)).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("closeBundle does not copy when Vite closes a dev server", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "aura-decoders-serve-"));
    try {
      const plugin = auraDecodersPlugin() as unknown as PluginShape;
      plugin.configResolved({ command: "serve", root, build: { outDir: "dist" } });
      await plugin.closeBundle();
      expect(existsSync(path.join(root, "dist"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("vendor root contains the three decoder families", () => {
    const root = auraDecodersVendorRoot();
    for (const dir of ["basis", "draco", "meshopt"]) {
      expect(existsSync(path.join(root, dir)), `vendor missing ${dir}`).toBe(true);
    }
  });

  it("dev middleware serves .wasm with application/wasm and .js as text/javascript", () => {
    const wasm = request("/aura-decoders/draco/draco_decoder.wasm?v=1");
    expect(wasm.calledNext).toBe(false);
    expect(wasm.res.statusCode).toBe(200);
    expect(wasm.res.headers.get("Content-Type")).toBe("application/wasm");
    const js = request("/aura-decoders/basis/basis_transcoder.js");
    expect(js.calledNext).toBe(false);
    expect(js.res.headers.get("Content-Type")).toBe("text/javascript");
  });

  it("dev middleware passes through traversal, directories, malformed escapes and other prefixes", () => {
    for (const url of ["/aura-decoders/../../package.json", "/aura-decoders/..%2F..%2Fpackage.json", "/aura-decoders/basis/", "/aura-decoders/%E0%A4%A", "/assets/foo.glb"]) {
      const { res, calledNext } = request(url);
      expect(calledNext, url).toBe(true);
      expect(res.statusCode, url).toBe(0);
    }
  });
});
