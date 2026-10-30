// Static checks for shipped games. Pure Node, no dependencies. See docs/agents/lessons-learned.md for why each exists.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { LUMA_BANDS_SCHEMA, evaluateBands, loadCapture } from "../../look-metrics/region-luma.mjs";
import { readArtDirectionAudit } from "./art-direction.mjs";

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|html|css|json)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".vercel", "evidence", "tests", "scripts", "public", "assets", "dist-dev", ".candidate-assets", "art-candidates", "art-review"]);
const MAX_FILE_BYTES = 400_000;

export function loadTerms(root) {
  return JSON.parse(readFileSync(join(root, "tools/game-checks/data/terms.json"), "utf8"));
}

export function loadInventory(root) {
  return JSON.parse(readFileSync(join(root, "docs/workflows/game-inventory.json"), "utf8"));
}

function walk(dir, out, { skipPublic = true } = {}) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name) && !(name === "public" && !skipPublic)) continue;
      walk(p, out, { skipPublic });
    } else if (SOURCE_EXT.test(name) && st.size <= MAX_FILE_BYTES) {
      out.push(p);
    }
  }
}

export function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/** Source files of a game: its app folder plus every examples/<x> folder the app references. */
export function gameSources(root, game) {
  const appDir = join(root, "apps", game.appFolder);
  const dirs = [appDir];
  const files = [];
  walk(appDir, files);
  const referenced = new Set();
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/examples\/([A-Za-z0-9-]+)\//g)) referenced.add(m[1]);
  }
  for (const ex of referenced) {
    const dir = join(root, "examples", ex);
    if (existsSync(dir) && !dirs.includes(dir)) {
      dirs.push(dir);
      walk(dir, files);
    }
  }
  const unique = [...new Set(files)].sort();
  return {
    appDir,
    dirs,
    files: unique.map((path) => {
      const raw = readFileSync(path, "utf8");
      return { path, rel: relative(root, path).split(sep).join("/"), raw, text: stripComments(raw), kind: path.split(".").pop() };
    })
  };
}

const notInPath = (term) => new RegExp(`(?<![\\w/.-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/-])`);
const isImportLine = (line) => /^\s*(import\s|export\s.*from\s|\}\s*from\s)/.test(line);

function* visibleLines(src, { kinds = ["html", "ts", "tsx", "js", "mjs", "jsx", "mts", "cts"] } = {}) {
  for (const f of src.files) {
    if (!kinds.includes(f.kind)) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || isImportLine(line)) continue;
      yield { file: f, line, no: i + 1 };
    }
  }
}

