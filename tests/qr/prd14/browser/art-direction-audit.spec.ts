import { expect, test, type Page } from "@playwright/test";
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
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

const ROOT = join(__dirname, "..", "..", "..", "..");
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
  // Rooted at `dir`: resolve+realpath the request so `..` segments and sibling
  // prefixes ("/apps/foo" vs "/apps/foo-bar") cannot escape the build dir.
  const root = realpathSync(resolve(dir));
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if ((!file.startsWith(root + sep) && file !== root) || !existsSync(file)) {
      res.writeHead(404); res.end("not found"); return;
    }
    try {
      const real = realpathSync(file);
      if (!real.startsWith(root + sep) && real !== root) {
        res.writeHead(404); res.end("not found"); return;
      }
    } catch {
      res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
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
  readonly dir?: string;
  readonly qrFlags?: readonly string[];
  readonly artDirection?: string;
  readonly budgets?: { readonly drawCalls?: Record<string, number> };
}

function routeEntries(): readonly { appDir: string; entry: GamesEntry }[] {
  const games = (JSON.parse(readFileSync(GAMES_JSON, "utf8")) as { games: GamesEntry[] }).games;
  const wanted = (process.env.A3D_QR_ROUTES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return games
    .filter((g) => {
      const dir = g.dir ?? g.id;
      const hasV2 = existsSync(join(APPS, dir, "src", "v2"));
      return hasV2 && (wanted.length === 0 || wanted.includes(dir) || wanted.includes(g.id));
    })
    .map((entry) => ({ appDir: entry.dir ?? entry.id, entry }));
}

function routeFlagShort(entry: GamesEntry): string | undefined {
  const flag = (entry.qrFlags ?? []).find((f) => /^A3D_QR_ROUTE_/.test(f));
  return flag === undefined ? undefined : `route-${flag.replace("A3D_QR_ROUTE_", "").toLowerCase().replace(/_/g, "-")}`;
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
  // Empty when no apps/*/src/v2 tree exists (wave ports not landed): the
  // describe registers no tests and the suite stays green until T2.x.
  const routes = routeEntries();

  for (const { appDir, entry } of routes) {
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
        const flag = routeFlagShort(entry);
        await page.goto(`${url}/?a3d-qr=${flag ?? "all"}`);
        await expect.poll(async () => page.evaluate(() => Boolean((window as { __AURA3D_GAME__?: unknown }).__AURA3D_GAME__))).toBe(true);

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
