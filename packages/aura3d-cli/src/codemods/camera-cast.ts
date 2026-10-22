/**
 * tools/camera-cast-codemod (PRD-08 §9.3, C-39 `camera-cast`).
 *
 * Rewrites style-(a) camera cast-mutations —
 *   `Object.assign(<cam> as unknown as <Mutable…>, {…})`
 *   `(<cam> as unknown as <T>).<field> = <v>`
 * — into C-22 `app.camera` calls, and reports style-(b) direct writes to
 * camera-spec values (no cast) as a manual-migration list.
 *
 * Mapping:
 *  - pose fields (position/target/near/far/orthographicSize/up)  → setPose (exact)
 *  - fov → setFov, roll → setRoll                                (exact)
 *  - spec-shape fields (offset/targetOffset/distance/mode/…)     → fromSpec merge (approximate)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface CameraCastRow {
  readonly file: string;
  readonly line: number;
  readonly construct: string;
  readonly mapping: "exact" | "approximate" | "none";
  readonly target?: string;
  readonly note?: string;
}

export interface CameraCastResult {
  readonly code: string;
  readonly rows: readonly CameraCastRow[];
}

const POSE_FIELDS = new Set(["position", "target", "near", "far", "orthographicSize", "up"]);
const CAMISH = /(?:camera|cameraSpec|cam|spec)\s*$/i;

function lineOf(source: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === "\n") n++;
  return n;
}

/** Split a flat `{a: x, b: y}` literal body into top-level entries. */
function splitProps(body: string): { key: string; value: string }[] {
  const props: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "{" || ch === "[" || ch === "(") depth++;
    if (ch === "}" || ch === "]" || ch === ")") depth--;
    if (ch === "," && depth === 0) {
      props.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) props.push(cur);
  return props
    .map((p) => {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*:(.*)$/s.exec(p);
      return m ? { key: m[1]!, value: m[2]!.trim() } : null;
    })
    .filter((p): p is { key: string; value: string } => p !== null);
}

function literalBodyOf(src: string, braceOpen: number, braceClose: number): string {
  return src.slice(braceOpen + 1, braceClose);
}

