/**
 * PRD-03 §10 item 3 — `aura3d codemod post-v2 <glob> --report|--write|--dry-run` (C-39).
 *
 * Pure transform: `source → { code, rows, report }`. The dispatcher decides
 * whether `code` is written (`--write`); rows carry every recognized legacy
 * post construct plus the rewrite rows this codemod applies. `report` holds
 * the per-file emissive audit (§10: material calls whose emissive luma ×
 * strength < 1.0 — lane 14 retunes; the codemod never auto-edits emissive).
 *
 * Write-mode rewrites (all in `code`):
 *  - `softKnee`/`shoulder`/`quality` removed from bloom/neonBloom/cinematicBloom calls.
 *  - `threshold` < 1 rewritten to `1.0` with a `// post-v2: was <old>` comment.
 *  - `effects.antiAlias({ mode: "fxaa" })` deleted (tier auto — never FXAA on MSAA).
 *  - `effects.contactOcclusion(o)` → `effects.ambientOcclusion({ radius: 0.2, ...o })`
 *    so an authored radius (mech-hangar 0.6) survives; when the file authors BOTH
 *    AO calls the contactOcclusion call is deleted with a
 *    `// post-v2: merged contactOcclusion(<args>)` comment (one AO stage — the
 *    bridge throws POST_DUPLICATE_STAGE otherwise).
 *  - `pixelRatio: 0.7` (skyline-runner) is REPORTED `approximate`, never edited.
 *  - `output: { preset: <mapped> }` is inserted into the create-app options object
 *    (per-game §10 map; lane 14 may override under C-35 art direction).
 *
 * Default file list (POST_V2_DEFAULT_FILES): the 17 game
 * `apps/showcase-<id>/src/main.ts` named in §5 + `apps/aura-clash-showcase/src/**`
 * + `examples/neon-corridor-strike/**` + `templates/**`. The 10 non-game
 * `apps/showcase-*` apps (POST_V2_NOT_MIGRATED) are excluded and surfaced in
 * dry-run output as "not migrated".
 */

/** §10 default file list — the 17 game mains + Aura Clash + the neon-corridor example + templates. */
export const POST_V2_GAME_IDS = [
  "courier-rush", "turbo-drift-circuit", "rooftop-buckets", "skyline-runner", "neon-swarm",
  "gallery-shift", "pulse-tunnel", "vault-breakers", "blockfall-reactor", "bank-shot",
  "aurora-lander", "orbital-defense", "gravity-post", "deep-recovery",
  "mech-hangar", "siege-golf", "patrol-wing"
];

export const POST_V2_DEFAULT_FILES = [
  ...POST_V2_GAME_IDS.map((id) => `apps/showcase-${id}/src/main.ts`),
  "apps/aura-clash-showcase/src/**",
  "examples/neon-corridor-strike/**",
  "templates/**"
];

/** §10: the 10 non-game `apps/showcase-*` apps are out of scope — listed "not migrated". */
export const POST_V2_NOT_MIGRATED = [
  "showcase-asset-audition", "showcase-cinematic-architecture", "showcase-data-galaxy",
  "showcase-digital-twin-ops", "showcase-index", "showcase-material-asset-inspector",
  "showcase-meshy-relic-pilot", "showcase-product-configurator", "showcase-smart-city-control",
  "showcase-webgpu-particle-lab"
];

/** §10 preset mapping (lane 14 may override per route under C-35). */
export const POST_V2_PRESET_BY_GAME = {
  "courier-rush": "neon-night", "turbo-drift-circuit": "neon-night", "rooftop-buckets": "neon-night",
  "skyline-runner": "neon-night", "neon-swarm": "neon-night", "gallery-shift": "neon-night",
  "pulse-tunnel": "neon-night", "vault-breakers": "neon-night", "blockfall-reactor": "neon-night",
  "bank-shot": "neon-night",
  "aurora-lander": "space", "orbital-defense": "space", "gravity-post": "space",
  "deep-recovery": "underwater",
  "aura-clash": "arena-fight", "mech-hangar": "arena-fight",
  "siege-golf": "daylight-outdoor", "patrol-wing": "daylight-outdoor"
};

