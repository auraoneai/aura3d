/**
 * animation-3.1 — C-39 codemod (PRD-06 §T1.13, owner prd06).
 *
 * Scans for the 3.0 → 3.1 animation API drift:
 *   1. `x.animate({ clip: "name", ... })`, `node.play("name" | { clip: "name" })`
 *      and `resolveGLTFClipName(_, "name")` call sites whose clip name does not
 *      resolve EXACTLY against the app's clip-name universe — the union of every
 *      `animations: [...]` array in the nearest ancestor `aura-assets.ts`
 *      (or `aura.assets.json`) to the scanned file.
 *   2. every `speed: <number>` property — behaviour change: `speed` is applied
 *      in 3.1 (previously ignored), so every site must be re-timed.
 *   3. `bindRuntimeNode({ applyPose: ... })` — the pose seam moved to the pose
 *      mixer in 3.1; the binding has to be re-audited.
 *
 * Pure: transform(source, fileName) -> { code, rows }.
 * Rows: { file, line, construct, mapping: "exact"|"approximate"|"none", target?, note? }
 *
 * --write effect (encoded in `code`; the C-39 runner decides whether to apply):
 *   clip-name misses are rewritten to the nearest real clip name, or get
 *   `fallback: "first"` when no universe is available, and the statement gains a
 *   `// TODO(animation-3.1)` marker.
 */
import tsModule from "typescript";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const { default: tsDefault, ...tsNamed } = tsModule;
const ts = tsDefault ?? tsNamed;

const MARKER = "// TODO(animation-3.1):";

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** property `name` of an object literal, or undefined */
function propOf(objLiteral, name) {
  for (const prop of objLiteral.properties) {
    if (ts.isPropertyAssignment(prop)) {
      const n = prop.name;
      if ((ts.isIdentifier(n) && n.text === name) || (ts.isStringLiteral(n) && n.text === name)) return prop;
    }
  }
  return undefined;
}

/** First string-literal clip name used by a call — .animate({clip:"x"}), .play("x"), .play({clip:"x"}), resolveGLTFClipName(_,"x"). */
function clipNameOf(node) {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;
  let kind;
  if (ts.isPropertyAccessExpression(callee)) {
    if (callee.name.text === "animate") kind = "animate";
    else if (callee.name.text === "play") kind = "play";
  } else if (ts.isIdentifier(callee) && callee.text === "resolveGLTFClipName") {
    kind = "resolveGLTFClipName";
  }
  if (!kind) return undefined;

  for (const arg of node.arguments) {
    if (ts.isStringLiteral(arg)) return { kind, literal: arg, name: arg.text, optionsObject: undefined };
    if (ts.isObjectLiteralExpression(arg)) {
      const clipProp = propOf(arg, "clip");
      if (clipProp && ts.isStringLiteral(clipProp.initializer)) {
        return { kind, literal: clipProp.initializer, name: clipProp.initializer.text, optionsObject: arg };
      }
    }
  }
  return undefined;
}

/** `bindRuntimeNode({ applyPose: ... })` call sites. */
function isBindRuntimeNodeApplyPose(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : undefined;
  if (name !== "bindRuntimeNode") return false;
  const arg = node.arguments[0];
  return ts.isObjectLiteralExpression(arg) && propOf(arg, "applyPose") !== undefined;
}

/** `speed: <numeric>` property assignment anywhere — 3.1 applies it. */
function isSpeedProp(node) {
  return (
    ts.isPropertyAssignment(node) &&
    ((ts.isIdentifier(node.name) && node.name.text === "speed") ||
      (ts.isStringLiteral(node.name) && node.name.text === "speed")) &&
    ts.isNumericLiteral(node.initializer)
  );
}

/* ---------- clip-name universe ---------- */

const universeCache = new Map();

/** Collect `animations: [...]` string literals from a manifest text (works for aura-assets.ts and aura.assets.json). */
function clipNamesFromManifest(text) {
  const names = new Set();
  const re = /animations\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    for (const sm of m[1].matchAll(/"([^"]+)"|'([^']+)'/g)) {
      names.add(sm[1] ?? sm[2]);
    }
  }
  return names;
}

