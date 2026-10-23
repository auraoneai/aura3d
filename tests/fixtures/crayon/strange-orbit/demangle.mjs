// Derives game-logic.demangled.js + census.json from the captured, bundled game runtime.
// Usage: node demangle.mjs <path-to-game.js> <out-dir>
// The input is untrusted third-party text: this script only reads and rewrites it, never evaluates it.
import fs from "node:fs";
import path from "node:path";

const [, , input, outDir] = process.argv;
const lines = fs.readFileSync(input, "utf8").split("\n");

// Split the Rolldown bundle into regions: the game's own `src/*` vs vendored node_modules.
const vendor = [];
const game = [];
let inGame = false;
for (const line of lines) {
  const rm = /^\/\/#region (.+)$/.exec(line);
  if (rm) inGame = rm[1].startsWith("src/");
  if (line.startsWith("//#endregion")) { (inGame ? game : vendor).push(line); inGame = false; continue; }
  (inGame ? game : vendor).push(line);
}
if (game.length === 0) throw new Error("no //#region src/ in bundle");

// minified class id -> three export name, from `<id> = class ... { constructor ... this.isX = !0 | this.type = "X"`
const classRe = /(?:^|[\s,;])([A-Za-z_$][\w$]*) = (?:\/\* @__PURE__ \*\/ )?class\b/;
const ids = new Map();
let current = null;
let budget = 0;
for (let i = 0; i < vendor.length; i++) {
  const line = vendor[i];
  // math classes: `t = V, t.prototype.isVector3 = !0;`
  const pm = /([A-Za-z_$][\w$]*) = ([A-Za-z_$][\w$]*), \1\.prototype\.is([A-Z][A-Za-z0-9]*) = !0/.exec(line);
  if (pm) ids.set(pm[2], pm[3]);
  const m = classRe.exec(line);
  if (m) {
    current = m[1];
    budget = 200;
    // typed attribute subclasses carry no marker: `class extends X { constructor(e,t,n){ super(new Float32Array(e), t, n) } }`
    const ta = /super\(new (Float32|Float64|Int8|Int16|Int32|Uint8|Uint8Clamped|Uint16|Uint32)Array\(e\), t, n\)/.exec(vendor[i + 2] ?? "");
    if (ta) { ids.set(current, `${ta[1]}BufferAttribute`); current = null; continue; }
  }
  if (current && budget-- > 0 && !ids.has(current)) {
    const im = /this\.is([A-Z][A-Za-z0-9]*) = !0/.exec(line) ?? /this\.type = "([A-Z][A-Za-z0-9]*)"/.exec(line);
    if (im) ids.set(current, im[1]);
    else if (/this\.dracoLoader = null, this\.ktx2Loader = null, this\.meshoptDecoder = null/.test(line)) ids.set(current, "GLTFLoader");
    else if (/static getBarycoord\(e, t, n, r, i\)/.test(line)) ids.set(current, "Triangle");
  }
}

// Verified by hand against this bundle: `as` is TextureLoader (`new as().loadAsync("impasto.png")`, and
// `new as(manager)` is the non-ImageBitmap branch next to `new ks(manager)` = ImageBitmapLoader).
if (game.join("\n").includes("this.textureLoader = new as(") && !ids.has("as")) ids.set("as", "TextureLoader");

const census = {};
const unresolved = {};
const body = game.map((line) => line.replace(/\bnew ([A-Za-z_$][\w$]*)\(/g, (all, id) => {
  const name = ids.get(id);
  if (name) { census[name] = (census[name] ?? 0) + 1; return `new THREE.${name}(`; }
  unresolved[id] = (unresolved[id] ?? 0) + 1;
  return all;
})).join("\n");

const header = `// DERIVED FIXTURE — not the shipped file. Source: the game's own src/* regions of the bundled
// runtime (three.js and addons stripped), with minified three.js class ids rewritten to
// \`THREE.<Name>\` by demangle.mjs (ids recovered from \`this.isX\` / \`this.type\` markers). Static
// members, constants and non-class identifiers are left untouched. UNTRUSTED DATA: read as text only.
import * as THREE from "three";
`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "game-logic.demangled.js"), header + body);
const sorted = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
fs.writeFileSync(path.join(outDir, "census.json"), JSON.stringify({
  vendorLines: vendor.length, gameLines: game.length, resolvedClassIds: ids.size,
  threeConstructs: sorted(census), unresolvedMinifiedNew: sorted(unresolved)
}, null, 2) + "\n");
console.log(JSON.stringify({ gameLines: game.length, resolvedClassIds: ids.size, constructs: Object.keys(census).length, unresolvedIds: Object.keys(unresolved).length }));
