// Pure planning for the marketing build. The catalog owns canonical URLs; the
// build supplies the actual route-local entries that need Cloudflare rewrites.
const ROUTE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_SEGMENT = /^[A-Za-z0-9_~@-][A-Za-z0-9._~@-]*$/;
const BEGIN = "# BEGIN AURA3D CATALOG ROUTE ALIASES";
const END = "# END AURA3D CATALOG ROUTE ALIASES";

function routeSegment(value, label) {
  if (typeof value !== "string" || value.length > 128 || !ROUTE_SEGMENT.test(value)) {
    throw new Error(`Unsafe ${label}: ${JSON.stringify(value)}`);
  }
  return value;
}

function catalogUrl(value) {
  if (typeof value !== "string") throw new Error(`Unsafe catalog URL: ${JSON.stringify(value)}`);
  const match = /^\/apps\/([^/]+)\/$/.exec(value);
  if (!match) throw new Error(`Unsafe catalog URL: ${JSON.stringify(value)}`);
  routeSegment(match[1], "catalog URL");
  return match[1];
}

export function assertSafeAssetSegment(value) {
  if (typeof value !== "string" || value.length > 200 || !ASSET_SEGMENT.test(value)) {
    throw new Error(`Unsafe route-local asset path segment: ${JSON.stringify(value)}`);
  }
}

export function catalogRouteAliases(catalog, publicRoutes, reservedRoutes = []) {
  if (catalog?.schema !== "aura3d-site-games-catalog/1" || !Array.isArray(catalog.games) || !catalog.games.length) {
    throw new Error("Invalid or empty site games catalog");
  }
  if (!Array.isArray(publicRoutes) || !Array.isArray(reservedRoutes)) {
    throw new Error("Public and reserved routes must be arrays");
  }
  const publicNames = new Set();
  for (const route of publicRoutes) {
    routeSegment(route, "public route");
    if (publicNames.has(route)) throw new Error(`Duplicate public route: ${route}`);
    publicNames.add(route);
  }
  const reservedNames = new Set(reservedRoutes.map((route) => routeSegment(route, "reserved route")));
  const folders = new Set();
  const urls = new Set();
  const aliases = [];
  for (const game of catalog.games) {
    const folder = routeSegment(game?.appFolder, "catalog appFolder");
    const slug = catalogUrl(game?.url);
    if (folders.has(folder)) throw new Error(`Duplicate catalog appFolder: ${folder}`);
    if (urls.has(game.url)) throw new Error(`Duplicate catalog URL: ${game.url}`);
    if (!publicNames.has(folder)) throw new Error(`Catalog appFolder is not a public built route: ${folder}`);
    folders.add(folder);
    urls.add(game.url);
    if (slug !== folder) aliases.push({ appFolder: folder, slug, url: game.url, sourceUrl: `/apps/${folder}/` });
  }
  for (const alias of aliases) {
    if (publicNames.has(alias.slug) || reservedNames.has(alias.slug)) {
      throw new Error(`Catalog alias collides with a built or reserved route: ${alias.url}`);
    }
  }
  return aliases;
}

function stripManagedBlock(text) {
  if (typeof text !== "string") throw new Error("Existing _redirects must be text");
  const lines = text.split("\n");
  const bare = lines.map((line) => line.replace(/\r$/, ""));
  const begins = bare.flatMap((line, i) => line === BEGIN ? [i] : []);
  const ends = bare.flatMap((line, i) => line === END ? [i] : []);
  if (!begins.length && !ends.length) return { base: text, previous: new Map() };
  if (begins.length !== 1 || ends.length !== 1 || begins[0] >= ends[0]) {
    throw new Error("Malformed or duplicate generated alias block in _redirects");
  }
  const previous = new Map();
  for (const line of bare.slice(begins[0] + 1, ends[0])) {
    if (line.startsWith("# alias ")) {
      const match = /^# alias (\S+) (\S+)$/.exec(line);
      if (!match) throw new Error("Malformed alias ownership marker in _redirects");
      catalogUrl(match[1]);
      catalogUrl(match[2]);
      if (match[1] === match[2] || previous.has(match[1])) {
        throw new Error(`Duplicate or invalid alias ownership marker: ${match[1]}`);
      }
      previous.set(match[1], match[2]);
    } else if (line && !line.startsWith("#") && !/^\S+\s+\S+\s+200$/.test(line)) {
      throw new Error("Malformed generated alias rule in _redirects");
    }
  }
  const before = lines.slice(0, begins[0]).join("\n");
  const after = lines.slice(ends[0] + 1).join("\n");
  return { base: before ? `${before}\n${after}` : after, previous };
}