/** Game id for a file path, or null when the path is not a game/showcase route. */
export function postV2GameIdFor(fileName) {
  const showcase = /apps\/showcase-([a-z0-9-]+)\//.exec(fileName);
  if (showcase) return showcase[1] in POST_V2_PRESET_BY_GAME ? showcase[1] : null;
  if (/apps\/aura-clash-showcase\//.test(fileName)) return "aura-clash";
  return null;
}

/** @type {readonly {re: RegExp, construct: string, mapping: "exact"|"approximate"|"none", target?: string, note?: string}[]} */
const CONSTRUCTS = [
  { re: /\beffects\.bloom\s*\(/g, construct: "effects.bloom", mapping: "exact", target: "v2 S9-bloom (native HDR bloom)", note: "field names survive; intensity/threshold rescale under v2 definitions" },
  { re: /\beffects\.neonBloom\s*\(/g, construct: "effects.neonBloom", mapping: "exact", target: "v2 S9-bloom preset" },
  { re: /\beffects\.cinematicBloom\s*\(/g, construct: "effects.cinematicBloom", mapping: "exact", target: "v2 S9-bloom preset" },
  { re: /\beffects\.ambientOcclusion\s*\(/g, construct: "effects.ambientOcclusion", mapping: "approximate", target: "v2 S2-gtao", note: "radius/density re-derived from GTAO world-space params" },
  { re: /\beffects\.contactOcclusion\s*\(/g, construct: "effects.contactOcclusion", mapping: "approximate", target: "v2 ambientOcclusion (one AO stage)" },
  { re: /\beffects\.colorGrade\s*\(/g, construct: "effects.colorGrade", mapping: "approximate", target: "v2 S10b-grade", note: "exposure real since Phase 1; shadows/highlights/lut land Phase 5" },
  { re: /\beffects\.antiAlias\s*\(/g, construct: "effects.antiAlias", mapping: "approximate", target: "v2 S11-aa tier", note: "mode maps to tier AA (never FXAA on MSAA); TAA behind A3D_QR_POST_TAA" },
  { re: /\beffects\.outline\s*\(/g, construct: "effects.outline", mapping: "approximate", target: "v2 outline stage" },
  { re: /\beffects\.screenSpaceReflections\s*\(/g, construct: "effects.screenSpaceReflections", mapping: "approximate", target: "v2 S3-ssr" },
  { re: /\beffects\.depthOfField\s*\(/g, construct: "effects.depthOfField", mapping: "approximate", target: "v2 S6-dof" },
  { re: /\beffects\.motionBlur\s*\(/g, construct: "effects.motionBlur", mapping: "approximate", target: "v2 S7-motion-blur" },
  { re: /\beffects\.volumetricFog\s*\(/g, construct: "effects.volumetricFog", mapping: "approximate", target: "v2 S4-god-rays" },
  { re: /\bchromaticAberration\s*[:()]/g, construct: "chromaticAberration", mapping: "approximate", target: "v2 display-space aberration" },
  { re: /\bfilmGrain\s*[:()]/g, construct: "filmGrain", mapping: "approximate", target: "v2 film-grain stage" },
  { re: /\bvignette\s*[:()]/g, construct: "vignette", mapping: "approximate", target: "v2 cinematic vignette" },
  { re: /\btoneMapping\s*:/g, construct: "renderer.toneMapping", mapping: "exact", target: "output.toneMapping (ACES/AgX/Neutral/linear/reinhard/none)" },
  { re: /\btoneMappingExposure\s*:/g, construct: "renderer.toneMappingExposure", mapping: "exact", target: "exposure uniform" },
  { re: /\bfxaa\b/g, construct: "fxaa", mapping: "exact", target: "v2 S11-aa-fxaa (r185 port + dither)" },
  { re: /\bPostProcessPass\b/g, construct: "PostProcessPass", mapping: "none", note: "legacy pass class — v2 has no drop-in; rewrite as C-13 custom pass or drop" },
  { re: /\baddPostPass\s*\(/g, construct: "app.addPostPass", mapping: "exact", target: "C-13 registered custom pass" },
  { re: /\bsetQualityTier\s*\(/g, construct: "app.setQualityTier", mapping: "approximate", target: "v2 tier AA/quality resolution" },
  { re: /\bpreserveDrawingBuffer\s*:/g, construct: "preserveDrawingBuffer", mapping: "none", note: "v2 chain never readbacks; capture via C-05 capture()" },
  { re: /\bpixelRatio\s*:\s*0\.7\b/g, construct: "createApp.pixelRatio", mapping: "approximate", target: "output.renderScale / C-27 minRenderScale", note: "skyline-runner DPR cap — lane 14 decides (Q-14-1)" }
];

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

/** Balanced-paren span of a call starting at `openParen` (index of "("). */
function callSpan(source, openParen) {
  let depth = 0;
  let quote = null;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Remove `field:` entries (incl. separating comma) from an object-literal slice. */
function stripFields(objectLiteral, fields) {
  let out = objectLiteral;
  for (const field of fields) {
    const re = new RegExp(`\\b${field}\\s*:`); // no /g/: every exec re-scans from 0 after each removal
    let m;
    while ((m = re.exec(out)) !== null) {
      // value end: next top-level `,` or the closing `}` of the literal
      let i = m.index + m[0].length;
      let depth = 0;
      let quote = null;
      for (; i < out.length; i++) {
        const ch = out[i];
        if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
        if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; continue; }
        if (ch === "(" || ch === "[" || ch === "{") depth++;
        else if (ch === ")" || ch === "]" || ch === "}") { if (depth === 0) break; depth--; }
        else if (ch === "," && depth === 0) break;
      }
      let start = m.index;
      while (start > 0 && /[ \t]/.test(out[start - 1])) start--;
      const end = out[i] === "," ? i + 1 : i;
      out = out.slice(0, start) + out.slice(end);
    }
  }
  return out.replace(/,\s*,/g, ",").replace(/\{\s*,/g, "{ ").replace(/,\s*\}/g, " }");
}

/** Rewrite `threshold: <n<1` inside a call-args slice to `1.0` + post-v2 comment. */
function rewriteThresholds(argsText) {
  return {
    text: argsText.replace(/\bthreshold\s*:\s*([0-9]*\.?[0-9]+)/g, (all, value) => {
      const n = Number(value);
      return n < 1 ? `threshold: 1.0 /* post-v2: was ${value} */` : all;
    }),
    rewritten: (argsText.match(/\bthreshold\s*:\s*([0-9]*\.?[0-9]+)/g) ?? [])
      .map((m) => Number(/:\s*([0-9.]+)/.exec(m)[1])).filter((n) => n < 1)
  };
}

/** Emissive audit: luma(emissive color) × emissiveIntensity < 1.0 (§10, lane 14 retunes). */
function emissiveReport(source, fileName, rows) {
  const report = [];
  const re = /\bemissive\s*:\s*("#[0-9a-fA-F]{3,8}"|\[[^\]]*\]|\{[^}]*\}|"[^"]*"|'[^']*'|[A-Za-z_][\w.]*)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    // emissiveIntensity in the same material options object (bounded window).
    const window = source.slice(m.index, m.index + 600);
    const intensityMatch = /\bemissiveIntensity\s*:\s*([0-9]*\.?[0-9]+)/.exec(window);
    const strength = intensityMatch ? Number(intensityMatch[1]) : 1;
    const spec = m[1].replace(/^['"]|['"]$/g, "");
    let luma = null;
    const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})/.exec(spec);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
      luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    } else if (spec.startsWith("[") || spec.startsWith("{")) {
      const nums = spec.match(/[0-9]*\.?[0-9]+/g)?.map(Number) ?? [];
      if (nums.length >= 3) luma = 0.2126 * nums[0] + 0.7152 * nums[1] + 0.0722 * nums[2];
    }
    if (luma === null) continue; // named colors/expressions — can't compute luma statically
    const product = luma * strength;
    const line = lineOf(source, m.index);
    report.push({ file: fileName, line, emissive: spec, emissiveIntensity: strength, lumaXstrength: Number(product.toFixed(3)) });
    if (product < 1.0) {
      rows.push({
        file: fileName, line, construct: "material.emissive", mapping: "approximate",
        target: "emissive retune (lane 14, §10)",
        note: `emissive luma×strength ${product.toFixed(2)} < 1.0 — invisible under bloom threshold 1.0`
      });
    }
  }
  return report;
}

/** Insert or extend `output: { preset }` inside the create-app options object. */
function insertPreset(source, preset, fileName, rows) {
  const createRe = /\b(createAuraApp|createGameApp|createGame|createA3DApp)\s*\(/g;
  const m = createRe.exec(source);
  if (!m) return null;
  const paren = source.indexOf("(", m.index);
  // The options object is the first top-level `{` inside the call parens —
  // `createAuraApp({...})` and `createAuraApp("#app", {...})` alike.
  let braceIndex = -1;
  let depth = 0;
  let quote = null;
  for (let i = paren; i < source.length; i++) {
    const ch = source[i];
    if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
    if (ch === "\"" || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") {
      if (ch === "{" && depth === 1) { braceIndex = i; break; }
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (braceIndex < 0) return null;
  const close = callSpan(source, braceIndex);
  if (close < 0) return null;
  const body = source.slice(braceIndex + 1, close);
  const existingOutput = /\boutput\s*:\s*\{/.exec(body);
  if (existingOutput) {
    const outputBrace = braceIndex + 1 + existingOutput.index + existingOutput[0].length - 1;
    const outputClose = callSpan(source, outputBrace);
    const outputBody = source.slice(outputBrace + 1, outputClose);
    if (/\bpreset\s*:/.test(outputBody)) return null; // already authored
    const next = source.slice(0, outputBrace + 1) + ` preset: "${preset}",` + source.slice(outputBrace + 1);
    rows.push({ file: fileName, line: lineOf(source, outputBrace), construct: "output.preset", mapping: "exact", target: preset, note: "inserted into existing output block" });
    return next;
  }
  const next = source.slice(0, braceIndex + 1) + ` output: { preset: "${preset}" },` + source.slice(braceIndex + 1);
  rows.push({ file: fileName, line: lineOf(source, braceIndex), construct: "output.preset", mapping: "exact", target: preset, note: "added output block" });
  return next;
}

/**
 * @param {string} source
 * @param {string} fileName
 * @returns {{ code: string, rows: object[], report: { emissive: object[], preset?: string } }}
 */
export function transformPostV2(source, fileName) {
  /** @type {object[]} */
  const rows = [];

  /* Report rows for every recognized construct (existing Phase-0 behavior). */
  for (const rule of CONSTRUCTS) {
    rule.re.lastIndex = 0;
    let match;
    while ((match = rule.re.exec(source)) !== null) {
      const row = { file: fileName, line: lineOf(source, match.index), construct: rule.construct, mapping: rule.mapping };
      if (rule.target) row.target = rule.target;
      if (rule.note) row.note = rule.note;
      rows.push(row);
    }
  }

  /* --- rewrites --------------------------------------------------------- */
  let code = source;

  // 1. bloom-family calls: strip softKnee/shoulder/quality; threshold < 1 → 1.0.
  const bloomRe = /\beffects\.(bloom|neonBloom|cinematicBloom)\s*\(/g;
  const bloomCalls = [];
  let bm;
  while ((bm = bloomRe.exec(source)) !== null) {
    const open = source.indexOf("(", bm.index);
    const close = callSpan(source, open);
    if (close > 0) bloomCalls.push({ start: bm.index, open, close });
  }
  for (const call of bloomCalls.reverse()) { // reverse: edits can't shift earlier spans
    const args = code.slice(call.open + 1, call.close);
    const thresholded = rewriteThresholds(args);
    const stripped = stripFields(thresholded.text, ["softKnee", "shoulder", "quality"]);
    if (stripped !== args) {
      code = code.slice(0, call.open + 1) + stripped + code.slice(call.close);
      rows.push({
        file: fileName, line: lineOf(source, call.start), construct: "effects." + source.slice(call.start, call.open).match(/effects\.(\w+)\s*$/)[1],
        mapping: "exact", note: `removed softKnee/shoulder/quality${thresholded.rewritten.length ? `; threshold <1 → 1.0 (was ${thresholded.rewritten.join(", ")})` : ""}`
      });
    }
  }

  // 2. `effects.antiAlias({ mode: "fxaa" })` → delete (tier auto). Three shapes:
  //    wrapped `.add(effects.antiAlias(...))`, list element `effects.antiAlias(...),`,
  //    bare statement `effects.antiAlias(...);`.
  // 2a. `.add(effects.antiAlias({mode:"fxaa"}))` — delete the whole .add call.
  code = code.replace(/\.add\(\s*effects\.antiAlias\s*\(\s*\{[^}]*\bmode\s*:\s*["']fxaa["'][^}]*\}\s*\)\s*\)[ \t]*\r?\n?/g, (all, offset) => {
    rows.push({ file: fileName, line: lineOf(code, offset), construct: "effects.antiAlias", mapping: "exact", note: "deleted — tier auto (never FXAA on MSAA)" });
    return "";
  });
  // 2b. remaining bare/list-element calls: call + one trailing comma/semicolon.
  code = code.replace(/\beffects\.antiAlias\s*\(\s*\{[^}]*\bmode\s*:\s*["']fxaa["'][^}]*\}\s*\)[ \t]*[;,]?[ \t]*\r?\n?/g, (all, offset) => {
    rows.push({ file: fileName, line: lineOf(code, offset), construct: "effects.antiAlias", mapping: "exact", note: "deleted — tier auto (never FXAA on MSAA)" });
    return "";
  });

  // 3. contactOcclusion → ambientOcclusion, or merge-delete when AO also authored.
  const hasAO = /\beffects\.ambientOcclusion\s*\(/.test(code);
  const coRe = /\beffects\.contactOcclusion\s*\(/g;
  const coCalls = [];
  let cm;
  while ((cm = coRe.exec(code)) !== null) {
    const open = code.indexOf("(", cm.index);
    const close = callSpan(code, open);
    if (close > 0) coCalls.push({ start: cm.index, open, close });
  }
  for (const call of coCalls.reverse()) {
    const argsText = code.slice(call.open + 1, call.close).trim();
    if (hasAO) {
      // Dual-AO: delete the contactOcclusion statement, leave a merge comment.
      const lineStart = code.lastIndexOf("\n", call.start) + 1;
      const stmtEnd = code.indexOf("\n", call.close);
      const indent = code.slice(lineStart, call.start);
      const merged = `${indent}// post-v2: merged contactOcclusion(${argsText}) into ambientOcclusion (one AO stage)\n`;
      code = code.slice(0, lineStart) + merged + code.slice(stmtEnd === -1 ? code.length : stmtEnd + 1);
      rows.push({ file: fileName, line: lineOf(code, lineStart), construct: "effects.contactOcclusion", mapping: "approximate", note: `merged into ambientOcclusion; kept AO call (one S2-gtao stage)` });
    } else {
      const inner = argsText.startsWith("{") && argsText.endsWith("}") ? argsText.slice(1, -1).trim() : `...${argsText}`;
      const replacement = `effects.ambientOcclusion({ radius: 0.2${inner ? `, ${inner}` : ""} })`;
      code = code.slice(0, call.start) + replacement + code.slice(call.close + 1);
      rows.push({ file: fileName, line: lineOf(code, call.start), construct: "effects.contactOcclusion", mapping: "exact", target: "effects.ambientOcclusion", note: "radius kept via spread over the 0.2 m default" });
    }
  }

  // 4. preset insert (per-game §10 map).
  const gameId = postV2GameIdFor(fileName);
  const preset = gameId ? POST_V2_PRESET_BY_GAME[gameId] : null;
  if (preset) {
    const next = insertPreset(code, preset, fileName, rows);
    if (next !== null) code = next;
  }

  // 5. emissive audit (report only).
  const emissive = emissiveReport(code, fileName, rows);

  rows.sort((a, b) => a.line - b.line || String(a.construct).localeCompare(String(b.construct)));
  return { code, rows, report: { emissive, preset: preset ?? undefined, notMigrated: POST_V2_NOT_MIGRATED.filter((id) => fileName.includes(`apps/${id}/`)).length > 0 } };
}

/** The C-39 codemod descriptor registered by `commands/prd03/index.ts`. */
export const postV2Codemod = {
  name: "post-v2",
  owner: "prd03",
  description: "Codemod for the v2 post chain: strips legacy bloom fields, rewires contactOcclusion→ambientOcclusion, deletes fxaa antiAlias, inserts the per-game output.preset, and reports emissive luma×strength < 1.0 per game.",
  transform: transformPostV2
};
