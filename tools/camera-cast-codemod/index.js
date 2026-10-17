import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
const POSE_FIELDS = /* @__PURE__ */ new Set(["position", "target", "near", "far", "orthographicSize", "up"]);
const CAMISH = /(?:camera|cameraSpec|cam|spec)\s*$/i;
function lineOf(source, index) {
  let n = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === "\n") n++;
  return n;
}
function splitProps(body) {
  const props = [];
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
  return props.map((p) => {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:(.*)$/s.exec(p);
    return m ? { key: m[1], value: m[2].trim() } : null;
  }).filter((p) => p !== null);
}
function literalBodyOf(src, braceOpen, braceClose) {
  return src.slice(braceOpen + 1, braceClose);
}
function matching(src, openIndex, openCh, closeCh) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
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
function transform(source, fileName = "<input>") {
  const rows = [];
  const edits = [];
  const objAssign = /Object\.assign\(\s*([\w$.[\]()]+?)\s+as\s+unknown\s+as\s+[\w$]+(?:<[^()]*>)?,\s*/g;
  let m;
  while (m = objAssign.exec(source)) {
    const target = m[1];
    const argStart = m.index + m[0].length;
    const parenClose = matching(source, m.index + "Object.assign(".length - 1, "(", ")");
    if (parenClose < 0) continue;
    const argSrc = source.slice(argStart, parenClose);
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
        const calls = [];
        if (pose.length) calls.push(`app.camera.setPose({ ${pose.map((p) => `${p.key}: ${p.value}`).join(", ")} });`);
        for (const p of fov) calls.push(`app.camera.setFov(${p.value});`);
        for (const p of roll) calls.push(`app.camera.setRoll(${p.value});`);
        edits.push({ start: m.index, end: stmtEnd, text: calls.join("\n") });
        rows.push({ file: fileName, line: ln, construct: `Object.assign(${target} as unknown as \u2026)`, mapping: "exact", target: calls.join(" ") });
      } else {
        const text = `app.camera.use(app.camera.rigs.fromSpec({ ...${target}, ...${trimmed} }));`;
        edits.push({ start: m.index, end: stmtEnd, text });
        rows.push({ file: fileName, line: ln, construct: `Object.assign(${target} as unknown as \u2026)`, mapping: "approximate", target: "app.camera.use(app.camera.rigs.fromSpec(merge))", note: `spec fields kept verbatim: ${rest.map((p) => p.key).join(", ") || "none"}` });
      }
    } else {
      const text = `app.camera.use(app.camera.rigs.fromSpec({ ...${target}, ...${trimmed} }));`;
      edits.push({ start: m.index, end: stmtEnd, text });
      rows.push({ file: fileName, line: ln, construct: `Object.assign(${target} as unknown as \u2026, ${trimmed.slice(0, 40)})`, mapping: "approximate", target: "app.camera.use(app.camera.rigs.fromSpec(merge))", note: "dynamic updates merged into a spec" });
    }
  }
  const castWrite = /\(\s*([\w$.[\]()]+?)\s+as\s+unknown\s+as\s+[\w$]+(?:<[^()]*>)?\)\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*/g;
  while (m = castWrite.exec(source)) {
    const [, target, field] = m;
    const ln = lineOf(source, m.index);
    if (!CAMISH.test(target)) continue;
    const stmtIdx = source.indexOf(";", m.index + m[0].length);
    const value = stmtIdx > 0 ? source.slice(m.index + m[0].length, stmtIdx).trim() : "<expr>";
    let text;
    let mapping = "exact";
    if (field === "fov") text = `app.camera.setFov(${value});`;
    else if (field === "roll") text = `app.camera.setRoll(${value});`;
    else if (POSE_FIELDS.has(field)) text = `app.camera.setPose({ ${field}: ${value} });`;
    else {
      text = `app.camera.use(app.camera.rigs.fromSpec({ ...${target}, ${field}: ${value} }));`;
      mapping = "approximate";
    }
    const end = stmtIdx > 0 ? stmtIdx + 1 : m.index + m[0].length;
    edits.push({ start: m.index, end, text });
    rows.push({ file: fileName, line: ln, construct: `(${target} as \u2026).${field} = \u2026`, mapping, target: text });
  }
  const directWrite = /\b([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\.((?:position|target|offset|targetOffset|fov|near|far|distance|targetNode|smoothing|offsetMode|mode|orthographicSize|roll))\s*=\s*/g;
  while (m = directWrite.exec(source)) {
    const [full, base] = [m[0], m[1]];
    if (!CAMISH.test(base)) continue;
    if (edits.some((e) => m.index >= e.start && m.index <= e.end)) continue;
    rows.push({ file: fileName, line: lineOf(source, m.index), construct: `${full}\u2026`, mapping: "none", note: "direct write to camera-spec value \u2014 migrate to app.camera.setPose/setFov or rigs.fromSpec (style b)" });
  }
  const parts = [];
  let last = source.length;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    parts.unshift(source.slice(e.end, last));
    parts.unshift(e.text);
    last = e.start;
  }
  parts.unshift(source.slice(0, last));
  return { code: parts.join(""), rows };
}
const cameraCastCodemod = {
  name: "camera-cast",
  owner: "prd08",
  description: "Camera spec cast-mutations \u2192 app.camera (C-22); reports direct spec writes.",
  transform
};
const feelEvidenceOnlyRule = {
  code: "feel/evidence-only",
  owner: "prd08",
  check(file) {
    const rows = [];
    const src = file.text;
    const gated = /(capture|evidence|VISUAL_CAPTURE|screenshot|diagnostic)/i;
    let m;
    const gateRe = /if\s*\(([^)]{0,160})\)\s*\{[^}]{0,900}?\b(shake|punch|fovKick|trauma|hitStop)\b/g;
    while (m = gateRe.exec(src)) {
      if (!gated.test(m[1])) continue;
      rows.push({ line: lineOf(src, m.index), severity: "warning", message: "feel call gated behind a capture/evidence branch \u2014 feel must reach pixels every frame, not only during captures (PRD-08 \xA79.5)" });
    }
    if (/\b(shake|trauma|punch|juice)\b/.test(src)) {
      const rndRe = /Math\.random\(\)/g;
      while (m = rndRe.exec(src)) {
        rows.push({ line: lineOf(src, m.index), severity: "error", message: "Math.random() in a file applying camera feel \u2014 use seeded feel/Noise (determinism, repo rule)" });
      }
    }
    const castRe = /as\s+unknown\s+as\s+[\w<>[\], ]+?\s*[),]\s*[^)]*?(position|target|fov|offset)\s*=/g;
    while (m = castRe.exec(src)) {
      rows.push({ line: lineOf(src, m.index), severity: "warning", message: "camera cast-mutation \u2014 run `aura3d codemod camera-cast --write` (C-22)" });
    }
    return rows;
  }
};
function collectFiles(paths, acc = []) {
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
function reportRows(allRows) {
  const lines = ["# camera-cast report", ""];
  for (const r of allRows) {
    lines.push(`- ${r.file}:${r.line} \u2014 ${r.construct} \u2192 ${r.mapping}${r.target ? ` (${r.target})` : ""}${r.note ? ` \u2014 ${r.note}` : ""}`);
  }
  lines.push("");
  lines.push(
    `${allRows.length} construct(s): ${allRows.filter((r) => r.mapping === "exact").length} exact, ${allRows.filter((r) => r.mapping === "approximate").length} approximate, ${allRows.filter((r) => r.mapping === "none").length} manual`
  );
  return lines.join("\n");
}
function main(argv = process.argv.slice(2)) {
  const args = [...argv];
  const write = args.includes("--write");
  const dryRun = args.includes("--dry-run");
  const inputs = args.filter((a) => !a.startsWith("--"));
  if (!inputs.length) {
    console.error("usage: index.mjs <dir-or-file>\u2026 [--report|--write|--dry-run]");
    return 2;
  }
  const allRows = [];
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
export {
  cameraCastCodemod,
  feelEvidenceOnlyRule,
  main,
  reportRows,
  transform
};
