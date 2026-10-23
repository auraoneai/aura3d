/**
 * tools/crayon-capture/look-dump-lib — pure logic and in-page sources for the look-spec dump.
 *
 * Goal: measure an original game's LOOK (camera, renderer settings, lights, fog/background, material table,
 * post chain, particles, canvas textures) and the ASSET INVENTORY it loads, as numbers, so a port can match
 * from data instead of eyeballing. Only numbers, names, hashes and sizes are recorded: no third-party bytes,
 * shader source or texture pixels are stored (shader sources are hashed; textures are summarised by a 4x4
 * mean-colour grid at most).
 *
 * The in-page sources are plain JS strings (not stringified TS) so tsx/esbuild helpers cannot leak into the
 * page and so the unit tests run the exact same source in a `vm` context. LOOK_HOOK_SOURCE is installed after
 * the probe's HOOK_SOURCE (same init-script mechanism, reaches the sandboxed srcdoc game frame).
 */

export const LOOK_SCHEMA = "a3d-look-spec/1";
export const LOOK_PHASES = ["title", "early", "mid", "effect"] as const;
export type LookPhase = (typeof LOOK_PHASES)[number];
export const LOOK_SEED = 20261023;

// ---- hashing (identical to the in-page `fnv`) -------------------------------------------------

const hex8 = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");

/** Two 32-bit FNV-style lanes, hex. Deterministic, dependency-free, the same function runs in the page. */
export function hashString(input: string): string {
  const s = String(input);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ ((c + i) & 0xffff), 0x85ebca6b) >>> 0;
  }
  return hex8(h1) + hex8(h2);
}

// ---- stable, rounded JSON ---------------------------------------------------------------------

export function roundDeep<T>(value: T, digits = 4): T {
  const f = 10 ** digits;
  const walk = (v: unknown): unknown => {
    if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * f) / f : null;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = walk((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

/** Sorted keys, floats rounded to `digits`, so equal specs are byte-equal. */
export function stableStringify(value: unknown, space = 2, digits = 4): string {
  return JSON.stringify(roundDeep(value, digits), null, space);
}

// ---- material de-duplication --------------------------------------------------------------------

export interface RawMaterial {
  readonly users?: number;
  readonly name?: string;
  readonly [key: string]: unknown;
}

export interface MaterialRow {
  readonly id: string;
  readonly signature: string;
  readonly instances: number;
  readonly users: number;
  readonly names: readonly string[];
  readonly spec: Record<string, unknown>;
}

/** Collapse identical material parameter sets (clones differing only by name/users) into rows, most used first. */
export function dedupeMaterials(raw: readonly RawMaterial[], cap = 120): { rows: MaterialRow[]; omitted: number } {
  const by = new Map<string, { spec: Record<string, unknown>; instances: number; users: number; names: string[] }>();
  for (const m of raw) {
    const { users, name, ...spec } = m;
    const sig = hashString(stableStringify(spec, 0));
    const hit = by.get(sig);
    const u = typeof users === "number" ? users : 1;
    if (hit) {
      hit.instances++;
      hit.users += u;
      if (name && hit.names.length < 5 && !hit.names.includes(name)) hit.names.push(name);
    } else {
      by.set(sig, { spec: spec as Record<string, unknown>, instances: 1, users: u, names: name ? [name] : [] });
    }
  }
  const sorted = [...by.entries()].sort((a, b) => b[1].users - a[1].users || a[0].localeCompare(b[0]));
  const rows = sorted.slice(0, cap).map(([signature, v], i): MaterialRow => ({ id: `m${i}`, signature, instances: v.instances, users: v.users, names: v.names, spec: v.spec }));
  return { rows, omitted: Math.max(0, sorted.length - cap) };
}

/** Union per-phase material row sets by signature (users/instances = max across phases), most used first. */
export function unionMaterialRows(sets: readonly (readonly MaterialRow[])[], cap = 160): MaterialRow[] {
  const by = new Map<string, MaterialRow>();
  for (const rows of sets) {
    for (const row of rows) {
      const hit = by.get(row.signature);
      if (!hit) by.set(row.signature, row);
      else if (row.users > hit.users || row.instances > hit.instances) {
        by.set(row.signature, { ...hit, users: Math.max(hit.users, row.users), instances: Math.max(hit.instances, row.instances), names: [...new Set([...hit.names, ...row.names])].slice(0, 5) });
      }
    }
  }
  return [...by.values()]
    .sort((a, b) => b.users - a.users || a.signature.localeCompare(b.signature))
    .slice(0, cap)
    .map((r, i) => ({ ...r, id: `m${i}` }));
}

// ---- camera path ----------------------------------------------------------------------------------

export interface PathPoint {
  readonly t: number;
  readonly pos: readonly number[];
  readonly fwd: readonly number[];
  readonly fov?: number | null;
}

export interface PathSummary {
  readonly count: number;
  readonly durationMs: number;
  readonly length: number;
  readonly meanSpeed: number;
  readonly maxSpeed: number;
  readonly samples: readonly PathPoint[];
}

const dist3 = (a: readonly number[], b: readonly number[]): number => Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));

/** Evenly spaced samples (by index) plus travelled length and speed (scene units per second). */
export function samplePath(points: readonly PathPoint[], n = 48): PathSummary {
  if (points.length === 0) return { count: 0, durationMs: 0, length: 0, meanSpeed: 0, maxSpeed: 0, samples: [] };
  let length = 0;
  let maxSpeed = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as PathPoint;
    const b = points[i] as PathPoint;
    const d = dist3(a.pos, b.pos);
    length += d;
    const dt = (b.t - a.t) / 1000;
    if (dt > 0) maxSpeed = Math.max(maxSpeed, d / dt);
  }
  const durationMs = (points[points.length - 1] as PathPoint).t - (points[0] as PathPoint).t;
  const meanSpeed = durationMs > 0 ? length / (durationMs / 1000) : 0;
  const take = Math.min(n, points.length);
  const samples: PathPoint[] = [];
  for (let i = 0; i < take; i++) samples.push(points[take === 1 ? 0 : Math.round((i * (points.length - 1)) / (take - 1))] as PathPoint);
  return { count: points.length, durationMs, length, meanSpeed, maxSpeed, samples };
}

// ---- effect-heaviness -------------------------------------------------------------------------------

export interface EffectComponents {
  readonly points: number;
  readonly sprites: number;
  readonly transparent: number;
  readonly instanced: number;
  readonly visible: number;
}

export function effectScore(c: EffectComponents): number {
  return c.points + c.sprites * 4 + c.transparent * 2 + c.instanced * 0.5 + c.visible * 0.01;
}

