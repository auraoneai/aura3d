/**
 * PRD-13 T2.18 — `look lint` command body + the `look-from-ambient` codemod.
 * Registered as C-39 command `look lint` and codemod `look-from-ambient` from
 * commands/prd13/index.ts.
 *
 * The command is a static TypeScript AST scan over src/** that flags the
 * look-hostile constructs §11.5 lists, then runs every rule other lanes
 * registered through C-39 `registerDoctorRule` (PRD 08 feel/evidence-only,
 * PRD 09 look/capture-branch, ...). PRD 13's own default capture-branch rule
 * covers `look/capture-branch` when PRD 09 has not registered one — it is
 * implemented as a builtin AST rule, so a lane registering the same code later
 * just adds (the C-39 duplicate guard keeps codes unique).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as ts from "typescript";
import { doctorRulesAll, type AuraCliCommand, type AuraCodemod, type AuraDoctorRule } from "../contracts/commands.js";

export interface LookLintFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly severity: "error" | "warning";
  readonly message: string;
}

export interface LookLintReport {
  readonly ok: boolean;
  readonly scannedFiles: number;
  readonly findings: readonly LookLintFinding[];
  readonly errors: number;
  readonly warnings: number;
  readonly doctorRules: readonly string[];
}

// ---------------------------------------------------------------------------
// Source collection

function listSourceFiles(cwd: string): string[] {
  const root = resolve(cwd, "src");
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(ts|tsx|mts)$/.test(entry.name)) out.push(path);
    }
  };
  visit(root);
  return out.sort();
}

// ---------------------------------------------------------------------------
// AST helpers

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function callExpressionName(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const expr = node.expression;
  if (ts.isPropertyAccessExpression(expr)) {
    const left = callExpressionRootName(expr.expression);
    return left ? `${left}.${expr.name.text}` : expr.name.text;
  }
  if (ts.isIdentifier(expr)) return expr.text;
  return undefined;
}

function callExpressionRootName(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const base = callExpressionRootName(expr.expression);
    return base ? `${base}.${expr.name.text}` : undefined;
  }
  if (ts.isCallExpression(expr)) return callExpressionRootName(expr.expression);
  return undefined;
}

/** Evidence-style property names whose `true` literal is a frozen claim. */
const EVIDENCE_TRUE_KEY = /(?:Aligned|InFrame|Framed|Applied|Reached|Visible|Grounded|Anchored|OnTrack|OnFloor|Clamped|Ready|Loaded|Enabled|Attached|Collected|Completed)(?:[A-Z][\w]*)*$/;
/** Overlay/debug-ish defaults that must not ship in a captured frame. */
const OVERLAY_TRUE_KEY = /^(?:debug|overlay|showOverlay|showHud|hud|stats|showStats|helpers|showHelpers|showGrid|grid|showAxes|axes|wireframe|showBounds)$/;

interface FileFacts {
  readonly usesEnvironment: boolean;
  readonly usesLooks: boolean;
}

