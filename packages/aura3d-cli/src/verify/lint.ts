// Static lint for silent no-ops: things that type-check, build and mount, and then do nothing (or hide the scene).
// Each rule reads the TypeScript AST of the project sources (no engine import, no browser), so it runs in milliseconds and is unit-testable.
// Rules are deliberately conservative: a rule fires only on literal evidence in source, never on a guess about values it cannot see.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

export interface LintSource { readonly path: string; readonly text: string }
export interface LintFinding {
  readonly code: string;
  readonly message: string;
  readonly location: { readonly file: string; readonly line: number; readonly column: number };
}
export type LintGroup = "assets" | "scene";
export interface LintOptions {
  /** Which rule group to run. Default: both. */
  readonly group?: LintGroup;
  /** Whether a project-relative URL (e.g. `/models/a.glb`) resolves to a file in the project. Default: never. */
  readonly fileExists?: (url: string) => boolean;
}

/** Names the generated GLSL prelude owns. Mirrors RESERVED_UNIFORM_NAMES in packages/engine/src/agent-api/compiler/customMaterial.ts (a parity test guards drift). */
export const RESERVED_UNIFORM_NAMES: readonly string[] = [
  "uTime", "u_time", "uResolution", "u_resolution", "cameraPosition", "u_cameraPosition",
  "modelMatrix", "u_modelMatrix", "viewMatrix", "u_viewMatrix", "projectionMatrix", "u_projectionMatrix",
  "modelViewMatrix", "modelViewProjectionMatrix", "u_modelViewProjection", "normalMatrix", "u_normalMatrix",
  "position", "normal", "uv", "gl_Position", "gl_FragCoord", "gl_FragColor"
];

/** Keys `effects.fog` reads. Mirrors FOG_OPTION_KEYS in packages/engine/src/agent-api/nodes/effects.ts (a parity test guards drift). Anything else is OPTION_IGNORED. */
export const FOG_VALID_OPTIONS: readonly string[] = [
  "name", "mode", "color", "density", "heightDensity", "heightFalloff", "heightReference", "start", "maxOpacity",
  "near", "far", "absorption", "sunInscatter", "anisotropy", "ambientScale", "affectsBackground",
  "backgroundDistance", "transitionSeconds", "legacyOpacityCap", "intensity"
];

/** Methods whose promise waits for the renderer mount (app.ready/readyStrict/readiness/precompile, game.ready); LINT_TOP_LEVEL_AWAIT_READY. */
const TOP_LEVEL_MOUNT_WAITS: ReadonlySet<string> = new Set(["ready", "readyStrict", "readiness", "precompile"]);

/** `instances.model` options the runtime accepts and does not apply (UNAPPLIED_INSTANCED_MODEL_OPTIONS in nodes/instances.ts; emitted as OPTION_IGNORED). */
export const INSTANCES_MODEL_UNAPPLIED_OPTIONS: readonly string[] = ["lod", "maxInstancesPerDraw", "static", "chunkSize", "shadowLod", "impostor"];

/**
 * Builder option tables for LINT_EFFECT_OPTION_IGNORED. `valid`: any other key is ignored. `ignored`: these keys are ignored.
 * `effects.particles` has no row: every defined particle option rides to lowering, so there is no list of ignored particle options to lint against
 * (the runtime still reports any that appear, see RUNTIME_OPTION_IGNORED).
 */
export const IGNORED_OPTION_RULES: readonly { readonly builder: string; readonly valid?: readonly string[]; readonly ignored?: readonly string[] }[] = [
  { builder: "effects.fog", valid: FOG_VALID_OPTIONS },
  { builder: "instances.model", ignored: INSTANCES_MODEL_UNAPPLIED_OPTIONS }
];

interface ParsedFile { readonly path: string; readonly sf: ts.SourceFile }
interface CallSite { readonly file: ParsedFile; readonly node: ts.CallExpression; readonly callee: string }

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vite", "coverage", "tests", "test", ".turbo"]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|mts)$/;