function literals(line) {
  const out = [];
  for (const m of line.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) out.push(m[2]);
  return out;
}
const idLike = (str) => /^[\w./:@#-]+$/.test(str) && !/\s/.test(str);
/** Text a player can read on this line: the whole line in HTML, string-literal contents in code. */
function textsOf(file, line) {
  return file.kind === "html" ? [line] : literals(line);
}

const finding = (check, severity, game, file, line, message) => ({ check, severity, game: game?.slug ?? "(global)", file: file ?? "", line: line ?? 0, message });

// ---------- per-game checks ----------

function checkNames({ game, src, terms }) {
  const out = [];
  const old = (terms.oldNames[game.slug] ?? []).map((n) => ({ n, re: notInPath(n) }));
  const wording = terms.portWording.map((w) => ({ w, re: new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }));
  const stale = new RegExp(terms.staleVersion);
  const chips = terms.engineChip.map((c) => ({ c, re: new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
  for (const { file, line, no } of visibleLines(src)) {
    const texts = textsOf(file, line);
    if (texts.length === 0) continue;
    const joined = texts.join("\n");
    for (const { n, re } of old) if (re.test(joined)) out.push(finding("names", "error", game, file.rel, no, `old game name "${n}" in visible text`));
    const prose = texts.filter((t) => !idLike(t)).join("\n");
    for (const { w, re } of wording) if (re.test(prose)) out.push(finding("names", "error", game, file.rel, no, `"${w}" wording in visible text`));
    if (stale.test(joined) && !/(sha256|integrity|@aura3d\/[\w-]+@)/.test(line)) {
      const evidenceOnly = /\b(engineVersion|version)\s*:/.test(line) && !/<[a-z]/i.test(line);
      out.push(finding("names", "warn", game, file.rel, no, evidenceOnly ? "stale engine version string in evidence code (hand-typed)" : "stale version text in visible text"));
    }
    for (const { c, re } of chips) if (re.test(line)) out.push(finding("names", "error", game, file.rel, no, `engine chip "${c}"`));
  }
  return dedupe(out);
}

function checkQuickbar({ game, src }) {
  const markup = /(id|class)\s*=\s*["'][^"']*(quickbar|quick-bar|modebar|mode-bar|quick-switch)/i;
  const shared = /quickbar\.css|aura3d-top-bar/;
  const usesShared = src.files.some((f) => shared.test(f.raw));
  const hit = src.files.find((f) => f.kind === "html" && markup.test(f.raw));
  if (hit && !usesShared) {
    const no = hit.raw.split("\n").findIndex((l) => markup.test(l)) + 1;
    return [finding("quickbar", "warn", game, hit.rel, no, "own mode bar markup without apps/showcase-port-shared/quickbar.css (wraps to several rows on phones)")];
  }
  return [];
}

function checkCanvasResize({ game, src }) {
  const out = [];
  for (const f of src.files) {
    if (!/^[cm]?[jt]sx?$/.test(f.kind)) continue;
    const lines = f.text.split("\n");
    const ready = lines.findIndex((l) => /\.ready\s*\(/.test(l));
    if (ready < 0) continue;
    for (let i = ready + 1; i < lines.length; i++) {
      if (/\bcanvas\.(width|height)\s*=(?!=)|\.setSize\s*\(|canvas\.style\.(width|height)\s*=/.test(lines[i])) {
        out.push(finding("canvas-resize", "warn", game, f.rel, i + 1, "canvas size assigned after app.ready(): the renderer keeps the old backing size (2x crop). Let the engine size the canvas."));
        break;
      }
    }
  }
  return out;
}

function checkFixedStepPresenter({ game, src }) {
  const all = src.files.filter((f) => /^[cm]?[jt]sx?$/.test(f.kind));
  const usesLoop = all.find((f) => /createFixedStepLoop\s*\(|\baccumulator\b\s*(\+=|-=)/.test(f.text));
  if (!usesLoop) return [];
  const has = all.some((f) => /createFixedStepPresenter|createRenderInterpolator|createRecordBlend|\bloop\.alpha\b|\.alpha\b\s*[;,)]/.test(f.text));
  if (has) return [];
  const no = usesLoop.text.split("\n").findIndex((l) => /createFixedStepLoop\s*\(|accumulator/.test(l)) + 1;
  return [finding("fixed-step-presenter", "error", game, usesLoop.rel, no, "fixed-step simulation drawn without interpolation (stalls on 120/144 Hz displays). Use createFixedStepPresenter or createRenderInterpolator.")];
}

function checkHitstopTime({ game, src }) {
  const out = [];
  const hasKit = src.files.some((f) => /createHitStop/.test(f.text));
  if (hasKit) return out;
  for (const f of src.files) {
    if (!/^[cm]?[jt]sx?$/.test(f.kind)) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/(hit[-_]?stop|hitstop|freeze(?:Timer|Time|Left|Remaining)?)\w*\s*(?:-=|=\s*Math\.max\([^)]*-)\s*[^;]*\b(dt|delta|simDt|stepDt)\b/i.test(lines[i])) {
        out.push(finding("hitstop-time", "warn", game, f.rel, i + 1, "hit-stop or freeze timer counts down on dt: if dt is game time and game time is frozen it never ends. Use createHitStop (real frame time)."));
        break;
      }
    }
  }
  return out;
}

function checkPoseArray({ game, src }) {
  const out = [];
  for (const f of src.files) {
    if (!/^[cm]?[jt]sx?$/.test(f.kind)) continue;
    if (!/\bbones\b/i.test(f.text) || !/(\.pose\s*\(|setPose|poseBones|applyPose)/.test(f.text)) continue;
    if (/poseBonesForEngine|\{\s*x:\s*\w+\[0\]/.test(f.text)) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const near = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
      if (/\b(rotation|position)\s*:\s*\[/.test(lines[i]) && /bone/i.test(near)) {
        out.push(finding("pose-array", "warn", game, f.rel, i + 1, "bone pose given as an array: the engine expects {x,y,z,w} / {x,y,z} objects and ignores arrays (arms never move)."));
        break;
      }
    }
  }
  return out;
}

/**
 * A `scaleMode: "fit"` model (also the default) is grounded on its LOWEST point: the node position is the feet. Placing it at
 * half its height ("origin at the centre") lifts it that far off the floor (Diamond 0.94 m, Hoops 0.96 m: the hand was a metre
 * above the bounce). Flags (1) `model(.. targetHeight: H ..).position(x, ~H/2, z)` and (2) a runtime `setPosition(.., k + y, ..)`
 * / `setPosition(.., y + k, ..)` whose constant k is half of a model's targetHeight declared in the same file.
 * Escape hatch for a deliberate lift: `// fit-grounding: ok` on the line.
 */
function checkFitGrounding({ game, src }) {
  const out = [];
  for (const f of src.files) {
    if (!/^[cm]?[jt]sx?$/.test(f.kind)) continue;
    const raw = f.raw.split("\n");
    const heights = [];
    for (const m of f.text.matchAll(/\bmodel\(/g)) {
      const chunk = f.text.slice(m.index, m.index + 900);
      const opt = chunk.match(/\{[^{}]*\}/);
      const optStr = opt ? opt[0] : "";
      if (/scaleMode:\s*"world"/.test(optStr)) continue;
      const th = optStr.match(/targetHeight:\s*([0-9.]+)/);
      const H = th ? Number(th[1]) : 0;
      const line = f.text.slice(0, m.index).split("\n").length;
      if (H >= 0.4) heights.push(H);
      const pos = chunk.match(/\.position\(\s*[^,()]+,\s*(-?[0-9.]+)\s*,/);
      if (H >= 0.4 && pos) {
        const y = Number(pos[1]);
        if (y > 0.2 && Math.abs(y - H / 2) <= Math.max(0.05, 0.1 * H / 2) && !/fit-grounding: ok/.test(raw[line - 1] ?? "")) {
          out.push(finding("fit-grounding", "error", game, f.rel, line, `fitted model (targetHeight ${H}) placed at y ${y} = half its height: fitted models are grounded on their lowest point, so it hovers ${y.toFixed(2)} m above the floor. Place it at floor height.`));
        }
      }
    }
    if (heights.length === 0) continue;
    const halves = [...new Set(heights.map((h) => h / 2))];
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/setPosition\(/.test(lines[i]) || /fit-grounding: ok/.test(raw[i] ?? "")) continue;
      const m = lines[i].match(/setPosition\([^;]*?,\s*(?:([0-9]*\.[0-9]+)\s*\+\s*[A-Za-z_][\w.]*|[A-Za-z_][\w.]*\s*\+\s*([0-9]*\.[0-9]+))\b[^,)]*,/);
      if (!m) continue;
      const k = Number(m[1] ?? m[2]);
      const half = halves.find((h) => k >= 0.3 && Math.abs(k - h) <= Math.max(0.03, 0.03 * h));
      if (half !== undefined) out.push(finding("fit-grounding", "error", game, f.rel, i + 1, `setPosition adds ${k} to y, half of a fitted model's targetHeight (${half * 2}) in this file: a fitted model's node position is its feet, so this lifts it ${k} m. Use the floor height (or mark a deliberate lift with // fit-grounding: ok).`));
    }
  }
  return out;
}

function checkLikeness({ game, src, terms }) {
  const out = [];
  const brand = terms.brandTerms.map((t) => ({ t, re: notInPath(t) }));
  for (const { file, line, no } of visibleLines(src)) {
    const texts = textsOf(file, line).filter((t) => !/\/|\.(glb|gltf|ktx2|png|jpe?g|webp)\b/i.test(t) || file.kind === "html");
    const joined = texts.join("\n");
    if (!joined) continue;
    for (const { t, re } of brand) if (re.test(joined)) out.push(finding("likeness", "error", game, file.rel, no, `real brand, product or lore term "${t}" in visible text`));
  }
  for (const f of src.files) {
    if (!/aura-assets[\w.-]*\.ts$|aura\.assets\.json$/.test(f.rel)) continue;
    const keys = f.raw.matchAll(/^\s*["']?([A-Za-z][\w]*)["']?\s*:\s*(?:\{|defineModel|model\()/gm);
    for (const m of keys) for (const { t } of brand) if (new RegExp(t, "i").test(m[1]) && t.length > 3) out.push(finding("likeness", "warn", game, f.rel, 0, `asset key "${m[1]}" names a real brand or product ("${t}")`));
  }
  return dedupe(out);
}

function checkAssetProvenance({ game, src }) {
  const out = [];
  for (const f of src.files) {
    if (/aura-assets[\w.-]*\.ts$/.test(f.rel)) {
      const urls = (f.text.match(/\burl\s*:\s*(?:new\s+URL\(\s*)?["'`][^"'`\n]*\.(?:glb|gltf|ktx2|webp|png|jpe?g|mp3|ogg|wav|hdr)/gi) ?? []).length;
      const hashes = (f.text.match(/\bsha256\b/g) ?? []).length;
      if (urls > hashes) out.push(finding("asset-provenance", "error", game, f.rel, 0, `${urls} asset urls but only ${hashes} sha256 fields (production assets need url + sha256 + provenance)`));
    }
    if (/^[cm]?[jt]sx?$/.test(f.kind) && !/aura-assets/.test(f.rel)) {
      const lines = f.text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/["'`]https?:\/\/[^"'`]*\.(?:glb|gltf)\b/i.test(lines[i])) out.push(finding("asset-provenance", "error", game, f.rel, i + 1, "raw remote GLB URL (use typed assets with sha256)"));
      }
    }
  }
  return out;
}

/**
 * The production build (marketing/scripts/build-showcase-routes.mjs) copies only manifest-admitted assets into dist, so a
 * /aura-assets/ URL that exists on disk but is not in aura.assets.json (or the route's own public/aura-assets) 404s live
 * and the model load rejects: Teleoperator shipped a black 3D canvas that way in 4.3.0.
 */
function checkDeployableAssets({ game, src, root }) {
  const out = [];
  let manifestUrls;
  try { manifestUrls = new Set(JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8")).assets.map((a) => a.url)); } catch { return out; }
  const routeLocal = join(root, "apps", game.appFolder, "public", "aura-assets");
  const seen = new Set();
  for (const f of src.files) {
    if (!/^[cm]?[jt]sx?$/.test(f.kind)) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(/["'`](\/aura-assets\/[A-Za-z0-9_.@-]+\.(?:glb|gltf|ktx2|mp3|ogg|wav|hdr|bin))["'`]/g)) {
        const url = m[1];
        if (seen.has(url) || /\.meshy-candidate\./.test(url)) continue;
        seen.add(url);
        const name = url.replace("/aura-assets/", "");
        const onDisk = existsSync(join(root, "public", "aura-assets", name)) || existsSync(join(routeLocal, name));
        if (!onDisk) out.push(finding("deployable-assets", "error", game, f.rel, i + 1, `${url} is not in public/aura-assets (404 live)`));
        else if (!manifestUrls.has(url) && !existsSync(join(routeLocal, name))) out.push(finding("deployable-assets", "error", game, f.rel, i + 1, `${url} is not admitted in aura.assets.json, so the production build does not copy it (404 live, model load rejects): admit it with aura3d assets add or copy it route-local`));
      }
    }
  }
  return out;
}

function checkKits({ game, src }) {
  const out = [];
  const code = src.files.filter((f) => /^[cm]?[jt]sx?$/.test(f.kind));
  const has = (re) => code.some((f) => re.test(f.text));
  const first = (re) => { for (const f of code) { const i = f.text.split("\n").findIndex((l) => re.test(l)); if (i >= 0) return { f, no: i + 1 }; } return null; };
  if (!has(/installGameBeacon/)) { const h = first(/window\.__AURA3D_GAME__\s*=(?!=)|\(window as any\)\.__AURA3D_GAME__/); if (h) out.push(finding("kits", "warn", game, h.f.rel, h.no, "game beacon assigned by hand (use installGameBeacon)")); }
  if (!has(/installQaHooks/)) { const h = first(/window\.__AURA_[A-Z0-9_]+__\s*=(?!=)|\(window as any\)\.__AURA_[A-Z0-9_]+__/); if (h) out.push(finding("kits", "warn", game, h.f.rel, h.no, "QA hook assigned by hand (use installQaHooks)")); }
  if (!has(/createCueBank|createGameSoundEngine|AudioContextManager/)) { const h = first(/new\s+(?:window\.)?(?:Audio|webkitAudio)Context\s*\(/); if (h) out.push(finding("kits", "warn", game, h.f.rel, h.no, "hand-rolled AudioContext (use createCueBank for one-shot cues)")); }
  return out;
}

function checkRuntimeMasking({ game, src }) {
  const out = [];
  for (const f of src.files) {
    if (!/^[cm]?[jt]sx?$/.test(f.kind)) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/\binstallNeutralLabels\s*\(|MutationObserver[^\n]*(textContent|innerText)|\.replace\(\s*\/(?:Goku|Saiyan|Paozu)/.test(lines[i]) && !/^\s*export\s+function/.test(lines[i])) {
        out.push(finding("runtime-masking", "error", game, f.rel, i + 1, "runtime text replacement hides borrowed terms instead of removing them from the source (rename in source, delete the masking layer)"));
        break;
      }
    }
  }
  return out;
}

function checkNoThree({ game, src }) {
  const out = [];
  for (const f of src.files) {
    if (!/^[cm]?[jt]sx?$/.test(f.kind)) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/from\s+["']three(?:\/[^"']*)?["']|require\(["']three["']\)|\bGLTFLoader\b|\bTHREE\.[A-Z]/.test(lines[i])) out.push(finding("no-three", "error", game, f.rel, i + 1, "three.js import or loader in a game source"));
    }
  }
  // vendored bundles, including under public/ (decoders and workers excluded)
  const pub = [];
  walk(join(src.appDir, "public"), pub, { skipPublic: false });
  for (const p of pub) {
    if (!/\.m?js$/.test(p) || /aura-decoders|draco|basis|meshopt|\.worker\./i.test(p)) continue;
    let st; try { st = statSync(p); } catch { continue; }
    if (st.size > 100_000) out.push(finding("no-three", "warn", game, relative(src.appDir, p), 0, `vendored JS bundle of ${Math.round(st.size / 1024)} KB under public/`));
  }
  return out;
}

function checkFonts({ game, src, terms }) {
  const out = [];
  const bad = terms.fonts.forbidden.map((n) => ({ n, re: new RegExp(`(?<![\\w-])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`) }));
  for (const f of src.files) {
    if (!/^(css|html|[cm]?[jt]sx?)$/.test(f.kind)) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/font(-family)?\s*:|fontFamily/.test(lines[i])) continue;
      for (const { n, re } of bad) if (re.test(lines[i]) && n !== "system-ui") out.push(finding("fonts", "warn", game, f.rel, i + 1, `font "${n}" is not in the licensed set`));
    }
  }
  return dedupe(out);
}

function checkScreensTracked({ game, root }) {
  const dir = game.screens?.dir;
  if (!dir) return [finding("screens-tracked", "error", game, "", 0, "inventory has no screens.dir for this game")];
  const tracked = gitFiles(root).filter((p) => p.startsWith(`${dir}/`) && /\.(jpe?g|png|webp)$/i.test(p));
  if (tracked.length === 0) return [finding("screens-tracked", "error", game, dir, 0, "no screenshots tracked in git for this game (gitignore or never committed)")];
  const card = game.screens.card;
  if (card && !tracked.some((p) => p.endsWith(`/${card}`))) return [finding("screens-tracked", "warn", game, dir, 0, `card image ${card} not tracked`)];
  return [];
}

// ---------- global checks ----------

let gitCache = new Map();
export function gitFiles(root) {
  if (gitCache.has(root)) return gitCache.get(root);
  let list = [];
  try { list = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString().split("\0").filter(Boolean); } catch { /* not a git repo */ }
  gitCache.set(root, list);
  return list;
}
export function resetGitCache() { gitCache = new Map(); releaseCache = new Map(); gu47Cache = new Map(); }

function checkVercelignore({ root }) {
  const p = join(root, ".vercelignore");
  if (!existsSync(p)) return [];
  const out = [];
  const files = gitFiles(root);
  const lines = readFileSync(p, "utf8").split("\n");
  lines.forEach((raw, i) => {
    const l = raw.trim();
    const m = /^([A-Za-z0-9._-]+)\/$/.exec(l);
    if (!m || l.startsWith("#") || l.startsWith("!")) return;
    const seg = m[1];
    if (["node_modules", "dist", ".git"].includes(seg)) return;
    const nested = files.find((f) => f.includes(`/${seg}/`) && !f.startsWith(`${seg}/`) && /^(packages|apps|tools|examples|marketing|templates|workers)\//.test(f));
    if (nested && /\/src\//.test(nested)) out.push(finding("vercelignore", "error", null, ".vercelignore", i + 1, `unanchored "${l}" also excludes ${nested} (anchor it: "/${l}")`));
    else if (nested) out.push(finding("vercelignore", "warn", null, ".vercelignore", i + 1, `unanchored "${l}" also excludes ${nested} (not under src/; check it is not needed by the build)`));
    else out.push(finding("vercelignore", "warn", null, ".vercelignore", i + 1, `unanchored "${l}" matches a "${seg}" directory at any depth (use "/${l}" if only the root one is meant)`));
  });
  return out;
}

function checkCounts({ root, inventory }) {
  const out = [];
  const live = inventory.liveGameCount;
  const words = { four: 4, fifteen: 15, "twenty-six": 26, thirty: 30 };
  for (const rel of ["README.md", "llms.txt", "llms-full.txt", "marketing/index.html", "apps/showcase-index/index.html", "marketing/public/llms.txt"]) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/\{\{|__\w+__|data-count|genre|eyebrow/.test(line)) return;
      for (const m of line.matchAll(/(?<![\d.])\b(\d{1,3}|four|fifteen|twenty-six|thirty)\s+(?:playable\s+|live\s+|showcase\s+)?games\b/gi)) {
        const n = words[m[1].toLowerCase()] ?? Number(m[1]);
        if (n !== live && n >= 4 && !/index games|ports|per genre|of the|new|old/i.test(line)) out.push(finding("counts", "warn", null, rel, i + 1, `hand-typed game count "${m[0]}" differs from the inventory (${live})`));
      }
    });
  }
  return out;
}

// Reads the same ledger `aura3d meshy ledger` writes (AURA3D_MESHY_LEDGER, else ~/.aura3d/meshy-ledger.jsonl), merged per
// reservation id exactly like the CLI: latest record wins, failed counts 0, otherwise actual ?? est. Baseline/config records never count.
function readLedgerByTag(file) {
  const byRid = new Map();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (!r.kind && r.rid) byRid.set(r.rid, { ...(byRid.get(r.rid) ?? {}), ...r }); } catch { /* skip a torn line */ }
  }
  const byTag = {};
  for (const r of byRid.values()) {
    const tag = r.game ?? r.tag;
    if (!tag || tag === "unattributed") continue;
    byTag[tag] = (byTag[tag] ?? 0) + (r.status === "failed" ? 0 : Number(r.actual ?? r.est ?? 0));
  }
  return byTag;
}

// Information only: Meshy spend is uncapped by owner decision (2026-10-25), so this never warns. It lists the credits per tag
// from the ledger `aura3d meshy ledger` writes so the numbers stay visible (AURA3D_MESHY_LEDGER, else ~/.aura3d/meshy-ledger.jsonl).
function checkMeshyCap({ env }) {
  const explicit = env.AURA3D_MESHY_LEDGER ?? env.MESHY_LEDGER;
  const home = env.HOME ?? process.env.HOME ?? "";
  const ledger = explicit ?? join(home, ".aura3d", "meshy-ledger.jsonl");
  if (!existsSync(ledger)) return [finding("meshy-cap", "info", null, ledger, 0, "no Meshy ledger found; route paid Meshy calls through `aura3d meshy ledger reserve` to keep credits visible (spend is uncapped)")];
  const byTag = readLedgerByTag(ledger);
  const list = Object.entries(byTag).sort((a, b) => b[1] - a[1]).map(([tag, spent]) => `${tag} ${spent}`).join(", ");
  const total = Object.values(byTag).reduce((sum, v) => sum + v, 0);
  return [finding("meshy-cap", "info", null, ledger, 0, `Meshy credits per tag, tracked for visibility (spend is uncapped by owner decision 2026-10-25): ${list || "none"}; ${total} attributed in total`)];
}

// Rigged characters a game ships must pass `aura3d assets validate --skin` (stretched triangles, flaps, bad weights). Known defects that
// still ship are listed with a reason in aura.skin-allow.json; those report as info, anything else is an error.
function checkSkin({ root, inventory }) {
  const runner = join(root, "tools/game-checks/skin-runner.mts");
  const tsx = join(root, "node_modules/.bin/tsx");
  if (!existsSync(runner) || !existsSync(tsx)) return [finding("skin", "info", null, "tools/game-checks/skin-runner.mts", 0, "skin check skipped: tsx is not installed (run pnpm install)")];
  const byFile = new Map();
  const manifestPath = join(root, "aura.assets.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { assets: [] };
  const fileOfId = new Map();
  for (const a of manifest.assets ?? []) {
    const url = a.derived?.url ?? a.url;
    if (a.format === "glb" && typeof url === "string") fileOfId.set(a.id, join(root, "public", url.replace(/^\//, "")));
  }
  for (const game of inventory.games.filter((g) => g.status === "live")) {
    const src = gameSources(root, game);
    for (const f of src.files) {
      // the typed-asset catalogues list every asset in the repo; only code that uses an asset counts
      if (/aura-assets[^/]*\.(?:ts|json)$/.test(f.rel)) continue;
      for (const m of f.text.matchAll(/[A-Za-z][A-Za-z0-9_]{5,}/g)) {
        const file = fileOfId.get(m[0]);
        if (!file || !existsSync(file)) continue;
        if (!byFile.has(file)) byFile.set(file, new Set());
        byFile.get(file).add(game.slug);
      }
    }
  }
  const rigged = [...byFile.keys()].filter((file) => { try { const b = readFileSync(file); return b.length > 24 && b.readUInt32LE(0) === 0x46546c67 && b.toString("utf8", 20, 20 + b.readUInt32LE(12)).includes('"skins"'); } catch { return false; } });
  if (rigged.length === 0) return [];
  let results;
  try {
    const out = execFileSync(tsx, ["--tsconfig", join(root, "tsconfig.base.json"), runner, root, ...rigged], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    results = JSON.parse(out.trim().split("\n").pop());
  } catch (error) {
    return [finding("skin", "warn", null, "tools/game-checks/skin-runner.mts", 0, `skin check could not run: ${String(error.message).split("\n")[0]}`)];
  }
  const findings = [];
  for (const r of results) {
    const games = [...(byFile.get(join(root, "public", "aura-assets", r.file)) ?? [])];
    for (const slug of games) {
      for (const b of r.blocking) findings.push(finding("skin", "error", { slug }, `public/aura-assets/${r.file}`, 0, `${r.id}: ${b.message}`));
      if (r.allowedFindings.length) findings.push(finding("skin", "info", { slug }, `public/aura-assets/${r.file}`, 0, `${r.id}: known skin defect(s) ${r.allowedFindings.join(", ")} allowed: ${r.allowReason}`));
    }
  }
  return findings;
}

const CODE_KIND = /^[cm]?[jt]sx?$/;
const firstLine = (files, re) => { for (const f of files) { const i = f.text.split("\n").findIndex((l) => re.test(l)); if (i >= 0) return { f, no: i + 1 }; } return null; };
const okMarker = (f, no, tag) => new RegExp(`${tag}: ok`).test(f.raw.split("\n")[no - 1] ?? "");

/** Body of the first `{ ... }` object literal that starts at or after `from` (brace matched on comment-free text). */
function objectAt(text, from) {
  const start = text.indexOf("{", from);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(start + 1, i);
  }
  return "";
}
const topLevelKeys = (body) => {
  const keys = [];
  let depth = 0;
  for (const m of body.matchAll(/[{}\[\]]|(?:^|[,{\s])["']?([A-Za-z_$][\w$.-]*)["']?\s*:/g)) {
    if (m[0] === "{" || m[0] === "[") depth++;
    else if (m[0] === "}" || m[0] === "]") depth--;
    else if (depth === 0 && m[1]) keys.push(m[1]);
  }
  return keys;
};

/**
 * Touch input (audit 2026-10-29, cross-cutting): seven live games shipped keyboard-only and four shipped touch that could not
 * work. Flags (1) gameplay read from the keyboard with no touch path: no touch preset or touch-controls API, no touchstart /
 * touchmove / pointermove handler, no on-screen hold button (pointercancel handler), and no pointerdown handler that reads the pointer (a handler that only unlocks audio or
 * starts the title does not count); (2) a `touch: { bindings }` value that names no declared input action or axis.
 * A pointerdown handler counts when it reads the pointer or writes game input (`keys[k] = true`, `press(...)`, a held set),
 * also when it is a named function defined in the same file (Gridlock Courier's `#t-*` buttons in touch.ts).
 * Severity is error since 2026-10-29 (audit fixes wave 3): with all 25 games merged every live game passes.
 * Escape hatch for a game that is desktop-only on purpose: `// touch-input: ok` on the keyboard listener line.
 */
export const TOUCH_INPUT_SEVERITY = "error";
const POINTER_READ = /clientX|clientY|offsetX|pageX|pointerType|movementX|getBoundingClientRect/;
/** A write to game input state: `keys[k] = true`, `input.left = 1`, `press(k, true)`, `held.add(k)`, `setKey(...)`. */
const INPUT_WRITE = /\b(?:keys|input|inputs|held|pressed|controls|buttons)\b(?:\.\w+|\[[^\]]+\])\s*=(?!=)|\b(?:keys|input|held|pressed)\.(?:add|set)\(|\bpress\w*\(|\bset(?:Key|Input|Action|Held|Steer|Throttle)\w*\(/;
function checkTouchInput({ game, src }) {
  const out = [];
  const code = src.files.filter((f) => CODE_KIND.test(f.kind));
  const keyboard = firstLine(code, /addEventListener\(\s*["']key(?:down|up)["']|\bonkeydown\s*=|\bactions\s*:\s*\{|\.code\s*===\s*["'](?:Key|Arrow|Space)/);
  if (!keyboard) return out;
  const touchApi = /mountTouchControls|bindGameTouch\w*\(|createTouchLayoutPreset|createGameTouchControlLayout|VirtualTouch\w*|addEventListener\(\s*["'](?:touchstart|touchmove|pointermove)["']|["']pointercancel["']|\bon(?:touchstart|touchmove|pointermove)\s*=|\btouch\s*:\s*\{\s*preset\s*:/;
  let touch = code.some((f) => touchApi.test(f.text));
  if (!touch) {
    for (const f of code) {
      for (const m of f.text.matchAll(/addEventListener\(\s*["']pointerdown["']\s*,\s*([A-Za-z_$][\w$]*)?|\bonpointerdown\s*=\s*([A-Za-z_$][\w$]*)?/g)) {
        let body = f.text.slice(m.index, m.index + 400);
        const named = m[1] ?? m[2];
        if (named && !/^(?:async|function|e|ev|event)$/.test(named)) {
          const def = f.text.match(new RegExp(`(?:const|let|var|function)\\s+${named.replace(/\$/g, "\\$")}\\b`));
          if (def) body += f.text.slice(def.index, def.index + 400);
        }
        if (POINTER_READ.test(body) || INPUT_WRITE.test(body)) { touch = true; break; }
      }
      if (touch) break;
    }
  }
  if (!touch && !okMarker(keyboard.f, keyboard.no, "touch-input")) {
    out.push(finding("touch-input", TOUCH_INPUT_SEVERITY, game, keyboard.f.rel, keyboard.no, "gameplay input is keyboard-only: phones and tablets cannot play. Mount the engine touch preset (createGame `touch: { preset, bindings }` or mountTouchControls) or read pointer moves."));
  }
  for (const f of code) {
    for (const m of f.text.matchAll(/\btouch\s*:\s*\{\s*preset\s*:/g)) {
      const bindingsAt = f.text.indexOf("bindings", m.index);
      if (bindingsAt < 0 || bindingsAt - m.index > 400) continue;
      const bindings = objectAt(f.text, bindingsAt);
      const declared = new Set();
      let spread = false;
      for (const a of f.text.matchAll(/\b(actions|axes)\s*:\s*\{/g)) {
        const body = objectAt(f.text, a.index);
        if (/\.\.\./.test(body)) spread = true;
        for (const k of topLevelKeys(body)) declared.add(k);
      }
      if (declared.size === 0) continue;
      for (const b of bindings.matchAll(/:\s*["']([\w.-]+)["']/g)) {
        if (declared.has(b[1])) continue;
        const no = f.text.slice(0, bindingsAt + bindings.indexOf(b[0])).split("\n").length + 1;
        if (okMarker(f, no, "touch-input")) continue;
        out.push(finding("touch-input", TOUCH_INPUT_SEVERITY, game, f.rel, no, `touch binding targets "${b[1]}", which is not a declared input action or axis${spread ? " in this file (a spread may supply it; check)" : ""}: the button does nothing`));
      }
    }
  }
  return dedupe(out);
}

/**
 * Lighting rule that changed in 4.5.0 (audit LIGHT-01/11): lights with no environment or look get no image-based light (no
 * implicit room since 4.5.0), so GLBs lose their reflections and fill. Add `environments.neutral({ intensity })` calibrated on
 * a capture. Warn: it needs a steady-state capture, not a rule.
 * Not checked, because the engine now handles them (lane E2): a hemisphere next to an environment contributes (LIGHT-05), a
 * look added at runtime drops its fill next to an authored ambient (LIGHT-04), and contact shadows on a weak key raise the
 * runtime warning CONTACT_SHADOWS_WEAK_KEY in app.diagnostics() (LIGHT-09).
 * Escape hatch: `// lighting: ok` on the flagged line.
 */
function checkLighting({ game, src }) {
  const out = [];
  const code = src.files.filter((f) => CODE_KIND.test(f.kind));
  const lights = firstLine(code, /\blights\.(?:ambient|hemisphere|directional|point|spot)\s*\(/);
  if (!lights) return out;
  const env = /\benvironments\.\w+\s*\(|\blooks\.preset\s*\(|\blook\s*:\s*["'`{]|\blook\s*:\s*[A-Z][A-Z0-9_]{2,}\b|\benvironment\s*:\s*["'`{]/;
  const hasEnv = code.some((f) => env.test(f.text));
  if (!hasEnv && !okMarker(lights.f, lights.no, "lighting")) {
    out.push(finding("lighting", "warn", game, lights.f.rel, lights.no, "lights with no environment or look: since 4.5.0 such a scene gets no image-based light, so GLBs lose reflections and fill. Add environments.neutral({ intensity }) calibrated on a steady-state capture."));
  }
  return dedupe(out);
}

/**
 * Root typed-asset catalogue (audit RH-06): `src/aura-assets.ts` lists every admitted asset in the repo (2.6 MB of JS live,
 * 522 of its URLs not deployed). A game that imports it ships the whole catalogue. Generate the route's own catalogue
 * (`aura3d assets typegen --route apps/<app>`, writes `src/aura-assets.route.ts`) and import that instead.
 */
function checkSharedCatalog({ game, src }) {
  const out = [];
  for (const f of src.files) {
    if (!CODE_KIND.test(f.kind)) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/from\s+["'](?:\.\.\/)+src\/aura-assets(?:\.ts)?["']|import\(\s*["'](?:\.\.\/)+src\/aura-assets(?:\.ts)?["']\s*\)/.test(lines[i]) && !okMarker(f, i + 1, "shared-catalog")) {
        out.push(finding("shared-catalog", "warn", game, f.rel, i + 1, "imports the repository-wide asset catalogue (src/aura-assets.ts, 2.6 MB of JS): run `aura3d assets typegen --route apps/<app>` and import ./aura-assets.route"));
      }
    }
  }
  return out;
}

/**
 * Card frame older than the latest minor release (audit RH-05): every index poster is built from the inventory's card frame
 * (tools/site/build-card-images.mjs), so a card committed before the last vX.Y.0 tag shows a render the engine no longer
 * produces. Retake the final screens from the current build, then rebuild the posters.
 */
let releaseCache = new Map();
function latestMinorRelease(root) {
  if (releaseCache.has(root)) return releaseCache.get(root);
  let out = null;
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.0"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const time = Number(execFileSync("git", ["log", "-1", "--format=%ct", tag], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim());
    if (tag && time) out = { tag, time };
  } catch { /* no release tag */ }
  releaseCache.set(root, out);
  return out;
}
function checkScreensFresh({ game, root }) {
  const release = latestMinorRelease(root);
  const dir = game.screens?.dir;
  const card = game.screens?.card;
  if (!release || !dir || !card) return [];
  const rel = `${dir}/${card}`;
  let time = 0;
  try { time = Number(execFileSync("git", ["log", "-1", "--format=%ct", "--", rel], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim()); } catch { return []; }
  if (!time || time >= release.time) return [];
  const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
  return [finding("screens-fresh", "warn", game, rel, 0, `card frame last committed ${day(time)}, before ${release.tag} (${day(release.time)}): the index poster shows an older render. Retake the final screens on the current build, then run node tools/site/build-card-images.mjs`)];
}

/**
 * Third-party names in identifiers that ship (audit RH-07): the `likeness` check reads visible text only, so QA hook ids,
 * log prefixes and storage keys such as `installQaHooks("kid-goku")` or `"saiyan-snake-way"` reached the live bundles.
 * Flags a real brand, product or lore term (terms.json `brandTerms`; former game names stay with `names`) inside any string literal of shipped code (case-insensitive, `-`/`_`/space folded),
 * import lines excluded. Escape hatch: `// brand-identifier: ok` on the line.
 * Typed asset catalogues (files that call `defineAuraAssets(`, such as the per-app copies of src/aura-assets.ts) are skipped:
 * their strings are the licence's source URL and the GLB's own node names ("Sketchfab_model"), which the asset-provenance
 * check governs, not identifiers the game chose.
 */
function checkBrandIdentifiers({ game, src, terms }) {
  const out = [];
  const fold = (t) => t.toLowerCase().replace(/[\s_-]+/g, "");
  const brand = terms.brandTerms.filter((t) => fold(t).length >= 4).map((t) => ({ t, f: fold(t) }));
  for (const f of src.files) {
    if (!CODE_KIND.test(f.kind) || /\bdefineAuraAssets\s*\(/.test(f.text)) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (isImportLine(lines[i]) || /\bimport\(/.test(lines[i]) || okMarker(f, i + 1, "brand-identifier")) continue;
      for (const lit of literals(lines[i])) {
        if (!idLike(lit)) continue; // prose is the likeness check's job
        const folded = fold(lit);
        const hit = brand.find((b) => folded.includes(b.f));
        if (hit) { out.push(finding("brand-identifiers", "warn", game, f.rel, i + 1, `identifier "${lit}" contains the third-party name "${hit.t}" and ships in the bundle (QA hook, log prefix or key): rename it to the game's own name`)); break; }
      }
    }
  }
  return dedupe(out);
}

/**
 * Open upgrade checks (audit RH-04): 4.5.0 shipped with every per-game guide in docs/upgrade-4.5.0/ still listing unchecked
 * `- [ ]` captures. Warns with the count for the guide of the latest minor release tag. Close a box only with the capture
 * or test that answers it.
 */
function checkUpgradeGuide({ game, root }) {
  const release = latestMinorRelease(root);
  if (!release) return [];
  const version = release.tag.replace(/^v/, "");
  const rel = `docs/upgrade-${version}/${game.slug}.md`;
  const file = join(root, rel);
  if (!existsSync(file)) return [];
  const open = readFileSync(file, "utf8").split("\n").filter((l) => /^[ \t]*[-*] \[ \]/.test(l)).length;
  return open ? [finding("upgrade-guide", "warn", game, rel, 0, `${open} unchecked item(s) in the ${version} upgrade guide: run the listed captures (tests/browser/game-luma-capture.spec.ts) and tick each box with its evidence`)] : [];
}

/**
 * Live page and example page out of step (audit C4, Duneglide; WW-1, The Bellkeeper's Walk): a port app whose
 * apps/<app>/src/main.ts imports examples/<dir>/main serves its own apps/<app>/index.html, so a fix made only in the
 * example page (results grid, phone layout, touch buttons) never reaches the live game. Compares the first <style> block
 * and the <body> markup before the first <script>. Escape hatch for an intended difference: `<!-- page-parity: ok -->`
 * in the app page.
 */
function checkPageParity({ game, root }) {
  const appDir = join(root, "apps", game.appFolder);
  const mainFile = join(appDir, "src", "main.ts");
  if (!existsSync(mainFile)) return [];
  const m = /import\s+["'](?:\.\.\/)+examples\/([^/"']+)\/main(?:\.ts)?["']/.exec(readFileSync(mainFile, "utf8"));
  if (!m) return [];
  const exampleHtml = join(root, "examples", m[1], "index.html");
  const appHtml = join(appDir, "index.html");
  if (!existsSync(exampleHtml) || !existsSync(appHtml)) return [];
  const app = readFileSync(appHtml, "utf8");
  if (/<!--\s*page-parity:\s*ok\b/.test(app)) return [];
  const block = (html) => ({ style: /<style>\n([\s\S]*?)\n\s*<\/style>/.exec(html)?.[1] ?? null, body: /<body>([\s\S]*?)<script/.exec(html)?.[1] ?? null });
  const a = block(app);
  const e = block(readFileSync(exampleHtml, "utf8"));
  const parts = [a.style !== e.style ? "<style> block" : null, a.body !== e.body ? "<body> markup" : null].filter(Boolean);
  if (parts.length === 0) return [];
  const rel = relative(root, appHtml).split(sep).join("/");
  return [finding("page-parity", "warn", game, rel, 0, `the ${parts.join(" and ")} differ from examples/${m[1]}/index.html, which this app mounts: a fix made in one page does not reach the other. Copy the example's block (or mark an intended difference with <!-- page-parity: ok -->)`)];
}

/**
 * Per-app asset subset gone stale (audit RH-06): a game that ships its own subset of the root catalogue keeps a generator at
 * apps/<app>/scripts/extract-assets.mjs. Runs it with --check, which exits non-zero when the root catalogue changed under it.
 */
function checkAppCatalog({ game, root }) {
  const script = join(root, "apps", game.appFolder, "scripts", "extract-assets.mjs");
  if (!existsSync(script)) return [];
  const rel = relative(root, script).split(sep).join("/");
  try {
    execFileSync(process.execPath, [script, "--check"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
    return [];
  } catch (error) {
    const said = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim().split("\n")[0]?.slice(0, 200) ?? "";
    return [finding("app-catalog", "warn", game, rel, 0, `the per-app asset subset is out of date with src/aura-assets.ts${said ? ` (${said})` : ""}: run node ${rel}`)];
  }
}

// ---------- GameUpgrades47 look checks (lane E-I, PRD WP-9 and D1/D2) ----------

/**
 * Severity of the four GU47 checks (art-direction, look-identity, borrowed-asset / prop-exclusivity, luma-band). They warn
 * through wave 2; WP-38 flips this to "error" for the 4.7.0 release gate (`run.mjs --all --strict` must pass either way).
 */
export const GU47_CHECK_SEVERITY = "warn";
const RECIPE = "docs/prds/game-upgrades-47/lanes/ei.md";
const posix = (p) => p.split(sep).join("/");

let gu47Cache = new Map();
const cached = (key, make) => { if (!gu47Cache.has(key)) gu47Cache.set(key, make()); return gu47Cache.get(key); };
const liveGames = (inventory) => inventory.games.filter((g) => g.kind === "game" && g.status === "live");
/** gameSources memoised per run (look-identity and prop-exclusivity read every live game). */
function sourcesOf(root, game) {
  return cached(`src|${root}|${game.slug}`, () => gameSources(root, game));
}

/** Candidate art/direction.ts paths of a game, repo-relative: the app folder first, then the examples it mounts. */
export function artDirectionCandidates(root, game, src) {
  const own = [`apps/${game.appFolder}/art/direction.ts`, `apps/${game.appFolder}/src/art/direction.ts`];
  const examples = src.dirs.map((d) => posix(relative(root, d))).filter((d) => d.startsWith("examples/")).map((d) => `${d}/art/direction.ts`);
  return [...own, ...examples];
}
const findArtDirection = (root, game, src) => artDirectionCandidates(root, game, src).find((rel) => existsSync(join(root, rel))) ?? null;

const AUDIT_PROBLEM = {
  missing: "art/direction.audit.json is missing: run the game's art-direction unit test, which writes it with writeArtDirectionAudit (tools/game-checks/lib/art-direction.mjs)",
  "invalid-json": "art/direction.audit.json is not valid JSON: rerun the art-direction unit test",
  schema: "art/direction.audit.json is not schema aura3d.art-direction-audit/1: rerun the art-direction unit test",
  stale: "art/direction.audit.json is stale (art/direction.ts changed since the audit): rerun the art-direction unit test and commit both files",
  "no-violations-array": "art/direction.audit.json has no violations array: write it with writeArtDirectionAudit",
  "no-id": "the art direction has no id",
  "no-signature-effect": "the art direction has no signatureEffect (the one effect that survives every tier)",
  "no-palette": "the art direction has no palette.primary"
};

/**
 * Art direction (PRD D1, WP-9): every live game ships art/direction.ts (defineArtDirection) and proves it with
 * auditArtDirection in a unit test that writes art/direction.audit.json (recipe: docs/prds/game-upgrades-47/lanes/ei.md).
 * TypeScript is never evaluated here; the check reads the audit record and verifies its sha256 against direction.ts.
 */
function checkArtDirection({ game, src, root }) {
  const rel = findArtDirection(root, game, src);
  if (!rel) {
    return [finding("art-direction", GU47_CHECK_SEVERITY, game, `apps/${game.appFolder}/art/direction.ts`, 0, `no art/direction.ts: ship defineArtDirection({ id, genre, palette, lighting, signatureEffect, ... }) in the game's folder and an auditArtDirection unit test that writes art/direction.audit.json (recipe: ${RECIPE})`)];
  }
  const audit = readArtDirectionAudit(join(root, rel), root);
  const auditRel = posix(relative(root, audit.path));
  return audit.problems.map((p) => {
    if (p === "violations") {
      const list = audit.record.violations;
      const rules = [...new Set(list.map((v) => v?.rule ?? v?.code ?? "?"))].slice(0, 6).join(", ");
      return finding("art-direction", GU47_CHECK_SEVERITY, game, auditRel, 0, `auditArtDirection reported ${list.length} violation(s) (${rules}): fix the scene or the direction, rerun the test`);
    }
    return finding("art-direction", GU47_CHECK_SEVERITY, game, p === "missing" ? rel : auditRel, 0, AUDIT_PROBLEM[p] ?? p);
  });
}

const normText = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normHex = (s) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s ?? "").trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? h.split("").map((c) => c + c).join("") : h}`;
};
const normHdriId = (s) => basename(String(s)).replace(/\.(hdr|exr|png|jpg|ktx2)$/i, "").replace(/[_-](1k|2k|4k|8k)$/i, "").toLowerCase();

/** The primary visible HDRI of an audit record: only `background: "hdri"` counts (PRD 6.1). { id, sha256, file } or null. */
export function primaryHdriOf(root, appFolder, environment) {
  if (!environment || environment.background !== "hdri" || !environment.hdri) return null;
  const raw = String(environment.hdri);
  const id = normHdriId(raw);
  const candidates = raw.startsWith("/")
    ? [`apps/${appFolder}/public${raw}`, `public${raw}`]
    : raw.includes("/")
      ? [raw]
      : [1, 2].flatMap((k) => [`public/hdri/${raw}_${k}k.hdr`, `fixtures/environment-corpus/hdri/${raw}_${k}k.hdr`, `assets/library/hdri/${raw}_${k}k.hdr`, `assets/library/hdri/${raw}-${k}k.hdr`]).concat([`public/hdri/${raw}.hdr`]);
  const file = candidates.find((c) => existsSync(join(root, c))) ?? null;
  const sha256 = file ? cached(`sha|${root}|${file}`, () => createHash("sha256").update(readFileSync(join(root, file))).digest("hex")) : null;
  return { id, sha256, file, raw };
}

/** Audit records of every live game (for look-identity), keyed by slug. */
function liveArtRecords(root, inventory) {
  return cached(`art|${root}`, () => {
    const out = new Map();
    for (const g of liveGames(inventory)) {
      const rel = findArtDirection(root, g, sourcesOf(root, g));
      if (!rel) continue;
      const audit = readArtDirectionAudit(join(root, rel), root);
      if (audit.record && audit.record.schema) out.set(g.slug, { game: g, record: audit.record, rel: posix(relative(root, audit.path)) });
    }
    return out;
  });
}

/**
 * Look identity (PRD D2, 6.1): no two live games share a primary HDRI (sha256 of the file, or the same catalogue id when
 * the file is not on disk yet), a signature effect, or a palette (3 or more identical primary hexes, or every primary of the
 * smaller palette). Reads the art-direction audit records; a game without one is the art-direction check's finding.
 */
function checkLookIdentity({ game, root, inventory }) {
  const records = liveArtRecords(root, inventory);
  const mine = records.get(game.slug);
  if (!mine) return [];
  const out = [];
  const others = [...records.values()].filter((r) => r.game.slug !== game.slug);
  const myHdri = primaryHdriOf(root, game.appFolder, mine.record.environment);
  if (myHdri) {
    const dup = others.filter((o) => {
      const h = primaryHdriOf(root, o.game.appFolder, o.record.environment);
      return h && ((h.sha256 && myHdri.sha256 && h.sha256 === myHdri.sha256) || h.id === myHdri.id);
    });
    if (dup.length) out.push(finding("look-identity", GU47_CHECK_SEVERITY, game, mine.rel, 0, `primary HDRI "${myHdri.raw}"${myHdri.sha256 ? ` (sha256 ${myHdri.sha256.slice(0, 12)})` : ""} is also the primary sky of ${dup.map((o) => o.game.slug).join(", ")}: pick a free HDRI in the same mood family or an authored sky (PRD 6.1)`));
  }
  const effect = normText(mine.record.signatureEffect);
  if (effect) {
    const dup = others.filter((o) => normText(o.record.signatureEffect) === effect);
    if (dup.length) out.push(finding("look-identity", GU47_CHECK_SEVERITY, game, mine.rel, 0, `signatureEffect "${mine.record.signatureEffect}" is shared with ${dup.map((o) => o.game.slug).join(", ")}: each live game owns its signature effect`));
  }
  const primaries = new Set((mine.record.palette?.primary ?? []).map(normHex).filter(Boolean));
  if (primaries.size) {
    const dup = others.flatMap((o) => {
      const theirs = new Set((o.record.palette?.primary ?? []).map(normHex).filter(Boolean));
      const common = [...primaries].filter((h) => theirs.has(h));
      const floor = Math.min(primaries.size, theirs.size);
      return common.length >= 3 || (common.length >= 2 && common.length === floor) ? [`${o.game.slug} (${common.join(" ")})`] : [];
    });
    if (dup.length) out.push(finding("look-identity", GU47_CHECK_SEVERITY, game, mine.rel, 0, `palette.primary is shared with ${dup.join(", ")}: give the game its own primary hexes`));
  }
  return out;
}

/** Every asset id in the root and per-app / per-example manifests: id -> { root: bool, apps: Set<appFolder>, source }. */
function assetUniverse(root) {
  return cached(`assets|${root}`, () => {
    const ids = new Map();
    const add = (rel, app) => {
      let json;
      try { json = JSON.parse(readFileSync(join(root, rel), "utf8")); } catch { return; }
      for (const a of Array.isArray(json?.assets) ? json.assets : []) {
        if (typeof a?.id !== "string") continue;
        const e = ids.get(a.id) ?? { root: false, apps: new Set(), source: null };
        if (app) e.apps.add(app);
        else { e.root = true; e.source = typeof a.source === "string" ? a.source : null; }
        ids.set(a.id, e);
      }
    };
    add("aura.assets.json", null);
    for (const base of ["apps", "examples"]) {
      if (!existsSync(join(root, base))) continue;
      for (const d of readdirSync(join(root, base))) {
        for (const rel of [`${base}/${d}/aura.assets.json`, `${base}/${d}/assets/aura.assets.json`]) if (existsSync(join(root, rel))) add(rel, `${base}/${d}`);
      }
    }
    return ids;
  });
}

/**
 * Owner of an asset id: the longest `assetOwners.prefixes` entry it starts with (at a camel-case boundary), else the one app
 * whose own manifest lists it, else the app its root-manifest source sits in. Owners are live slugs or retired app folders.
 */
export function assetOwnerOf(id, terms, universe, inventory) {
  const prefixes = terms.assetOwners?.prefixes ?? {};
  let best = null;
  for (const p of Object.keys(prefixes)) {
    if (id.startsWith(p) && (id.length === p.length || /[A-Z0-9_]/.test(id[p.length])) && (!best || p.length > best.length)) best = p;
  }
  if (best) return { owner: prefixes[best], via: `prefix ${best}` };
  const slugOf = (dir) => liveGames(inventory).find((g) => `apps/${g.appFolder}` === dir)?.slug ?? dir;
  const e = universe.get(id);
  if (e && !e.root && e.apps.size === 1) return { owner: slugOf([...e.apps][0]), via: "its own manifest" };
  const m = e?.source ? /^apps\/([^/]+)\//.exec(e.source) : null;
  if (m) return { owner: slugOf(`apps/${m[1]}`), via: "manifest source" };
  return null;
}

const isGenericAsset = (id, terms) => (terms.assetOwners?.generic ?? []).some((p) => id === p || (id.startsWith(p) && /[A-Z0-9_]/.test(id[p.length] ?? "")));
const MULTI_WORD = /[a-z][A-Z0-9]/;

/**
 * Asset ids a game references: multi-word ids anywhere in its code, one-word ids only as `assets.<id>`, `assets["<id>"]` or a
 * manifest `"id"`. An id that only another app's own manifest lists is not loadable here, so a match is a coincidence (an
 * audio cue or a variable named like it) and is skipped.
 */
function assetKeysUsed(root, game) {
  return cached(`used|${root}|${game.slug}`, () => {
    const universe = assetUniverse(root);
    const src = sourcesOf(root, game);
    const ownDirs = new Set(src.dirs.map((d) => posix(relative(root, d))));
    const used = new Map();
    for (const f of src.files) {
      if (!CODE_KIND.test(f.kind) && f.kind !== "json") continue;
      const lines = f.text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hit = (id) => {
          const e = universe.get(id);
          if (!e || used.has(id) || (!e.root && ![...e.apps].some((a) => ownDirs.has(a)))) return;
          used.set(id, { f, no: i + 1 });
        };
        for (const m of line.matchAll(/[A-Za-z_][A-Za-z0-9_]{2,}/g)) if (MULTI_WORD.test(m[0])) hit(m[0]);
        for (const m of line.matchAll(/\bassets\s*(?:\.\s*([A-Za-z_]\w*)|\[\s*["'`]([A-Za-z_]\w*)["'`]\s*\])|"id"\s*:\s*"([A-Za-z_]\w*)"/g)) hit(m[1] ?? m[2] ?? m[3]);
      }
    }
    return used;
  });
}

/**
 * Borrowed asset (PRD D2, IC47-A1, LINKS-08): a live game references an asset key owned by another game or app (by its
 * id prefix in terms.json `assetOwners.prefixes`, its own manifest or its manifest source). Escape hatch on the line:
 * `// borrowed-asset: ok`.
 */
function checkBorrowedAsset({ game, root, terms, inventory }) {
  const universe = assetUniverse(root);
  const out = [];
  for (const [id, at] of assetKeysUsed(root, game)) {
    if (isGenericAsset(id, terms) || okMarker(at.f, at.no, "borrowed-asset")) continue;
    const owner = assetOwnerOf(id, terms, universe, inventory);
    if (!owner || owner.owner === game.slug) continue;
    out.push(finding("borrowed-asset", GU47_CHECK_SEVERITY, game, at.f.rel, at.no, `asset key "${id}" belongs to ${owner.owner} (${owner.via}): replace it with an asset this game owns (D2: no borrowed keys across games)`));
  }
  return out;
}

/**
 * Prop exclusivity (PRD D2): no two live games reference the same non-generic asset key that neither owns (a key another
 * game owns is reported to the borrower by borrowed-asset). Generic engine assets: terms.json `assetOwners.generic`.
 * Escape hatch on the line: `// prop-exclusivity: ok`.
 */
function checkPropExclusivity({ game, root, terms, inventory }) {
  const universe = assetUniverse(root);
  const out = [];
  const mine = assetKeysUsed(root, game);
  const others = liveGames(inventory).filter((g) => g.slug !== game.slug);
  for (const [id, at] of mine) {
    if (isGenericAsset(id, terms) || okMarker(at.f, at.no, "prop-exclusivity")) continue;
    const owner = assetOwnerOf(id, terms, universe, inventory);
    if (owner && owner.owner !== game.slug) continue; // borrowed-asset reports it
    const sharers = others.filter((g) => assetKeysUsed(root, g).has(id) && !(owner && owner.owner === g.slug)).map((g) => g.slug);
    if (owner?.owner === game.slug || sharers.length === 0) continue;
    out.push(finding("prop-exclusivity", GU47_CHECK_SEVERITY, game, at.f.rel, at.no, `asset key "${id}" is also used by ${sharers.join(", ")}: no two live games share a non-generic asset key (D2); give each game its own`));
  }
  return out;
}

const fmtMiss = (m) => `${m.region === "frame" ? "" : `${m.region} `}${m.metric}${m.value === null || m.value === undefined ? "" : `=${m.value}`}${m.reason ? ` (${m.reason})` : ` not in [${m.min ?? ""}, ${m.max ?? ""}]`}`;

/**
 * Luma band (PRD 1.5, 7.2, WP-9): the committed steady-state capture `evidence/game-upgrades-47/<slug>/luma-after.json`
 * (decode-luma output) sits inside the bands the game declares in `luma-bands.json` (schema aura3d.luma-bands/1, see
 * tools/look-metrics/region-luma.mjs), or the PRD default band when none is declared. Blank frames and shots taken while
 * textures were still uploading always miss.
 */
function checkLumaBand({ game, root }) {
  const dir = `evidence/game-upgrades-47/${game.slug}`;
  const bandsRel = `${dir}/luma-bands.json`;
  const captureRel = `${dir}/luma-after.json`;
  const hasBands = existsSync(join(root, bandsRel));
  const decode = `node evidence/audit-fix/e5/decode-luma.mjs after=<acr-run.log> --out ${dir}`;
  if (!existsSync(join(root, captureRel))) {
    return [finding("luma-band", GU47_CHECK_SEVERITY, game, captureRel, 0, hasBands
      ? `luma-bands.json is declared but no steady-state capture is committed: capture remotely, then ${decode}`
      : `no committed steady-state capture (luma-after.json) and no declared luma-bands.json: declare the WP's bands and commit the decoded after-capture (${decode})`)];
  }
  let spec = null;
  if (hasBands) {
    try { spec = JSON.parse(readFileSync(join(root, bandsRel), "utf8")); } catch { spec = undefined; }
    if (!spec || spec.schema !== LUMA_BANDS_SCHEMA) return [finding("luma-band", GU47_CHECK_SEVERITY, game, bandsRel, 0, `luma-bands.json is not valid ${LUMA_BANDS_SCHEMA} JSON`)];
  }
  let rows;
  try { rows = loadCapture(join(root, captureRel)).metas; } catch { rows = []; }
  const results = evaluateBands(rows, spec, { slug: game.slug });
  if (results.length === 0) return [finding("luma-band", GU47_CHECK_SEVERITY, game, captureRel, 0, `no steady-state GL_META rows for ${game.slug} (settle-<s>s shots with s >= 20) in luma-after.json`)];
  const out = results.filter((r) => !r.pass).map((r) => finding("luma-band", GU47_CHECK_SEVERITY, game, captureRel, 0, `${r.target} ${r.id}: ${r.misses.slice(0, 3).map(fmtMiss).join("; ")}${r.misses.length > 3 ? ` (+${r.misses.length - 3} more)` : ""}`));
  if (!hasBands) out.push(finding("luma-band", GU47_CHECK_SEVERITY, game, bandsRel, 0, "no luma-bands.json: the capture was checked against the PRD default band only (darkFrac <= 0.6, clipFrac <= 0.05); declare the WP's acceptance bands"));
  return out;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => { const k = `${f.check}|${f.game}|${f.file}|${f.line}|${f.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export const GAME_CHECKS = {
  names: checkNames,
  quickbar: checkQuickbar,
  "canvas-resize": checkCanvasResize,
  "fixed-step-presenter": checkFixedStepPresenter,
  "hitstop-time": checkHitstopTime,
  "pose-array": checkPoseArray,
  "fit-grounding": checkFitGrounding,
  likeness: checkLikeness,
  "asset-provenance": checkAssetProvenance,
  kits: checkKits,
  "deployable-assets": checkDeployableAssets,
  "runtime-masking": checkRuntimeMasking,
  "no-three": checkNoThree,
  fonts: checkFonts,
  "screens-tracked": checkScreensTracked,
  "touch-input": checkTouchInput,
  lighting: checkLighting,
  "shared-catalog": checkSharedCatalog,
  "screens-fresh": checkScreensFresh,
  "brand-identifiers": checkBrandIdentifiers,
  "upgrade-guide": checkUpgradeGuide,
  "page-parity": checkPageParity,
  "app-catalog": checkAppCatalog,
  "art-direction": checkArtDirection,
  "look-identity": checkLookIdentity,
  "borrowed-asset": checkBorrowedAsset,
  "prop-exclusivity": checkPropExclusivity,
  "luma-band": checkLumaBand
};
export const GLOBAL_CHECKS = { vercelignore: checkVercelignore, counts: checkCounts, "meshy-cap": checkMeshyCap, skin: checkSkin };

/**
 * Run checks. options: { root, slugs?: string[] | "all", only?: string[], global?: boolean, env? }
 * Returns { findings, games, errors, warnings }.
 */
export function runChecks({ root, slugs = "all", only, global = slugs === "all", env = process.env }) {
  const inventory = loadInventory(root);
  const terms = loadTerms(root);
  const all = inventory.games.filter((g) => g.kind === "game" && g.status === "live");
  const norm = (s) => s.toLowerCase();
  const games = slugs === "all" ? all : all.filter((g) => slugs.some((s) => [g.slug, g.appFolder, g.title].map(norm).includes(norm(s))));
  if (slugs !== "all" && games.length !== slugs.length) {
    const missing = slugs.filter((s) => !games.some((g) => [g.slug, g.appFolder, g.title].map(norm).includes(norm(s))));
    throw new Error(`unknown game(s): ${missing.join(", ")}`);
  }
  const enabled = (id) => !only || only.includes(id);
  const findings = [];
  gu47Cache = new Map(); // memoised sources, manifests and audit records live for one run only
  for (const game of games) {
    const src = sourcesOf(root, game);
    for (const [id, fn] of Object.entries(GAME_CHECKS)) if (enabled(id)) findings.push(...fn({ game, src, terms, root, inventory }));
  }
  if (global) for (const [id, fn] of Object.entries(GLOBAL_CHECKS)) if (enabled(id)) findings.push(...fn({ root, terms, inventory, env }));
  return {
    findings,
    games: games.map((g) => g.slug),
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warn").length
  };
}
