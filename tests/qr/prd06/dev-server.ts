/**
 * PRD-06 dev-server wrapper (lane 06 only).
 *
 * The shared `tests/browser/example-dev-server.ts` specifier map covers
 * `@aura3d/animation/lanes` but not `@aura3d/engine/lanes` (or its `lanes/*`
 * subpaths) — the engine lanes barrel is where `characterAnimation` and the
 * PRD-06 node-handle extensions live. Editing the shared server is lane-15's
 * surface (same rule the PRD-04 wrapper documents), so this proxies
 * `startPrd04DevServer` — which already layers the prd04 specifier fixes plus
 * `/qr-assets` and `__AURA3D_VERSION__` — and applies the missing
 * `@aura3d/engine/lanes` rewrite on JS responses.
 */
import { createServer, request as httpRequest, type Server } from "node:http";
import { startPrd04DevServer } from "../prd04/dev-server";
import type { ExampleDevServer } from "../../browser/example-dev-server";

export type { ExampleDevServer };

function rewriteLaneImports(source: string): string {
  let output = source;
  // Exact specifier: `@aura3d/engine/lanes` -> src/lanes/index.ts.
  output = output
    .replace(/(\bfrom\s*["'])@aura3d\/engine\/lanes(["'])/g, "$1/packages/engine/src/lanes/index.ts$2")
    .replace(/(\bimport\s*["'])@aura3d\/engine\/lanes(["'])/g, "$1/packages/engine/src/lanes/index.ts$2")
    .replace(
      /(\bimport\s*\(\s*(?:\/\*[^]*?\*\/\s*)?["'])@aura3d\/engine\/lanes(["']\s*\))/g,
      "$1/packages/engine/src/lanes/index.ts$2",
    );
  // Subpaths: `@aura3d/engine/lanes/<x>` -> src/lanes/<x>.ts.
  output = output
    .replace(/(\bfrom\s*["'])@aura3d\/engine\/lanes\/([^"']+)(["'])/g, "$1/packages/engine/src/lanes/$2.ts$3")
    .replace(
      /(\bimport\s*\(\s*(?:\/\*[^]*?\*\/\s*)?["'])@aura3d\/engine\/lanes\/([^"']+)(["']\s*\))/g,
      "$1/packages/engine/src/lanes/$2.ts$3",
    );
  return output;
}

export async function startPrd06DevServer(root = process.cwd()): Promise<ExampleDevServer> {
  const upstream = await startPrd04DevServer(root);
  const server: Server = createServer((req, res) => {
    const proxy = httpRequest(new URL(req.url ?? "/", upstream.origin), { method: req.method, headers: req.headers }, (up) => {
      const chunks: Buffer[] = [];
      up.on("data", (c: Buffer) => chunks.push(c));
      up.on("end", () => {
        const body = Buffer.concat(chunks);
        const type = String(up.headers["content-type"] ?? "");
        const payload = /javascript|text\/plain/.test(type)
          ? rewriteLaneImports(body.toString("utf8"))
          : body;
        const headers: Record<string, string> = { "content-type": type };
        const location = up.headers.location;
        if (location) headers.location = String(location);
        res.writeHead(up.statusCode ?? 502, headers);
        res.end(payload);
      });
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
    throw new Error("prd06 dev-server proxy did not bind a TCP port.");
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