/** Source files of a project: `src/` if present, else the root (config files excluded). */
export function collectLintSources(projectDir: string): LintSource[] {
  const root = resolve(projectDir);
  const start = existsSync(join(root, "src")) ? join(root, "src") : root;
  const out: LintSource[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 8) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) { if (!SKIP_DIRS.has(name) && !name.startsWith(".")) walk(full, depth + 1); continue; }
      if (!SOURCE_EXT.test(name) || name.endsWith(".d.ts") || /\.(test|spec)\./.test(name) || /^(vite|vitest|playwright|eslint)\.config\./.test(name)) continue;
      out.push({ path: relative(root, full).split("\\").join("/"), text: readFileSync(full, "utf8") });
    }
  };
  walk(start, 0);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const SCRIPT_KIND = (path: string): ts.ScriptKind => (path.endsWith(".tsx") ? ts.ScriptKind.TSX : path.endsWith(".jsx") ? ts.ScriptKind.JSX : path.endsWith(".js") || path.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS);

function loc(file: ParsedFile, node: ts.Node): LintFinding["location"] {
  const { line, character } = file.sf.getLineAndCharacterOfPosition(node.getStart(file.sf));
  return { file: file.path, line: line + 1, column: character + 1 };
}

const isObject = (node: ts.Node | undefined): node is ts.ObjectLiteralExpression => !!node && ts.isObjectLiteralExpression(node);
const unwrap = (node: ts.Expression): ts.Expression => {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) current = current.expression;
  return current;
};

function propName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return undefined;
}

/** Property initializer (or the shorthand identifier) by name. */
function getProp(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && propName(p.name) === name) return p.initializer;
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) return p.name;
  }
  return undefined;
}

function objectKeys(obj: ts.ObjectLiteralExpression): { readonly key: string; readonly node: ts.Node; readonly value?: ts.Expression }[] {
  const keys: { key: string; node: ts.Node; value?: ts.Expression }[] = [];
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p)) { const key = propName(p.name); if (key !== undefined) keys.push({ key, node: p.name, value: p.initializer }); }
    else if (ts.isShorthandPropertyAssignment(p)) keys.push({ key: p.name.text, node: p.name, value: p.name });
    else if (ts.isMethodDeclaration(p)) { const key = propName(p.name); if (key !== undefined) keys.push({ key, node: p.name }); }
  }
  return keys;
}

const isFalsyLiteral = (node: ts.Expression): boolean => {
  const e = unwrap(node);
  return e.kind === ts.SyntaxKind.FalseKeyword || (ts.isIdentifier(e) && e.text === "undefined") || e.kind === ts.SyntaxKind.NullKeyword;
};

/** A constant-ish string value: literal, template (substitutions become blanks), `a + b`, or an identifier bound to one const in the same file. */
function resolveText(file: ParsedFile, node: ts.Expression | undefined, depth = 0): string | undefined {
  if (!node || depth > 4) return undefined;
  const e = unwrap(node);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isTemplateExpression(e)) return e.head.text + e.templateSpans.map((s) => " " + s.literal.text).join("");
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = resolveText(file, e.left, depth + 1), b = resolveText(file, e.right, depth + 1);
    return a !== undefined && b !== undefined ? a + b : undefined;
  }
  if (ts.isIdentifier(e)) {
    let found: ts.Expression | undefined;
    const visit = (n: ts.Node): void => {
      if (found) return;
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === e.text && n.initializer) found = n.initializer;
      else ts.forEachChild(n, visit);
    };
    visit(file.sf);
    return resolveText(file, found, depth + 1);
  }
  return undefined;
}

