import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

// Aura3D Animation Studio — bundled inside the animation-studio template.
// Adapts the monorepo paths (REPO_ROOT, tsconfig.base.json) to the template's
// standalone project layout so `npm run studio` works in a scaffolded project.

const __dirname = dirname(fileURLToPath(import.meta.url));
// The template root (parent of this studio/ directory).
const TEMPLATE_DIR = resolve(__dirname, "..");
// The Scene-Tool CLI lives inside the template's scripts/ folder.
const SCENE_CLI = resolve(TEMPLATE_DIR, "scripts", "animation-scene.ts");
// Persisted working document the Scene-Tool CLI mutates.
const WORKING_DOC = resolve(TEMPLATE_DIR, "dist", "scene", "working.document.json");
// Command/result history alongside the working document.
const WORKING_HISTORY = resolve(TEMPLATE_DIR, "dist", "scene", "working.history.json");
// Where `animation-scene render` writes frames + episode-3d.webm.
const RENDER_OUT_DIR = resolve(TEMPLATE_DIR, "dist", "episodes", "scene");

const MIME: Record<string, string> = {
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json"
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => res(Buffer.concat(chunks).toString("utf8")));
    req.on("error", rej);
  });
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function tokenize(command: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/** Spawn the Scene-Tool CLI from the template root using npx tsx. */
function runCli(args: string[], extraEnv: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const child = spawn(
      "npx",
      ["tsx", SCENE_CLI, ...args],
      { cwd: TEMPLATE_DIR, env: { ...process.env, ...extraEnv } }
    );
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.on("error", (e) => res({ code: 1, out: out + String(e) }));
    child.on("close", (code) => res({ code: code ?? 0, out: out.trim() }));
  });
}

function docHash(): string {
  if (!existsSync(WORKING_DOC)) return "—";
  let h = 5381;
  const buf = readFileSync(WORKING_DOC);
  for (let i = 0; i < buf.length; i++) h = ((h << 5) + h + buf[i]!) >>> 0;
  return h.toString(16).slice(-3);
}

function auraBackend(): Plugin {
  return {
    name: "aura-studio-backend",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/document", (req, res, next) => {
        if (req.method !== "GET") return next();
        try {
          if (!existsSync(WORKING_DOC)) return json(res, 200, { exists: false });
          const doc = JSON.parse(readFileSync(WORKING_DOC, "utf8")) as unknown;
          json(res, 200, doc);
        } catch (e) {
          json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      });

      server.middlewares.use("/api/history", (req, res, next) => {
        if (req.method !== "GET") return next();
        try {
          if (!existsSync(WORKING_HISTORY)) return json(res, 200, []);
          const hist = JSON.parse(readFileSync(WORKING_HISTORY, "utf8")) as unknown;
          json(res, 200, Array.isArray(hist) ? hist : []);
        } catch (e) {
          json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      });

      server.middlewares.use("/api/scene", (req, res, next) => {
        if (req.method !== "POST") return next();
        void (async () => {
          const started = Date.now();
          try {
            const { command } = JSON.parse((await readBody(req)) || "{}") as { command?: string };
            if (!command || !command.trim()) return json(res, 400, { ok: false, error: "empty command" });
            const { code, out } = await runCli(tokenize(command.trim()));
            const ok = code === 0;
            json(res, 200, { ok, output: out, rejected: !ok, ms: Date.now() - started, hash: docHash() });
          } catch (e) {
            json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        })();
      });

      server.middlewares.use("/api/render", (req, res, next) => {
        if (req.method === "GET") {
          const webm = resolve(RENDER_OUT_DIR, "episode-3d.webm");
          const poster = resolve(RENDER_OUT_DIR, "frames", "first.png");
          const hasVideo = existsSync(webm);
          json(res, 200, {
            ok: true, exists: hasVideo,
            video: hasVideo ? "/preview/episode-3d.webm" : null,
            poster: existsSync(poster) ? "/preview/frames/first.png" : null,
            hash: docHash()
          });
          return;
        }
        if (req.method !== "POST") return next();
        void (async () => {
          const started = Date.now();
          try {
            const body = JSON.parse((await readBody(req)) || "{}") as { lowFi?: boolean; range?: string };
            const args = ["render"];
            if (body.range) args.push("--range", body.range);
            const env: Record<string, string> = { AURA_LOW_FIDELITY: body.lowFi === false ? "0" : "1" };
            const { code, out } = await runCli(args, env);
            if (code !== 0) return json(res, 500, { ok: false, output: out });
            const webm = resolve(RENDER_OUT_DIR, "episode-3d.webm");
            const poster = resolve(RENDER_OUT_DIR, "frames", "first.png");
            json(res, 200, {
              ok: true, output: out, ms: Date.now() - started,
              video: existsSync(webm) ? "/preview/episode-3d.webm" : null,
              poster: existsSync(poster) ? "/preview/frames/first.png" : null,
              hash: docHash()
            });
          } catch (e) {
            json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        })();
      });

      server.middlewares.use("/preview", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]!).replace(/^\/+/, "");
        const file = resolve(RENDER_OUT_DIR, rel);
        if (!file.startsWith(RENDER_OUT_DIR) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
        res.setHeader("cache-control", "no-store");
        createReadStream(file).pipe(res);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), auraBackend()],
  server: { host: "127.0.0.1", port: 5188 },
  build: { outDir: "dist", emptyOutDir: true }
});
