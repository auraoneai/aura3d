import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

// Aura3D Animation Studio — the real 3-pane NLE shell (PRD §7).
// Standalone Vite + React + TS app. The Director Console + Render button are wired
// to the REAL backend via a DEV-ONLY middleware (see auraBackend below):
//   POST /api/scene  { command }        → runs the template's agent-native Scene-Tool
//                                          CLI (animation-scene.ts) against the shared
//                                          working document and returns the validated
//                                          mutation result (or the validator rejection).
//   POST /api/render { lowFi?, range? }  → renders the working document (low-fi by
//                                          default) and returns the output path; the
//                                          rendered frames/webm are served under /preview/*.
// This is the LOCAL studio control surface. The user's own coding agent remains the
// director — Command mode runs raw scene-tool commands; Prompt mode only displays intent.

const __dirname = dirname(fileURLToPath(import.meta.url));
// The monorepo root — the Scene-Tool CLI + render scripts must be shelled from here
// (they import workspace packages and pin tsconfig.base.json).
const REPO_ROOT = resolve(__dirname, "..", "..");
const TEMPLATE_DIR = resolve(REPO_ROOT, "packages", "create-aura3d", "templates", "animation-studio");
const SCENE_CLI = "packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts";
// The persisted working document the Scene-Tool CLI mutates + the render pipeline reads.
const WORKING_DOC = resolve(TEMPLATE_DIR, "dist", "scene", "working.document.json");
// The persisted command/result history alongside the working document.
const WORKING_HISTORY = resolve(TEMPLATE_DIR, "dist", "scene", "working.history.json");
// Where `animation-scene render` writes (relative to template root): frames/ + episode-3d.webm.
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

/** Naive but safe-ish tokenizer for a scene-tool command line (supports "quoted args"). */
function tokenize(command: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/** Spawn the Scene-Tool CLI (or render) from the monorepo root and collect output. */
function runCli(args: string[], extraEnv: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.base.json", SCENE_CLI, ...args],
      { cwd: REPO_ROOT, env: { ...process.env, ...extraEnv } }
    );
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.on("error", (e) => res({ code: 1, out: out + String(e) }));
    child.on("close", (code) => res({ code: code ?? 0, out: out.trim() }));
  });
}

/** A short content hash of the current working document — the card's "doc @ xxx" revision. */
function docHash(): string {
  if (!existsSync(WORKING_DOC)) return "—";
  let h = 5381;
  const buf = readFileSync(WORKING_DOC);
  for (let i = 0; i < buf.length; i++) h = ((h << 5) + h + buf[i]!) >>> 0;
  return h.toString(16).slice(-3);
}

/** DEV-ONLY backend middleware — the local studio control surface. Not part of the build. */
function auraBackend(): Plugin {
  return {
    name: "aura-studio-backend",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      // GET /api/document → the REAL working document (the single source of truth the UI
      // hydrates from). Returns { exists:false } when no document has been authored yet.
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

      // GET /api/history → the REAL command/result history (array), or [] when none.
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

      // POST /api/scene { command } → validated Scene-Tool mutation (commit or rejection).
      server.middlewares.use("/api/scene", (req, res, next) => {
        if (req.method !== "POST") return next();
        void (async () => {
          const started = Date.now();
          try {
            const { command } = JSON.parse((await readBody(req)) || "{}") as { command?: string };
            if (!command || !command.trim()) return json(res, 400, { ok: false, error: "empty command" });
            const { code, out } = await runCli(tokenize(command.trim()));
            const ok = code === 0;
            json(res, 200, {
              ok,
              output: out,
              // "ok"/"REJECTED — ..." come straight from the CLI; surface the rejection reason.
              rejected: !ok,
              ms: Date.now() - started,
              hash: docHash()
            });
          } catch (e) {
            json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        })();
      });

      // GET /api/render → return the EXISTING render (if any) so the Stage shows it on page load,
      // without re-rendering. POST below actually (re)renders. This is why an already-rendered scene
      // now appears on the Stage immediately instead of "No render yet".
      server.middlewares.use("/api/render", (req, res, next) => {
        if (req.method !== "GET") return next();
        const webm = resolve(RENDER_OUT_DIR, "episode-3d.webm");
        const poster = resolve(RENDER_OUT_DIR, "frames", "first.png");
        const hasVideo = existsSync(webm);
        json(res, 200, {
          ok: true,
          exists: hasVideo,
          video: hasVideo ? "/preview/episode-3d.webm" : null,
          poster: existsSync(poster) ? "/preview/frames/first.png" : null,
          hash: docHash()
        });
      });

      // POST /api/render { lowFi?, range? } → render the working document; return output paths.
      server.middlewares.use("/api/render", (req, res, next) => {
        if (req.method !== "POST") return next();
        void (async () => {
          const started = Date.now();
          try {
            const body = JSON.parse((await readBody(req)) || "{}") as { lowFi?: boolean; range?: string };
            // Clear the previous render's progress.json BEFORE spawning: a stale
            // {label:"finishing", pct:100} would make the SSE stream report 100% and
            // end instantly on every re-render (see /api/render-progress below).
            try {
              rmSync(resolve(RENDER_OUT_DIR, "progress.json"), { force: true });
            } catch {}
            const args = ["render"];
            if (body.range) args.push("--range", body.range);
            // Low-fi by default for the fast studio iteration loop.
            const env: Record<string, string> = { AURA_LOW_FIDELITY: body.lowFi === false ? "0" : "1" };
            const { code, out } = await runCli(args, env);
            if (code !== 0) return json(res, 500, { ok: false, output: out });
            const webm = resolve(RENDER_OUT_DIR, "episode-3d.webm");
            const poster = resolve(RENDER_OUT_DIR, "frames", "first.png");
            json(res, 200, {
              ok: true,
              output: out,
              ms: Date.now() - started,
              // Served by the /preview middleware below (cache-busted by the caller).
              video: existsSync(webm) ? "/preview/episode-3d.webm" : null,
              poster: existsSync(poster) ? "/preview/frames/first.png" : null,
              hash: docHash()
            });
          } catch (e) {
            json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        })();
      });

      // GET /api/render-progress → SSE stream of render pipeline progress JSON.
      server.middlewares.use("/api/render-progress", (req, res, next) => {
        if (req.method !== "GET") return next();
        const progressPath = resolve(RENDER_OUT_DIR, "progress.json");
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();
        const interval = setInterval(() => {
          try {
            if (!existsSync(progressPath)) {
              res.write(`data: ${JSON.stringify({ current: 0, total: 1, label: "waiting", pct: 0 })}\n\n`);
              return;
            }
            const raw = readFileSync(progressPath, "utf8");
            const data = JSON.parse(raw) as { current: number; total: number; label: string; pct: number };
            res.write(`data: ${JSON.stringify(data)}\n\n`);
            if (data.label === "finishing" || data.pct >= 100) {
              clearInterval(interval);
              res.end();
            }
          } catch {
            res.write(`data: ${JSON.stringify({ current: 0, total: 1, label: "unknown", pct: 0 })}\n\n`);
          }
        }, 200);
        req.on("close", () => clearInterval(interval));
      });

      // GET /preview/* → serve the rendered frames/webm out of the template render dir.
      server.middlewares.use("/preview", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]!).replace(/^\/+/, "");
        // Resolve under the render output dir and reject path traversal.
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