/** The call expression a node is, or the const-bound call an identifier points at (same file). */
function resolveCall(file: ParsedFile, node: ts.Expression, depth = 0): ts.CallExpression | undefined {
  const e = unwrap(node);
  if (ts.isCallExpression(e)) return e;
  if (!ts.isIdentifier(e) || depth > 3) return undefined;
  let found: ts.Expression | undefined;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === e.text && n.initializer) found = n.initializer;
    else ts.forEachChild(n, visit);
  };
  visit(file.sf);
  return found ? resolveCall(file, found, depth + 1) : undefined;
}

function numberOf(node: ts.Expression | undefined): number | undefined {
  if (!node) return undefined;
  const e = unwrap(node);
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return -Number(e.operand.text);
  return undefined;
}

function numberTuple(node: ts.Expression | undefined): number[] | undefined {
  if (!node) return undefined;
  const e = unwrap(node);
  if (!ts.isArrayLiteralExpression(e)) return undefined;
  const values = e.elements.map((el) => numberOf(el as ts.Expression));
  return values.every((v): v is number => v !== undefined) ? (values as number[]) : undefined;
}

function calleeText(call: ts.CallExpression): string {
  return call.expression.getText().replace(/\s+/g, "").replace(/\?\./g, ".");
}

function collectCalls(files: readonly ParsedFile[]): CallSite[] {
  const calls: CallSite[] = [];
  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) calls.push({ file, node, callee: calleeText(node) });
      ts.forEachChild(node, visit);
    };
    visit(file.sf);
  }
  return calls;
}

const endsWithBuilder = (callee: string, builder: string): boolean => callee === builder || callee.endsWith(`.${builder}`);

/** Root call of a method chain such as `primitives.sphere({..}).position(..).scale(..)`. */
function chainRoot(call: ts.CallExpression): ts.CallExpression {
  let current: ts.Expression = call;
  for (;;) {
    const e = unwrap(current);
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
      const inner = unwrap(e.expression.expression);
      if (ts.isCallExpression(inner)) { current = inner; continue; }
    }
    return ts.isCallExpression(e) ? e : call;
  }
}

/** Chain calls from root outward, e.g. [primitives.sphere, position, scale]. */
function chainCalls(outer: ts.CallExpression): ts.CallExpression[] {
  const list: ts.CallExpression[] = [outer];
  let current: ts.Expression = outer;
  for (;;) {
    const e = unwrap(current);
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
      const inner = unwrap(e.expression.expression);
      if (ts.isCallExpression(inner)) { list.unshift(inner); current = inner; continue; }
    }
    return list;
  }
}

function unwrapParent(node: ts.Node): ts.Node {
  let parent = node.parent;
  while (parent && (ts.isAwaitExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent))) parent = parent.parent;
  return parent;
}

const finding = (file: ParsedFile, node: ts.Node, code: string, message: string): LintFinding => ({ code, message, location: loc(file, node) });

// ---------------------------------------------------------------------------------------------------------------------

interface ShaderInfo { readonly text?: string; readonly resolved: boolean }

function shaderTexts(site: CallSite): ShaderInfo {
  const arg = site.node.arguments[0];
  const spec = arg && isObject(unwrap(arg)) ? (unwrap(arg) as ts.ObjectLiteralExpression) : undefined;
  const glsl = spec ? getProp(spec, "glsl") : undefined;
  const glslObj = glsl && isObject(unwrap(glsl)) ? (unwrap(glsl) as ts.ObjectLiteralExpression) : undefined;
  if (!glslObj) return { resolved: false };
  const parts: string[] = [];
  let resolved = true;
  for (const stage of ["vertex", "fragment"]) {
    const node = getProp(glslObj, stage);
    if (!node) continue;
    const text = resolveText(site.file, node);
    if (text === undefined) resolved = false; else parts.push(text);
  }
  return { text: parts.join("\n"), resolved };
}

