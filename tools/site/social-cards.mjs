import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gameGuidePath } from "./game-guide.mjs";
import { interactiveExamples } from "./interactive-examples.mjs";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const sitePublic = join(root, "marketing/public");
const catalog = JSON.parse(readFileSync(join(root, "tools/site/games.catalog.json"), "utf8"));
const docFrames = {
  "agent-quickstart": "vesper-gt", "agent-rules": "top-tennis@2x", api: "relay-workcell",
  assets: "vesper-gt", "aura3d-vs-threejs": "vesper-gt", claims: "top-tennis@2x",
  claude: "where-the-wind-wanders-port@2x", cursor: "drift-and-deliver-port@2x",
  deployment: "roadster-rush@2x", evidence: "heatsink@2x", index: "ember-courier",
  "migration/4-to-5": "relay-workcell", "prompt-recipes": "ember-courier", templates: "serpentine-sky-run-port@2x",
};
const sceneLabels = { "ember-courier": "Character game", "vesper-gt": "Automotive studio", "relay-workcell": "Robotics simulation" };
const sceneSubjects = {
  "ember-courier": "an armored courier in a night-shift port",
  "vesper-gt": "a gloss oxblood grand touring coupe in a photography studio",
  "relay-workcell": "an industrial robot transferring a part",
};
const frame = (slug) => join(sitePublic, "previews/showcase-index", slug + ".webp");
const sceneImage = (slug) => join(sitePublic, "previews/showcase", slug + ".png");
const brandPath = "/store-assets/brand/social/";
const docs = readdirSync(join(root, "marketing/docs"), { recursive: true }).filter((p) => p.endsWith(".html")).sort();

export const cards = [
  { route: "/", file: "marketing/index.html", layout: "home", title: "Build playable 3D worlds.", label: "TypeScript 3D engine",
    output: brandPath + "og-1200x630.png", twitter: brandPath + "twitter-1200x630.png",
    frames: ["ember-courier", "vesper-gt", "relay-workcell"].map(sceneImage),
    alt: "Aura3D scenes showing an armored courier, the gloss oxblood Vesper GT and a six-axis industrial robot." },
  { route: "/apps/showcase-index/", file: "apps/showcase-index/index.html", layout: "play", title: "The games", label: "Playable collection",
    output: "/previews/social/games.jpg", frame: frame("top-tennis@2x"), alt: "Aura3D game gallery featuring two Aura Slam players on a grass court." },
  ...interactiveExamples.map(({ slug, title }) => ({
    route: "/apps/" + slug + "/", file: "apps/" + slug + "/index.html", layout: "play", title, label: sceneLabels[slug],
    frame: sceneImage(slug), output: "/previews/social/examples/" + slug + ".jpg", alt: title + " in Aura3D, showing " + sceneSubjects[slug] + ".",
  })),
  ...docs.map((file) => {
    const slug = file.slice(0, -5);
    const source = "marketing/docs/" + file;
    if (!docFrames[slug]) throw Error("Missing documentation social frame for " + source);
    const title = readFileSync(join(root, source), "utf8").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "");
    if (!title) throw Error("Missing documentation heading for " + source);
    const capture = docFrames[slug];
    const game = catalog.games.find((item) => item.previewSlug + "@2x" === capture);
    const subject = sceneSubjects[capture] || ("a frame from " + game.title);
    return { route: slug === "index" ? "/docs/" : "/docs/" + slug, file: source, layout: "article", title, label: "Developer documentation",
      frame: frame(capture), output: "/previews/docs/" + slug + ".jpg", alt: title + " — Aura3D documentation featuring " + subject + "." };
  }),
  ...catalog.games.flatMap((g) => {
    const guide = gameGuidePath(g);
    return [
      { route: g.url, file: "apps/" + g.appFolder + "/index.html", layout: "play", title: g.title, label: catalog.genres[g.genre],
        frame: frame(g.previewSlug + "@2x"), output: "/previews/social/play/" + g.previewSlug + ".jpg", alt: g.title + " gameplay captured in Aura3D. " + g.guide.summary },
      { route: guide, file: "marketing/public" + guide + "index.html", layout: "article", title: g.title, label: "Inside the game",
        frame: frame(g.previewSlug + "@2x"), output: "/previews/social/guides/" + g.previewSlug + ".jpg", alt: "Inside " + g.title + ", an Aura3D game. " + g.guide.summary },
    ];
  }),
];
const byRoute = new Map(cards.map((c) => [c.route, c]));
const hashes = new Map();
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function versioned(origin, path) {
  if (!hashes.has(path)) hashes.set(path, createHash("sha256").update(readFileSync(join(sitePublic, path))).digest("hex").slice(0, 12));
  return origin + path + "?v=" + hashes.get(path);
}

