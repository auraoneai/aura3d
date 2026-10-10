/**
 * PRD-08 dev-server wrapper (lane 08 only).
 *
 * The shared `tests/browser/example-dev-server.ts` serves esbuild bundles only
 * for entries under `/tests/browser/`; any other `.ts` entry goes through its
 * per-module transform, whose literal `packageEntryPoints` map has no
 * `@aura3d/engine/lanes` entry. The PRD-08 harness imports
 * `createFixedStepDriver` / `createInterpolationStore` from that subpath, so the
 * bare specifier reached the browser verbatim ("Failed to resolve module
 * specifier '@aura3d/engine/lanes'"), the module never evaluated, nothing set
 * `__AURA3D_PRD08_HARNESS__`, and every frame-pacing test waited out its 60 s
 * ready deadline (run 37489294624).
 *
 * Editing the shared server is lane-15's surface, so this wrapper serves the
 * lane's own harness entries (`/tests/qr/prd08/harness/*.ts`) as a single
 * esbuild bundle resolved through the repo's TS path map (`tsconfig.base.json`,
 * which maps `@aura3d/engine/lanes` → `packages/engine/src/lanes/index.ts`) —
 * one module instead of ~1,300 transformed files, so singleton registries are
 * single-instance by construction. Every other request is proxied unchanged to
 * the shared server.
 */
import { readFileSync, statSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import { join, normalize, resolve } from "node:path";
import * as esbuild from "esbuild";
import { startExampleDevServer, type ExampleDevServer } from "../../browser/example-dev-server";

export type { ExampleDevServer };

const HARNESS_PREFIX = "/tests/qr/prd08/harness/";

const LOADERS: Record<string, esbuild.Loader> = {
  ".glsl": "text",
  ".glb": "dataurl",
  ".png": "dataurl",
  ".jpg": "dataurl",
  ".jpeg": "dataurl",
  ".webp": "dataurl",
  ".hdr": "dataurl",
  ".exr": "dataurl",
  ".ktx2": "dataurl",
  ".bin": "dataurl",
  ".wasm": "dataurl",
  ".mp3": "dataurl",
  ".wav": "dataurl",
  ".ogg": "dataurl",
};

function readVersion(packageJsonPath: string): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
  if (!pkg.version) throw new Error(`no version in ${packageJsonPath}`);
  return pkg.version;
}

/** Bundle one harness entry; throws (served as 500) instead of falling back. */
async function bundleHarness(root: string, file: string): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [file],
    absWorkingDir: root,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    logLevel: "silent",
    tsconfig: join(root, "tsconfig.base.json"),
    loader: LOADERS,
    define: {
      // Same test-build defines the shared bundler + vite configs inject.
      "import.meta.env.MODE": '"test"',
      __AURA3D_VERSION__: JSON.stringify(readVersion(join(root, "package.json"))),
      __THREE_VERSION__: JSON.stringify(readVersion(join(root, "node_modules/three/package.json"))),
    },
    plugins: [
      {
        name: "prd08-node-builtins",
        setup(build) {
          // Node builtins only appear inside dormant dynamic imports of deps
          // (e.g. @gltf-transform node IO); keep them lazy like the shared
          // server does — they 404 only if ever executed.
          build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, external: true }));
        },
      },
    ],
  });
  const output = result.outputFiles[0]?.text;
  if (!output) throw new Error(`esbuild produced no output for ${file}`);
  return output;
}

export async function startPrd08DevServer(root = process.cwd()): Promise<ExampleDevServer> {
  const upstream = await startExampleDevServer(root);
  const cache = new Map<string, { mtimeMs: number; output: string }>();
  const harnessRoot = resolve(root, `.${HARNESS_PREFIX}`);

  const server: Server = createServer((req, res) => {
    const pathname = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    if (pathname.startsWith(HARNESS_PREFIX) && /\.(ts|js)$/.test(pathname)) {
      const file = resolve(root, `.${normalize(pathname).replace(/\.js$/, ".ts")}`);
      if (!file.startsWith(harnessRoot)) {
        res.writeHead(403, { "content-type": "text/plain" });
        res.end("outside prd08 harness");
        return;
      }
      void (async () => {
        try {
          const mtimeMs = statSync(file).mtimeMs;
          const hit = cache.get(file);
          const output = hit && hit.mtimeMs === mtimeMs ? hit.output : await bundleHarness(root, file);
          cache.set(file, { mtimeMs, output });
          res.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" });
          res.end(output);
        } catch (error) {
          // Surface bundle errors in the CI log; the harness page then reports
          // a module load failure instead of silently timing out.
          console.error("[prd08-dev-server] bundle failed for", pathname, String(error));
          res.writeHead(500, { "content-type": "text/plain" });
          res.end(String(error));
        }
      })();
      return;
    }
    const proxy = httpRequest(new URL(req.url ?? "/", upstream.origin), { method: req.method, headers: req.headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    proxy.on("error", (err) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(String(err));
    });
    req.pipe(proxy);
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("prd08 dev-server did not bind a TCP port.");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
      await upstream.close();
    },
  };
}
