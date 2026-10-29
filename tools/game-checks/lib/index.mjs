// Static checks for shipped games. Pure Node, no dependencies. See docs/agents/lessons-learned.md for why each exists.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

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
export function resetGitCache() { gitCache = new Map(); releaseCache = new Map(); }

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
 * Severity is warn until every live game passes; switch TOUCH_INPUT_SEVERITY to "error" then (lessons-learned.md).
 * Escape hatch for a game that is desktop-only on purpose: `// touch-input: ok` on the keyboard listener line.
 */
export const TOUCH_INPUT_SEVERITY = "warn";
function checkTouchInput({ game, src }) {
  const out = [];
  const code = src.files.filter((f) => CODE_KIND.test(f.kind));
  const keyboard = firstLine(code, /addEventListener\(\s*["']key(?:down|up)["']|\bonkeydown\s*=|\bactions\s*:\s*\{|\.code\s*===\s*["'](?:Key|Arrow|Space)/);
  if (!keyboard) return out;
  const touchApi = /mountTouchControls|bindGameTouch\w*\(|createTouchLayoutPreset|createGameTouchControlLayout|VirtualTouch\w*|addEventListener\(\s*["'](?:touchstart|touchmove|pointermove)["']|["']pointercancel["']|\bon(?:touchstart|touchmove|pointermove)\s*=|\btouch\s*:\s*\{\s*preset\s*:/;
  let touch = code.some((f) => touchApi.test(f.text));
  if (!touch) {
    for (const f of code) {
      for (const m of f.text.matchAll(/addEventListener\(\s*["']pointerdown["']|\bonpointerdown\s*=/g)) {
        const body = f.text.slice(m.index, m.index + 400);
        if (/clientX|clientY|offsetX|pageX|pointerType|movementX|getBoundingClientRect/.test(body)) { touch = true; break; }
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
 * Lighting rules that changed in 4.5.0 (audit LIGHT-01/03/04/05/11). All warn: each needs a steady-state capture, not a rule.
 *  - lights with no environment or look: the scene gets no image-based light (no implicit room since 4.5.0), so GLBs lose
 *    their reflections and fill. Add `environments.neutral({ intensity })` calibrated on a capture.
 *  - hemisphere next to an environment or look: with an environment node the hemisphere is dropped; with a no-HDRI look whose
 *    fill yields to an authored ambient, it is added to the ambient term.
 *  - a look added at runtime through app.nodes next to an authored ambient: the look's fill does not yield at runtime, so the
 *    scene is lit twice after the swap.
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
  const hemi = firstLine(code, /\blights\.hemisphere\s*\(/);
  if (hemi && hasEnv && !okMarker(hemi.f, hemi.no, "lighting")) {
    out.push(finding("lighting", "warn", game, hemi.f.rel, hemi.no, "hemisphere light next to an environment or look: an environment node drops it, and a no-HDRI look whose fill yields to an ambient adds it to the ambient term. Capture before and after tuning its intensity."));
  }
  const ambient = firstLine(code, /\blights\.ambient\s*\(/);
  if (ambient) {
    for (const f of code) {
      const lookFns = [...f.text.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)[^{]*\{/g)]
        .filter((m) => /\blooks\.preset\s*\(/.test(objectAt(f.text, m.index)))
        .map((m) => m[1]);
      const receivers = ["app\\.nodes", "\\w+\\.nodes"];
      for (const m of f.text.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*(?:\w+\.)?nodes\b/g)) receivers.push(m[1]);
      const arg = ["looks\\.preset", ...lookFns].join("|");
      const re = new RegExp(`(?:${receivers.join("|")})\\.add\\w*\\(\\s*(?:${arg})\\s*\\(`);
      const lines = f.text.split("\n");
      const i = lines.findIndex((l) => re.test(l));
      if (i >= 0 && !okMarker(f, i + 1, "lighting")) {
        out.push(finding("lighting", "warn", game, f.rel, i + 1, "look added at runtime through app.nodes next to an authored lights.ambient: the look's fill does not yield to the ambient at runtime, so the scene is brighter after the swap than on first load. Capture both."));
      }
    }
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
 */
function checkBrandIdentifiers({ game, src, terms }) {
  const out = [];
  const fold = (t) => t.toLowerCase().replace(/[\s_-]+/g, "");
  const brand = terms.brandTerms.filter((t) => fold(t).length >= 4).map((t) => ({ t, f: fold(t) }));
  for (const f of src.files) {
    if (!CODE_KIND.test(f.kind)) continue;
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
  "upgrade-guide": checkUpgradeGuide
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
  for (const game of games) {
    const src = gameSources(root, game);
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
