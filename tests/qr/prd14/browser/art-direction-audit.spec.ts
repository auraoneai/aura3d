import { expect, test, type Page } from "@playwright/test";
import { createReadStream, existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { auditArtDirection } from "../../../../packages/game/src/art/audit";
import { snapshotForAudit, assetManifestLike } from "../../../../packages/game/src/art/snapshot";
import { lookLint } from "../../../../packages/engine/src/contracts/looks";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/index";
import type { GameArtDirection } from "../../../../packages/game/src/art/define";

/**
 * T1.9 (b) — runtime art-direction audit. The lane workflow builds each route
 * (capture-games --build-only / vite build), then this spec mounts it with the
 * route flag, pulls the authored scene + draw calls out of the page beacon,
 * and runs snapshotForAudit + lookLint (C-34) + auditArtDirection. Any
 * violation fails the spec (exit 1).
 *
 * Routes under test: A3D_QR_ROUTES=<app-dir,…> or auto-discovered app dirs
 * with a src/v2 tree. Skips when no route has v2 (wave work has not landed).
 */

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const APPS = join(ROOT, "apps");
const GAMES_JSON = join(ROOT, "tools", "quality-rebuild-capture", "games.json");

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json", ".hdr": "application/octet-stream", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".wasm": "application/wasm"
};

