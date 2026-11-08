// `aura3d validate [file|dir]`: static checks of scene source in about a second, before any build or browser.
// It reuses the `aura3d verify` lint rules (silent no-ops, invented asset paths, unknown asset keys, reserved uniforms ...) and adds:
//   - VALIDATE_COLOR_INVALID: a colour string the engine parser rejects (it throws COLOR_INVALID at mount);
//   - VALIDATE_UNKNOWN_OPTION / _MEMBER / _EXPORT: the TypeScript checker's "does not exist" diagnostics only, against the installed engine;
//   - VALIDATE_SUBJECT_SMALL / VALIDATE_SUBJECT_CROPPED: literal camera distance and subject size give the share of frame height;
//   - VALIDATE_NO_LIGHTING and VALIDATE_REFLECTIVE_NO_ENVIRONMENT: no light/look/environment at all, or metal/glass with nothing to reflect.
// Every code is in the verify explainer table, so `aura3d verify --explain <CODE>` prints its cause and fix.
import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import { explainCode } from "../verify/codes.js";
import { collectLintSources, lintProject, lintSources, type LintSource } from "../verify/lint.js";
import { colorStringProblem, CSS_COLOR_NAMES } from "./color.js";
import { countSeverities, formatFindings, positionals, type AgentToolIo, type ToolFinding } from "./shared.js";

export const VALIDATE_SCHEMA = "aura3d.validate/1";
export const VALIDATE_USAGE =
  "aura3d validate [file.ts ... | projectDir] [--json] [--no-types] [--strict]\n" +
  "  Static checks: colours, unknown options/members/exports (TypeScript checker), invented asset paths and keys, framing, lighting,\n" +
  "  and the `aura3d verify` lint rules. Exit 0 when no error (with --strict: no error or warning), 1 otherwise, 2 on usage error.";

export interface ValidateReport {
  readonly schema: typeof VALIDATE_SCHEMA;
  readonly ok: boolean;
  readonly project: string;
  readonly files: readonly string[];
  readonly typeCheck: "ran" | "skipped" | "unavailable";
  readonly findings: readonly ToolFinding[];
  readonly counts: { readonly error: number; readonly warning: number; readonly info: number };
}

interface Parsed { readonly path: string; readonly sf: ts.SourceFile }

