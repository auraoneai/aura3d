/**
 * 05-PKG — auraDecodersPlugin copies vendor/{basis,draco,meshopt} into
 * `<outDir>/aura-decoders/` on closeBundle and serves the same tree under
 * `/aura-decoders/` in dev with correct MIME types.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { auraDecodersPlugin, auraDecodersVendorRoot } from "../../../packages/assets/src/vite/auraDecoders";

describe("auraDecodersPlugin", () => {
  it("closeBundle copies vendor/{basis,draco,meshopt} → <outDir>/aura-decoders", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "aura-decoders-"));
    try {
      const plugin = auraDecodersPlugin() as {
        configResolved: (c: { build?: { outDir?: string } }) => void;
        closeBundle: () => Promise<void>;
      };
      plugin.configResolved({ build: { outDir } });
      await plugin.closeBundle();
      for (const dir of ["basis", "draco", "meshopt"]) {
        expect(existsSync(path.join(outDir, "aura-decoders", dir)), `missing ${dir}`).toBe(true);
      }
      expect(existsSync(path.join(outDir, "aura-decoders", "basis", "basis_transcoder.js"))).toBe(true);
      expect(existsSync(path.join(outDir, "aura-decoders", "draco", "draco_decoder.js"))).toBe(true);
      expect(existsSync(path.join(outDir, "aura-decoders", "meshopt", "meshopt_decoder.mjs"))).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("vendor root contains the three decoder families", () => {
    const root = auraDecodersVendorRoot();
    for (const dir of ["basis", "draco", "meshopt"]) {
      expect(existsSync(path.join(root, dir)), `vendor missing ${dir}`).toBe(true);
    }
  });

  it("dev middleware serves vendored files under /aura-decoders/ with MIME", () => {
    const plugin = auraDecodersPlugin() as {
      configureServer: (s: { middlewares: { use: (fn: (req: { url?: string }, res: MockRes, next: () => void) => void) => void } }) => void;
    };
    interface MockRes { statusCode: number; headers: Map<string, string>; body: string | null; setHeader: (k: string, v: string) => void; end: (b?: string) => void }
    const res: MockRes = { statusCode: 0, headers: new Map(), body: null, setHeader(k, v) { this.headers.set(k, v); }, end(b) { this.body = b ?? null; } };
    let handler!: (req: { url?: string }, res: MockRes, next: () => void) => void;
    plugin.configureServer({ middlewares: { use(fn) { handler = fn; } } });

    // wasm → application/wasm
    const wasmRes = { ...res, headers: new Map<string, string>(), body: null as string | null, setHeader: res.setHeader, end: res.end };
    let calledNext = false;
    handler({ url: "/aura-decoders/draco/draco_decoder.wasm" }, wasmRes, () => { calledNext = true; });
    expect(calledNext).toBe(false);
    expect(wasmRes.statusCode).toBe(200);
    expect(wasmRes.headers.get("Content-Type")).toBe("application/wasm");

    // path traversal → next()
    calledNext = false;
    handler({ url: "/aura-decoders/../../etc/passwd" }, wasmRes, () => { calledNext = true; });
    // middleware normalizes the path; traversal must not escape VENDOR_ROOT
    expect(calledNext || wasmRes.statusCode !== 200).toBe(true);

    // other prefixes → next()
    calledNext = false;
    handler({ url: "/assets/foo.glb" }, wasmRes, () => { calledNext = true; });
    expect(calledNext).toBe(true);
  });
});
