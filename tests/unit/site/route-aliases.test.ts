import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error This build-only .mjs script has no declaration file.
import { buildCatalogRouteAliases } from "../../../marketing/scripts/build-showcase-routes.mjs";
// @ts-expect-error This build-only .mjs script has no declaration file.
import { rewriteBuiltAuraAssetUrls } from "../../../marketing/scripts/showcase-cdn-assets.mjs";
// @ts-expect-error This pure .mjs build helper has no declaration file.
import { catalogRouteAliases, planAliasRedirects } from "../../../tools/site/route-aliases.mjs";

const schema = "aura3d-site-games-catalog/1";
const old = "showcase-example-port";
const pretty = "example-game";
const oldUrl = `/apps/${old}/`;
const prettyUrl = `/apps/${pretty}/`;
const game = { appFolder: old, url: prettyUrl };
const unchanged = { appFolder: "showcase-other", url: "/apps/showcase-other/" };
const routes = [old, unchanged.appFolder, "showcase-index"];
const catalog = () => ({ schema, games: [{ ...game }, { ...unchanged }] });
const userRedirects = `# User-owned redirects\r\n${oldUrl.slice(0, -1)} ${prettyUrl} 301\r\n${oldUrl} ${prettyUrl} 301\r\n`;
const html = `<!doctype html><html><head><link rel="stylesheet" href="./fonts/game.css"></head><body><script type="module" src="/assets/game-a1b2.js"></script></body></html>\n`;
const css = '@font-face { font-family: Game; src: url("./game.woff2?rev=2"); }\n';

let temp: string;
let root: string;
let dist: string;

function write(file: string, data: string | Buffer) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

function build(overrides: Record<string, unknown> = {}) {
  return buildCatalogRouteAliases({
    catalog: catalog(), routes, reservedRoutes: ["retired-route"], rootDir: root, outDir: dist, ...overrides
  });
}

function output(file: string) {
  return readFileSync(join(dist, file), "utf8");
}

// Models the relevant Pages rules without opening a socket or making claims
// about the live provider. Asset rewrites are one internal hop; old 301s keep
// the original query in this model. Edge behavior is verified separately.
function modelRequest(input: string, text: string) {
  let url = new URL(input, "https://fixture.invalid");
  const rules = text.split(/\r?\n/).filter((line) => line && !line.startsWith("#"))
    .map((line) => line.trim().split(/\s+/));
  const visited: string[] = [];
  for (let step = 0; step < 6; step++) {
    const current = `${url.pathname}${url.search}`;
    if (visited.includes(current)) throw new Error(`redirect loop: ${current}`);
    visited.push(current);
    let matching: { destination: string; status: string } | undefined;
    for (const [from, to, status = "302"] of rules) {
      if (from.endsWith("/*")) {
        const prefix = from.slice(0, -1);
        if (!url.pathname.startsWith(prefix)) continue;
        matching = { destination: to.replace(":splat", url.pathname.slice(prefix.length)), status };
      } else if (from === url.pathname) {
        matching = { destination: to, status };
      }
      if (matching) break;
    }
    if (!matching) {
      const pathname = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
      return { visible: `${url.pathname}${url.search}`, target: `${pathname}${url.search}`, visited };
    }
    if (matching.status === "200") {
      return { visible: `${url.pathname}${url.search}`, target: `${matching.destination}${url.search}`, visited };
    }
    const search = url.search;
    url = new URL(matching.destination, url);
    if (!url.search) url.search = search;
  }
  throw new Error("too many redirects");
}

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), "aura3d-route-alias-test-"));
  root = join(temp, "repo");
  dist = join(temp, "dist");
  write(join(root, "apps", old, "index.html"), "<html>unbuilt source</html>");
  write(join(root, "apps", unchanged.appFolder, "index.html"), "<html>other source</html>");
  write(join(root, "apps", old, "public", "fonts", "game.css"), css);
  write(join(root, "apps", old, "public", "fonts", "game.woff2"), Buffer.from("synthetic-font"));
  // A top-level public file was not copied by the old build script.
  write(join(root, "apps", old, "public", "settings.json"), '{"mode":"original"}\n');
  write(join(root, "marketing", "public", "_redirects"), userRedirects);
  write(join(dist, "apps", old, "index.html"), html);
  write(join(dist, "apps", old, "fonts", "game.css"), css);
  write(join(dist, "apps", old, "fonts", "game.woff2"), Buffer.from("synthetic-font"));
  write(join(dist, "apps", old, "route-health.json"), '{"ok":true}\n');
  write(join(dist, "apps", unchanged.appFolder, "index.html"), "<html>other built route</html>");
  write(join(dist, "assets", "game-a1b2.js"), "export const game = true;\n");
  write(join(dist, "_redirects"), userRedirects);
});