const KIND = (p: string): ts.ScriptKind => (p.endsWith(".tsx") ? ts.ScriptKind.TSX : p.endsWith(".jsx") ? ts.ScriptKind.JSX : /\.m?js$/.test(p) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
const loc = (file: Parsed, node: ts.Node): ToolFinding["location"] => {
  const { line, character } = file.sf.getLineAndCharacterOfPosition(node.getStart(file.sf));
  return { file: file.path, line: line + 1, column: character + 1 };
};
function finding(code: string, message: string, location?: ToolFinding["location"], severity?: ToolFinding["severity"]): ToolFinding {
  const entry = explainCode(code);
  return { code, severity: severity ?? entry?.severity ?? "warning", message, ...(entry ? { fix: entry.fix } : {}), ...(location ? { location } : {}) };
}
const unwrap = (node: ts.Expression): ts.Expression => {
  let e = node;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
  return e;
};
const propName = (name: ts.PropertyName): string | undefined => (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : undefined);
const getProp = (obj: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined => {
  for (const p of obj.properties) if (ts.isPropertyAssignment(p) && propName(p.name) === key) return p.initializer;
  return undefined;
};
const num = (node: ts.Expression | undefined): number | undefined => {
  if (!node) return undefined;
  const e = unwrap(node);
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return -Number(e.operand.text);
  return undefined;
};
const tuple = (node: ts.Expression | undefined): number[] | undefined => {
  if (!node) return undefined;
  const e = unwrap(node);
  if (!ts.isArrayLiteralExpression(e)) return undefined;
  const values = e.elements.map((el) => num(el as ts.Expression));
  return values.every((v): v is number => v !== undefined) ? values : undefined;
};
const callee = (call: ts.CallExpression): string => call.expression.getText().replace(/\s+/g, "").replace(/\?\./g, ".");
const firstObject = (call: ts.CallExpression, index = 0): ts.ObjectLiteralExpression | undefined => {
  const arg = call.arguments[index];
  return arg && ts.isObjectLiteralExpression(unwrap(arg)) ? (unwrap(arg) as ts.ObjectLiteralExpression) : undefined;
};

// ---- colours ------------------------------------------------------------------------------------------------------------
const COLOR_KEY = /(^|[a-z])(colou?r|Colou?r)$|^(background|tint|emissive|albedo)$/;
const COLOR_LIST_KEY = /colou?rs$|^palette$/i;

// Colour-valued keys also appear in app data that never reaches the engine: DOM styles (`color: "var(--fg)"`, `background: "linear-gradient(...)"`),
// palette lookups (`color: "skin"`), art-direction enums (`background: "sky"`), texture slot names (`baseColor: "Fox_baseColor"`) and material-graph
// node references (`outputs: { color: "tint" }`). So a value is checked against the full engine grammar only when its object literal is an argument of an
// engine builder call (`material.pbr({...})`, `lights.directional({...})`); anywhere else only an unambiguous colour attempt is checked: a `#` value, a
// colour function (rgb/hsl/oklch, or lab/lch/hwb/color() the engine lacks), a "0x..." string, or a spaced CSS name such as "light blue".
const ENGINE_COLOR_CALL = /(^|\.)(material|materials|lights|primitives|environments|sky|looks|effects|fog|water|weather|particles|text3D|instances|prefabs|sceneKits|postprocess|post)\.\w+$/;
const ENGINE_COLOR_ROOT = /(^|\.)(scene|createAuraApp|createGameApp)$/;
const NOT_A_COLOR_SINK = /\.(node|graph)$/;

/** True when the property sits (through nested object/array literals) in an argument of an engine builder call. */
function inEngineCall(prop: ts.PropertyAssignment): boolean {
  let n: ts.Node | undefined = prop.parent;
  while (n) {
    if (ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n) || ts.isPropertyAssignment(n) || ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isSpreadElement(n)) { n = n.parent; continue; }
    if (ts.isCallExpression(n)) { const name = callee(n); return (ENGINE_COLOR_CALL.test(name) || ENGINE_COLOR_ROOT.test(name)) && !NOT_A_COLOR_SINK.test(name); }
    return false;
  }
  return false;
}

/** A colour attempt that cannot be anything else (an app token like "sky" or "skin" is not one). */
function unambiguousColor(value: string): boolean {
  const v = value.trim();
  return v.startsWith("#") || /^0x[0-9a-f]+$/i.test(v) || /^(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix)\(/i.test(v) || (/[\s_-]/.test(v) && CSS_COLOR_NAMES.has(v.toLowerCase().replace(/[\s_-]+/g, "")));
}

export function checkColors(file: Parsed): ToolFinding[] {
  const out: ToolFinding[] = [];
  const check = (key: string, value: ts.Expression, strict: boolean): void => {
    const e = unwrap(value);
    let text: string;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) text = e.text;
    // A template is checked for shape only, with each substitution as "0" (`hsl(${h}, 60%, 40%)` passes), and only when it is plainly a colour.
    else if (ts.isTemplateExpression(e)) { text = e.head.text + e.templateSpans.map((s) => `0${s.literal.text}`).join(""); strict = false; }
    else return;
    if (text.trim() === "") return;
    // In an engine call, `background` also takes keywords (looks: "look"); a bare word there is only judged when it is a spaced colour name.
    if (!(strict && !(key === "background" && /^[a-z]+$/i.test(text.trim()))) && !unambiguousColor(text)) return;
    const problem = colorStringProblem(text);
    if (problem) out.push(finding("VALIDATE_COLOR_INVALID", `${key}: ${problem}. The engine throws COLOR_INVALID for it at mount.`, loc(file, value)));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const key = propName(node.name);
      if (key && COLOR_KEY.test(key)) check(key, node.initializer, inEngineCall(node));
      else if (key && COLOR_LIST_KEY.test(key)) {
        const arr = unwrap(node.initializer);
        const strict = inEngineCall(node);
        if (ts.isArrayLiteralExpression(arr)) for (const el of arr.elements) check(key, el as ts.Expression, strict);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file.sf);
  return out;
}

// ---- framing, lighting, reflective materials -----------------------------------------------------------------------------
const GROUND_NAME = /ground|floor|plane|terrain|water|ocean|sea|sky|backdrop|stage|wall|room|dome|grid|road|track|arena/i;

/** `height`: the size is an authored height (targetHeight), not a largest dimension. `unknown`: a model whose size the source does not state. */
interface Subject { readonly size: number; readonly node: ts.Node; readonly label: string; readonly height?: boolean; readonly unknown?: boolean }

function subjectOf(call: ts.CallExpression, name: string): Subject | undefined {
  const opts = firstObject(call) ?? firstObject(call, 1);
  const nameNode = opts ? getProp(opts, "name") : undefined;
  const nameExpr = nameNode ? unwrap(nameNode) : undefined;
  const label = nameExpr && (ts.isStringLiteral(nameExpr) || ts.isNoSubstitutionTemplateLiteral(nameExpr)) ? nameExpr.text : nameExpr && ts.isTemplateExpression(nameExpr) ? nameExpr.head.text : "";
  if (GROUND_NAME.test(label)) return undefined;
  if (/(^|\.)model$|assets\.node$/.test(name)) {
    const h = num(opts ? getProp(opts, "targetHeight") : undefined);
    const d = num(opts ? getProp(opts, "targetSize") : undefined) ?? num(opts ? getProp(opts, "targetMaxDimension") : undefined);
    if (h !== undefined) return { size: h, node: call, label: label || name, height: true };
    return d !== undefined ? { size: d, node: call, label: label || name } : { size: 0, node: call, label: label || name, unknown: true };
  }
  const kind = /primitives\.(\w+)$/.exec(name)?.[1];
  if (!kind || /plane|ground|floor|sky|water|terrain/i.test(kind) || !opts) return kind && !opts && /box|cube|sphere/.test(kind) ? { size: 1, node: call, label: label || name } : undefined;
  const sizeTuple = tuple(getProp(opts, "size"));
  const dims = [
    ...(sizeTuple ?? []), num(getProp(opts, "size")), num(getProp(opts, "width")), num(getProp(opts, "height")), num(getProp(opts, "depth")),
    ...[num(getProp(opts, "radius")), num(getProp(opts, "radiusTop")), num(getProp(opts, "radiusBottom"))].map((r) => (r === undefined ? undefined : r * 2))
  ].filter((v): v is number => v !== undefined && v > 0);
  if (dims.length === 0) return /box|cube|sphere|torus|cylinder|cone|capsule/.test(kind) ? { size: 1, node: call, label: label || name } : undefined;
  const optScale = num(getProp(opts, "scale")) ?? (tuple(getProp(opts, "scale")) ? Math.max(...tuple(getProp(opts, "scale"))!.map(Math.abs)) : 1);
  return { size: Math.max(...dims) * Math.abs(optScale), node: call, label: label || name };
}

/** Scale chained on a builder (`.scale(2)` or `.scale([x, y, z])`), largest axis. */
function chainedScale(call: ts.CallExpression): number {
  let node: ts.Node = call;
  let scale = 1;
  while (node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.parent && ts.isCallExpression(node.parent.parent)) {
    const outer = node.parent.parent;
    if (node.parent.name.text === "scale") {
      const s = num(outer.arguments[0]) ?? (tuple(outer.arguments[0]) ? Math.max(...tuple(outer.arguments[0])!.map(Math.abs)) : undefined) ?? (outer.arguments.length === 3 ? Math.max(...outer.arguments.map((a) => Math.abs(num(a) ?? 1))) : undefined);
      if (s !== undefined) scale *= Math.abs(s);
    }
    node = outer;
  }
  return scale;
}

export function checkSceneHints(files: readonly Parsed[], allCallees: readonly string[]): ToolFinding[] {
  const out: ToolFinding[] = [];
  const has = (re: RegExp): boolean => allCallees.some((c) => re.test(c));
  const mountsScene = has(/(^|\.)createAuraApp$|(^|\.)createGameApp$/);
  const hasLight = has(/(^|\.)lights\.\w+$/);
  const hasEnvironment = has(/(^|\.)(environments|looks|sky)\.\w+$|(^|\.)(lookPreset|withLook)$/) || files.some((f) => /\blook\s*:/.test(f.sf.text));
  const usesKit = has(/(^|\.)(sceneKits|prefabs|product|city|charts|solar|game|games)\.\w+$|promptPlanToScene$|compilePromptPlanV2$/);
  if (mountsScene && !hasLight && !hasEnvironment && !usesKit) {
    const file = files.find((f) => /createAuraApp|createGameApp/.test(f.sf.text)) ?? files[0];
    out.push(finding("VALIDATE_NO_LIGHTING", "The scene adds no light, environment, sky or look preset, so it depends entirely on engine defaults.", file ? { file: file.path, line: 1, column: 1 } : undefined));
  }
  const frames = has(/(^|\.)camera\.(frame|autoFrame|frameAsset)$/);
  const subjects: Subject[] = [];
  const cameras: { call: ts.CallExpression; file: Parsed; distance: number; fov: number }[] = [];
  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = callee(node);
        if (!hasEnvironment) {
          const opts = firstObject(node);
          const metallic = opts ? num(getProp(opts, "metallic")) ?? num(getProp(opts, "metalness")) : undefined;
          const transmission = opts ? num(getProp(opts, "transmission")) : undefined;
          const reflectiveBuilder = /(^|\.)material\.(metal|chrome|brushedMetal|glass|clearGlass|frostedGlass|mirror)$/.test(name);
          if (/(^|\.)material\.\w+$/.test(name) && (reflectiveBuilder || (metallic !== undefined && metallic >= 0.5) || (transmission !== undefined && transmission > 0.2))) {
            out.push(finding("VALIDATE_REFLECTIVE_NO_ENVIRONMENT", `${name}(${reflectiveBuilder ? "" : metallic !== undefined ? `metallic: ${metallic}` : `transmission: ${transmission}`}) has nothing to reflect: the scene has no environments.*, sky.* or looks.preset, so metal reads dark and glass reads flat.`, loc(file, node)));
          }
        }
        const subject = subjectOf(node, name);
        if (subject) subjects.push({ ...subject, size: subject.size * chainedScale(node) });
        if (/(^|\.)camera\.(orbit|perspective)$/.test(name)) {
          const opts = firstObject(node);
          if (opts) {
            const fov = num(getProp(opts, "fov")) ?? 45;
            let distance = num(getProp(opts, "distance")) ?? num(getProp(opts, "radius"));
            const pos = tuple(getProp(opts, "position")), target = tuple(getProp(opts, "target")) ?? [0, 0, 0];
            if (distance === undefined && pos && pos.length === 3 && target.length === 3) distance = Math.hypot(pos[0]! - target[0]!, pos[1]! - target[1]!, pos[2]! - target[2]!);
            if (distance !== undefined && distance > 0 && fov > 0 && fov < 170) cameras.push({ call: node, file, distance, fov });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file.sf);
  }
  // Only judge framing when every subject's size is stated in source and the scene is not a kit/game rig with its own camera logic.
  if (!frames && !usesKit && cameras.length === 1 && subjects.length > 0 && !subjects.some((s) => s.unknown)) {
    const cam = cameras[0]!;
    const subject = subjects.reduce((a, b) => (b.size > a.size ? b : a));
    const viewHeight = 2 * cam.distance * Math.tan((cam.fov * Math.PI) / 360);
    const fill = subject.size / viewHeight;
    const pct = `${Math.round(fill * 100)}%`;
    if (fill < 0.2) out.push(finding("VALIDATE_SUBJECT_SMALL", `The largest subject (${subject.label}, about ${subject.size.toFixed(2)} units) fills about ${pct} of the frame height from ${cam.distance.toFixed(1)} units at fov ${cam.fov}. Products and characters read best at 45-70%.`, loc(cam.file, cam.call)));
    else if (fill > 1.4 && subject.height) out.push(finding("VALIDATE_SUBJECT_CROPPED", `The largest subject (${subject.label}, about ${subject.size.toFixed(2)} units) is about ${pct} of the frame height from ${cam.distance.toFixed(1)} units at fov ${cam.fov}, so it is cropped.`, loc(cam.file, cam.call)));
  }
  return out;
}

// ---- TypeScript "does not exist" diagnostics -----------------------------------------------------------------------------
const TS_CODE_MAP: Readonly<Record<number, string>> = {
  2353: "VALIDATE_UNKNOWN_OPTION", 2561: "VALIDATE_UNKNOWN_OPTION",
  2339: "VALIDATE_UNKNOWN_MEMBER", 2551: "VALIDATE_UNKNOWN_MEMBER",
  2305: "VALIDATE_UNKNOWN_EXPORT", 2724: "VALIDATE_UNKNOWN_EXPORT"
};

export function typeDiagnostics(projectDir: string, files: readonly string[]): { status: ValidateReport["typeCheck"]; findings: ToolFinding[] } {
  const configPath = ts.findConfigFile(projectDir, ts.sys.fileExists, "tsconfig.json");
  let options: ts.CompilerOptions = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ["lib.es2022.d.ts", "lib.dom.d.ts"], types: [] };
  if (configPath && dirname(configPath) === projectDir) {
    const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config ?? {}, ts.sys, dirname(configPath));
    options = { ...parsed.options, noEmit: true, skipLibCheck: true };
  }
  const program = ts.createProgram(files.map((f) => resolve(projectDir, f)), options);
  const out: ToolFinding[] = [];
  for (const f of files) {
    const sf = program.getSourceFile(resolve(projectDir, f));
    if (!sf) continue;
    for (const d of program.getSemanticDiagnostics(sf)) {
      const text = ts.flattenDiagnosticMessageText(d.messageText, " ");
      if (d.code === 2307 && /@aura3d\/engine/.test(text)) return { status: "unavailable", findings: [finding("VALIDATE_TYPES_UNAVAILABLE", "Cannot resolve @aura3d/engine types from this project, so unknown options and names were not checked. Run npm install.")] };
      const code = TS_CODE_MAP[d.code];
      if (!code || d.start === undefined) continue;
      const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
      out.push(finding(code, `TS${d.code}: ${text}`, { file: relative(projectDir, sf.fileName).split("\\").join("/"), line: line + 1, column: character + 1 }));
    }
  }
  return { status: "ran", findings: out };
}