function serve(dir: string): Promise<{ server: Server; url: string }> {
  // Rooted at `dir` with fallback to the route's public/ and repo public/
  // (matching lib/serve.ts) so `/aura-assets/*` and `/assets/packs/*` resolve.
  const root = realpathSync(resolve(dir));
  const roots = [
    root,
    join(APPS, basename(root), "public"),
    join(ROOT, "public"),
    join(ROOT, "packages", "create-aura3d")
  ].filter((d) => existsSync(d)).map((d) => realpathSync(resolve(d)));
  const server = createServer((req, res) => {
    const raw = new URL(req.url ?? "/", "http://x").pathname;
    // capture-games builds with `base: /apps/<dir>/` (see lib/serve.ts).
    const base = `/apps/${basename(root)}/`;
    const path = raw.startsWith(base) ? `/${raw.slice(base.length)}` : raw;
    const rel = "." + (path === "/" ? "/index.html" : path);
    for (const r of roots) {
      const file = resolve(r, rel);
      if ((!file.startsWith(r + sep) && file !== r) || !existsSync(file)) continue;
      try {
        const real = realpathSync(file);
        if (!real.startsWith(r + sep) && real !== r) continue;
        res.writeHead(200, { "content-type": MIME[extname(real)] ?? "application/octet-stream" });
        createReadStream(real).pipe(res);
        return;
      } catch {
        continue;
      }
    }
    if (path === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    res.writeHead(404); res.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

interface GamesEntry {
  readonly id: string;
  readonly appDir?: string;
  readonly dir?: string;
  readonly qrFlags?: readonly string[];
  readonly artDirection?: string;
  readonly budgets?: { readonly drawCalls?: Record<string, number> };
}

function routeEntries(): readonly { appDir: string; entry: GamesEntry; singlePath: boolean }[] {
  const games = (JSON.parse(readFileSync(GAMES_JSON, "utf8")) as { games: GamesEntry[] }).games;
  const wanted = (process.env.A3D_QR_ROUTES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return games
    .filter((g) => {
      const dir = g.appDir ?? g.dir ?? g.id;
      const hasV2 = existsSync(join(APPS, dir, "src", "v2"));
      const singlePath = !hasV2
        && existsSync(join(APPS, dir, "art", "direction.ts"))
        && existsSync(join(APPS, dir, "src", "main.ts"));
      return (hasV2 || singlePath) && (wanted.length === 0 || wanted.includes(dir) || wanted.includes(g.id));
    })
    .map((entry) => {
      const appDir = entry.appDir ?? entry.dir ?? entry.id;
      const singlePath = !existsSync(join(APPS, appDir, "src", "v2"));
      return { appDir, entry, singlePath };
    });
}

/** Serializes beacon.app.scene + diagnostics out of the mounted page. */
async function readMountedSnapshot(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const beacon = (window as unknown as Record<string, unknown>).__AURA3D_GAME__ as
      | { scene?: unknown; diagnostics?: () => unknown; app?: { scene?: unknown; diagnostics?: () => unknown } }
      | undefined;
    const app = beacon?.app ?? beacon;
    const diag = typeof app?.diagnostics === "function" ? app.diagnostics() : undefined;
    return { scene: app?.scene ?? null, drawCalls: (diag as { drawCalls?: number } | undefined)?.drawCalls ?? 0 };
  });
}

async function importDirection(file: string): Promise<GameArtDirection | undefined> {
  if (!existsSync(file)) return undefined;
  const mod = (await import(file)) as { default?: GameArtDirection; direction?: GameArtDirection };
  return mod.default ?? mod.direction;
}

test.describe("art-direction runtime audit (T1.9)", () => {
  // Empty when no apps/*/src/v2 or single-path tree exists: the
  // describe registers no tests and the suite stays green until T2.x.
  const routes = routeEntries();

  for (const { appDir, entry, singlePath } of routes) {
    test(`route ${appDir}: no auditArtDirection/lookLint violations`, async ({ page }) => {
      const buildDirs = [
        join(ROOT, "tools", "quality-rebuild-capture", ".build", "site", "apps", appDir),
        join(ROOT, "tools", "quality-rebuild-capture", ".build", appDir),
        join(APPS, appDir, "dist")
      ];
      const root = buildDirs.find((d) => existsSync(join(d, "index.html")));
      expect(root, `${appDir} not built (${buildDirs.join(", ")})`).not.toBeUndefined();

      const { server, url } = await serve(root!);
      try {
        if (singlePath) {
          await page.goto(`${url}/`);
          await expect.poll(
            async () => page.evaluate(() => ((window as { __AURA3D_GAME__?: { state?: string } }).__AURA3D_GAME__?.state) === "playing"),
            { timeout: 30_000 }
          ).toBe(true);
        } else {
          // games.json qrFlags is the URL contract (route-<id> + engine short
          // flags); falling back to "all" never selected the v2 route.
          const flags = (entry.qrFlags ?? []).join(",");
          expect(flags, `${appDir}: games.json has no qrFlags`).not.toBe("");
          await page.goto(`${url}/?a3d-qr=${flags}`);
          await expect.poll(async () => page.evaluate(() => Boolean((window as { __AURA3D_GAME__?: unknown }).__AURA3D_GAME__))).toBe(true);
        }

        const mounted = (await readMountedSnapshot(page)) as {
          scene: AuraSceneSnapshot | null;
          drawCalls: number;
        };
        expect(mounted.scene, `${appDir}: page beacon exposes no scene`).not.toBeNull();

        const manifestPath = join(APPS, appDir, "aura.assets.json");
        const manifest = existsSync(manifestPath)
          ? assetManifestLike(JSON.parse(readFileSync(manifestPath, "utf8")))
          : { assets: {} };
        const appLike = {
          scene: mounted.scene,
          diagnostics: () => ({ drawCalls: mounted.drawCalls })
        } as Parameters<typeof snapshotForAudit>[0];
        const snapshot = snapshotForAudit(appLike, manifest);

        const lint = lookLint(mounted.scene!, {
          devicePixelRatio: 1, tierCap: 3, production: true,
          capabilities: { ambientAdditive: true, effectsPixelBacked: [] }
        });
        const lintErrors = lint.filter((f) => f.severity === "error").map((f) => `lookLint ${f.code}: ${f.message}`);

        const direction = await importDirection(join(ROOT, entry.artDirection ?? ""));
        const violations = direction === undefined
          ? [`${appDir}: no art direction at ${entry.artDirection}`]
          : auditArtDirection(direction, snapshot, { drawCallsBudget: entry.budgets?.drawCalls?.high })
              .map((v) => `${v.rule}: ${v.message}`);

        expect.soft([...lintErrors, ...violations]).toEqual([]);
      } finally {
        server.close();
      }
    });
  }
});