/** Walk up from `fileName` to the nearest aura-assets.ts / aura.assets.json; union every `animations:` list in it. */
function clipUniverseFor(fileName) {
  if (universeCache.has(fileName)) return universeCache.get(fileName);
  let dir = dirname(fileName);
  const seen = new Set();
  const names = new Set();
  let manifestPath;
  for (let depth = 0; depth < 12 && !seen.has(dir); depth += 1) {
    seen.add(dir);
    const tsPath = join(dir, "aura-assets.ts");
    const srcPath = join(dir, "src", "aura-assets.ts");
    const jsonPath = join(dir, "aura.assets.json");
    const hit = [srcPath, tsPath, jsonPath].find((p) => existsSync(p));
    if (hit) {
      manifestPath = hit;
      for (const name of clipNamesFromManifest(readFileSync(hit, "utf8"))) names.add(name);
      break;
    }
    dir = dirname(dir);
  }
  const universe = { names: [...names], manifestPath };
  universeCache.set(fileName, universe);
  return universe;
}

/* ---------- nearest-name ---------- */

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

function nearestClip(name, universe) {
  let best;
  for (const candidate of universe) {
    const d = levenshtein(name.toLowerCase(), candidate.toLowerCase());
    if (best === undefined || d < best.d) best = { name: candidate, d };
  }
  return best?.name;
}

/** position of the start of `node`'s statement (for the marker comment) */
function statementPos(node) {
  let cur = node;
  while (cur.parent && !ts.isStatement(cur) && !ts.isVariableDeclaration(cur)) cur = cur.parent;
  return cur.getStart();
}

export function transform(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const rows = [];
  const edits = []; // {pos, insert} | {start, end, insert}
  const markedStatements = new Set();

  const markStatement = (node, note) => {
    const pos = statementPos(node);
    if (markedStatements.has(pos)) return;
    markedStatements.add(pos);
    const column = sourceFile.getLineAndCharacterOfPosition(pos).character;
    edits.push({ pos, insert: `${MARKER} ${note}\n${" ".repeat(column)}` });
  };

  const visit = (node) => {
    // 1) clip-name call sites
    const clip = clipNameOf(node);
    if (clip) {
      const universe = clipUniverseFor(fileName);
      const exact = universe.names.includes(clip.name);
      if (!exact) {
        const nearest = nearestClip(clip.name, universe.names);
        const line = lineOf(sourceFile, node);
        rows.push({
          file: fileName,
          line,
          construct: `${clip.kind} clip "${clip.name}"`,
          mapping: "none",
          target: nearest,
          note: nearest
            ? `clip name does not resolve exactly against ${universe.manifestPath}; nearest: "${nearest}"`
            : `clip name does not resolve exactly${universe.manifestPath ? ` against ${universe.manifestPath}` : " (no aura-assets.ts clip universe found)"}`
        });
        // --write payload
        if (nearest) {
          edits.push({ start: clip.literal.getStart() + 1, end: clip.literal.getEnd() - 1, insert: nearest });
          markStatement(node, `clip "${clip.name}" rewritten to "${nearest}" (exact resolve in 3.1)`);
        } else if (clip.optionsObject) {
          const last = clip.optionsObject.properties[clip.optionsObject.properties.length - 1];
          const pos = last ? last.getEnd() : clip.optionsObject.getStart() + 1;
          edits.push({ pos, insert: `${last ? ", " : ""}fallback: "first"` });
          markStatement(node, `clip "${clip.name}" unresolved — added fallback: "first"`);
        } else {
          // node.play("x") → node.play({ clip: "x", fallback: "first" })
          edits.push({ start: clip.literal.getStart(), end: clip.literal.getEnd(), insert: `{ clip: ${clip.literal.getText(sourceFile)}, fallback: "first" }` });
          markStatement(node, `clip "${clip.name}" unresolved — added fallback: "first"`);
        }
      }
    }

    // 2) bindRuntimeNode({ applyPose })
    if (isBindRuntimeNodeApplyPose(node)) {
      rows.push({
        file: fileName,
        line: lineOf(sourceFile, node),
        construct: "bindRuntimeNode({ applyPose })",
        mapping: "none",
        note: "applyPose seam moved to the pose mixer in 3.1 — re-audit this binding"
      });
    }

    // 3) every `speed: <number>` — applied (not ignored) since 3.1
    if (isSpeedProp(node)) {
      rows.push({
        file: fileName,
        line: lineOf(sourceFile, node),
        construct: `speed: ${node.initializer.text}`,
        mapping: "approximate",
        note: "speed is applied in 3.1 (was ignored) — verify timing"
      });
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  edits.sort((a, b) => (b.start ?? b.pos) - (a.start ?? a.pos));
  let code = source;
  for (const edit of edits) {
    if (edit.start !== undefined) {
      code = code.slice(0, edit.start) + edit.insert + code.slice(edit.end);
    } else {
      code = code.slice(0, edit.pos) + edit.insert + code.slice(edit.pos);
    }
  }
  return { code, rows };
}

export default { transform };