// ---- asset inventory ----------------------------------------------------------------------------------

export interface PerfEntry {
  readonly name: string;
  readonly initiatorType?: string;
  readonly transferSize?: number;
  readonly encodedBodySize?: number;
  readonly decodedBodySize?: number;
  readonly duration?: number;
}

export interface ResponseEntry {
  readonly url: string;
  readonly status: number;
  readonly contentType?: string;
  readonly resourceType?: string;
  readonly bytes?: number;
  readonly sha256?: string;
}

export type AssetKind = "model" | "image" | "audio" | "video" | "script" | "style" | "json" | "wasm" | "font" | "html" | "shader" | "other";

export interface InventoryEntry {
  readonly url: string;
  readonly host: string;
  readonly path: string;
  readonly ext: string;
  readonly kind: AssetKind;
  readonly queryKeys: readonly string[];
  readonly status: number | null;
  readonly contentType: string | null;
  readonly bytes: number | null;
  readonly transferSize: number | null;
  readonly sha256: string | null;
  readonly initiators: readonly string[];
}

const KIND_BY_EXT: Record<string, AssetKind> = {
  glb: "model", gltf: "model", obj: "model", fbx: "model", bin: "model", ktx2: "image", basis: "image",
  png: "image", jpg: "image", jpeg: "image", webp: "image", avif: "image", gif: "image", svg: "image", hdr: "image", exr: "image",
  mp3: "audio", ogg: "audio", wav: "audio", m4a: "audio", opus: "audio", flac: "audio",
  mp4: "video", webm: "video",
  js: "script", mjs: "script", css: "style", json: "json", wasm: "wasm", woff: "font", woff2: "font", ttf: "font", otf: "font",
  html: "html", htm: "html", glsl: "shader", wgsl: "shader", frag: "shader", vert: "shader"
};

export function classifyAsset(ext: string, contentType: string | null): AssetKind {
  const e = ext.toLowerCase();
  if (KIND_BY_EXT[e]) return KIND_BY_EXT[e] as AssetKind;
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("model/")) return "model";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("audio/")) return "audio";
  if (ct.startsWith("video/")) return "video";
  if (ct.includes("javascript")) return "script";
  if (ct.includes("css")) return "style";
  if (ct.includes("json")) return "json";
  if (ct.includes("wasm")) return "wasm";
  if (ct.startsWith("font/")) return "font";
  if (ct.includes("html")) return "html";
  return "other";
}

/** Drop query VALUES (they can carry signed tokens), keep origin, path and the query KEY names. */
export function normalizeUrl(raw: string): { url: string; host: string; path: string; ext: string; queryKeys: string[] } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol === "data:" || u.protocol === "blob:") {
    return { url: `${u.protocol}${raw.length > 24 ? `<${raw.length}b>` : ""}`, host: u.protocol, path: "", ext: "", queryKeys: [] };
  }
  const keys = [...new Set([...u.searchParams.keys()])].sort();
  const m = /\.([A-Za-z0-9]{1,6})$/.exec(u.pathname);
  return { url: `${u.origin}${u.pathname}`, host: u.host, path: u.pathname, ext: m ? (m[1] as string).toLowerCase() : "", queryKeys: keys };
}

/** Merge Resource Timing entries (initiators, sizes) with Node-side responses (status, content type, bytes, hash). */
export function mergeInventory(perf: readonly PerfEntry[], responses: readonly ResponseEntry[]): { entries: InventoryEntry[]; totals: Record<string, { count: number; bytes: number }> } {
  const by = new Map<string, { url: string; host: string; path: string; ext: string; queryKeys: Set<string>; status: number | null; contentType: string | null; bytes: number | null; transferSize: number | null; sha256: string | null; initiators: Set<string> }>();
  const touch = (raw: string) => {
    const n = normalizeUrl(raw);
    if (!n) return null;
    let row = by.get(n.url);
    if (!row) {
      row = { url: n.url, host: n.host, path: n.path, ext: n.ext, queryKeys: new Set(), status: null, contentType: null, bytes: null, transferSize: null, sha256: null, initiators: new Set() };
      by.set(n.url, row);
    }
    for (const k of n.queryKeys) row.queryKeys.add(k);
    return row;
  };
  for (const p of perf) {
    const row = touch(p.name);
    if (!row) continue;
    if (p.initiatorType) row.initiators.add(p.initiatorType);
    if (typeof p.transferSize === "number" && p.transferSize > 0) row.transferSize = Math.max(row.transferSize ?? 0, p.transferSize);
    const body = p.decodedBodySize ?? p.encodedBodySize;
    if (typeof body === "number" && body > 0 && row.bytes === null) row.bytes = body;
  }
  for (const r of responses) {
    const row = touch(r.url);
    if (!row) continue;
    row.status = r.status;
    if (r.contentType) row.contentType = r.contentType.split(";")[0]?.trim() ?? null;
    if (typeof r.bytes === "number") row.bytes = r.bytes;
    if (r.sha256) row.sha256 = r.sha256;
    if (r.resourceType) row.initiators.add(`pw:${r.resourceType}`);
  }
  const entries = [...by.values()]
    .map((r): InventoryEntry => ({
      url: r.url,
      host: r.host,
      path: r.path,
      ext: r.ext,
      kind: classifyAsset(r.ext, r.contentType),
      queryKeys: [...r.queryKeys].sort(),
      status: r.status,
      contentType: r.contentType,
      bytes: r.bytes,
      transferSize: r.transferSize,
      sha256: r.sha256,
      initiators: [...r.initiators].sort()
    }))
    .sort((a, b) => a.url.localeCompare(b.url));
  const totals: Record<string, { count: number; bytes: number }> = {};
  for (const e of entries) {
    const t = (totals[e.kind] ??= { count: 0, bytes: 0 });
    t.count++;
    t.bytes += e.bytes ?? 0;
  }
  return { entries, totals };
}

// ---- ACR log splitting ----------------------------------------------------------------------------------

/** Extract `@@A3D_LOOK_BEGIN:<id>` ... `@@A3D_LOOK_END:<id>` blocks from a run log and JSON-parse each. */
export function splitMarkerBlocks(log: string, prefix = "A3D_LOOK"): { id: string; json: unknown | null; error?: string }[] {
  const out: { id: string; json: unknown | null; error?: string }[] = [];
  const re = new RegExp(`@@${prefix}_BEGIN:([A-Za-z0-9_.-]+)\\r?\\n([\\s\\S]*?)@@${prefix}_END:\\1`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(log)) !== null) {
    const id = m[1] as string;
    const body = (m[2] as string).trim();
    try {
      out.push({ id, json: JSON.parse(body) });
    } catch (e) {
      out.push({ id, json: null, error: String(e).slice(0, 160) });
    }
  }
  return out;
}

