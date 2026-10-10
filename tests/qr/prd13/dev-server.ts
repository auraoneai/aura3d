/**
 * PRD-13 §17.2 dev-server handle for the 13-SPECS browser specs
 * (tests/qr/prd13/browser/*.spec.ts).
 *
 * Proxies the prd04 wrapper (which already adds the `@aura3d/rendering/contracts`
 * rewrites and the `__AURA3D_VERSION__` / `__THREE_VERSION__` defines the shared
 * `tests/browser/example-dev-server.ts` lacks) and adds three things this lane
 * needs, without editing either upstream file (lane 04 / lane 15 surfaces):
 *
 *  1. Bare `@aura3d/*` specifiers the shared map does not cover (for example
 *     `@aura3d/engine/game`, which five game templates import) are rewritten
 *     to the `tsconfig.base.json` `paths` target. Exact keys only, so a prefix
 *     can never capture a longer specifier.
 *  2. `/__template/<id>/…` serves a create-aura3d template as its own Vite root:
 *     `index.html` with its `/src/…` and `./src/…` entry rewritten to the
 *     workspace copy, and root-absolute public files (`/aura-assets/…`, …)
 *     resolved against `packages/create-aura3d/templates/<id>/public/` by the
 *     request's Referer. Nothing outside the template's own public/ is added —
 *     a file the template does not ship stays a 404, exactly as in a scaffold.
 *  3. `/hdri/<file>.hdr` for the lane-13 harness pages (Referer under
 *     `/tests/qr/prd13/harness/`) resolves to `fixtures/environment-corpus/hdri/`,
 *     mirroring the §7.1.1 scaffold step that copies those files into public/.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import ts from "typescript";
import { startPrd04DevServer, type ExampleDevServer } from "../prd04/dev-server";

export type { ExampleDevServer };

const ESCAPE = /[.*+?^${}()|[\]\\]/g;
const TEMPLATE_PREFIX = "/__template/";
const HARNESS_PREFIX = "/tests/qr/prd13/harness/";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".hdr": "application/octet-stream",
  ".ktx2": "image/ktx2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff2": "font/woff2",
  ".css": "text/css"
};

/** Exact (non-wildcard) `@aura3d/*` path aliases from tsconfig.base.json, longest first. */
function workspaceAliases(root: string): readonly (readonly [string, string])[] {
  const read = ts.readConfigFile(join(root, "tsconfig.base.json"), ts.sys.readFile);
  const paths = (read.config?.compilerOptions?.paths ?? {}) as Record<string, readonly string[]>;
  return Object.entries(paths)
    .filter(([key, targets]) => key.startsWith("@aura3d/") && !key.includes("*") && targets.length > 0)
    .filter(([, targets]) => /\.(ts|js|mjs)$/.test(targets[0]))
    .map(([key, targets]) => [key, `/${targets[0].replace(/^\.\//, "")}`] as const)
    .sort((left, right) => right[0].length - left[0].length);
}

function rewriteBareAuraSpecifiers(source: string, aliases: readonly (readonly [string, string])[]): string {
  let output = source;
  for (const [specifier, target] of aliases) {
    if (!output.includes(specifier)) continue;
    const esc = specifier.replace(ESCAPE, "\\$&");
    output = output
      .replace(new RegExp(`(\\bfrom\\s*["'])${esc}(["'])`, "g"), `$1${target}$2`)
      .replace(new RegExp(`(\\bimport\\s*["'])${esc}(["'])`, "g"), `$1${target}$2`)
      .replace(new RegExp(`(\\bimport\\s*\\(\\s*(?:/\\*[^]*?\\*/\\s*)?["'])${esc}(["']\\s*\\))`, "g"), `$1${target}$2`);
  }
  return output;
}

/** Template id from `/__template/<id>/…` or `/packages/create-aura3d/templates/<id>/…`. */
function templateFromPath(pathname: string): string | undefined {
  const match = /^\/(?:__template|packages\/create-aura3d\/templates)\/([a-z0-9-]+)\//.exec(pathname);
  return match?.[1];
}

