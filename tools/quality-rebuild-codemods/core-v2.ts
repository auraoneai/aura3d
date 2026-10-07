/**
 * C-39 codemod `core-v2` (PRD-01 §11 item 4, §15 Phase 2).
 * Pure `source → code + rows` transform — no fs access; the C-39 registry
 * (`packages/aura3d-cli/src/commands/prd01/index.ts`) drives file IO.
 *
 * Rules:
 *  - `pixelRatio:` overrides inside `createAuraApp(...)` options (top level or
 *    inside a `...(cond ? {...} : {})` spread): `Math.min(<cap>, <dpr>)` and the
 *    literal `1` map to `renderer.resolution.maxPixelRatio`; any other value
 *    maps to `renderer.resolution.pixelRatio` (same semantics, new surface).
 *  - `qualityProfile:` inside `renderer:` options → `quality:` tier
 *    (`"production"` → `"high"`, `"safe-basic"` → `"low"`; unknown values keep
 *    the expression and are reported `approximate`).
 *  - `safe-basic` mentions are classified (mode-select / fallback-warning
 *    assertion / documentation) and reported for the inventory — not edited.
 *  - `lights.ambient({intensity})` sites are reported with old vs physical
 *    effective irradiance (÷π) for lane 14's retune — not edited.
 */

export interface CodemodRow {
  readonly file: string;
  readonly line: number;
  readonly construct: string;
  readonly mapping: "exact" | "approximate" | "none";
  readonly target?: string;
  readonly note?: string;
}

export interface CodemodResult {
  readonly code: string;
  readonly rows: readonly CodemodRow[];
}

interface Span { readonly start: number; readonly end: number }

