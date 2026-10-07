/**
 * Minimal static file server for the lane-01 harness build.
 * Usage: node tests/qr/prd01/serve.mjs --root tests/qr/prd01/harness/dist --port 5299
 * Also imported by capture.mjs as `startStaticServer(root)`.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm"
};

export function startStaticServer(root, port = 0) {
  const rootDir = resolve(root);
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost/");
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
      if (path.includes("..")) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      let file = join(rootDir, path);
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) {
        file = join(rootDir, "index.html");
      }
      res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
      createReadStream(file).pipe(res);
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });
  return new Promise((resolvePromise) => {
    server.listen(port, "127.0.0.1", () => {
      resolvePromise({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const root = args[args.indexOf("--root") + 1] ?? "tests/qr/prd01/harness/dist";
  const port = Number(args[args.indexOf("--port") + 1] ?? 5299);
  const { url } = await startStaticServer(root, port);
  console.log(`serving ${root} at ${url}`);
}