function refererPath(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).pathname;
  } catch {
    return undefined;
  }
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function safeJoin(base: string, relativePath: string): string | undefined {
  const target = resolve(base, normalize(relativePath).replace(/^([/\\])+/, ""));
  return target.startsWith(base) ? target : undefined;
}

function sendFile(res: import("node:http").ServerResponse, file: string): void {
  res.writeHead(200, { "content-type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

export async function startPrd13DevServer(root = process.cwd()): Promise<ExampleDevServer> {
  const upstream = await startPrd04DevServer(root);
  const aliases = workspaceAliases(root);
  const templatesRoot = resolve(root, "packages/create-aura3d/templates");
  const hdriRoot = resolve(root, "fixtures/environment-corpus/hdri");

  const server: Server = createServer((req, res) => {
    const pathname = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");

    // (2a) template index.html, served as the template's own root.
    if (pathname.startsWith(TEMPLATE_PREFIX)) {
      const template = templateFromPath(pathname);
      const rest = template ? pathname.slice(TEMPLATE_PREFIX.length + template.length + 1) : "";
      const templateDir = template ? resolve(templatesRoot, template) : undefined;
      if (!template || !templateDir || !existsSync(templateDir)) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end(`unknown template in ${pathname}`);
        return;
      }
      if (rest === "" || rest === "index.html") {
        const html = readFileSync(join(templateDir, "index.html"), "utf8");
        const base = `/packages/create-aura3d/templates/${template}/`;
        const rewritten = html.replace(/(\bsrc\s*=\s*["'])(?:\.\/|\/)(src\/[^"']+)(["'])/g, `$1${base}$2$3`);
        res.writeHead(200, { "content-type": CONTENT_TYPES[".html"] });
        res.end(rewritten);
        return;
      }
      const publicFile = safeJoin(join(templateDir, "public"), rest);
      if (publicFile && isFile(publicFile)) {
        sendFile(res, publicFile);
        return;
      }
    }

    // (2b) root-absolute public files requested by a template page.
    const fromPath = refererPath(req.headers.referer);
    const refererTemplate = fromPath ? templateFromPath(fromPath) : undefined;
    if (refererTemplate && !pathname.startsWith("/packages/") && !pathname.startsWith("/node_modules/")) {
      const publicFile = safeJoin(resolve(templatesRoot, refererTemplate, "public"), pathname);
      if (publicFile && isFile(publicFile)) {
        sendFile(res, publicFile);
        return;
      }
    }

    // (3) §7.1.1 HDRIs for the lane-13 harness pages only.
    if (pathname.startsWith("/hdri/") && fromPath?.startsWith(HARNESS_PREFIX)) {
      const hdri = safeJoin(hdriRoot, pathname.slice("/hdri/".length));
      if (hdri && isFile(hdri)) {
        sendFile(res, hdri);
        return;
      }
    }

    const proxy = httpRequest(new URL(req.url ?? "/", upstream.origin), { method: req.method, headers: req.headers }, (up) => {
      const chunks: Buffer[] = [];
      up.on("data", (chunk: Buffer) => chunks.push(chunk));
      up.on("end", () => {
        const body = Buffer.concat(chunks);
        const type = String(up.headers["content-type"] ?? "");
        const payload = /javascript/.test(type) ? rewriteBareAuraSpecifiers(body.toString("utf8"), aliases) : body;
        const headers: Record<string, string> = { "content-type": type };
        const location = up.headers.location;
        if (location) headers.location = String(location);
        res.writeHead(up.statusCode ?? 502, headers);
        res.end(payload);
      });
    });
    proxy.on("error", (error) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(String(error));
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
    throw new Error("prd13 dev-server proxy did not bind a TCP port.");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
      await upstream.close();
    }
  };
}