function lineOf(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/** Match a `(`/`{`/`[` opening at `open`, skipping strings and comments. */
export function matchDelimited(src: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const openCh = src[open]!;
  const closeCh = pairs[openCh];
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (ch === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i++;
      while (i < src.length && src[i] !== quote) { if (src[i] === "\\") i++; i++; }
      i++;
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

/** Depth-0 member key spans inside an object literal span. */
function memberKeys(src: string, obj: Span): readonly { key: string; start: number; colon: number; valueStart: number }[] {
  const out: { key: string; start: number; colon: number; valueStart: number }[] = [];
  const keyRe = /([A-Za-z_$][\w$]*)\s*:/gy;
  let i = obj.start + 1;
  while (i < obj.end) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (ch === "/" && next === "/") { while (i < obj.end && src[i] !== "\n") i++; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < obj.end && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { const q = ch; i++; while (i < obj.end && src[i] !== q) { if (src[i] === "\\") i++; i++; } i++; continue; }
    if (ch === "{" || ch === "(" || ch === "[") { i = matchDelimited(src, i) + 1; continue; }
    keyRe.lastIndex = i;
    const m = keyRe.exec(src);
    if (m && m.index === i) {
      let v = keyRe.lastIndex;
      while (v < obj.end && /\s/.test(src[v]!)) v++;
      out.push({ key: m[1]!, start: m.index, colon: m.index + m[0].length - 1, valueStart: v });
      i = v;
      continue;
    }
    i++;
  }
  return out;
}

/** Value-expression end: first depth-0 `,` or the object close. */
function valueEnd(src: string, valueStart: number, objEnd: number): number {
  let i = valueStart;
  while (i < objEnd) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (ch === "/" && next === "/") { while (i < objEnd && src[i] !== "\n") i++; continue; }
    if (ch === "/" && next === "*") { i += 2; while (i < objEnd && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { const q = ch; i++; while (i < objEnd && src[i] !== q) { if (src[i] === "\\") i++; i++; } i++; continue; }
    if (ch === "{" || ch === "(" || ch === "[") { i = matchDelimited(src, i) + 1; continue; }
    if (ch === ",") return i;
    i++;
  }
  return objEnd;
}

/** `...(cond ? { … } : {})` inner object literals at depth 0 of `obj`. */
function spreadObjects(src: string, obj: Span): readonly Span[] {
  const out: Span[] = [];
  for (const m of src.slice(obj.start, obj.end).matchAll(/\.\.\./g)) {
    const abs = obj.start + m.index;
    // Skip `...` not at the object's own depth (nested values, spreads in strings).
    let depth = 0;
    for (let i = obj.start + 1; i < abs; i++) {
      const ch = src[i]!;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth !== 0) continue;
    const q = src.indexOf("?", abs);
    if (q === -1 || q > obj.end) continue;
    let i = q + 1;
    while (i < obj.end && /\s/.test(src[i]!)) i++;
    if (src[i] !== "{") continue;
    out.push({ start: i, end: matchDelimited(src, i) });
  }
  return out;
}

interface Edit { start: number; end: number; text: string }

export function transformCoreV2(source: string, fileName: string): CodemodResult {
  const rows: CodemodRow[] = [];
  const edits: Edit[] = [];

  // Every options object: each createAuraApp( call's LAST top-level `{` arg.
  const optionObjects: Span[] = [];
  for (const m of source.matchAll(/\bcreateAuraApp\s*\(/g)) {
    const paren = m.index + m[0].length - 1;
    const close = matchDelimited(source, paren);
    if (close === -1) continue;
    let last: Span | undefined;
    for (let i = paren + 1; i < close; i++) {
      const ch = source[i]!;
      if (ch === "{") { const end = matchDelimited(source, i); last = { start: i, end }; i = end; }
      else if (ch === "(" || ch === "[") i = matchDelimited(source, i);
      else if (ch === "'" || ch === '"' || ch === "`") { const q = ch; i++; while (i < close && source[i] !== q) { if (source[i] === "\\") i++; i++; } }
    }
    if (last) optionObjects.push(last);
  }

  const classifyPixelRatio = (expr: string): { key: "maxPixelRatio" | "pixelRatio"; value: string; note?: string } => {
    const minMatch = /^Math\.min\s*\(\s*([\w.]+)\s*,\s*(?:window\.)?devicePixelRatio(?:\s*\|\|\s*1)?\s*\)$/.exec(expr.trim());
    if (minMatch) return { key: "maxPixelRatio", value: minMatch[1]! };
    if (/^1(?:\.0+)?$/.test(expr.trim())) return { key: "maxPixelRatio", value: "1" };
    return { key: "pixelRatio", value: expr.trim() };
  };

  const rewriteObject = (obj: Span, inConditionalSpread = false): void => {
    const pixelMembers = memberKeys(source, obj).filter((m) => m.key === "pixelRatio");
    if (pixelMembers.length === 0) return;
    const rendererMember = memberKeys(source, obj).find((m) => m.key === "renderer" && source[m.valueStart] === "{");

    for (const member of pixelMembers) {
      const end = valueEnd(source, member.valueStart, obj.end);
      const expr = source.slice(member.valueStart, end);
      const { key, value } = classifyPixelRatio(expr);
      const line = lineOf(source, member.start);

      rows.push({
        file: fileName,
        line,
        construct: "createAuraApp.pixelRatio",
        mapping: "exact",
        target: `renderer.resolution.${key}`,
        note: inConditionalSpread ? "inside a conditional spread — correct the stale DPR comment above the site" : undefined
      });

      // Remove `pixelRatio: <expr>` including its separating comma: consume
      // `key: value ,` when a trailing comma exists, otherwise walk back over
      // whitespace and drop the preceding comma of a trailing member.
      let delEnd = end;
      while (delEnd < obj.end && /\s/.test(source[delEnd]!)) delEnd++;
      let delStart = member.start;
      if (source[delEnd] === ",") {
        delEnd++;
      } else {
        let back = member.start;
        while (back > obj.start && /\s/.test(source[back - 1]!)) back--;
        if (source[back - 1] === ",") delStart = back - 1;
      }
      edits.push({ start: delStart, end: delEnd, text: "" });

      if (rendererMember === undefined) {
        const objIndent = (() => {
          const ls = source.lastIndexOf("\n", obj.start) + 1;
          const m = /^[\t ]*/.exec(source.slice(ls, obj.start));
          return m?.[0] ?? "";
        })();
        edits.push({
          start: obj.start + 1,
          end: obj.start + 1,
          text: `\n${objIndent}  renderer: { resolution: { ${key}: ${value} } },`
        });
      } else {
        const rendererObj: Span = { start: rendererMember.valueStart, end: matchDelimited(source, rendererMember.valueStart) };
        const resolutionMember = memberKeys(source, rendererObj).find((m) => m.key === "resolution" && source[m.valueStart] === "{");
        if (resolutionMember) {
          edits.push({ start: resolutionMember.valueStart + 1, end: resolutionMember.valueStart + 1, text: ` ${key}: ${value},` });
        } else {
          edits.push({ start: rendererObj.start + 1, end: rendererObj.start + 1, text: ` resolution: { ${key}: ${value} },` });
        }
      }
    }
  };

  for (const obj of optionObjects) {
    rewriteObject(obj);
    for (const spread of spreadObjects(source, obj)) rewriteObject(spread, true);
  }

  // qualityProfile inside renderer: { … } objects anywhere in the file.
  for (const m of source.matchAll(/\brenderer\s*:\s*\{/g)) {
    const objStart = source.indexOf("{", m.index + m[0].length - 1);
    const obj: Span = { start: objStart, end: matchDelimited(source, objStart) };
    for (const member of memberKeys(source, obj).filter((k) => k.key === "qualityProfile")) {
      const end = valueEnd(source, member.valueStart, obj.end);
      const expr = source.slice(member.valueStart, end).trim();
      const line = lineOf(source, member.colon);
      const mapped = expr === "\"production\"" || expr === "'production'" ? "\"high\""
        : expr === "\"safe-basic\"" || expr === "'safe-basic'" ? "\"low\""
        : undefined;
      rows.push({
        file: fileName, line, construct: "renderer.qualityProfile",
        mapping: mapped ? "exact" : "approximate",
        target: `renderer.quality: ${mapped ?? expr}`,
        note: mapped ? undefined : "no exact tier mapping; review"
      });
      edits.push({ start: member.colon - "qualityProfile".length, end, text: `quality: ${mapped ?? expr}` });
    }
  }

  // safe-basic inventory rows (no edits).
  for (const m of source.matchAll(/safe-basic/g)) {
    const line = lineOf(source, m.index);
    const lineText = source.slice(source.lastIndexOf("\n", m.index) + 1, source.indexOf("\n", m.index) >>> 0 || source.length);
    const kind = /mode\s*:|fallback\s*:|qualityProfile\s*:/.test(lineText) ? "selects the mode"
      : /expect|assert|toContain|toBe|warn/.test(lineText) ? "asserts the fallback warning string"
      : /^\s*(?:\/\/|\*|\/\*)/.test(lineText) ? "documentation"
      : "documentation";
    rows.push({ file: fileName, line, construct: "safe-basic", mapping: "none", note: kind });
  }

  // Ambient review rows (no edits): effective irradiance changes I → I/π.
  for (const m of source.matchAll(/\blights\.ambient\s*\(/g)) {
    const paren = m.index + m[0].length - 1;
    const close = matchDelimited(source, paren);
    const args = source.slice(paren + 1, close === -1 ? source.length : close);
    const intensity = /\bintensity\s*:\s*([0-9.]+)/.exec(args)?.[1];
    const oldEff = intensity ? Number(intensity) : undefined;
    rows.push({
      file: fileName,
      line: lineOf(source, m.index),
      construct: "lights.ambient",
      mapping: "none",
      note: oldEff !== undefined
        ? `ambient review: intensity ${oldEff} renders ${oldEff}→${(oldEff / Math.PI).toFixed(3)} effective irradiance under physical lighting (retune, Q-14-1)`
        : "ambient review: retune under physical lighting (Q-14-1)"
    });
  }

  const code = edits.sort((a, b) => b.start - a.start).reduce((acc, e) => acc.slice(0, e.start) + e.text + acc.slice(e.end), source);
  return { code, rows };
}

/* ------------------------------------------------------------------ */
/* Evidence collectors (consume git-grep results; still pure)          */
/* ------------------------------------------------------------------ */

export interface SafeBasicInventoryEntry {
  readonly file: string;
  readonly line: number;
  readonly construct: string;
  readonly classification: string;
}

export function collectSafeBasicInventory(files: readonly { path: string; text: string }[]): readonly SafeBasicInventoryEntry[] {
  const entries: SafeBasicInventoryEntry[] = [];
  for (const { path, text } of files) {
    for (const row of transformCoreV2(text, path).rows.filter((r) => r.construct === "safe-basic")) {
      entries.push({ file: row.file, line: row.line, construct: row.construct, classification: row.note ?? "documentation" });
    }
  }
  return entries;
}

export interface AmbientReviewEntry {
  readonly file: string;
  readonly line: number;
  readonly intensity?: number;
  readonly effectiveIrradianceBefore?: number;
  readonly effectiveIrradianceAfter?: number;
}

export function collectAmbientReview(files: readonly { path: string; text: string }[]): readonly AmbientReviewEntry[] {
  const entries: AmbientReviewEntry[] = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(/\blights\.ambient\s*\(/g)) {
      const paren = m.index + m[0].length - 1;
      const close = matchDelimited(text, paren);
      const args = text.slice(paren + 1, close === -1 ? text.length : close);
      const intensity = /\bintensity\s*:\s*([0-9.]+)/.exec(args)?.[1];
      const value = intensity ? Number(intensity) : undefined;
      entries.push({
        file: path,
        line: lineOf(text, m.index),
        intensity: value,
        effectiveIrradianceBefore: value,
        effectiveIrradianceAfter: value === undefined ? undefined : Number((value / Math.PI).toFixed(4))
      });
    }
  }
  return entries;
}
