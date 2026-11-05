import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build, type Plugin } from "vite";

// This acceptance spec consumes the exact already-installed candidate. It never
// installs or repairs dependencies and must run only after CODE_COMPLETE_GO.
const installedRoot = process.env.A3D_INSTALLED_PACKAGE_ROOT;
const generatedRoots: string[] = [];
let server: Server;
let origin = "";
const observed: Array<{ path: string; contentType: string }> = [];
const mounts = new Map<string, string>();

async function buildConsumer(base: string): Promise<string> {
  if (!installedRoot) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must point to the verified packed candidate installation");
  const modules = path.resolve(installedRoot, "node_modules");
  const assets = path.join(modules, "@aura3d", "assets");
  const pluginPath = path.join(assets, "dist", "vite", "auraDecoders.js");
  const workerPath = path.join(assets, "dist", "workers", "ktx2.worker.js");
  if (!existsSync(pluginPath) || !existsSync(workerPath)) throw new Error(`Packed assets plugin/worker missing in ${assets}`);
  const { auraDecodersPlugin } = await import(pathToFileURL(pluginPath).href) as { auraDecodersPlugin(options: { codecs: string[] }): Plugin };
  const root = mkdtempSync(path.join(tmpdir(), "aura-packed-decoder-"));
  generatedRoots.push(root);
  symlinkSync(modules, path.join(root, "node_modules"), "dir");
  mkdirSync(path.join(root, "src"));
  writeFileSync(path.join(root, "index.html"), '<!doctype html><html><body><script type="module" src="./src/main.ts"></script></body></html>');
  writeFileSync(path.join(root, "src", "main.ts"), `
    import { transcodeKTX2BasisTexture } from "@aura3d/assets";
    const base = import.meta.env.BASE_URL;
    window.decodeFixture = async (signal) => {
      const bytes = new Uint8Array(await (await fetch(base + "fixture.ktx2")).arrayBuffer());
      const result = await transcodeKTX2BasisTexture(bytes, {
        targetFormat: "rgba8", workerCount: 1, transcoderUrl: base + "aura-decoders/basis/", signal
      });
      return { width: result.width, height: result.height, first: Array.from(result.data.slice(0, 4)), length: result.data.length };
    };
  `);
  await build({ root, base, configFile: false, logLevel: "error", plugins: [auraDecodersPlugin({ codecs: ["basis"] })], build: { outDir: "dist" } });
  const dist = path.join(root, "dist");
  copyFileSync("tests/assets/native-fixtures/ktx2-red-4x4.ktx2", path.join(dist, "fixture.ktx2"));
  return dist;
}

