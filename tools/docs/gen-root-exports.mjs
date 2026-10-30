#!/usr/bin/env node
// Generates docs/api/root-exports.md from the real `@aura3d/engine` root entry
// (packages/engine/src/public/index.ts) using the TypeScript checker.
// Usage: node tools/docs/gen-root-exports.mjs [--write] [--json]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENTRY = path.join(ROOT, "packages/engine/src/public/index.ts");
const OUT = path.join(ROOT, "docs/api/root-exports.md");
const PURPOSES = path.join(ROOT, "tools/docs/root-export-purposes.json");

const AREAS = [
  ["Scene nodes and builders", /agent-api\/nodes\//],
  ["Game kits and sports/vehicle kits", /agent-api\/game-kits\/|GameAssetValidation|CombatFrameData|PlatformerMotion|VehicleChassis|GameCameraRigs|agent-api\/app\/game|createGame/],
  ["QA, replay and fixed-step loop", /\/qa\//],
  ["Scene compile and runtime nodes", /agent-api\/compiler\/|contracts\/(compiler|runtimeNodes|sceneGraph)\.ts|postBridge/],
  ["App, loop and time", /agent-api\/app\/|agent-api\/FrameLoop|contracts\/(app|time|world)\.ts|agent-api\/engineSurface/],
  ["Diagnostics", /diagnostics\.ts/],
  ["Environments, looks and lighting", /contracts\/(looks|environment)\.ts|EnvironmentPipeline|looks\/looks|postPresets|atmosphere-api/],
  ["Animation, characters and voice", /AnimationController|VisemeController|AuraVoiceBridge|DialoguePerformance|agent-api\/characters|PromptAnimationEvidence|ShotTimeline|CameraChoreographer/],
  ["Scene queries, spatial and layout", /SceneQueries|SpatialAnchoring|FocusSelection|LayeredSceneComposition|NavigationCrowds|TerrainTiles/],
  ["Application kits", /ApplicationKits/],
  ["Assets", /agent-api\/assets\//],
  ["Renderer", /rendering\/src\/Renderer\.ts/]
];

const rel = (file) => file.replace(ROOT + "/", "");

function loadProgram() {
  const cfg = ts.readConfigFile(path.join(ROOT, "tsconfig.base.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  const program = ts.createProgram([ENTRY], { ...parsed.options, noEmit: true, skipLibCheck: true, types: [] });
  return program;
}

function jsDocSummary(symbol, checker) {
  const parts = symbol.getDocumentationComment(checker);
  const text = ts.displayPartsToString(parts).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const m = text.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : text).slice(0, 160);
}

export function collect() {
  const program = loadProgram();
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(ENTRY);
  const mod = checker.getSymbolAtLocation(sf);

  // Names deprecated via a JSDoc block on the export statement in public/index.ts.
  const deprecatedNote = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt) || !stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) continue;
    const tags = ts.getJSDocTags(stmt).filter((t) => t.tagName.text === "deprecated");
    if (tags.length === 0) continue;
    const note = (typeof tags[0].comment === "string" ? tags[0].comment : ts.getTextOfJSDocComment(tags[0].comment) ?? "").replace(/\s+/g, " ").trim();
    for (const el of stmt.exportClause.elements) deprecatedNote.set(el.name.text, note);
  }

  const rows = [];
  for (const sym of checker.getExportsOfModule(mod)) {
    const resolved = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    if (!(resolved.flags & ts.SymbolFlags.Value)) continue;
    const decl = resolved.declarations?.[0];
    const file = decl ? rel(decl.getSourceFile().fileName) : "?";
    let kind = "constant";
    let members = [];
    if (resolved.flags & ts.SymbolFlags.Class) kind = "class";
    else if (resolved.flags & ts.SymbolFlags.Function) kind = "function";
    else if (resolved.flags & ts.SymbolFlags.Enum) kind = "enum";
    else {
      const type = checker.getTypeOfSymbolAtLocation(resolved, decl ?? sf);
      if (type.getConstructSignatures().length > 0) kind = "class";
      else if (type.getCallSignatures().length > 0) kind = "function";
      else if (checker.isArrayType?.(type) || checker.isTupleType?.(type)) kind = "constant";
      else if (!/^[A-Z0-9_]+$/.test(sym.name) && type.getProperties().length > 0 && (type.flags & ts.TypeFlags.Object)) {
        kind = "namespace";
        members = type.getProperties().map((p) => p.name);
      }
    }
    const depTag = resolved.getJsDocTags(checker).find((t) => t.name === "deprecated");
    const deprecated = deprecatedNote.has(sym.name) || Boolean(depTag);
    const tagText = depTag ? ts.displayPartsToString(depTag.text ?? []).replace(/\s+/g, " ").trim() : "";
    let area = "Other (utilities)";
    for (const [name, re] of AREAS) {
      if (re.test(file) || re.test(sym.name)) { area = name; break; }
    }
    if (/\/contracts\/stubs\/|^Stub[A-Z]|^stubCamera/.test(file) || /^Stub[A-Z]|^stubCamera/.test(sym.name)) area = "Contract stubs (do not call directly)";
    rows.push({
      name: sym.name,
      kind,
      deprecated,
      deprecatedNote: deprecatedNote.get(sym.name) ?? tagText,
      area,
      file,
      members,
      doc: jsDocSummary(resolved, checker)
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return rows;
}

function cell(s) {
  return String(s).replace(/\|/g, "\\|");
}

export function render(rows) {
  const purposes = existsSync(PURPOSES) ? JSON.parse(readFileSync(PURPOSES, "utf8")) : {};
  const live = rows.filter((r) => !r.deprecated);
  const dep = rows.filter((r) => r.deprecated);
  const out = [];
  out.push("# `@aura3d/engine` root exports (generated)");
  out.push("");
  out.push(`Generated by \`node tools/docs/gen-root-exports.mjs --write\` from \`packages/engine/src/public/index.ts\`. Do not edit by hand: \`node tools/docs/check-root-exports.mjs\` fails when this file is stale. Types are not listed here; import them with \`import type\`.`);
  out.push("");
  out.push(`Value exports: ${rows.length} total, ${live.length} live, ${dep.length} deprecated. Prefer live names. Deprecated names are removed in 5.0.0 (see the last section).`);
  out.push("");
  out.push("## Start here (core path)");
  out.push("");
  out.push("| Name | Kind | What it is for |");
  out.push("|---|---|---|");
  const core = Object.keys(purposes).filter((n) => live.some((r) => r.name === n));
  for (const n of core) {
    const r = live.find((x) => x.name === n);
    out.push(`| \`${n}\` | ${r.kind} | ${cell(purposes[n])} |`);
  }
  out.push("");
  out.push("## All live exports by area");
  out.push("");
  out.push("Namespace objects list their members (builder functions) in the last column.");
  const byArea = new Map();
  for (const r of live) {
    if (!byArea.has(r.area)) byArea.set(r.area, []);
    byArea.get(r.area).push(r);
  }
  const areaOrder = [...AREAS.map((a) => a[0]), "Contract stubs (do not call directly)", "Other (utilities)"];
  for (const area of areaOrder) {
    const list = byArea.get(area);
    if (!list) continue;
    out.push("");
    out.push(`### ${area} (${list.length})`);
    out.push("");
    out.push("| Name | Kind | Members |");
    out.push("|---|---|---|");
    for (const r of list) {
      const members = r.members.length > 0 ? r.members.slice(0, 24).map((m) => `\`${m}\``).join(" ") + (r.members.length > 24 ? ` (+${r.members.length - 24})` : "") : "";
      out.push(`| \`${r.name}\` | ${r.kind} | ${members} |`);
    }
  }
  out.push("");
  out.push(`## Deprecated (${dep.length})`);
  out.push("");
  out.push("| Name | Kind | Replacement / note |");
  out.push("|---|---|---|");
  for (const r of dep) {
    out.push(`| \`${r.name}\` | ${r.kind} | ${cell(r.deprecatedNote.replace(/\s*Kept at 4\.0\.0.*$/, "").replace(/\s*[—-] removes in 5\.0\.0\.?$/, "") || "deprecated")} |`);
  }
  out.push("");
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = collect();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const text = render(rows);
    if (process.argv.includes("--write")) {
      writeFileSync(OUT, text);
      console.log(`wrote ${rel(OUT)} (${rows.length} value exports)`);
    } else {
      process.stdout.write(text);
    }
  }
}