// ---- driver ------------------------------------------------------------------------------------------------------------
export interface ValidateOptions { readonly projectDir: string; readonly files?: readonly string[]; readonly types?: boolean }

export function runValidate(options: ValidateOptions): ValidateReport {
  const projectDir = resolve(options.projectDir);
  const targetSet = new Set((options.files ?? []).map((f) => relative(projectDir, resolve(projectDir, f)).split("\\").join("/")));
  // Explicit files in a project without src/ (a monorepo root, a docs folder): check only those files instead of walking the tree.
  const all: LintSource[] = targetSet.size && !existsSync(join(projectDir, "src")) ? [] : collectLintSources(projectDir);
  const targets = targetSet.size ? all.filter((s) => targetSet.has(s.path)) : all;
  // A target outside src/ (or a file the walker skips) is still checked.
  for (const path of targetSet) if (!targets.some((t) => t.path === path) && existsSync(join(projectDir, path))) targets.push({ path, text: ts.sys.readFile(join(projectDir, path)) ?? "" });
  const inTargets = (file: string | undefined): boolean => !targetSet.size || (file !== undefined && targetSet.has(file));
  const parsed: Parsed[] = targets.map((s) => ({ path: s.path, sf: ts.createSourceFile(s.path, s.text, ts.ScriptTarget.Latest, true, KIND(s.path)) }));
  const allParsed: Parsed[] = all.map((s) => ({ path: s.path, sf: ts.createSourceFile(s.path, s.text, ts.ScriptTarget.Latest, true, KIND(s.path)) }));
  const callees: string[] = [];
  for (const f of allParsed.length ? allParsed : parsed) { const v = (n: ts.Node): void => { if (ts.isCallExpression(n)) callees.push(callee(n)); ts.forEachChild(n, v); }; v(f.sf); }

  const findings: ToolFinding[] = [];
  const lints = all.length ? lintProject(projectDir) : lintSources(targets, { fileExists: (url) => existsSync(join(projectDir, "public", url.replace(/^\//, "").replace(/\?.*$/, ""))) });
  for (const lint of lints) if (inTargets(lint.location.file)) findings.push(finding(lint.code, lint.message, lint.location));
  for (const file of parsed) findings.push(...checkColors(file));
  findings.push(...checkSceneHints(parsed, callees).filter((f) => inTargets(f.location?.file)));
  let typeCheck: ValidateReport["typeCheck"] = "skipped";
  if (options.types !== false && parsed.length) {
    const result = typeDiagnostics(projectDir, parsed.map((p) => p.path));
    typeCheck = result.status;
    findings.push(...result.findings);
  }
  findings.sort((a, b) => (a.location?.file ?? "").localeCompare(b.location?.file ?? "") || (a.location?.line ?? 0) - (b.location?.line ?? 0) || a.code.localeCompare(b.code));
  const counts = countSeverities(findings);
  return { schema: VALIDATE_SCHEMA, ok: counts.error === 0, project: projectDir, files: parsed.map((p) => p.path), typeCheck, findings, counts };
}

export async function validateCommand(argv: readonly string[], io: AgentToolIo): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) { io.stdout(VALIDATE_USAGE); return 0; }
  const args = positionals(argv, new Set());
  let projectDir = resolve(io.cwd);
  const files: string[] = [];
  for (const arg of args) {
    const full = isAbsolute(arg) ? arg : resolve(io.cwd, arg);
    if (!existsSync(full)) { io.stderr(`${arg}: no such file or directory.`); return 2; }
    if (statSync(full).isDirectory()) projectDir = full;
    else files.push(full);
  }
  if (files.length && !args.some((a) => statSync(resolve(io.cwd, a)).isDirectory())) {
    // Project root for a lone file: the nearest directory with a package.json or tsconfig.json above it.
    let dir = dirname(files[0]!);
    const isRoot = (d: string): boolean => existsSync(join(d, "package.json")) || existsSync(join(d, "tsconfig.json"));
    while (!isRoot(dir) && dirname(dir) !== dir) dir = dirname(dir);
    projectDir = isRoot(dir) ? dir : dirname(files[0]!);
  }
  const report = runValidate({ projectDir, files: files.map((f) => relative(projectDir, f)), types: !argv.includes("--no-types") });
  const failed = argv.includes("--strict") ? report.counts.error + report.counts.warning > 0 : !report.ok;
  if (argv.includes("--json")) io.stdout(JSON.stringify({ ...report, ok: !failed }, null, 2));
  else {
    const head = `aura3d validate: ${failed ? "FAIL" : "PASS"} (${report.counts.error} error, ${report.counts.warning} warning, ${report.counts.info} info) over ${report.files.length} file(s); types ${report.typeCheck}`;
    io.stdout([head, ...formatFindings(report.findings), ...(report.findings.length ? ["", "Explain any code: aura3d verify --explain <CODE>"] : [])].join("\n"));
  }
  return failed ? 1 : 0;
}