test.beforeAll(async () => {
  mounts.set("/", await buildConsumer("/"));
  mounts.set("/nested/", await buildConsumer("/nested/"));
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://local.invalid").pathname;
    const mount = pathname.startsWith("/nested/") ? "/nested/" : "/";
    const root = mounts.get(mount)!;
    const relative = pathname.slice(mount.length) || "index.html";
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`) || !existsSync(target)) { response.writeHead(404).end(); return; }
    const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".ktx2": "image/ktx2" };
    const contentType = mime[path.extname(target)] ?? "application/octet-stream";
    observed.push({ path: pathname, contentType });
    response.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'"
    });
    response.end(readFileSync(target));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Static decoder server did not bind");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  for (const root of generatedRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

for (const base of ["/", "/nested/"]) {
  test(`packed KTX2 decodes offline with same-origin worker at ${base}`, async ({ page, context }, testInfo) => {
    observed.length = 0;
    const blocked: string[] = [];
    // Diagnostics for AssetDecoderUnavailable, which hides the real worker/wasm failure.
    const diagnostics: string[] = [];
    page.on("console", (message) => diagnostics.push(`[console.${message.type()}] ${message.text()} @${message.location().url}:${message.location().lineNumber}`));
    page.on("pageerror", (error) => diagnostics.push(`[pageerror] ${error.name}: ${error.message}\n${error.stack ?? ""}`));
    page.on("worker", (worker) => { diagnostics.push(`[worker] created ${worker.url()}`); worker.on("close", () => diagnostics.push(`[worker] closed ${worker.url()}`)); });
    page.on("requestfailed", (request) => diagnostics.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ""}`));
    page.on("response", (response) => { if (response.status() >= 400) diagnostics.push(`[http ${response.status()}] ${response.url()}`); });
    const attachDiagnostics = async (): Promise<void> => {
      diagnostics.push(`[observed] ${JSON.stringify(observed)}`, `[blocked] ${JSON.stringify(blocked)}`);
      await testInfo.attach("ktx2-page-diagnostics", { body: diagnostics.join("\n"), contentType: "text/plain" });
    };
    await context.route("**/*", async (route) => {
      if (new URL(route.request().url()).origin !== origin) { blocked.push(route.request().url()); await route.abort(); }
      else await route.continue();
    });
    await page.goto(`${origin}${base}`);
    await page.waitForFunction(() => typeof (window as unknown as { decodeFixture?: unknown }).decodeFixture === "function");
    const decoded = await page.evaluate(async () => {
      const run = (window as unknown as { decodeFixture(signal?: AbortSignal): Promise<{ width: number; height: number; first: number[]; length: number }> }).decodeFixture;
      const abort = new AbortController();
      const OriginalWorker = window.Worker;
      let started = false;
      // Trigger abort after the actual transcode has been sent to the real
      // same-origin worker, rather than testing only an already-aborted signal.
      window.Worker = class extends OriginalWorker {
        constructor(url: string | URL, workerOptions?: WorkerOptions) {
          super(url, workerOptions);
          console.log(`[worker-ctor] ${String(url)}`);
          this.addEventListener("error", (event) => console.log(`[worker-error] ${event.message} ${event.filename}:${event.lineno}:${event.colno}`));
          this.addEventListener("messageerror", () => console.log("[worker-messageerror]"));
          this.addEventListener("message", (event) => { const data = event.data as { type?: string; error?: unknown; message?: unknown } | undefined; if (data?.type === "error" || data?.error) console.log(`[worker-message] ${JSON.stringify({ type: data?.type, error: String(data?.error ?? data?.message) })}`); });
        }
        override postMessage(message: unknown, transfer: Transferable[]): void;
        override postMessage(message: unknown, options?: StructuredSerializeOptions): void;
        override postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions): void {
          if (Array.isArray(options)) super.postMessage(message, options);
          else super.postMessage(message, options);
          if ((message as { type?: string }).type === "transcode" && !started) { started = true; abort.abort(); }
        }
      } as typeof Worker;
      const cancelled = await run(abort.signal).then(() => "unexpected-success", (error: Error) => { console.log(`[first-run] ${error.name}: ${error.message}`); return error.name; });
      let image: { width: number; height: number; first: number[]; length: number };
      try { image = await run(); }
      catch (error) { console.log(`[second-run] ${(error as Error).name}: ${(error as Error).message} cause=${String((error as { cause?: unknown }).cause)}`); window.Worker = OriginalWorker; throw error; }
      window.Worker = OriginalWorker;
      return { image, cancelled, started };
    }).catch(async (error: unknown) => { await attachDiagnostics(); throw new Error(`${String(error)}\n--- page diagnostics ---\n${diagnostics.join("\n")}`); });
    await attachDiagnostics();
    expect(decoded.started).toBe(true);
    expect(decoded.cancelled).toBe("AbortError");
    expect([decoded.image.width, decoded.image.height, decoded.image.length]).toEqual([4, 4, 64]);
    expect(decoded.image.first[0]).toBeGreaterThan(180);
    expect(decoded.image.first[1]).toBeLessThan(75);
    expect(decoded.image.first[2]).toBeLessThan(75);
    expect(decoded.image.first[3]).toBe(255);
    expect(blocked).toEqual([]);
    for (const [file, contentType] of [["ktx2.worker.js", "text/javascript"], ["basis_transcoder.js", "text/javascript"], ["basis_transcoder.wasm", "application/wasm"]]) {
      expect(observed).toContainEqual({ path: `${base}aura-decoders/basis/${file}`, contentType });
    }
  });
}