// ---- spec assembly + validation ------------------------------------------------------------------------

export interface LookSpec {
  readonly schema: typeof LOOK_SCHEMA;
  readonly game: string;
  readonly url: string;
  readonly meta: Record<string, unknown>;
  readonly phases: Partial<Record<LookPhase, Record<string, unknown>>>;
  readonly materials: { readonly rows: readonly MaterialRow[]; readonly omitted: number; readonly fromPhase?: string };
  readonly postChain: Record<string, unknown> | null;
  readonly cameraPath: PathSummary | null;
  readonly inventory: { readonly entries: readonly InventoryEntry[]; readonly totals: Record<string, { count: number; bytes: number }> };
  readonly errors: readonly string[];
}

export function validateLookSpec(spec: unknown): string[] {
  const errs: string[] = [];
  if (!spec || typeof spec !== "object") return ["spec is not an object"];
  const s = spec as Record<string, unknown>;
  if (s.schema !== LOOK_SCHEMA) errs.push(`schema must be ${LOOK_SCHEMA}`);
  if (typeof s.game !== "string" || s.game === "") errs.push("game missing");
  if (typeof s.url !== "string") errs.push("url missing");
  const phases = s.phases as Record<string, Record<string, unknown>> | undefined;
  if (!phases || typeof phases !== "object") errs.push("phases missing");
  else {
    for (const need of ["mid"]) if (!phases[need]) errs.push(`phase ${need} missing`);
    for (const [name, p] of Object.entries(phases)) {
      if (!(LOOK_PHASES as readonly string[]).includes(name)) errs.push(`unknown phase ${name}`);
      if (!p || typeof p !== "object") continue;
      if (!Array.isArray(p.renderers)) errs.push(`phase ${name}: renderers must be an array`);
      if (!Array.isArray(p.lights)) errs.push(`phase ${name}: lights must be an array`);
      if (!p.counts || typeof p.counts !== "object") errs.push(`phase ${name}: counts missing`);
    }
  }
  const mats = s.materials as { rows?: unknown } | undefined;
  if (!mats || !Array.isArray(mats.rows)) errs.push("materials.rows missing");
  const inv = s.inventory as { entries?: unknown } | undefined;
  if (!inv || !Array.isArray(inv.entries)) errs.push("inventory.entries missing");
  if (!Array.isArray(s.errors)) errs.push("errors must be an array");
  return errs;
}

// ---- in-page sources -----------------------------------------------------------------------------------

