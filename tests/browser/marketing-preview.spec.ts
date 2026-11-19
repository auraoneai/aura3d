import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { expect, test } from "@playwright/test";

interface StaticPreviewServer {
  readonly origin: string;
  close(): Promise<void>;
}

interface PreviewManifest {
  readonly status: string;
  readonly previews: readonly {
    readonly id: string;
    readonly target: string;
    readonly sha256: string;
  }[];
}

interface GalleryGame {
  title: string;
  url: string;
  previewSlug: string;
  guide: { heading: string; source: string };
}

const games = JSON.parse(readFileSync(resolve("tools/site/games.catalog.json"), "utf8")).games as GalleryGame[];
const manifest = JSON.parse(readFileSync(resolve("marketing/public/previews/final-preview-manifest.json"), "utf8")) as PreviewManifest;

test.describe("built marketing preview", () => {
  test.setTimeout(120_000);
  let server: StaticPreviewServer;

  test.beforeAll(async () => {
    const deployed = process.env.AURA3D_MARKETING_PREVIEW_URL;
    server = deployed
      ? { origin: new URL(deployed).origin, close: async () => {} }
      : await startStaticPreviewServer(resolve("marketing/dist"));
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("offers a working install command before loading the featured game on mobile", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
      if (response.url().startsWith(server.origin) && response.status() >= 400) errors.push(response.url());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.origin);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("[data-demo-frame]")).not.toHaveAttribute("src", /.+/);
    await expect(page.locator(".stage-poster")).toBeVisible();
    expect(await page.locator(".stage-poster").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.getByText("Install Aura3D", { exact: true }).first().click();
    await expect(page.locator("#scaffold-command")).toBeVisible();
    await expect(page.locator("#scaffold-command")).toContainText("--template product-viewer");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Inside the game", exact: true }).click();
    await expect(page).toHaveURL(/\/games\/the-bellkeepers-walk\/?$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Bellkeeper's Walk");
    await expect(page.getByRole("link", { name: "Read the implementation" })).toHaveAttribute("href", /camera-seq\.ts$/);
    await expect(page.locator("pre")).toContainText("npm run dev");
    expect(errors).toEqual([]);
  });

  test("compares the same scene in source and leads to a working project", async ({ page }) => {
    await page.goto(server.origin);
    await page.getByRole("link", { name: "Compare the implementations" }).click();
    await expect(page.getByRole("heading", { name: "Compare the scene files" })).toBeVisible();
    await expect(page.locator("pre").filter({ hasText: "import * as THREE" }).first()).toBeVisible();
    await expect(page.locator("pre").filter({ hasText: "createAuraApp(" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "How we measured" })).toBeVisible();
    await page.locator("a[href='/docs/agent-quickstart']").last().click();
    await expect(page.locator("pre").filter({ hasText: "--template product-viewer" }).first()).toContainText("npm install");
  });

  test("serves the retained preview files with their recorded hashes", async ({ request }) => {
    expect(manifest.previews.length).toBeGreaterThan(0);
    for (const preview of manifest.previews) {
      const publicPath = preview.target.replace(/^marketing\/public/, "");
      const response = await request.get(server.origin + publicPath);
      expect(response.status(), preview.id).toBe(200);
      expect(createHash("sha256").update(await response.body()).digest("hex"), preview.id).toBe(preview.sha256);
    }
  });

  test("links every game to a working capture, playable route and implementation guide", async ({ page, request }) => {
    await page.goto(server.origin + "/apps/showcase-index/");
    await expect(page.locator(".games-library .showcase-card")).toHaveCount(games.length);
    for (const game of games) {
      const card = page.locator("article.game").filter({ has: page.getByRole("heading", { name: game.title, exact: true }) });
      await expect(card.getByRole("link", { name: `Play ${game.title}`, exact: true }).first()).toHaveAttribute("href", game.url);
      const image = await card.locator("img").getAttribute("src");
      const capture = await request.get(server.origin + image);
      expect(capture.ok(), `${game.title} image`).toBe(true);
      expect((await capture.body()).subarray(8, 12).toString("ascii")).toBe("WEBP");
      const response = await request.get(server.origin + game.url);
      expect(response.status(), game.title).toBe(200);
      expect(await response.text()).toContain('type="module"');
      const guide = await card.getByRole("link", { name: `How ${game.title} was built` }).getAttribute("href");
      expect(guide).toMatch(/^\/games\//);
      const content = await request.get(server.origin + guide);
      expect(content.status(), `${game.title} guide`).toBe(200);
      const html = await content.text();
      expect(html).toContain(game.guide.source);
      expect(html).toContain(`href="${game.url}"`);
      expect(html).toContain("npm run dev");
    }
  });

  test("launches the featured game from the keyboard and returns focus when closed", async ({ page }) => {
    await page.goto(server.origin);
    const play = page.locator("[data-demo-play]");
    await play.focus();
    await play.press("Enter");
    const frame = page.frameLocator("[data-demo-frame]");
    await expect(frame.locator("canvas#world")).toBeVisible({ timeout: 60_000 });
    await expect(frame.locator("#loading")).toHaveClass(/hidden/, { timeout: 90_000 });
    await expect(frame.locator("#found")).toContainText("discovered");
    await page.getByRole("button", { name: "Close game" }).click();
    await expect(page.locator("[data-demo-frame]")).not.toHaveAttribute("src", /.+/);
    await expect(play).toBeFocused();
  });
});

async function startStaticPreviewServer(root: string): Promise<StaticPreviewServer> {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const relativePath = normalize(pathname).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
    let file = resolve(root, relativePath || "index.html");
    if (!file.startsWith(resolve(root))) {
      response.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) && !extname(file) && existsSync(file + ".html")) file += ".html";
    if (!existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": staticContentType(file), "cache-control": "no-store" });
    response.end(readFileSync(file));
  });
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Static preview server did not bind a TCP port.");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server)
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
}

function staticContentType(file: string): string {
  return ({
    ".css": "text/css; charset=utf-8",
    ".glb": "model/gltf-binary",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".wasm": "application/wasm",
    ".woff2": "font/woff2",
    ".webp": "image/webp"
  } as Record<string, string>)[extname(file)] ?? "application/octet-stream";
}
