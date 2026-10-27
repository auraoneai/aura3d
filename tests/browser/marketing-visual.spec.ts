import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import sharp from "sharp";
import { test } from "@playwright/test";

/**
 * Visual check of the static marketing pages (docs/design/marketing-site-update.md). Remote only
 * (tools/remote-acr/run.sh, EXTRA_DIRS="marketing"): serves marketing/ the way Vite does (public/ at the root, /marketing/src/*
 * from the repo, the build-time {{TOKENS}} substituted from docs/workflows/game-inventory.json and the package inventory),
 * takes full-page screenshots at a desktop and a mobile width, and prints them plus layout metrics as base64 chunks in the log.
 * Software WebGL2 / CPU runner: this is a layout and copy check, not a performance measurement.
 */
// The remote image copies only a fixed set of directories, so the run stages a trimmed copy of marketing/ plus the game inventory and a
// tokens.json (package and template counts computed locally) under apps/mkt-stage-tmp (EXTRA_DIRS); locally the repo root is used.
const STAGED = "/repo/apps/mkt-stage-tmp";
const REPO = process.env.MARKETING_VISUAL_ROOT ?? (existsSync(join(STAGED, "marketing")) ? STAGED : "/repo");
const MARKETING = join(REPO, "marketing");
const PAGES = (process.env.MARKETING_VISUAL_PAGES ?? "/,/docs/aura3d-vs-threejs.html,/docs/index.html").split(",");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".txt": "text/plain"
};
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function tokens(html: string): string {
  const inventory = JSON.parse(readFileSync(join(REPO, "docs/workflows/game-inventory.json"), "utf8")) as { liveGameCount: number; games: Array<{ title: string; status: string }> };
  const live = inventory.games.filter((g) => g.status === "live");
  const featured = [...html.matchAll(/<h3 class="game-title">([^<]*)<\/h3>/g)].map((m) => (m[1] ?? "").replace(/&amp;/g, "&").trim());
  const others = live.map((g) => g.title).filter((t) => !featured.includes(t));
  const list = others.length <= 2 ? others.join(" and ") : `${others.slice(0, -1).join(", ")}, and ${others[others.length - 1]}`;
  const word = WORDS[featured.length] ?? String(featured.length);
  const staged = existsSync(join(REPO, "tokens.json")) ? (JSON.parse(readFileSync(join(REPO, "tokens.json"), "utf8")) as { packages: number; templates: number }) : null;
  let packages = 1;
  for (const dir of !staged && existsSync(join(REPO, "packages")) ? readdirSync(join(REPO, "packages")) : []) {
    const manifest = join(REPO, "packages", dir, "package.json");
    if (existsSync(manifest) && !JSON.parse(readFileSync(manifest, "utf8")).private) packages += 1;
  }
  const templatesDir = join(REPO, "packages/create-aura3d/templates");
  const templates = staged ? staged.templates : existsSync(templatesDir) ? readdirSync(templatesDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0;
  if (staged) packages = staged.packages;
  return html
    .replaceAll("{{GAME_COUNT}}", String(inventory.liveGameCount))
    .replaceAll("{{GAME_FEATURED_COUNT_WORD}}", word)
    .replaceAll("{{GAME_FEATURED_COUNT_WORD_CAP}}", word.charAt(0).toUpperCase() + word.slice(1))
    .replaceAll("{{GAME_OTHERS_COUNT}}", String(others.length))
    .replaceAll("{{GAME_OTHERS_LIST}}", list.replace(/&/g, "&amp;"))
    .replaceAll("{{PACKAGE_COUNT}}", String(packages))
    .replaceAll("{{TEMPLATE_COUNT}}", String(templates));
}

function serve(): Promise<{ server: Server; origin: string }> {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
      if (rel.endsWith("/")) rel += "index.html";
      const candidates = [join(MARKETING, "public", rel), join(MARKETING, rel), join(REPO, rel)];
      const file = candidates.find((c) => existsSync(c) && statSync(c).isFile() && resolve(c).startsWith(REPO));
      if (!file) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
      const type = MIME[extname(file)] ?? "application/octet-stream";
      if (extname(file) === ".html") {
        const body = Buffer.from(tokens(readFileSync(file, "utf8")));
        res.writeHead(200, { "content-type": type, "content-length": body.length, "cache-control": "no-store" });
        res.end(body);
        return;
      }
      res.writeHead(200, { "content-type": type, "content-length": statSync(file).size, "cache-control": "no-store" });
      createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      done({ server, origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}` });
    });
  });
}

const emit = (tag: string, b64: string): void => { for (let i = 0; i * 3000 < b64.length; i++) console.log(`${tag}:${i}:${b64.slice(i * 3000, (i + 1) * 3000)}`); };

test("marketing pages render at desktop and mobile widths", async ({ browser }) => {
  test.setTimeout(900_000);
  const { server, origin } = await serve();
  const metrics: Record<string, unknown> = {};
  try {
    for (const viewport of VIEWPORTS) {
      for (const path of PAGES) {
        const key = `${viewport.name}${path === "/" ? "-home" : path.replace(/[^a-z0-9]+/gi, "-")}`;
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const consoleErrors: string[] = [];
        const failed: string[] = [];
        page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
        page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
        page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
        try {
          await page.goto(`${origin}${path}`, { waitUntil: "load", timeout: 60_000 });
          await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
          await page.waitForTimeout(1200);
          const data = await page.evaluate(() => {
            const h1 = document.querySelector("h1");
            const body = document.body;
            const unresolved = (body.innerText.match(/\{\{[A-Z_]+\}\}/g) ?? []).slice(0, 5);
            const wide = [...document.querySelectorAll("body *")].filter((el) => (el as HTMLElement).scrollWidth > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed" && !(el as HTMLElement).closest("pre, .table-scroll, .code-body, .browser-table")).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`.slice(0, 80));
            const headingFonts = [...document.querySelectorAll("h1, h2")].slice(0, 6).map((el) => `${el.tagName}:${getComputedStyle(el).fontSize}/${getComputedStyle(el).fontWeight}`);
            return {
              title: document.title,
              h1: h1?.textContent?.trim().slice(0, 140) ?? null,
              h1Size: h1 ? getComputedStyle(h1).fontSize : null,
              docWidth: document.documentElement.scrollWidth,
              docHeight: document.documentElement.scrollHeight,
              unresolvedTokens: unresolved,
              overflowingElements: wide,
              headingFonts,
              fontFamilyBody: getComputedStyle(body).fontFamily.slice(0, 80)
            };
          });
          const png = await page.screenshot({ fullPage: true, type: "png" });
          const jpg = await sharp(png).jpeg({ quality: 72 }).toBuffer();
          metrics[key] = { path, viewport: viewport.name, ...data, consoleErrors: consoleErrors.slice(0, 6), failedRequests: failed.slice(0, 8), jpegBytes: jpg.length };
          console.log(`MKT_PAGE ${key}: h1="${data.h1}" ${data.h1Size} width=${data.docWidth}/${viewport.width} height=${data.docHeight} unresolved=${data.unresolvedTokens.length} overflow=${data.overflowingElements.length} errors=${consoleErrors.length} failed=${failed.length}`);
          console.log(`MKT_FRAME_BEGIN ${key}`);
          emit(`MKT_FRAME:${key}`, jpg.toString("base64"));
          console.log(`MKT_FRAME_END ${key}`);
        } catch (error) {
          metrics[key] = { path, viewport: viewport.name, error: String((error as Error)?.message ?? error).slice(0, 300), consoleErrors, failedRequests: failed };
          console.log(`MKT_PAGE ${key}: ERROR ${(metrics[key] as { error: string }).error}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    server.close();
  }
  console.log("MKT_RESULTS_BEGIN");
  emit("MKT_RESULTS", Buffer.from(JSON.stringify(metrics)).toString("base64"));
  console.log("MKT_RESULTS_END");
});