function lintAssets(files: readonly ParsedFile[], calls: readonly CallSite[], options: LintOptions): LintFinding[] {
  const out: LintFinding[] = [];
  // Typed asset keys, from `defineAuraAssets({ key: {...} })`.
  const typedKeys = new Set<string>();
  let hasTypedAssets = false;
  for (const call of calls) {
    if (endsWithBuilder(call.callee, "defineAuraAssets")) {
      const arg = call.node.arguments[0];
      if (arg && isObject(unwrap(arg))) {
        hasTypedAssets = true;
        for (const { key, value } of objectKeys(unwrap(arg) as ts.ObjectLiteralExpression)) {
          typedKeys.add(key);
          // A typed asset whose file is not in the project is a hand-written entry, not an admitted one: the URL was invented.
          const entryObj = value && isObject(unwrap(value)) ? (unwrap(value) as ts.ObjectLiteralExpression) : undefined;
          const urlNode = entryObj ? getProp(entryObj, "url") : undefined;
          const url = resolveText(call.file, urlNode);
          if (urlNode && url !== undefined && !/^(https?:)?\/\//i.test(url) && !(options.fileExists?.(url) ?? false)) {
            out.push(finding(call.file, urlNode, "ASSET_PATH_INVENTED", `assets.${key} points at "${url}", but no such file exists under public/ in the project. Admit a real file with \`aura3d assets add\` or \`assets resolve\` instead of writing the entry by hand.`));
          }
        }
      }
    }
  }
  for (const call of calls) {
    // model("/models/robot.glb"): a string where a typed asset belongs.
    if (call.callee === "model" || endsWithBuilder(call.callee, "model")) {
      const first = call.node.arguments[0];
      const text = first ? resolveText(call.file, first) : undefined;
      if (text !== undefined && /\.(glb|gltf)(\?.*)?$/i.test(text)) {
        const exists = options.fileExists?.(text) ?? false;
        out.push(finding(call.file, first!, "ASSET_PATH_INVENTED", `model("${text}") passes a string path${exists ? " (the file exists, but it is not a typed asset)" : " and no file with that path exists in the project"}. Use model(assets.<key>) from src/aura-assets.ts.`));
      }
    }
  }
  if (hasTypedAssets) {
    for (const file of files) {
      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "assets") {
          const key = node.name.text;
          if (!typedKeys.has(key) && !/^(get|has|keys|values|entries|resolve)$/.test(key)) out.push(finding(file, node.name, "ASSET_KEY_UNKNOWN", `assets.${key} is not defined in src/aura-assets.ts (defined: ${[...typedKeys].join(", ") || "none"}).`));
        }
        ts.forEachChild(node, visit);
      };
      visit(file.sf);
    }
  }
  return out;
}