function collectFileFacts(sourceFile: ts.SourceFile): FileFacts {
  let usesEnvironment = false;
  let usesLooks = false;
  const visit = (node: ts.Node): void => {
    const name = callExpressionName(node);
    if (name?.startsWith("environments.")) usesEnvironment = true;
    if (name === "looks.preset" || name === "looks.nodes" || name === "scene.look") usesLooks = true;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { usesEnvironment, usesLooks };
}

function scanFile(path: string, relativeFile: string, source: string): LookLintFinding[] {
  const sourceFile = ts.createSourceFile(relativeFile, source, ts.ScriptTarget.Latest, true);
  const facts = collectFileFacts(sourceFile);
  const findings: LookLintFinding[] = [];
  const hasEnv = facts.usesEnvironment || facts.usesLooks; // a look supplies its own env

  const push = (node: ts.Node, rule: string, severity: "error" | "warning", message: string): void => {
    findings.push({ file: relativeFile, line: lineOf(sourceFile, node), rule, severity, message });
  };

  const visit = (node: ts.Node): void => {
    // lights.ambient(...) with no env/look in the same scene flattens shading.
    if (callExpressionName(node) === "lights.ambient" && !hasEnv) {
      push(node, "look/ambient-without-env", "error", "lights.ambient() with no environment or look in this file — pick a look (looks.preset) instead of bare ambient fill");
    }
    // lean imports bypass the look pipeline entirely.
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith("@aura3d/lean")) {
      push(node, "look/lean-import", "error", `import from ${node.moduleSpecifier.text} bypasses looks — use @aura3d/engine with looks.preset`);
    }
    // renderer overrides fight the look's own render config.
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "renderer") {
      const prop = node.name.text;
      if (prop === "toneMapping" || prop === "toneMappingExposure" || prop === "outputColorSpace" || prop === "setPixelRatio") {
        push(node, "look/renderer-override", "error", `renderer.${prop} overrides the look's render config — set it through the look instead`);
      }
    }
    // capture branches: behaviour keyed on capture/screenshot URL params.
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = callExpressionName(node) ?? "";
      if (/\.get$/.test(callee) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0]!)) {
        const param = node.arguments[0]!.text;
        if (param === "capture" || param === "screenshot" || param === "snapshot" || param === "lookdev") {
          push(node, "look/capture-branch", "error", `code branches on the "${param}" URL param — one code path; captures observe it`);
        }
      }
    }
    if (ts.isStringLiteral(node) && /\bcapture\b|\bscreenshot\b|\bsnapshot\b|\blookdev\b/.test(node.text) && node.text.includes("=")) {
      push(node, "look/capture-branch", "warning", `URL fragment "${node.text}" may carry a capture flag`);
    }
    // `x: true` evidence/overlay literals.
    if (ts.isPropertyAssignment(node) && node.initializer.kind === ts.SyntaxKind.TrueKeyword && ts.isIdentifier(node.name)) {
      const key = node.name.text;
      if (OVERLAY_TRUE_KEY.test(key)) {
        push(node, "look/overlay-default", "error", `${key}: true ships an overlay/debug element — remove it or default false`);
      } else if (EVIDENCE_TRUE_KEY.test(key)) {
        push(node, "look/evidence-constant", "warning", `${key}: true is a constant evidence claim — compute it from the real state`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

// ---------------------------------------------------------------------------
// Command

export function lookLintFiles(cwd: string): readonly { readonly path: string; readonly text: string }[] {
  return listSourceFiles(cwd).map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

export function runLookLintScan(cwd: string): LookLintReport {
  const files = lookLintFiles(cwd);
  const findings: LookLintFinding[] = [];
  for (const file of files) {
    findings.push(...scanFile(file.path, relative(cwd, file.path), file.text));
  }
  // C-39 doctor rules from every lane run over the same files.
  const doctorCodes: string[] = [];
  for (const rule of doctorRulesAll()) {
    doctorCodes.push(rule.code);
    for (const file of files) {
      for (const hit of rule.check({ path: relative(cwd, file.path), text: file.text })) {
        findings.push({ file: relative(cwd, file.path), line: hit.line, rule: rule.code, severity: hit.severity, message: hit.message });
      }
    }
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  return { ok: errors === 0, scannedFiles: files.length, findings, errors, warnings, doctorRules: doctorCodes };
}

export async function runLookLint(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }): Promise<number> {
  const switches = new Set(argv.filter((a) => a.startsWith("--")));
  const report = runLookLintScan(io.cwd);
  if (switches.has("--json")) {
    io.stdout(JSON.stringify(report, null, 2));
  } else {
    io.stdout(`look lint scanned ${report.scannedFiles} files under src/ (doctor rules: ${report.doctorRules.join(", ") || "none registered"})`);
    for (const finding of report.findings) {
      io.stdout(`  ${finding.severity} ${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`);
    }
    io.stdout(`${report.errors} errors, ${report.warnings} warnings`);
  }
  return report.ok ? 0 : 1;
}

export const lookLintCommand: AuraCliCommand = {
  name: "look lint",
  owner: "prd13",
  summary: "Static look-lint over src/** (AST) plus every C-39 registerDoctorRule rule",
  usage: "aura3d look lint [--json]",
  run: (argv, io) => runLookLint(argv, io)
};

// ---------------------------------------------------------------------------
// look-from-ambient codemod (§11.5)

const DEFAULT_LOOK_ID = "outdoor-day";

export const lookFromAmbientCodemod: AuraCodemod = {
  name: "look-from-ambient",
  owner: "prd13",
  description: "Replace bare lights.ambient() (no env/look in file) with looks.preset + TODO; drop renderer qualityProfile 'safe-basic'; move report.visualSystems consumers to report.appliedEffects",
  transform(source: string, fileName: string) {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
    const facts = collectFileFacts(sourceFile);
    const rows: { readonly file: string; readonly line: number; readonly construct: string; readonly mapping: "exact" | "approximate" | "none"; readonly target?: string; readonly note?: string }[] = [];
    const edits: { start: number; end: number; text: string }[] = [];

    const visit = (node: ts.Node): void => {
      // lights.ambient(...) with no env node in the same scene → look preset + TODO.
      if (ts.isCallExpression(node) && callExpressionName(node) === "lights.ambient" && !facts.usesEnvironment && !facts.usesLooks) {
        edits.push({ start: node.getStart(sourceFile), end: node.getEnd(), text: `looks.preset("${DEFAULT_LOOK_ID}") /* TODO: pick the scene's genre look — see aura3d look rubric */` });
        rows.push({ file: fileName, line: lineOf(sourceFile, node), construct: "lights.ambient", mapping: "approximate", target: `looks.preset("${DEFAULT_LOOK_ID}")`, note: "ambient light replaced by a look; confirm the genre look id" });
      }
      // renderer.qualityProfile: "safe-basic" → property removed.
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "qualityProfile" && ts.isStringLiteral(node.initializer) && node.initializer.text === "safe-basic") {
        // Remove the property including a trailing comma when present.
        let end = node.getEnd();
        while (end < source.length && /\s/.test(source[end]!)) end += 1;
        if (source[end] === ",") end += 1;
        edits.push({ start: node.getStart(sourceFile), end, text: "" });
        rows.push({ file: fileName, line: lineOf(sourceFile, node), construct: 'renderer.qualityProfile: "safe-basic"', mapping: "exact", note: "safe-basic removed; the look sets the render profile" });
      }
      // report.visualSystems → report.appliedEffects (V2 consumers).
      if (ts.isPropertyAccessExpression(node) && node.name.text === "visualSystems") {
        edits.push({ start: node.name.getStart(sourceFile), end: node.name.getEnd(), text: "appliedEffects" });
        rows.push({ file: fileName, line: lineOf(sourceFile, node), construct: ".visualSystems", mapping: "approximate", target: ".appliedEffects", note: "apply when the consumer moves to compilePromptPlanV2" });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    const code = edits
      .sort((a, b) => b.start - a.start)
      .reduce((text, edit) => `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`, source);
    return { code, rows };
  }
};

/** Default PRD-13 capture-branch doctor rule — registered only when no lane
 *  already registered `look/capture-branch` (PRD 09 owns that code when it lands). */
export const defaultCaptureBranchRule: AuraDoctorRule = {
  code: "look/capture-branch",
  owner: "prd13",
  check(file) {
    const hits: { readonly line: number; readonly message: string; readonly severity: "error" | "warning" }[] = [];
    const lines = file.text.split("\n");
    for (const [index, line] of lines.entries()) {
      if (/searchParams\.get\(["'](?:capture|screenshot|snapshot|lookdev)["']\)/.test(line) || /[?&](?:capture|screenshot|snapshot|lookdev)=/.test(line)) {
        hits.push({ line: index + 1, message: "behaviour branches on a capture/screenshot URL param — one code path; captures observe it", severity: "error" });
      }
    }
    return hits;
  }
};
