// Shared stale-content rules for the marketing site (docs/design/marketing-site-update.md section 11.4).
// Used by marketing/scripts/check-site.mjs (static files, fails the build) and tools/site/scan-live-site.mjs (live pages).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Function-style names in the "Deprecated" table of docs/api/root-exports.md. Classes and namespaces (PascalCase or plain words such as `Renderer`, `crowds`, `workflows`, `GLTFLoader`) are skipped: they collide with three.js class names in porting tables and with ordinary words. */
export function loadDeprecatedNames(repoRoot) {
  const path = join(repoRoot, "docs", "api", "root-exports.md");
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const section = text.slice(text.indexOf("## Deprecated"));
  const names = [...section.matchAll(/^\| `([A-Za-z0-9_]+)` \|/gm)].map((m) => m[1]);
  return names.filter((name) => /^[a-z]/.test(name) && /[a-z][A-Z]/.test(name));
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#46;/g, ".")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

function codeBlocks(kind, source) {
  if (kind === "html") {
    return [...source.matchAll(/<pre[\s\S]*?<\/pre>/g)].map((m) => visibleText(m[0]));
  }
  return [...source.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
}

/**
 * @param {string} source raw file or page contents
 * @param {{kind: "html" | "text", canonical: string, deprecatedNames: string[]}} options
 * @returns {string[]} violation messages (empty when clean)
 */
export function scanText(source, { kind, canonical, deprecatedNames }) {
  const violations = [];
  const text = kind === "html" ? visibleText(source) : source;
  const context = (index, length) => text.slice(Math.max(0, index - 50), index + length + 50).replace(/\s+/g, " ").trim();

  // 1. Aura3D versions other than the current release: any 4.x.y triple, prefixed older triples, short "Aura3D 4.0" forms.
  for (const m of text.matchAll(/(?<![\d.])4\.(\d+)\.(\d+)(?![\d.])/g)) {
    if (m[0] !== canonical) violations.push(`stale version ${m[0]}: ...${context(m.index, m[0].length)}...`);
  }
  for (const m of text.matchAll(/(?:Aura3D|aura3d|@aura3d\/[a-z-]+@|create-aura3d@)\s?v?([1-3]\.\d+\.\d+)(?![\d.])/gi)) {
    violations.push(`stale version ${m[1]}: ...${context(m.index, m[0].length)}...`);
  }
  for (const m of text.matchAll(/\b(?:Aura3D|aura3d)\s+v?([0-4])\.(\d+)(?![\d.])/gi)) {
    const [, major, minor] = m;
    const canonicalMinor = canonical.split(".").slice(0, 2);
    if (major !== canonicalMinor[0] || minor !== canonicalMinor[1]) violations.push(`stale version ${major}.${minor}: ...${context(m.index, m[0].length)}...`);
  }

  // 2. Version-numbered build names ("(V2 build)", "(V2, Aura3D ...)", /apps/...-v2/).
  for (const m of text.matchAll(/\(V\d[,) ]|\bV\d build\b/g)) violations.push(`version-numbered build name: ...${context(m.index, m[0].length)}...`);
  for (const m of source.matchAll(/\/apps\/[a-z0-9-]+-v\d\//g)) violations.push(`route with a version-numbered slug: ${m[0]}`);

  // 3. Deprecated or removed APIs taught in code samples.
  const removedOrWrong = ["orbitCamera", "environment.studio", "@aura3d/three-compat", "aura3d agent init", "aura3d new game"];
  for (const block of codeBlocks(kind, source)) {
    for (const name of [...deprecatedNames, ...removedOrWrong]) {
      if (block.includes(name)) violations.push(`code sample uses deprecated or removed "${name}"`);
    }
    if (/target:\s*['"]#app['"]/.test(block)) violations.push(`code sample uses createAuraApp({ target: "#app" }); the signature is createAuraApp("#app", { scene })`);
  }

  // 4. Claims the product does not back.
  for (const m of text.matchAll(/check-deploy[^.]{0,140}(?:console errors|failed requests)/gi)) {
    violations.push(`check-deploy claim it does not back (it is a static check): ...${context(m.index, m[0].length)}...`);
  }
  for (const m of text.matchAll(/where each one wins|where three\.js wins|three\.js wins|when to choose three\.js|wraps a three\.js|three\.js-compatible renderer/gi)) {
    violations.push(`comparison framing the site does not use: ...${context(m.index, m[0].length)}...`);
  }
  return [...new Set(violations)];
}