function lintScene(files: readonly ParsedFile[], calls: readonly CallSite[]): LintFinding[] {
  const out: LintFinding[] = [];

  // --- shadow with no receiver -------------------------------------------------------------------------------------
  // Primitives and models receive shadows by default; a `material.custom` node does not (it must opt in with receiveShadow: true).
  // So a shadow light is a no-op only when every surface builder we can see is receiver-off. No visible builders = no evidence = no finding.
  const surfaceCalls = calls.filter((c) => /(^|\.)primitives\.\w+$/.test(c.callee) || /(^|\.)model$/.test(c.callee));
  const receivesShadow = (site: CallSite): boolean => {
    const obj = site.node.arguments.map((a) => unwrap(a)).find(isObject) as ts.ObjectLiteralExpression | undefined;
    if (!obj) return true;
    const explicit = getProp(obj, "receiveShadow");
    if (explicit) return !isFalsyLiteral(explicit);
    const materialNode = getProp(obj, "material");
    const materialCall = materialNode ? resolveCall(site.file, materialNode) : undefined;
    if (materialCall && /(^|\.)material\.custom$/.test(calleeText(materialCall))) {
      const spec = materialCall.arguments[0] ? unwrap(materialCall.arguments[0]!) : undefined;
      const flag = spec && isObject(spec) ? getProp(spec, "receiveShadow") : undefined;
      return !!flag && !isFalsyLiteral(flag);
    }
    return true;
  };
  const noReceivers = surfaceCalls.length > 0 && surfaceCalls.every((c) => !receivesShadow(c));
  for (const call of calls) {
    if (!/(^|\.)lights\.(directional|point|spot|sun)$/.test(call.callee)) continue;
    const arg = call.node.arguments[0];
    const obj = arg && isObject(unwrap(arg)) ? (unwrap(arg) as ts.ObjectLiteralExpression) : undefined;
    const shadow = obj ? getProp(obj, "shadow") : undefined;
    if (shadow && !isFalsyLiteral(shadow) && noReceivers) {
      out.push(finding(call.file, shadow, "LINT_SHADOW_NO_RECEIVER", `${call.callee} sets shadow, but none of the ${surfaceCalls.length} surface node(s) in the project can receive it (receiveShadow false, or material.custom without receiveShadow: true), so no shadow can appear.`));
    }
  }

  // --- sky + background --------------------------------------------------------------------------------------------
  for (const file of files) {
    const fileCalls = calls.filter((c) => c.file === file);
    const skyCall = fileCalls.find((c) => /(^|\.)sky\.(preetham|gradient|hdri|dayNight)$/.test(c.callee));
    if (!skyCall) continue;
    let backgroundNode: ts.Node | undefined;
    for (const c of fileCalls) {
      if (/(^|\.)background$/.test(c.callee) && c.node.arguments[0]) {
        const text = c.node.arguments[0]!.getText();
        if (!/background|sky/i.test(text)) backgroundNode = c.node;
      }
      if (/(^|\.)scene$/.test(c.callee)) {
        const arg = c.node.arguments[0];
        const obj = arg && isObject(unwrap(arg)) ? (unwrap(arg) as ts.ObjectLiteralExpression) : undefined;
        const bg = obj ? getProp(obj, "background") : undefined;
        if (bg && !isFalsyLiteral(bg) && !/background|sky/i.test(bg.getText())) backgroundNode = bg;
      }
    }
    if (backgroundNode) out.push(finding(file, skyCall.node, "LINT_SKY_HIDES_BACKGROUND", `${skyCall.callee} draws over the scene background set at line ${file.sf.getLineAndCharacterOfPosition(backgroundNode.getStart(file.sf)).line + 1}, so that background is never visible.`));
  }

  // --- custom shaders: uniforms, reserved names, uTime, attributes -------------------------------------------------
  const shaderSites = calls.filter((c) => /(^|\.)material\.custom$/.test(c.callee));
  const allShaderText: string[] = [];
  let allResolved = true;
  let readsTime: { site: CallSite } | undefined;
  for (const site of shaderSites) {
    const info = shaderTexts(site);
    if (info.text !== undefined) allShaderText.push(info.text);
    if (!info.resolved) allResolved = false;
    const arg = site.node.arguments[0];
    const spec = arg && isObject(unwrap(arg)) ? (unwrap(arg) as ts.ObjectLiteralExpression) : undefined;
    if (!spec) continue;
    const uniformsNode = getProp(spec, "uniforms");
    const aliasesNode = getProp(spec, "uniformAliases");
    const aliases = new Map<string, string>();
    if (aliasesNode && isObject(unwrap(aliasesNode))) for (const { key, value } of objectKeys(unwrap(aliasesNode) as ts.ObjectLiteralExpression)) { const v = resolveText(site.file, value); if (v) aliases.set(key, v); }
    if (uniformsNode && isObject(unwrap(uniformsNode))) {
      for (const { key, node } of objectKeys(unwrap(uniformsNode) as ts.ObjectLiteralExpression)) {
        if (RESERVED_UNIFORM_NAMES.includes(key)) {
          out.push(finding(site.file, node, "LINT_UNIFORM_RESERVED", `Uniform "${key}" is reserved for a generated built-in; material.custom rejects it and the draw is skipped.`));
          continue;
        }
        if (info.resolved && info.text !== undefined) {
          const names = [key, aliases.get(key)].filter((n): n is string => !!n);
          const read = names.some((n) => new RegExp(`(?<![A-Za-z0-9_])${n.replace(/[$]/g, "\\$")}(?![A-Za-z0-9_])`).test(info.text!));
          if (!read) out.push(finding(site.file, node, "LINT_SHADER_UNIFORM_UNREAD", `Uniform "${key}" is declared but the GLSL never reads it.`));
        }
      }
    }
    if (info.text !== undefined && /(?<![A-Za-z0-9_])(uTime|u_time)(?![A-Za-z0-9_])/.test(info.text) && !readsTime) readsTime = { site };
  }
  if (readsTime) {
    const drivesTime = files.some((f) => /\bonFrame\s*\(/.test(f.sf.text)) && files.some((f) => /\bmutable\s*:\s*true\b/.test(f.sf.text));
    if (!drivesTime) out.push(finding(readsTime.site.file, readsTime.site.node, "LINT_UTIME_NOT_ANIMATED", "The shader reads uTime, but the project has no app.onFrame together with a .runtime({ mutable: true }) node, so nothing drives time and uTime stays at its initial value."));
  }
  // Attributes supplied by geometry that no shader reads.
  const geometryCalls = calls.filter((c) => /(^|\.)geometry\.\w+$/.test(c.callee));
  for (const g of geometryCalls) {
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && propName(node.name) === "attributes" && isObject(unwrap(node.initializer))) {
        for (const { key, node: keyNode } of objectKeys(unwrap(node.initializer) as ts.ObjectLiteralExpression)) {
          if (allResolved && !allShaderText.some((t) => new RegExp(`(?<![A-Za-z0-9_])${key}(?![A-Za-z0-9_])`).test(t))) {
            out.push(finding(g.file, keyNode, "LINT_SHADER_ATTRIBUTE_UNREAD", `Attribute "${key}" is supplied but no custom shader in the project reads it.`));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(g.node);
  }

  // --- options the lowering ignores --------------------------------------------------------------------------------
  for (const call of calls) {
    const rule = IGNORED_OPTION_RULES.find((r) => endsWithBuilder(call.callee, r.builder));
    if (!rule) continue;
    const objArg = call.node.arguments.map((a) => unwrap(a)).find(isObject);
    const obj = objArg as ts.ObjectLiteralExpression | undefined;
    if (!obj) continue;
    const bad = objectKeys(obj).filter(({ key, value }) => value !== undefined && !(ts.isIdentifier(unwrap(value)) && (unwrap(value) as ts.Identifier).text === "undefined") && (rule.valid ? !rule.valid.includes(key) : rule.ignored!.includes(key)));
    for (const { key, node } of bad) {
      out.push(finding(call.file, node, "LINT_EFFECT_OPTION_IGNORED", `${rule.builder} does not read option "${key}" (the runtime reports OPTION_IGNORED), so it has no effect.${rule.valid ? ` Valid options: ${rule.valid.join(", ")}.` : ""}`));
    }
  }

  // --- app.ready() not awaited -------------------------------------------------------------------------------------
  // Only when the handle is kept (`const app = createAuraApp(...)`): a discarded handle cannot be awaited, and templates that do
  // that report readiness through body[data-aura3d-ready] instead.
  const keptCreates = calls.filter((c) => endsWithBuilder(c.callee, "createAuraApp") && ts.isVariableDeclaration(unwrapParent(c.node)));
  if (keptCreates.length) {
    const readyHandled = files.some((f) => {
      let handled = false;
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "ready" && !ts.isExpressionStatement(node.parent)) handled = true;
        ts.forEachChild(node, visit);
      };
      visit(f.sf);
      return handled;
    });
    if (!readyHandled) out.push(finding(keptCreates[0]!.file, keptCreates[0]!.node, "LINT_READY_NOT_AWAITED", "createAuraApp(...) is kept in a variable but app.ready() is never awaited or chained, so mount errors are never observed."));
  }

  // --- module-level `await app.ready()` -----------------------------------------------------------------------------
  // A default `vite build` puts the engine modules the app imports into the entry chunk, and every lazily loaded engine
  // chunk (renderer, environment, decoders) imports that entry chunk back. An entry module suspended on a top-level await
  // of anything that waits for the mount never finishes evaluating, so the lazy chunks never evaluate and the mount never
  // settles: a black page with no console output. `vite dev` serves separate modules and hides it. Flags any module-level
  // await whose operand (outside nested functions) calls ready()/readyStrict()/readiness()/precompile() or warmPrograms().
  const waitsOnMount = (expr: ts.Node): string | undefined => {
    let hit: string | undefined;
    const scan = (node: ts.Node): void => {
      if (hit || ts.isFunctionLike(node)) return;
      if (ts.isCallExpression(node)) {
        const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ts.isIdentifier(node.expression) ? node.expression.text : "";
        if (ts.isPropertyAccessExpression(node.expression) && TOP_LEVEL_MOUNT_WAITS.has(name)) hit = `${name}()`;
        else if (name === "warmPrograms") hit = "warmPrograms()";
      }
      ts.forEachChild(node, scan);
    };
    scan(expr);
    return hit;
  };
  for (const file of files) {
    const visit = (node: ts.Node, inFunction: boolean): void => {
      const fn = ts.isFunctionLike(node);
      if (!inFunction && ts.isAwaitExpression(node)) {
        const call = waitsOnMount(node.expression);
        if (call) {
          out.push(finding(file, node, "LINT_TOP_LEVEL_AWAIT_READY", `Module-level await on ${call} deadlocks a production build: the engine's lazy chunks import this entry chunk back, so the module never finishes evaluating and the page stays black (vite dev hides it). Use \`void app.ready().then(() => { ... })\` or await inside \`async function main() { ... } void main();\`.`));
        }
      }
      ts.forEachChild(node, (child) => visit(child, inFunction || fn));
    };
    visit(file.sf, false);
  }

  // --- scale off by orders of magnitude / camera inside an object --------------------------------------------------
  const EXCLUDED_NAME = /plane|ground|floor|terrain|sky|water|dome|ocean|backdrop|stage|grid/i;
  interface NodeBox { readonly file: ParsedFile; readonly node: ts.Node; readonly center: number[]; readonly half: number }
  const boxes: NodeBox[] = [];
  const seenRoots = new Set<ts.CallExpression>();
  for (const call of calls) {
    if (!/\.scale$/.test(call.callee)) continue;
    const chain = chainCalls(call.node);
    const root = chain[0]!;
    if (seenRoots.has(root)) continue;
    const rootName = calleeText(root);
    const rootArg = root.arguments[0];
    const rootObj = rootArg && isObject(unwrap(rootArg)) ? (unwrap(rootArg) as ts.ObjectLiteralExpression) : undefined;
    const nameText = rootObj ? resolveText(call.file, getProp(rootObj, "name")) ?? "" : "";
    if (!/(^|\.)(primitives\.\w+|model)$/.test(rootName)) continue;
    if (EXCLUDED_NAME.test(rootName) || EXCLUDED_NAME.test(nameText)) continue;
    seenRoots.add(root);
    const scaleCall = chain.find((c) => /\.scale$/.test(calleeText(c)))!;
    const sArgs = scaleCall.arguments.map((a) => numberOf(a) ?? numberTuple(a));
    const scalars = sArgs.flatMap((v) => (typeof v === "number" ? [v] : Array.isArray(v) ? v : []));
    if (!scalars.length) continue;
    const maxScale = Math.max(...scalars.map(Math.abs));
    const minScale = Math.min(...scalars.map(Math.abs));
    if (maxScale >= 50 || (minScale > 0 && minScale <= 0.02)) {
      out.push(finding(call.file, scaleCall, "LINT_SCALE_EXTREME", `.scale(${scaleCall.arguments.map((a) => a.getText()).join(", ")}) on ${rootName}(...) is ${maxScale >= 50 ? "very large" : "very small"}; 1 unit is 1 metre, so this is likely a unit mix-up.`));
    }
    const posCall = chain.find((c) => /\.position$/.test(calleeText(c)));
    const posNums = posCall ? posCall.arguments.map((a) => numberOf(a)) : [];
    const center = posCall ? (posNums.length === 3 && posNums.every((n) => n !== undefined) ? (posNums as number[]) : posCall.arguments.length === 1 ? numberTuple(posCall.arguments[0]) : undefined) : [0, 0, 0];
    const sizeText = rootObj ? numberOf(getProp(rootObj, "size")) : undefined;
    if (center) boxes.push({ file: call.file, node: scaleCall, center, half: ((sizeText ?? 1) * maxScale) / 2 });
  }
  for (const call of calls) {
    if (!/(^|\.)camera\.(orbit|perspective)$/.test(call.callee)) continue;
    const arg = call.node.arguments[0];
    const obj = arg && isObject(unwrap(arg)) ? (unwrap(arg) as ts.ObjectLiteralExpression) : undefined;
    if (!obj) continue;
    const target = numberTuple(getProp(obj, "target")) ?? [0, 0, 0];
    const position = numberTuple(getProp(obj, "position"));
    const distance = numberOf(getProp(obj, "distance"));
    for (const box of boxes) {
      let inside = false;
      if (position) inside = Math.hypot(position[0]! - box.center[0]!, position[1]! - box.center[1]!, position[2]! - box.center[2]!) < box.half;
      else if (distance !== undefined) inside = Math.hypot(target[0]! - box.center[0]!, target[1]! - box.center[1]!, target[2]! - box.center[2]!) < 1e-6 + box.half && distance < box.half;
      if (inside) { out.push(finding(call.file, call.node, "LINT_CAMERA_INSIDE_OBJECT", `The camera starts inside a node scaled to about ${(box.half * 2).toFixed(0)} units (${box.file.path}:${box.file.sf.getLineAndCharacterOfPosition(box.node.getStart(box.file.sf)).line + 1}); only back faces or nothing will draw.`)); break; }
    }
  }
  return out;
}

/** Run the lint rules over in-memory sources. Pure: no file system, no engine import. */
export function lintSources(sources: readonly LintSource[], options: LintOptions = {}): LintFinding[] {
  const files: ParsedFile[] = sources.map((s) => ({ path: s.path, sf: ts.createSourceFile(s.path, s.text, ts.ScriptTarget.Latest, true, SCRIPT_KIND(s.path)) }));
  const calls = collectCalls(files);
  const out: LintFinding[] = [];
  if (!options.group || options.group === "assets") out.push(...lintAssets(files, calls, options));
  if (!options.group || options.group === "scene") out.push(...lintScene(files, calls));
  return out.sort((a, b) => a.location.file.localeCompare(b.location.file) || a.location.line - b.location.line || a.code.localeCompare(b.code));
}

/** Project-level convenience: collect sources, resolve `fileExists` against `public/` and the project root. */
export function lintProject(projectDir: string, options: LintOptions = {}): LintFinding[] {
  const root = resolve(projectDir);
  const fileExists = options.fileExists ?? ((url: string) => {
    const clean = url.replace(/^\//, "").replace(/\?.*$/, "");
    return existsSync(join(root, "public", clean)) || existsSync(join(root, clean)) || existsSync(join(root, "src", clean));
  });
  return lintSources(collectLintSources(root), { ...options, fileExists });
}
