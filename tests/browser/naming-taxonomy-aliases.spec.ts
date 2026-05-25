import { expect, test, type APIRequestContext } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer as createNetServer } from "node:net";
import {
  ADVANCED_GALLERY_CONTEXTUAL_ROUTE,
  ADVANCED_GALLERY_LEGACY_ROUTE,
  CONTEXTUAL_ROUTE_ALIASES
} from "../../tools/naming-taxonomy/contextualAliases";

interface ViteDevServer {
  readonly origin: string;
  close(): Promise<void>;
}

const ROUTE_ALIAS_PAIRS = [
  [ADVANCED_GALLERY_CONTEXTUAL_ROUTE, ADVANCED_GALLERY_LEGACY_ROUTE],
  ["/apps/flagship-viewer/", "/apps/v8-flagship-viewer/"],
  ["/apps/character-viewer/", "/apps/v6-character-viewer/"],
  ["/apps/regression-animation-keyframes/", "/apps/v7-animation-keyframes/"],
  ["/apps/public-scene/", "/apps/v9-public-scene/"],
  ["/apps/common/src/styles.css", "/apps/v6-common/src/styles.css"]
] as const;

const FIXTURE_ALIAS_PAIRS = [
  ["/fixtures/asset-corpus/damaged-helmet.glb", "/fixtures/v6/assets/corpus/damaged-helmet.glb"],
  ["/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", "/fixtures/v6/environments/hdri/studio_small_08_1k.hdr"],
  ["/fixtures/threejs-parity/assets/vehicles/car-concept.glb", "/fixtures/v8/assets/vehicles/car-concept.glb"],
  ["/fixtures/advanced-gallery/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb", "/fixtures/v9/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb"],
  ["/fixtures/advanced-gallery/environments/hdri/data_galaxy_deep_space_1k.hdr", "/fixtures/v9/environments/hdri/data_galaxy_deep_space_1k.hdr"]
] as const;

test.describe("naming taxonomy browser aliases", () => {
  let server: ViteDevServer;

  test.beforeAll(async () => {
    server = await startViteDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("serves contextual and legacy browser routes through the same Vite app", async ({ page, request }) => {
    await page.goto(`${server.origin}/`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`[data-route-path="${ADVANCED_GALLERY_CONTEXTUAL_ROUTE}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-route-path^="/apps/v"]`)).toHaveCount(0);
    await expect(page.locator(`a[href*="/apps/v"]`)).toHaveCount(0);

    for (const [contextualPath, legacyPath] of ROUTE_ALIAS_PAIRS) {
      expect(CONTEXTUAL_ROUTE_ALIASES.some((alias) =>
        (contextualPath === alias.contextual || contextualPath.startsWith(alias.contextual))
        && (legacyPath === alias.legacy || legacyPath.startsWith(alias.legacy))
      ), contextualPath).toBe(true);

      const contextual = await request.get(`${server.origin}${contextualPath}`);
      const legacy = await request.get(`${server.origin}${legacyPath}`);
      expect(contextual.status(), contextualPath).toBe(200);
      expect(legacy.status(), legacyPath).toBe(200);
      expect(await contextual.text(), contextualPath).toBe(await legacy.text());
    }

    const contextualModule = await request.get(`${server.origin}${ADVANCED_GALLERY_CONTEXTUAL_ROUTE}src/main.ts`);
    const legacyModule = await request.get(`${server.origin}${ADVANCED_GALLERY_LEGACY_ROUTE}src/main.ts`);
    expect(contextualModule.status()).toBe(200);
    expect(legacyModule.status()).toBe(200);
  });

  test("serves contextual and legacy fixture URLs as the same bytes", async ({ request }) => {
    for (const [contextualPath, legacyPath] of FIXTURE_ALIAS_PAIRS) {
      const contextual = await responseBody(request, `${server.origin}${contextualPath}`);
      const legacy = await responseBody(request, `${server.origin}${legacyPath}`);
      expect(contextual.length, contextualPath).toBeGreaterThan(128);
      expect(sha256(contextual), contextualPath).toBe(sha256(legacy));
    }
  });
});

async function responseBody(request: APIRequestContext, url: string): Promise<Buffer> {
  const response = await request.get(url);
  expect(response.status(), url).toBe(200);
  return response.body();
}

async function startViteDevServer(): Promise<ViteDevServer> {
  const port = await resolveVitePort();
  const child = spawn("pnpm", [
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_FORCE_HMR_DISABLED: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForViteReady(child, port);
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => closeVite(child)
  };
}

async function resolveVitePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 5198;
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(port);
      });
    });
  });
}

function waitForViteReady(child: ChildProcessWithoutNullStreams, port: number): Promise<void> {
  return new Promise((resolveReady, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for Vite test server on ${port}.\n${output}`));
    }, 20_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes(`http://127.0.0.1:${port}/`)) {
        clearTimeout(timeout);
        cleanup();
        resolveReady();
      }
    };
    const onExit = (code: number | null): void => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Vite test server exited with code ${code}.\n${output}`));
    };
    const cleanup = (): void => {
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

function closeVite(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolveClose) => {
    if (child.exitCode !== null) {
      resolveClose();
      return;
    }
    child.once("exit", () => resolveClose());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveClose();
    }, 500).unref();
  });
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