afterEach(() => rmSync(temp, { recursive: true, force: true }));

describe("catalog-driven showcase route aliases", () => {
  it("copies only the built HTML and maps local assets without copying their directories", () => {
    const aliases = build();
    expect(aliases).toEqual([{ appFolder: old, slug: pretty, url: prettyUrl, sourceUrl: oldUrl }]);
    expect(output(`apps/${pretty}/index.html`)).toBe(html);
    expect(output(`apps/${old}/index.html`)).toBe(html);
    expect(readdirSync(join(dist, "apps", pretty))).toEqual(["index.html"]);
    expect(output(`apps/${old}/settings.json`)).toBe('{"mode":"original"}\n');
    expect(output("assets/game-a1b2.js")).toBe("export const game = true;\n");

    const redirects = output("_redirects");
    expect(redirects.startsWith(userRedirects)).toBe(true);
    expect(redirects).toContain(`${prettyUrl}fonts/* ${oldUrl}fonts/:splat 200`);
    expect(redirects).toContain(`${prettyUrl}settings.json ${oldUrl}settings.json 200`);
    expect(redirects).toContain(`${prettyUrl}route-health.json ${oldUrl}route-health.json 200`);
    expect(redirects).not.toContain(`${prettyUrl}* ${oldUrl}:splat`);
    expect(readFileSync(join(root, "marketing/public/_redirects"), "utf8")).toBe(userRedirects);
    expect(output(`apps/${unchanged.appFolder}/index.html`)).toBe("<html>other built route</html>");
  });

  it("keeps multiple aliases and their identically named public directories isolated", () => {
    const second = { appFolder: "showcase-second-port", url: "/apps/second-game/" };
    const secondHtml = html.replace("game-a1b2.js", "second-b2c3.js");
    write(join(root, "apps", second.appFolder, "index.html"), "<html>second source</html>");
    write(join(root, "apps", second.appFolder, "public", "fonts", "game.css"), "second game font");
    write(join(dist, "apps", second.appFolder, "index.html"), secondHtml);
    write(join(dist, "apps", second.appFolder, "fonts", "game.css"), "second game font");
    write(join(dist, "assets", "second-b2c3.js"), "export const second = true;\n");
    build({ catalog: { schema, games: [game, second, unchanged] }, routes: [...routes, second.appFolder] });
    expect(output(`apps/${pretty}/index.html`)).toBe(html);
    expect(output("apps/second-game/index.html")).toBe(secondHtml);
    const redirects = output("_redirects");
    expect(modelRequest(`${prettyUrl}fonts/game.css`, redirects).target).toBe(`${oldUrl}fonts/game.css`);
    expect(modelRequest("/apps/second-game/fonts/game.css", redirects).target)
      .toBe("/apps/showcase-second-port/fonts/game.css");
    expect(output("apps/showcase-second-port/fonts/game.css")).toBe("second game font");
    expect(output(`apps/${old}/fonts/game.css`)).toBe(css);
    expect(readdirSync(join(dist, "apps", "second-game"))).toEqual(["index.html"]);
  });

  it("models query-preserving canonical, legacy, relative font and root bundle requests without loops", () => {
    build();
    const redirects = output("_redirects");
    const query = "?look=original&seed=47&label=a%2Bb";
    const canonical = modelRequest(`${prettyUrl}${query}`, redirects);
    expect(canonical.visible).toBe(`${prettyUrl}${query}`);
    expect(canonical.target).toBe(`${prettyUrl}index.html${query}`);
    expect(canonical.visited).toHaveLength(1);

    const legacy = modelRequest(`${oldUrl}${query}`, redirects);
    expect(legacy.visible).toBe(`${prettyUrl}${query}`);
    expect(legacy.target).toBe(`${prettyUrl}index.html${query}`);
    expect(legacy.visited).toEqual([`${oldUrl}${query}`, `${prettyUrl}${query}`]);

    const cssUrl = new URL("./fonts/game.css?v=3", `https://fixture.invalid${prettyUrl}${query}`);
    const cssRequest = modelRequest(cssUrl.href, redirects);
    expect(cssRequest.target).toBe(`${oldUrl}fonts/game.css?v=3`);
    expect(output(cssRequest.target.split("?")[0].slice(1))).toBe(css);
    const fontUrl = new URL("./game.woff2?rev=2", cssUrl);
    const fontRequest = modelRequest(fontUrl.href, redirects);
    expect(fontRequest.target).toBe(`${oldUrl}fonts/game.woff2?rev=2`);
    expect(output(fontRequest.target.split("?")[0].slice(1))).toBe("synthetic-font");
    expect(modelRequest("/assets/game-a1b2.js?v=4", redirects).target).toBe("/assets/game-a1b2.js?v=4");
    expect(output("assets/game-a1b2.js")).toContain("game = true");
  });

  it("keeps the old route directly available when there is no user redirect file", () => {
    rmSync(join(dist, "_redirects"));
    rmSync(join(root, "marketing/public/_redirects"));
    build();
    const redirects = output("_redirects");
    expect(modelRequest(`${oldUrl}?seed=1`, redirects).target).toBe(`${oldUrl}index.html?seed=1`);
    expect(output(`apps/${old}/index.html`)).toBe(html);
    expect(modelRequest(`${prettyUrl}?seed=1`, redirects).target).toBe(`${prettyUrl}index.html?seed=1`);
  });

  it("is idempotent and refreshes a previous alias after a source rebuild", () => {
    build();
    const first = output("_redirects");
    build();
    expect(output("_redirects")).toBe(first);
    expect(first.match(/# BEGIN AURA3D CATALOG ROUTE ALIASES/g)).toHaveLength(1);
    write(join(dist, "apps", old, "index.html"), `${html}<!-- rebuilt -->\n`);
    build();
    expect(output(`apps/${pretty}/index.html`)).toBe(`${html}<!-- rebuilt -->\n`);
    expect(output("_redirects")).toBe(first);
    expect(readFileSync(join(root, "marketing/public/_redirects"), "utf8")).toBe(userRedirects);
  });

  it("keeps both HTML copies and root hashed bundles synchronized during optional CDN rewriting", () => {
    const cdnHtml = html.replace("</body>", '<img src="/aura-assets/hero.glb"></body>');
    write(join(dist, "apps", old, "index.html"), cdnHtml);
    write(join(dist, "assets", "game-a1b2.js"), 'export const model = "/aura-assets/hero.glb";\n');
    build();
    rewriteBuiltAuraAssetUrls(dist, "https://assets.invalid/aura-assets");
    const source = output(`apps/${old}/index.html`);
    expect(output(`apps/${pretty}/index.html`)).toBe(source);
    expect(source).toContain("https://assets.invalid/aura-assets/hero.glb");
    const bundle = /\/assets\/(game-a1b2-cdn-[a-f0-9]+\.js)/.exec(source)?.[1];
    expect(bundle).toBeDefined();
    expect(output(`assets/${bundle}`)).toContain("https://assets.invalid/aura-assets/hero.glb");
  });

  it("deduplicates an existing shared route-local aura-assets tree and fails if it differs", () => {
    const src = join(root, "apps", old, "public", "aura-assets", "hero.glb");
    const shared = join(dist, "aura-assets", "hero.glb");
    write(src, Buffer.from("synthetic-model"));
    write(shared, Buffer.from("wrong-model"));
    expect(() => build()).toThrow(/Shared Aura asset collision/);
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
    copyFileSync(src, shared);
    build();
    expect(output("_redirects")).toContain(`${prettyUrl}aura-assets/* /aura-assets/:splat 200`);
    expect(existsSync(join(dist, "apps", pretty, "aura-assets"))).toBe(false);
    expect(existsSync(join(dist, "apps", old, "aura-assets"))).toBe(false);
  });

  it("fails rather than advertising an unavailable shared Aura asset", () => {
    write(join(root, "apps", old, "public", "aura-assets", "hero.glb"), "synthetic-model");
    expect(() => build()).toThrow(/Shared Aura assets.*missing.*CDN-only builds/);
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
  });

  it("does not overwrite a pre-existing alias route or partially copy its public files", () => {
    const collision = join(dist, "apps", pretty, "index.html");
    write(collision, "<html>someone else's route</html>");
    expect(() => build()).toThrow(/collides with existing build output/);
    expect(readFileSync(collision, "utf8")).toBe("<html>someone else's route</html>");
    expect(output("_redirects")).toBe(userRedirects);
    expect(existsSync(join(dist, "apps", old, "settings.json"))).toBe(false);
  });

  it("rejects missing built HTML and missing nested public assets before producing aliases", () => {
    const builtHtml = join(dist, "apps", old, "index.html");
    rmSync(builtHtml);
    expect(() => build()).toThrow(/Missing or unsafe built source HTML/);
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
    write(builtHtml, html);
    rmSync(join(dist, "apps", old, "fonts", "game.woff2"));
    expect(() => build()).toThrow(/Missing or unsafe built public asset/);
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
    expect(output("_redirects")).toBe(userRedirects);
  });

  it("rejects missing or unsafe root hashed bundle references in built HTML", () => {
    rmSync(join(dist, "assets", "game-a1b2.js"));
    expect(() => build()).toThrow(/Missing or unsafe built root asset/);
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
    write(join(dist, "assets", "game-a1b2.js"), "export const game = true;\n");
    write(join(dist, "apps", old, "index.html"), html.replace("/assets/game-a1b2.js", "/assets/../escape.js"));
    expect(() => build()).toThrow(/Unsafe route-local asset path segment/);
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
  });

  it("rejects a colliding top-level public file rather than replacing a built file", () => {
    write(join(dist, "apps", old, "settings.json"), '{"different":true}\n');
    expect(() => build()).toThrow(/Route public file collides/);
    expect(output(`apps/${old}/settings.json`)).toBe('{"different":true}\n');
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
  });

  it("rejects stale generated mappings and unexpected files on incremental runs", () => {
    build();
    const redirects = output("_redirects");
    const changed = { schema, games: [{ ...game, url: "/apps/renamed-game/" }, unchanged] };
    expect(() => build({ catalog: changed })).toThrow(/Stale generated alias/);
    expect(output("_redirects")).toBe(redirects);
    write(join(dist, "apps", pretty, "user-owned.txt"), "do not overwrite");
    expect(() => build()).toThrow(/unexpected build output/);
    expect(output(`apps/${pretty}/user-owned.txt`)).toBe("do not overwrite");
  });

  it.each([
    "/apps/../../escape/",
    "/apps/%2e%2e/",
    "/apps//",
    "/apps/example-game",
    "/apps/example-game/?look=original",
    "/apps/example-game/#fragment",
    "/apps/example\\game/",
    "https://example.invalid/apps/example-game/",
    "/apps/Example-Game/"
  ])("rejects unsafe catalog URL %s", (url) => {
    const bad = { schema, games: [{ ...game, url }] };
    expect(() => build({ catalog: bad })).toThrow(/Unsafe/);
    expect(output("_redirects")).toBe(userRedirects);
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
  });

  it("rejects unsafe folders, duplicate URLs/folders and aliases colliding with other routes", () => {
    expect(() => build({ catalog: { schema, games: [{ ...game, appFolder: "../escape" }] } })).toThrow(/Unsafe/);
    expect(() => build({ catalog: { schema, games: [game, { ...game, url: "/apps/another/" }] } })).toThrow(/Duplicate catalog appFolder/);
    expect(() => build({ catalog: { schema, games: [game, { ...unchanged, url: prettyUrl }] } })).toThrow(/Duplicate catalog URL/);
    expect(() => build({ catalog: { schema, games: [{ ...game, url: "/apps/showcase-index/" }] } })).toThrow(/collides with a built or reserved route/);
    expect(() => build({ catalog: { schema, games: [{ ...game, url: "/apps/retired-route/" }] } })).toThrow(/collides with a built or reserved route/);
    expect(() => build({ routes: [unchanged.appFolder] })).toThrow(/not a public built route/);
    expect(() => build({ routes: [old, old] })).toThrow(/Duplicate public route/);
  });

  it("rejects unsafe public path segments and symlinks without following them", () => {
    write(join(root, "apps", old, "public", "fonts", "bad name.css"), "bad");
    write(join(dist, "apps", old, "fonts", "bad name.css"), "bad");
    expect(() => build()).toThrow(/Unsafe route-local asset path segment/);
    rmSync(join(root, "apps", old, "public", "fonts", "bad name.css"));
    rmSync(join(dist, "apps", old, "fonts", "bad name.css"));
    symlinkSync("game.css", join(root, "apps", old, "public", "fonts", "link.css"));
    expect(() => build()).toThrow(/symlinks are not supported/);
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
  });

  it("rejects symlink destinations and a symlinked output _redirects", () => {
    const canary = join(temp, "canary");
    mkdirSync(canary);
    symlinkSync(canary, join(dist, "apps", pretty), "dir");
    expect(() => build()).toThrow(/collides with existing build output/);
    expect(readdirSync(canary)).toEqual([]);
    rmSync(join(dist, "apps", pretty));
    rmSync(join(dist, "_redirects"));
    symlinkSync(join(root, "marketing/public/_redirects"), join(dist, "_redirects"));
    expect(() => build()).toThrow(/Unsafe build _redirects/);
    expect(readFileSync(join(root, "marketing/public/_redirects"), "utf8")).toBe(userRedirects);
  });

  it.each([
    `${prettyUrl} ${oldUrl} 301`,
    `${prettyUrl}* ${oldUrl}:splat 200`,
    `${oldUrl}* ${prettyUrl} 301`,
    `${oldUrl}index.html ${prettyUrl} 301`,
    `${oldUrl} /apps/wrong-game/ 301`,
    "/apps/:route/* /somewhere/:splat 200"
  ])("rejects existing rules that would shadow, redirect or loop an alias: %s", (rule) => {
    write(join(dist, "_redirects"), `${rule}\n`);
    expect(() => build()).toThrow(/conflicts/);
    expect(output("_redirects")).toBe(`${rule}\n`);
    expect(existsSync(join(dist, "apps", pretty))).toBe(false);
  });

  it("rejects malformed managed blocks, duplicate rules and excessive dynamic rewrites", () => {
    write(join(dist, "_redirects"), "# BEGIN AURA3D CATALOG ROUTE ALIASES\n");
    expect(() => build()).toThrow(/Malformed or duplicate generated alias block/);
    write(join(dist, "_redirects"), "/unrelated /first 301\n/unrelated /second 301\n");
    expect(() => build()).toThrow(/Duplicate _redirects source/);
    const aliases = catalogRouteAliases(catalog(), routes);
    const entries = Array.from({ length: 101 }, (_, i) => ({ name: `dir-${i}`, kind: "directory" }));
    expect(() => planAliasRedirects(aliases, new Map([[old, entries]]))).toThrow(/rule limit exceeded/);
  });

  it("derives the real alias set from the catalog and existing public-route declaration", () => {
    const project = process.cwd();
    const realCatalog = JSON.parse(readFileSync(resolve(project, "tools/site/games.catalog.json"), "utf8"));
    const source = readFileSync(resolve(project, "marketing/scripts/build-showcase-routes.mjs"), "utf8");
    const list = (name: string) => {
      const body = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))?.[1] ?? "";
      return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    };
    const aliases = catalogRouteAliases(realCatalog, list("showcaseRoutes"), [
      ...list("retiredPrototypeRoutes"), ...list("supersededPublicRoutes"), "aura-clash"
    ]);
    const expected = realCatalog.games.filter((entry: typeof game) => entry.url !== `/apps/${entry.appFolder}/`);
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.map((entry: typeof game) => [entry.appFolder, entry.url]))
      .toEqual(expected.map((entry: typeof game) => [entry.appFolder, entry.url]));
  });
});