function matching(src: string, openIndex: number, openCh: string, closeCh: string): number {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i]!;
    if (ch === openCh) depth++;
    if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
    if ((ch === '"' || ch === "'" || ch === "`") && depth === 1) {
      const q = ch;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
    }
  }
  return -1;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export function transform(source: string, fileName = "<input>"): CameraCastResult {
  const rows: CameraCastRow[] = [];
  const edits: Edit[] = []; // applied later; positions are pre-edit

  // ── Style (a1): Object.assign(<target> as unknown as <T>, <updates>) ──
  // Type part is `[\w$]+` optionally generic — `<…>` may itself contain commas.
  const objAssign = /Object\.assign\(\s*([\w$.[\]()]+?)\s+as\s+unknown\s+as\s+[\w$]+(?:<[^()]*>)?,\s*/g;
  let m: RegExpExecArray | null;
  while ((m = objAssign.exec(source))) {
    const target = m[1]!;
    const argStart = m.index + m[0].length;
    const parenClose = matching(source, m.index + "Object.assign(".length - 1, "(", ")");
    if (parenClose < 0) continue;
    const argSrc = source.slice(argStart, parenClose);
    // Consume a trailing `;` so replacements don't emit `;;`.
    const stmtEnd = source[parenClose + 1] === ";" ? parenClose + 2 : parenClose + 1;
    const trimmed = argSrc.trim();
    const ln = lineOf(source, m.index);
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const props = splitProps(
        literalBodyOf(source, argStart + argSrc.indexOf("{"), argStart + argSrc.lastIndexOf("}"))
      );
      const pose = props.filter((p) => POSE_FIELDS.has(p.key));
      const fov = props.filter((p) => p.key === "fov");
      const roll = props.filter((p) => p.key === "roll");
      const rest = props.filter((p) => !POSE_FIELDS.has(p.key) && p.key !== "fov" && p.key !== "roll");
      if (rest.length === 0 && (pose.length || fov.length || roll.length)) {
        const calls: string[] = [];
        if (pose.length) calls.push(`app.camera.setPose({ ${pose.map((p) => `${p.key}: ${p.value}`).join(", ")} });`);
        for (const p of fov) calls.push(`app.camera.setFov(${p.value});`);
        for (const p of roll) calls.push(`app.camera.setRoll(${p.value});`);
        edits.push({ start: m.index, end: stmtEnd, text: calls.join("\n") });
        rows.push({ file: fileName, line: ln, construct: `Object.assign(${target} as unknown as …)`, mapping: "exact", target: calls.join(" ") });
      } else {
        // Mixed or spec-shape fields → merge into a rigs.fromSpec spec.
        const text = `app.camera.use(app.camera.rigs.fromSpec({ ...${target}, ...${trimmed} }));`;
        edits.push({ start: m.index, end: stmtEnd, text });
        rows.push({ file: fileName, line: ln, construct: `Object.assign(${target} as unknown as …)`, mapping: "approximate", target: "app.camera.use(app.camera.rigs.fromSpec(merge))", note: `spec fields kept verbatim: ${rest.map((p) => p.key).join(", ") || "none"}` });
      }
    } else {
      const text = `app.camera.use(app.camera.rigs.fromSpec({ ...${target}, ...${trimmed} }));`;
      edits.push({ start: m.index, end: stmtEnd, text });
      rows.push({ file: fileName, line: ln, construct: `Object.assign(${target} as unknown as …, ${trimmed.slice(0, 40)})`, mapping: "approximate", target: "app.camera.use(app.camera.rigs.fromSpec(merge))", note: "dynamic updates merged into a spec" });
    }
  }

  // ── Style (a2): (<x> as unknown as <T>).<field> = <v> ──
  const castWrite = /\(\s*([\w$.[\]()]+?)\s+as\s+unknown\s+as\s+[\w$]+(?:<[^()]*>)?\)\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*/g;
  while ((m = castWrite.exec(source))) {
    const [, target, field] = m as unknown as [string, string, string];
    const ln = lineOf(source, m.index);
    if (!CAMISH.test(target)) continue;
    const stmtIdx = source.indexOf(";", m.index + m[0].length);
    const value = stmtIdx > 0 ? source.slice(m.index + m[0].length, stmtIdx).trim() : "<expr>";
    let text: string;
    let mapping: CameraCastRow["mapping"] = "exact";
    if (field === "fov") text = `app.camera.setFov(${value});`;
    else if (field === "roll") text = `app.camera.setRoll(${value});`;
    else if (POSE_FIELDS.has(field)) text = `app.camera.setPose({ ${field}: ${value} });`;
    else {
      text = `app.camera.use(app.camera.rigs.fromSpec({ ...${target}, ${field}: ${value} }));`;
      mapping = "approximate";
    }
    const end = stmtIdx > 0 ? stmtIdx + 1 : m.index + m[0].length;
    edits.push({ start: m.index, end, text });
    rows.push({ file: fileName, line: ln, construct: `(${target} as …).${field} = …`, mapping, target: text });
  }

  // ── Style (b): <camish>.<camera field> = <v> — no cast → manual list ──
  const directWrite = /\b([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\.((?:position|target|offset|targetOffset|fov|near|far|distance|targetNode|smoothing|offsetMode|mode|orthographicSize|roll))\s*=\s*/g;
  while ((m = directWrite.exec(source))) {
    const [full, base] = [m[0], m[1]!];
    if (!CAMISH.test(base)) continue;
    // Skip writes already covered by a cast edit above.
    if (edits.some((e) => m!.index >= e.start && m!.index <= e.end)) continue;
    rows.push({ file: fileName, line: lineOf(source, m.index), construct: `${full}…`, mapping: "none", note: "direct write to camera-spec value — migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)" });
  }

  // Apply edits right-to-left.
  const parts: string[] = [];
  let last = source.length;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    parts.unshift(source.slice(e.end, last));
    parts.unshift(e.text);
    last = e.start;
  }
  parts.unshift(source.slice(0, last));
  return { code: parts.join(""), rows };
}

// ── C-39 `camera-cast` codemod descriptor ──
export const cameraCastCodemod = {
  name: "camera-cast",
  owner: "prd08",
  description: "Camera spec cast-mutations → app.camera (C-22); reports direct spec writes.",
  transform
};

// ── C-39 doctor rule `feel/evidence-only` ──
export const feelEvidenceOnlyRule = {
  code: "feel/evidence-only",
  owner: "prd08",
  check(file: { readonly path: string; readonly text: string }) {
    const rows: { line: number; severity: "error" | "warning"; message: string }[] = [];
    const src = file.text;
    const gated = /(capture|evidence|VISUAL_CAPTURE|screenshot|diagnostic)/i;
    let m: RegExpExecArray | null;
    const gateRe = /if\s*\(([^)]{0,160})\)\s*\{[^}]{0,900}?\b(shake|punch|fovKick|trauma|hitStop)\b/g;
    while ((m = gateRe.exec(src))) {
      if (!gated.test(m[1]!)) continue;
      rows.push({ line: lineOf(src, m.index), severity: "warning", message: "feel call gated behind a capture/evidence branch — feel must reach pixels every frame, not only during captures (PRD-08 §9.5)" });
    }
    if (/\b(shake|trauma|punch|juice)\b/.test(src)) {
      const rndRe = /Math\.random\(\)/g;
      while ((m = rndRe.exec(src))) {
        rows.push({ line: lineOf(src, m.index), severity: "error", message: "Math.random() in a file applying camera feel — use seeded feel/Noise (determinism, repo rule)" });
      }
    }
    const castRe = /as\s+unknown\s+as\s+[\w<>[\], ]+?\s*[),]\s*[^)]*?(position|target|fov|offset)\s*=/g;
    while ((m = castRe.exec(src))) {
      rows.push({ line: lineOf(src, m.index), severity: "warning", message: "camera cast-mutation — run `aura3d codemod camera-cast --write` (C-22)" });
    }
    return rows;
  }
};