/** Installed after HOOK_SOURCE. Virtual clock + seeded RNG + render wrapper (camera/post-chain capture) + resource timing. */
export const LOOK_HOOK_SOURCE = String.raw`(function () {
  if (typeof window === "undefined" || window.__a3dLook) return;
  var realPerfNow = performance.now.bind(performance);
  var realDateNow = Date.now.bind(Date);
  var look = {
    schema: 1, mode: "auto", dt: 50, vt: 0, vt0: 0, dateBase: 0, steps: 0, skipRender: false,
    rafQueue: [], manualId: 0, frameCalls: [], lastFrameCalls: [], cameras: [], resources: [],
    marks: [], errors: [], renderCalls: 0, seed: ${LOOK_SEED}
  };
  window.__a3dLook = look;

  var seed = look.seed >>> 0;
  Math.random = function () {
    seed = (seed + 0x6D2B79F5) >>> 0;
    var t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  performance.now = function () { return look.mode === "manual" ? look.vt : realPerfNow(); };
  Date.now = function () { return look.mode === "manual" ? look.dateBase + (look.vt - look.vt0) : realDateNow(); };

  var realRAF = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
  var realCancel = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null;
  function frameBoundary() {
    look.lastFrameCalls = look.frameCalls;
    look.frameCalls = [];
  }
  window.requestAnimationFrame = function (cb) {
    if (look.mode === "manual" || !realRAF) {
      look.manualId--;
      look.rafQueue.push({ id: look.manualId, cb: cb });
      return look.manualId;
    }
    return realRAF(function (ts) { frameBoundary(); cb(ts); });
  };
  window.cancelAnimationFrame = function (id) {
    if (id < 0) {
      look.rafQueue = look.rafQueue.filter(function (e) { return e.id !== id; });
      return;
    }
    if (realCancel) realCancel(id);
  };

  look.enterManual = function (dt) {
    if (look.mode === "manual") return look.vt;
    look.dt = dt || 50;
    look.vt0 = realPerfNow();
    look.vt = look.vt0;
    look.dateBase = realDateNow();
    look.mode = "manual";
    return look.vt;
  };
  function runTick() {
    look.vt += look.dt;
    look.steps++;
    frameBoundary();
    var q = look.rafQueue;
    look.rafQueue = [];
    for (var j = 0; j < q.length; j++) {
      try { q[j].cb(look.vt); } catch (e) { if (look.errors.length < 20) look.errors.push("tick:" + String(e).slice(0, 120)); }
    }
  }
  look.stepAsync = function (n) {
    return new Promise(function (resolve) {
      var i = 0, empty = 0;
      function tick() {
        if (i >= n) return resolve({ done: i, vt: look.vt });
        if (!look.rafQueue.length) {
          if (++empty > 400) return resolve({ done: i, stalled: true, vt: look.vt });
          return setTimeout(tick, 5);
        }
        empty = 0;
        runTick();
        i++;
        if (i % 4 === 0) setTimeout(tick, 0); else tick();
      }
      tick();
    });
  };
  look.virtualMs = function () { return look.mode === "manual" ? Math.round(look.vt - look.vt0) : null; };

  var KEYCODES = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32, Enter: 13, Escape: 27, ShiftLeft: 16, KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68 };
  function biggestCanvas() {
    var best = null, area = 0, cs = document.getElementsByTagName("canvas");
    for (var i = 0; i < cs.length; i++) { var a = (cs[i].width || 0) * (cs[i].height || 0); if (a > area) { area = a; best = cs[i]; } }
    return best || document.body || document;
  }
  look.key = function (type, code) {
    var key = code.indexOf("Key") === 0 ? code.slice(3).toLowerCase() : code === "Space" ? " " : code;
    var kc = KEYCODES[code] || 0;
    var ev = new KeyboardEvent(type, { key: key, code: code, keyCode: kc, which: kc, bubbles: true, cancelable: true });
    biggestCanvas().dispatchEvent(ev);
    return true;
  };

  // ---- summarisers (shared with the dump) ----
  var u = look.util = {};
  u.ctor = function (o) { try { return (o && o.constructor && o.constructor.name) || "?"; } catch (e) { return "?"; } };
  u.round = function (n) { return typeof n === "number" && isFinite(n) ? Math.round(n * 10000) / 10000 + 0 : (typeof n === "number" ? null : n); };
  u.fnv = function (s) {
    s = String(s);
    var h1 = 0x811c9dc5, h2 = 0x9e3779b9;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ ((c + i) & 0xffff), 0x85ebca6b) >>> 0;
    }
    function hx(n) { var t = (n >>> 0).toString(16); while (t.length < 8) t = "0" + t; return t; }
    return hx(h1) + hx(h2);
  };
  u.hex = function (c) { try { return c && c.isColor ? "#" + c.getHexString() : null; } catch (e) { return null; } };
  u.vec = function (v) {
    if (!v) return null;
    var r = u.round;
    if (v.isVector4 || v.isQuaternion) return [r(v.x), r(v.y), r(v.z), r(v.w)];
    if (v.isVector3) return [r(v.x), r(v.y), r(v.z)];
    if (v.isVector2) return [r(v.x), r(v.y)];
    if (v.isEuler) return [r(v.x), r(v.y), r(v.z), v.order];
    return null;
  };
  u.grid = function (src) {
    try {
      var c = document.createElement("canvas");
      c.width = 4; c.height = 4;
      var g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(src, 0, 0, 4, 4);
      var d = g.getImageData(0, 0, 4, 4).data, out = [];
      for (var i = 0; i < 16; i++) out.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]]);
      return out;
    } catch (e) { return null; }
  };
  u.strip = function (s) {
    try { var x = new URL(String(s), location.href); return x.protocol === "data:" ? "data:" : x.origin + x.pathname; } catch (e) { return String(s).slice(0, 64); }
  };
  u.texCount = 0;
  u.tex = function (t, withGrid) {
    if (!t) return null;
    var img = t.image, w = null, h = null, src = null;
    if (Array.isArray(img)) { img = img[0]; }
    if (img) {
      w = img.width || img.videoWidth || img.naturalWidth || null;
      h = img.height || img.videoHeight || img.naturalHeight || null;
      if (typeof img.src === "string" && img.src) src = u.strip(img.src);
    }
    var o = {
      ctor: u.ctor(t), name: t.name || "", w: w, h: h, format: t.format, type: t.type, colorSpace: t.colorSpace || null,
      wrapS: t.wrapS, wrapT: t.wrapT, minFilter: t.minFilter, magFilter: t.magFilter, anisotropy: t.anisotropy,
      flipY: t.flipY, mipmaps: t.generateMipmaps, mapping: t.mapping,
      repeat: u.vec(t.repeat), offset: u.vec(t.offset), rotation: u.round(t.rotation),
      canvas: !!(t.isCanvasTexture || (img && img.tagName === "CANVAS")), data: !!t.isDataTexture, cube: !!t.isCubeTexture,
      video: !!t.isVideoTexture, compressed: !!t.isCompressedTexture, depth: !!t.isDepthTexture, src: src
    };
    if (withGrid && u.texCount < 64 && img && (o.canvas || t.isDataTexture !== true) && (img.tagName === "CANVAS" || img.tagName === "IMG")) {
      u.texCount++;
      var g = u.grid(img);
      if (g) o.colorGrid4x4 = g;
    }
    return o;
  };
  u.uval = function (v) {
    if (v === null || v === undefined) return null;
    var t = typeof v;
    if (t === "number") return u.round(v);
    if (t === "boolean" || t === "string") return v;
    if (v.isColor) return { color: u.hex(v) };
    var vv = u.vec(v);
    if (vv) return vv;
    if (v.isTexture) return { texture: u.tex(v, false) };
    if (v.isMatrix4 || v.isMatrix3) return { matrix: v.elements ? v.elements.length : 0 };
    if (Array.isArray(v) || (v.length !== undefined && typeof v !== "function")) {
      var sample = [], n = Math.min(v.length, 4);
      for (var i = 0; i < n; i++) sample.push(typeof v[i] === "number" ? u.round(v[i]) : u.uval(v[i]));
      return { array: v.length, sample: sample };
    }
    return { object: u.ctor(v) };
  };
  u.uniforms = function (us, limit) {
    var out = {}, keys = Object.keys(us || {}).sort().slice(0, limit || 64);
    for (var i = 0; i < keys.length; i++) {
      var x = us[keys[i]];
      var val = x && typeof x === "object" && "value" in x ? x.value : x;
      out[keys[i]] = u.uval(val);
    }
    return out;
  };
  var SCALARS = ["opacity", "transparent", "alphaTest", "side", "blending", "depthWrite", "depthTest", "colorWrite", "fog", "flatShading", "vertexColors", "toneMapped", "wireframe", "roughness", "metalness", "emissiveIntensity", "envMapIntensity", "reflectivity", "ior", "transmission", "thickness", "clearcoat", "clearcoatRoughness", "sheen", "iridescence", "size", "sizeAttenuation", "linewidth", "dashSize", "gapSize", "shininess", "specularIntensity", "lightMapIntensity", "aoMapIntensity", "bumpScale", "displacementScale"];
  var COLORS = ["color", "emissive", "specular", "specularColor", "sheenColor", "attenuationColor"];
  var MAPS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "alphaMap", "envMap", "lightMap", "bumpMap", "displacementMap", "gradientMap", "matcap", "transmissionMap", "clearcoatMap"];
  var NODE_SLOTS = ["fragmentNode", "colorNode", "positionNode", "vertexNode", "emissiveNode", "normalNode", "opacityNode", "roughnessNode", "metalnessNode"];
  u.mat = function (m) {
    var o = { ctor: u.ctor(m), type: m.type || null, name: m.name || "" }, i, k;
    for (i = 0; i < SCALARS.length; i++) { k = SCALARS[i]; var v = m[k]; if (typeof v === "number") o[k] = u.round(v); else if (typeof v === "boolean") o[k] = v; }
    for (i = 0; i < COLORS.length; i++) { k = COLORS[i]; var h = u.hex(m[k]); if (h) o[k] = h; }
    if (m.normalScale && m.normalScale.isVector2) o.normalScale = u.vec(m.normalScale);
    var maps = {}, any = false;
    for (i = 0; i < MAPS.length; i++) { k = MAPS[i]; if (m[k]) { maps[k] = u.tex(m[k], true); any = true; } }
    if (any) o.maps = maps;
    if (m.isShaderMaterial || m.isRawShaderMaterial) {
      o.shader = true;
      o.uniforms = u.uniforms(m.uniforms, 64);
      if (m.defines && typeof m.defines === "object") { var dk = Object.keys(m.defines).sort().slice(0, 32), dd = {}; for (i = 0; i < dk.length; i++) dd[dk[i]] = u.uval(m.defines[dk[i]]); o.defines = dd; }
      o.vertexHash = m.vertexShader ? u.fnv(m.vertexShader) : null;
      o.fragmentHash = m.fragmentShader ? u.fnv(m.fragmentShader) : null;
      o.vertexLen = m.vertexShader ? m.vertexShader.length : 0;
      o.fragmentLen = m.fragmentShader ? m.fragmentShader.length : 0;
      o.lights = !!m.lights;
    }
    if (m.isNodeMaterial === true || /NodeMaterial$/.test(o.ctor)) {
      o.node = true;
      var slots = [];
      for (i = 0; i < NODE_SLOTS.length; i++) { try { if (m[NODE_SLOTS[i]] != null) slots.push(NODE_SLOTS[i]); } catch (e) {} }
      o.nodeSlots = slots;
    }
    return o;
  };

  // ---- render wrapper: camera path, frame call log (post chain), optional render skipping ----
  function recordCall(r, obj, cam) {
    look.renderCalls++;
    var e = { kind: obj && obj.isScene ? "scene" : "object", ctor: u.ctor(obj) };
    if (cam) e.camera = u.ctor(cam);
    try {
      var tgt = r.getRenderTarget ? r.getRenderTarget() : null;
      if (tgt) e.target = { w: tgt.width, h: tgt.height, samples: tgt.samples || 0, textures: tgt.textures ? tgt.textures.length : 1, type: tgt.texture ? tgt.texture.type : null, format: tgt.texture ? tgt.texture.format : null, depth: !!tgt.depthBuffer };
    } catch (err) {}
    try {
      if (obj && !obj.isScene) {
        var m = obj.material;
        if (m) { e.material = u.ctor(m); if (m.uniforms) e.uniforms = u.uniforms(m.uniforms, 24); if (m.fragmentShader) e.fragmentHash = u.fnv(m.fragmentShader); }
      } else if (obj) {
        e.children = obj.children ? obj.children.length : 0;
        if (obj.overrideMaterial) e.override = u.ctor(obj.overrideMaterial);
      }
    } catch (err) {}
    if (look.frameCalls.length < 64) look.frameCalls.push(e);
    if (cam && cam.isCamera && obj && obj.isScene) {
      var rec = null;
      for (var i = 0; i < look.cameras.length; i++) if (look.cameras[i].ref === cam) { rec = look.cameras[i]; break; }
      if (!rec) { rec = { ref: cam, calls: 0, path: [], lastT: -1e9 }; look.cameras.push(rec); }
      rec.calls++;
      var now = performance.now();
      if (now - rec.lastT >= 90 && rec.path.length < 800) {
        rec.lastT = now;
        try {
          if (cam.updateMatrixWorld) cam.updateMatrixWorld();
          var el = cam.matrixWorld.elements;
          rec.path.push({ t: Math.round(now), pos: [u.round(el[12]), u.round(el[13]), u.round(el[14])], fwd: [u.round(-el[8]), u.round(-el[9]), u.round(-el[10])], fov: cam.fov === undefined ? null : u.round(cam.fov) });
        } catch (err) {}
      }
    }
  }
  function wrapRenderer(r) {
    ["render", "renderAsync"].forEach(function (name) {
      try {
        var orig = r[name];
        if (typeof orig !== "function" || orig.__a3dLook) return;
        var w = function (obj, cam) {
          try { recordCall(r, obj, cam); } catch (err) {}
          if (look.skipRender && look.mode === "manual") return name === "renderAsync" ? Promise.resolve() : undefined;
          return orig.apply(this, arguments);
        };
        w.__a3dLook = true;
        r[name] = w;
      } catch (err) { look.errors.push("wrap:" + name); }
    });
  }
  var bus = window.__THREE_DEVTOOLS__;
  if (!bus || typeof bus.addEventListener !== "function") {
    bus = new EventTarget();
    try { Object.defineProperty(window, "__THREE_DEVTOOLS__", { value: bus, configurable: true, writable: true }); } catch (e) { window.__THREE_DEVTOOLS__ = bus; }
  }
  bus.addEventListener("observe", function (e) {
    try { var d = e && e.detail; if (d && (d.isWebGLRenderer || d.isWebGPURenderer || d.isRenderer)) wrapRenderer(d); } catch (err) {}
  });

  // ---- resource timing ----
  try {
    new PerformanceObserver(function (list) {
      var es = list.getEntries();
      for (var i = 0; i < es.length && look.resources.length < 6000; i++) {
        var x = es[i];
        look.resources.push({ name: u.strip(x.name), initiatorType: x.initiatorType, transferSize: x.transferSize, encodedBodySize: x.encodedBodySize, decodedBodySize: x.decodedBodySize, duration: Math.round(x.duration) });
      }
    }).observe({ type: "resource", buffered: true });
  } catch (e) { look.errors.push("perfobserver"); }
})();`;