export function withBrandAssets(html) {
  return html.replace(/\b(src|href)=(["'])(\/(?:store-assets\/brand\/aura3d-logo(?:-light)?\.svg|fonts\/local\.css|games\/editorial\.css))(?:\?v=[\w.-]+)?\2/g,
    (_attribute, name, quote, path) => name + "=" + quote + versioned("", path) + quote);
}

/** Update share artwork only, preserving compiled scripts, editorial markup and other structured data. */
export function withSocialCard(html) {
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1];
  if (!canonical) return html;
  const url = new URL(canonical);
  const card = byRoute.get(url.pathname);
  if (!card) return html;
  const og = versioned(url.origin, card.output);
  const twitter = versioned(url.origin, card.twitter ?? card.output);
  const tag = (attribute, name, value) => '<meta ' + attribute + '="' + name + '" content="' + escape(value) + '" />';
  const type = card.output.endsWith(".png") ? "image/png" : "image/jpeg";
  const imageTags = [
    tag("property", "og:image", og), tag("property", "og:image:width", "1200"), tag("property", "og:image:height", "630"),
    tag("property", "og:image:type", type), tag("property", "og:image:alt", card.alt),
    tag("name", "twitter:image", twitter), tag("name", "twitter:image:alt", card.alt),
  ].join("");
  return withBrandAssets(html).replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, (head) => {
    // Stable filenames remain available for direct requests, while returning browsers see new art immediately.
    let withIcons = head.replace(/<link\b[^>]+\brel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>/gi, (link) =>
      link.replace(/href=(["'])(?:https:\/\/aura3d\.auraone\.ai)?(\/(?:favicon\.(?:svg|ico)|apple-touch-icon\.png))(?:\?[^"']*)?\1/i,
        (_href, quote, path) => "href=" + quote + versioned("", path) + quote));
    if (!/<link\b[^>]+\brel=["'](?:shortcut icon|icon)["']/i.test(withIcons)) {
      withIcons = withIcons.replace("</head>", '<link rel="icon" type="image/svg+xml" href="' + versioned("", "/favicon.svg") + '" />\n</head>');
    }
    const cleaned = withIcons.replace(/<meta\s+(?:property|name)=["'](?:og|twitter):image(?::[\w-]+)?["'][^>]*>/gi, "").replace(/^[ \t]+$/gm, "");
    return cleaned.replace(/<meta\s+name=["']twitter:card["'][^>]*>/i, (match) => imageTags + match)
      .replace(/(<script\s+type=["']application\/ld\+json["']>)([\s\S]*?)(<\/script>)/gi, (full, open, data, close) => {
        const value = JSON.parse(data);
        if (!["WebPage", "TechArticle", "WebApplication", "SoftwareApplication", "VideoGame", "CollectionPage"].includes(value["@type"])) return full;
        if (value.image === og) return full;
        value.image = og;
        return open + JSON.stringify(value, null, data.includes("\n") ? 2 : undefined).replaceAll("<", "\\u003c") + close;
      });
  });
}