// ── CLI (`node tools/camera-cast-codemod/index.mjs <paths> [--report|--write|--dry-run]`) ──
function collectFiles(paths: readonly string[], acc: string[] = []): string[] {
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        collectFiles([join(p, name)], acc);
      }
    } else if (extname(p) === ".ts" || extname(p) === ".tsx") {
      acc.push(p);
    }
  }
  return acc;
}

export function reportRows(allRows: readonly CameraCastRow[]): string {
  const lines = ["# camera-cast report", ""];
  for (const r of allRows) {
    lines.push(`- ${r.file}:${r.line} — ${r.construct} → ${r.mapping}${r.target ? ` (${r.target})` : ""}${r.note ? ` — ${r.note}` : ""}`);
  }
  lines.push("");
  lines.push(
    `${allRows.length} construct(s): ${allRows.filter((r) => r.mapping === "exact").length} exact, ${allRows.filter((r) => r.mapping === "approximate").length} approximate, ${allRows.filter((r) => r.mapping === "none").length} manual`
  );
  return lines.join("\n");
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  const args = [...argv];
  const write = args.includes("--write");
  const dryRun = args.includes("--dry-run");
  const inputs = args.filter((a) => !a.startsWith("--"));
  if (!inputs.length) {
    console.error("usage: index.mjs <dir-or-file>… [--report|--write|--dry-run]");
    return 2;
  }
  const allRows: CameraCastRow[] = [];
  for (const file of collectFiles(inputs)) {
    const src = readFileSync(file, "utf8");
    const { code, rows } = transform(src, file);
    allRows.push(...rows);
    if (write && code !== src) writeFileSync(file, code);
    if (dryRun && code !== src) console.log(`--- ${file} would change`);
  }
  console.log(reportRows(allRows));
  return 0;
}