/** Expression: bounded, JSON-safe look dump of the current live state. Requires HOOK_SOURCE + LOOK_HOOK_SOURCE. */
export const LOOK_DUMP_SOURCE = String.raw`(function () {
  var hook = window.__a3dHook, look = window.__a3dLook;
  if (!hook || !look) return { error: "hook missing" };
  var u = look.util, r4 = u.round;
  var TONE = ["none", "linear", "reinhard", "cineon", "aces", "custom", "agx", "neutral"];
  var SHADOW = ["basic", "pcf", "pcfsoft", "vsm"];
  var SKY_NAME = /sky|dome|gradient|horizon|cloud|aurora|space|star/i;
  var PARTICLE_NAME = /particle|spark|rain|dust|snow|smoke|fx|trail|splash|confetti|ember|stream|speed/i;
  var out = { virtualMs: look.virtualMs(), mode: look.mode, steps: look.steps, errors: [] };

  function describeRenderer(info) {
    var r = info.ref, o = { kind: info.kind, renderCalls: info.renderCalls, targetSets: info.targetSets, nonNullTargetSets: info.nonNullTargetSets };
    try { o.toneMapping = r.toneMapping; o.toneMappingName = TONE[r.toneMapping] || "unknown"; o.exposure = r4(r.toneMappingExposure); } catch (e) {}
    try { o.outputColorSpace = r.outputColorSpace || null; } catch (e) {}
    try { if (r.getPixelRatio) o.pixelRatio = r4(r.getPixelRatio()); } catch (e) {}
    try { if (r.getSize) { var sz = { x: 0, y: 0, set: function (a, b) { this.x = a; this.y = b; return this; } }; r.getSize(sz); o.size = [sz.x, sz.y]; } } catch (e) {}
    try { if (r.shadowMap) o.shadowMap = { enabled: !!r.shadowMap.enabled, type: SHADOW[r.shadowMap.type] || r.shadowMap.type, autoUpdate: r.shadowMap.autoUpdate }; } catch (e) {}
    try { o.autoClear = r.autoClear; } catch (e) {}
    try { if (r.info) { o.info = { render: r.info.render ? { calls: r.info.render.calls, triangles: r.info.render.triangles, points: r.info.render.points, lines: r.info.render.lines } : null, memory: r.info.memory ? { geometries: r.info.memory.geometries, textures: r.info.memory.textures } : null }; } } catch (e) {}
    try { if (r.backend && r.backend.constructor) o.backend = r.backend.constructor.name; } catch (e) {}
    try { if (r.getClearAlpha) o.clearAlpha = r4(r.getClearAlpha()); } catch (e) {}
    return o;
  }
  out.renderers = hook.renderers.map(describeRenderer);

  var camRec = null;
  for (var ci = 0; ci < look.cameras.length; ci++) if (!camRec || look.cameras[ci].calls > camRec.calls) camRec = look.cameras[ci];
  if (camRec) {
    var c = camRec.ref, el = null;
    try { c.updateMatrixWorld && c.updateMatrixWorld(); el = c.matrixWorld.elements; } catch (e) {}
    out.camera = {
      ctor: u.ctor(c), calls: camRec.calls, fov: c.fov === undefined ? null : r4(c.fov), aspect: c.aspect === undefined ? null : r4(c.aspect),
      near: r4(c.near), far: r4(c.far), zoom: r4(c.zoom), ortho: !!c.isOrthographicCamera,
      bounds: c.isOrthographicCamera ? [r4(c.left), r4(c.right), r4(c.top), r4(c.bottom)] : null,
      position: el ? [r4(el[12]), r4(el[13]), r4(el[14])] : null, forward: el ? [r4(-el[8]), r4(-el[9]), r4(-el[10])] : null, up: el ? [r4(el[4]), r4(el[5]), r4(el[6])] : null
    };
  } else out.camera = null;
  out.cameraCount = look.cameras.length;

  // ---- scene traversal ----
  var scenes = hook.renderedScenes.length ? hook.renderedScenes : hook.scenes;
  var materials = [], matSeen = new Map(), mainIdx = -1, mainObjects = -1;
  var sceneOut = [];
  function boxOf(o) {
    var g = o.geometry;
    if (!g) return null;
    if (!g.boundingBox && g.computeBoundingBox) { try { g.computeBoundingBox(); } catch (e) { return null; } }
    var b = g.boundingBox;
    if (!b) return null;
    var e = o.matrixWorld.elements, mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
    for (var i = 0; i < 8; i++) {
      var x = i & 1 ? b.max.x : b.min.x, y = i & 2 ? b.max.y : b.min.y, z = i & 4 ? b.max.z : b.min.z;
      var wx = e[0] * x + e[4] * y + e[8] * z + e[12], wy = e[1] * x + e[5] * y + e[9] * z + e[13], wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (wx < mn[0]) mn[0] = wx; if (wy < mn[1]) mn[1] = wy; if (wz < mn[2]) mn[2] = wz;
      if (wx > mx[0]) mx[0] = wx; if (wy > mx[1]) mx[1] = wy; if (wz > mx[2]) mx[2] = wz;
    }
    var size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    if (!isFinite(size[0] + size[1] + size[2])) return null;
    return { size: size, center: [(mx[0] + mn[0]) / 2, (mx[1] + mn[1]) / 2, (mx[2] + mn[2]) / 2], volume: Math.abs(size[0] * size[1] * size[2]) };
  }
  function noteMaterial(m) {
    if (!m || typeof m !== "object") return;
    var rec = matSeen.get(m);
    if (rec) { rec.users++; return; }
    if (materials.length >= 400) { out.materialsOverflow = (out.materialsOverflow || 0) + 1; return; }
    var spec = u.mat(m); spec.users = 1;
    matSeen.set(m, spec); materials.push(spec);
  }
  function analyze(scene, index) {
    try { scene.updateMatrixWorld(true); } catch (e) {}
    var counts = { objects: 0, meshes: 0, instancedMeshes: 0, batchedMeshes: 0, skinnedMeshes: 0, points: 0, lines: 0, sprites: 0, lights: 0, cameras: 0, visible: 0, transparent: 0, groups: 0 };
    var ctorCounts = {}, geoTypes = {}, tri = 0, instTotal = 0;
    var meshes = [], lights = [], points = [], sprites = [], instanced = [], sky = [], spriteMaps = {};
    var stack = [scene], seen = new Set();
    while (stack.length) {
      var o = stack.pop();
      if (!o || typeof o !== "object" || seen.has(o)) continue;
      seen.add(o);
      counts.objects++;
      var cn = u.ctor(o);
      ctorCounts[cn] = (ctorCounts[cn] || 0) + 1;
      if (o.visible !== false) counts.visible++;
      if (o.isGroup) counts.groups++;
      if (o.isCamera) counts.cameras++;
      var mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (var mi = 0; mi < mats.length; mi++) { noteMaterial(mats[mi]); if (mats[mi] && mats[mi].transparent) counts.transparent++; }
      if (o.isLight) {
        counts.lights++;
        if (lights.length < 32) {
          var le = o.matrixWorld ? o.matrixWorld.elements : null;
          var L = { ctor: cn, type: o.type, color: u.hex(o.color), intensity: r4(o.intensity), position: le ? [r4(le[12]), r4(le[13]), r4(le[14])] : null, castShadow: !!o.castShadow, name: o.name || "" };
          if (o.groundColor) L.groundColor = u.hex(o.groundColor);
          if (o.distance !== undefined) L.distance = r4(o.distance);
          if (o.decay !== undefined) L.decay = r4(o.decay);
          if (o.angle !== undefined) L.angle = r4(o.angle);
          if (o.penumbra !== undefined) L.penumbra = r4(o.penumbra);
          if (o.target && o.target.matrixWorld) { var te = o.target.matrixWorld.elements; L.target = [r4(te[12]), r4(te[13]), r4(te[14])]; }
          if (o.shadow) {
            var sh = o.shadow;
            L.shadow = { mapSize: sh.mapSize ? [sh.mapSize.x, sh.mapSize.y] : null, bias: r4(sh.bias), normalBias: r4(sh.normalBias), radius: r4(sh.radius) };
            if (sh.camera && sh.camera.isOrthographicCamera) L.shadow.camera = { left: r4(sh.camera.left), right: r4(sh.camera.right), top: r4(sh.camera.top), bottom: r4(sh.camera.bottom), near: r4(sh.camera.near), far: r4(sh.camera.far) };
          }
          lights.push(L);
        }
      }
      if (o.isSprite) {
        counts.sprites++;
        var sm = o.material && o.material.map ? (o.material.map.image && o.material.map.image.src ? u.strip(o.material.map.image.src) : (o.material.map.name || "canvas")) : "none";
        spriteMaps[sm] = (spriteMaps[sm] || 0) + 1;
        if (sprites.length < 12) sprites.push({ name: o.name || "", scale: u.vec(o.scale), color: u.hex(o.material && o.material.color), opacity: o.material ? r4(o.material.opacity) : null, additive: o.material ? o.material.blending === 2 : null });
      } else if (o.isPoints) {
        counts.points++;
        var pg = o.geometry, pm = o.material;
        if (points.length < 24) points.push({ name: o.name || "", count: pg && pg.attributes && pg.attributes.position ? pg.attributes.position.count : 0, attributes: pg && pg.attributes ? Object.keys(pg.attributes).sort() : [], size: pm ? r4(pm.size) : null, sizeAttenuation: pm ? pm.sizeAttenuation : null, color: u.hex(pm && pm.color), opacity: pm ? r4(pm.opacity) : null, blending: pm ? pm.blending : null, transparent: pm ? pm.transparent : null, shader: !!(pm && pm.isShaderMaterial), map: pm && pm.map ? u.tex(pm.map, false) : null });
      } else if (o.isLine) counts.lines++;
      else if (o.isMesh) {
        counts.meshes++;
        var g = o.geometry;
        if (g) {
          geoTypes[g.type || u.ctor(g)] = (geoTypes[g.type || u.ctor(g)] || 0) + 1;
          var pc = g.attributes && g.attributes.position ? g.attributes.position.count : 0;
          var ic = g.index ? g.index.count : pc;
          var inst = o.isInstancedMesh ? (o.count || 0) : 1;
          tri += Math.floor(ic / 3) * inst;
          if (o.isInstancedMesh) instTotal += o.count || 0;
        }
        if (o.isInstancedMesh) {
          counts.instancedMeshes++;
          if (instanced.length < 32) instanced.push({ name: o.name || "", count: o.count, vertices: g && g.attributes && g.attributes.position ? g.attributes.position.count : 0, geometry: g ? g.type : null, hasColor: !!o.instanceColor, particleLike: PARTICLE_NAME.test(o.name || "") });
        }
        if (o.isBatchedMesh) counts.batchedMeshes++;
        if (o.isSkinnedMesh) counts.skinnedMeshes++;
        var bb = boxOf(o);
        var m0 = mats[0];
        if (bb) {
          meshes.push({ name: o.name || "", geometry: g ? g.type : null, vertices: g && g.attributes && g.attributes.position ? g.attributes.position.count : 0, size: bb.size.map(r4), center: bb.center.map(r4), volume: bb.volume, instanced: !!o.isInstancedMesh, material: m0 ? u.ctor(m0) : null, materialColor: m0 ? u.hex(m0.color) : null });
          var big = Math.max(bb.size[0], bb.size[1], bb.size[2]);
          if (m0 && m0.isShaderMaterial && (m0.side === 1 || big > 200 || SKY_NAME.test(o.name || "") || SKY_NAME.test(m0.name || ""))) {
            if (sky.length < 12) sky.push({ name: o.name || "", material: m0.name || "", side: m0.side, maxExtent: r4(big), uniforms: u.uniforms(m0.uniforms, 40), fragmentHash: m0.fragmentShader ? u.fnv(m0.fragmentShader) : null });
          } else if (SKY_NAME.test(o.name || "") && sky.length < 12) {
            sky.push({ name: o.name || "", material: m0 ? m0.name || "" : "", side: m0 ? m0.side : null, maxExtent: r4(big), color: u.hex(m0 && m0.color), uniforms: null, fragmentHash: null });
          }
        }
      }
      var kids = o.children;
      if (kids && kids.length) for (var k = 0; k < kids.length; k++) stack.push(kids[k]);
    }
    meshes.sort(function (a, b) { return b.volume - a.volume; });
    var s = { index: index, counts: counts, constructors: ctorCounts, geometryTypes: geoTypes, estimatedTriangles: tri, instanceTotal: instTotal };
    s.topGeometry = meshes.slice(0, 40).map(function (m) { m.volume = r4(m.volume); return m; });
    s.lights = lights; s.points = points; s.sprites = sprites; s.spriteMaps = spriteMaps; s.instanced = instanced; s.sky = sky;
    s.background = scene.background ? (scene.background.isColor ? { color: u.hex(scene.background) } : { texture: u.tex(scene.background, true) }) : null;
    s.fog = scene.fog ? (scene.fog.isFogExp2 ? { type: "exp2", color: u.hex(scene.fog.color), density: r4(scene.fog.density) } : { type: "linear", color: u.hex(scene.fog.color), near: r4(scene.fog.near), far: r4(scene.fog.far) }) : null;
    s.environment = scene.environment ? u.tex(scene.environment, false) : null;
    if (scene.backgroundIntensity !== undefined) s.backgroundIntensity = r4(scene.backgroundIntensity);
    if (scene.backgroundBlurriness !== undefined) s.backgroundBlurriness = r4(scene.backgroundBlurriness);
    if (scene.environmentIntensity !== undefined) s.environmentIntensity = r4(scene.environmentIntensity);
    if (scene.overrideMaterial) s.overrideMaterial = u.ctor(scene.overrideMaterial);
    return s;
  }
  for (var si = 0; si < scenes.length && si < 6; si++) {
    try {
      var a = analyze(scenes[si], si);
      sceneOut.push(a);
      if (a.counts.objects > mainObjects) { mainObjects = a.counts.objects; mainIdx = si; }
    } catch (e) { out.errors.push("scene:" + String(e).slice(0, 100)); }
  }
  out.scenes = sceneOut;
  out.mainScene = mainIdx;
  var main = mainIdx >= 0 ? sceneOut[mainIdx] : null;
  out.counts = main ? main.counts : { objects: 0 };
  out.lights = main ? main.lights : [];
  out.fog = main ? main.fog : null;
  out.background = main ? main.background : null;
  out.environment = main ? main.environment : null;
  out.sky = main ? main.sky : [];
  out.particles = main ? { points: main.points, sprites: main.sprites, spriteMaps: main.spriteMaps, instancedParticleLike: main.instanced.filter(function (x) { return x.particleLike; }) } : { points: [], sprites: [], spriteMaps: {}, instancedParticleLike: [] };
  out.materials = materials;

  // ---- post chain: last frame's render-call log + bounded composer / node pipeline walk ----
  out.frameCalls = look.lastFrameCalls.slice(0, 48);
  var composers = [], nodes = [];
  function passProps(p) {
    var o = { ctor: u.ctor(p), enabled: p.enabled, renderToScreen: p.renderToScreen, needsSwap: p.needsSwap, clear: p.clear };
    var props = {}, keys = Object.keys(p).slice(0, 80), n = 0;
    for (var i = 0; i < keys.length && n < 30; i++) {
      var v = p[keys[i]], t = typeof v;
      if (t === "number") { props[keys[i]] = r4(v); n++; } else if (t === "boolean" || t === "string") { props[keys[i]] = v; n++; } else if (v && (v.isColor || v.isVector2 || v.isVector3 || v.isVector4)) { props[keys[i]] = u.uval(v); n++; }
    }
    o.props = props;
    var uni = p.uniforms || (p.material && p.material.uniforms) || (p.fsQuad && p.fsQuad.material && p.fsQuad.material.uniforms);
    if (uni) o.uniforms = u.uniforms(uni, 24);
    return o;
  }
  function nodeSummary(n, depth, seen) {
    if (!n || typeof n !== "object" || depth > 6 || seen.size > 120 || seen.has(n)) return null;
    seen.add(n);
    var o = { type: u.ctor(n) };
    try { if (n.nodeType) o.nodeType = n.nodeType; } catch (e) {}
    try { if (n.value !== undefined && n.isUniformNode) o.value = u.uval(n.value); } catch (e) {}
    try { if (n.scope) o.scope = String(n.scope); } catch (e) {}
    var kids = [], names = ["aNode", "bNode", "cNode", "node", "textureNode", "inputNode", "colorNode", "strength", "radius", "threshold"];
    for (var i = 0; i < names.length; i++) { var c = null; try { c = n[names[i]]; } catch (e) {} if (c && typeof c === "object") { var s = nodeSummary(c, depth + 1, seen); if (s) { s.via = names[i]; kids.push(s); } } }
    if (kids.length) o.inputs = kids;
    return o;
  }
  try {
    var skip = { window: 1, self: 1, top: 1, parent: 1, frames: 1, document: 1, globalThis: 1, opener: 1, location: 1, navigator: 1, performance: 1, __a3dHook: 1, __a3dLook: 1, __THREE_DEVTOOLS__: 1, localStorage: 1, sessionStorage: 1, indexedDB: 1, caches: 1, crypto: 1, history: 1 };
    var queue = [], visited = new Set(), steps = 0;
    var wk = Object.getOwnPropertyNames(window);
    for (var wi = 0; wi < wk.length; wi++) { var kn = wk[wi]; if (skip[kn]) continue; var wv; try { wv = window[kn]; } catch (e) { continue; } if (wv && typeof wv === "object") queue.push({ v: wv, d: 0 }); }
    while (queue.length && steps < 4000) {
      var it = queue.shift(); steps++;
      var v = it.v;
      if (visited.has(v)) continue;
      visited.add(v);
      try {
      var cname = u.ctor(v);
      if (/^(HTML|SVG|CSS|Window|Document|Navigator|Storage|Location|History|Performance|Event|Node|Element|Text)/.test(cname)) continue;
      if (Array.isArray(v.passes) && v.passes.length && composers.length < 4) { composers.push({ ctor: cname, passes: v.passes.slice(0, 24).map(passProps) }); continue; }
      if ((v.isPostProcessing === true || (v.outputNode && typeof v.render === "function")) && nodes.length < 4) { nodes.push({ ctor: cname, outputNode: nodeSummary(v.outputNode, 0, new Set()) }); continue; }
      if (it.d >= 3) continue;
      var pk; try { pk = Object.keys(v).slice(0, 60); } catch (e) { continue; }
      for (var pi = 0; pi < pk.length; pi++) { var pv; try { pv = v[pk[pi]]; } catch (e) { continue; } if (pv && typeof pv === "object" && !visited.has(pv)) queue.push({ v: pv, d: it.d + 1 }); }
      } catch (e) { continue; }
    }
    out.walkSteps = steps;
  } catch (e) { out.errors.push("walk:" + String(e).slice(0, 100)); }
  out.composers = composers;
  out.nodePipelines = nodes;
  out.effectComponents = main ? { points: main.points.reduce(function (a, p) { return a + (p.count || 0); }, 0), sprites: main.counts.sprites, transparent: main.counts.transparent, instanced: main.instanceTotal, visible: main.counts.visible } : { points: 0, sprites: 0, transparent: 0, instanced: 0, visible: 0 };
  out.canvasTextures = [];
  for (var mi2 = 0; mi2 < materials.length; mi2++) { var mp = materials[mi2].maps; if (mp) for (var mk in mp) if (mp[mk] && mp[mk].canvas && out.canvasTextures.length < 24) out.canvasTextures.push({ material: materials[mi2].name || materials[mi2].ctor, slot: mk, w: mp[mk].w, h: mp[mk].h, colorGrid4x4: mp[mk].colorGrid4x4 || null }); }
  return out;
})()`;