function redirectPattern(source) {
  if (!source.startsWith("/") || source.startsWith("//") || /[\\?#%]/.test(source)) {
    throw new Error(`Unsafe or unsupported _redirects source: ${source}`);
  }
  const segments = source.slice(1).split("/");
  if (segments.at(-1) === "") segments.pop();
  for (let i = 0; i < segments.length; i++) {
    const part = segments[i];
    if (part === "*" && i === segments.length - 1) continue;
    if (/^:[A-Za-z][A-Za-z0-9_]*$/.test(part)) continue;
    if (!/^[A-Za-z0-9._~@-]+$/.test(part) || part === "." || part === "..") {
      throw new Error(`Unsafe or unsupported _redirects source: ${source}`);
    }
  }
  return segments;
}

// Whether an existing exact, placeholder or splat source can match the route
// root OR any descendant. This deliberately rejects ambiguous host rules.
function overlapsPrefix(pattern, prefix) {
  const target = prefix.replace(/^\/|\/$/g, "").split("/");
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "*") return true;
    if (i >= target.length) return true;
    if (!pattern[i].startsWith(":") && pattern[i] !== target[i]) return false;
  }
  return pattern.length >= target.length;
}

function parseRedirects(text) {
  const seen = new Set();
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const fields = line.split(/\s+/);
    if (fields.length < 2 || fields.length > 3 || (fields[2] && !/^(?:200|301|302|303|307|308)$/.test(fields[2]))) {
      throw new Error(`Invalid _redirects rule: ${line}`);
    }
    const [source, destination, status = "302"] = fields;
    if (seen.has(source)) throw new Error(`Duplicate _redirects source: ${source}`);
    seen.add(source);
    rules.push({ source, destination, status, pattern: redirectPattern(source) });
  }
  return rules;
}

export function planAliasRedirects(aliases, entriesByApp, existingRedirects = "") {
  const { base, previous } = stripManagedBlock(existingRedirects);
  const current = new Map(aliases.map((alias) => [alias.url, alias.sourceUrl]));
  if (current.size !== aliases.length) throw new Error("Duplicate catalog alias URL");
  for (const [url, sourceUrl] of previous) {
    if (current.get(url) !== sourceUrl) {
      throw new Error(`Stale generated alias ${url}; clean the build output before rebuilding`);
    }
  }

  const existing = parseRedirects(base);
  const generated = [];
  let usesSharedAuraAssets = false;
  for (const alias of aliases) {
    for (const rule of existing) {
      if (overlapsPrefix(rule.pattern, alias.url)) {
        throw new Error(`Existing _redirects rule conflicts with canonical alias ${alias.url}: ${rule.source}`);
      }
      if (overlapsPrefix(rule.pattern, alias.sourceUrl)) {
        const exactRoot = rule.source === alias.sourceUrl || rule.source === alias.sourceUrl.slice(0, -1);
        const correctDestination = rule.destination === alias.url || rule.destination === alias.url.slice(0, -1);
        if (!exactRoot || !correctDestination || !/^30[12378]$/.test(rule.status)) {
          throw new Error(`Existing _redirects rule conflicts with source route ${alias.sourceUrl}: ${rule.source}`);
        }
      }
    }

    const entries = entriesByApp.get(alias.appFolder);
    if (!Array.isArray(entries)) throw new Error(`Missing built source entries for ${alias.appFolder}`);
    const names = new Set();
    for (const entry of [...entries].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      assertSafeAssetSegment(entry.name);
      if (entry.name === "index.html" || names.has(entry.name)) {
        throw new Error(`Duplicate or reserved route-local asset: ${alias.appFolder}/${entry.name}`);
      }
      names.add(entry.name);
      if (entry.kind !== "file" && entry.kind !== "directory") {
        throw new Error(`Unsupported built asset type: ${alias.appFolder}/${entry.name}`);
      }
      if (entry.sharedAuraAssets && (entry.name !== "aura-assets" || entry.kind !== "directory")) {
        throw new Error(`Invalid shared Aura asset mapping: ${alias.appFolder}/${entry.name}`);
      }
      const from = `${alias.url}${entry.name}${entry.kind === "directory" ? "/*" : ""}`;
      const target = entry.sharedAuraAssets ? "/aura-assets" : `${alias.sourceUrl}${entry.name}`;
      const to = `${target}${entry.kind === "directory" ? "/:splat" : ""}`;
      usesSharedAuraAssets ||= Boolean(entry.sharedAuraAssets);
      generated.push({ source: from, destination: to, status: "200" });
    }
  }
  if (usesSharedAuraAssets && existing.some((rule) => overlapsPrefix(rule.pattern, "/aura-assets/"))) {
    throw new Error("Existing _redirects rule conflicts with shared Aura assets");
  }

  // Pages has a separate, much smaller limit for wildcard/placeholder rules.
  const all = [...existing, ...generated];
  const dynamic = all.filter((rule) => /[\\*:]/.test(rule.source)).length;
  if (dynamic > 100 || all.length - dynamic > 2000) {
    throw new Error(`Cloudflare Pages _redirects rule limit exceeded (${dynamic} dynamic, ${all.length - dynamic} static)`);
  }
  if (!aliases.length) return { text: base, previous, rules: generated };
  const block = [
    BEGIN,
    "# Generated from tools/site/games.catalog.json; edit the catalog, not this block.",
    ...aliases.map((alias) => `# alias ${alias.url} ${alias.sourceUrl}`),
    ...generated.map((rule) => `${rule.source} ${rule.destination} ${rule.status}`),
    END,
    ""
  ].join("\n");
  return { text: `${base}${base && !base.endsWith("\n") ? "\n" : ""}${block}`, previous, rules: generated };
}