/** Cheap expression: components of the effect score for the main scene (traversal only, no summarising). */
export const LOOK_EFFECT_SOURCE = String.raw`(function () {
  var hook = window.__a3dHook;
  if (!hook) return null;
  var scenes = hook.renderedScenes.length ? hook.renderedScenes : hook.scenes;
  var best = null;
  for (var i = 0; i < scenes.length && i < 6; i++) {
    var c = { points: 0, sprites: 0, transparent: 0, instanced: 0, visible: 0, objects: 0 };
    var st = [scenes[i]], seen = new Set();
    while (st.length) {
      var o = st.pop();
      if (!o || typeof o !== "object" || seen.has(o)) continue;
      seen.add(o); c.objects++;
      if (o.visible !== false) c.visible++;
      if (o.isSprite) c.sprites++;
      if (o.isPoints && o.geometry && o.geometry.attributes && o.geometry.attributes.position) c.points += o.geometry.attributes.position.count;
      if (o.isInstancedMesh) c.instanced += o.count || 0;
      var m = o.material;
      if (m && !Array.isArray(m) && m.transparent) c.transparent++;
      var k = o.children;
      if (k && k.length) for (var j = 0; j < k.length; j++) st.push(k[j]);
    }
    if (!best || c.objects > best.objects) best = c;
  }
  return best;
})()`;
