/**
 * PRD-15 T6.1 — emitter for `aura3d migrate three`.
 *
 * Rewrites `from "three"` imports to the engine imports the emitted calls
 * need, replaces each mapped `new THREE.X(...)` with its factory call, and
 * inserts `// TODO(a3d-migrate)` comments above every unmapped construct so
 * the output fails noisily instead of silently producing wrong code.
 */

import { threeMappingFor, type ThreeMapping } from "./mappings.js";
import { parseThreeSource, type ThreeConstruct } from "./parse.js";

export interface MigrateRow {
  readonly construct: string;
  readonly line: number;
  readonly mapping: "exact" | "approximate" | "none";
  readonly note: string;
}

export interface MigrateResult {
  readonly code: string;
  readonly rows: readonly MigrateRow[];
  readonly rewrittenConstructs: number;
}

const UNSAFE_BARE_NAME = /^(?:Error|Map|Set|Promise|RegExp|Date|Number|String|Boolean|Array|Object)$/;

export function emitMigratedSource(source: string): MigrateResult {
  const constructs = parseThreeSource(source);
  const rows: MigrateRow[] = [];
  const neededImports = new Set<string>();
  const comments = new Map<number, string[]>();
  const rewrites: { readonly match: string; readonly replacement: string }[] = [];
  let rewritten = 0;

  for (const c of constructs) {
    if (c.construct === "import") continue; // handled at the end
    if (c.specifier === "bare" && UNSAFE_BARE_NAME.test(c.construct)) continue;
    const mapping = threeMappingFor(c.construct);
    if (c.specifier === "bare" && !mapping) continue; // not a THREE name — don't report local ctors

    const row = rowFor(c, mapping);
    rows.push(row);

    if (mapping && mapping.mapping !== "none") {
      rewritten++;
      if (mapping.engineImport) neededImports.add(mapping.engineImport);
      if (c.construct.endsWith(".load")) {
        // loader `.load(` calls get a comment, not a rewrite (the model() call needs a typed asset key)
        pushComment(comments, c.line, `// TODO(a3d-migrate): ${c.construct} → ${mapping.target} — ${mapping.note}`);
      } else {
        const replacement = emitCall(mapping, c);
        const needle = `new THREE.${c.construct}(${c.args})`;
        const needleBare = `new ${c.construct}(${c.args})`;
        if (source.includes(needle)) {
          rewrites.push({ match: needle, replacement });
        } else if (source.includes(needleBare)) {
          rewrites.push({ match: needleBare, replacement });
        }
      }
    } else {
      pushComment(comments, c.line, `// TODO(a3d-migrate): no mapping for ${c.construct} — ${row.note}`);
    }
  }

  let code = source;
  for (const { match, replacement } of rewrites) {
    code = code.replaceAll(match, replacement);
  }

  // rewrite three imports
  const importNames = [...neededImports].sort();
  if (importNames.length > 0) {
    let importWritten = false;
    for (const c of constructs.filter((x) => x.construct === "import")) {
      const spec = c.specifier ?? "";
      if (spec === "three" || spec === "three/src/three.module.js") {
        if (!importWritten) {
          code = code.replace(/from\s+["']three["']/, `from "@aura3d/engine"`);
          code = code.replace(/import\s+(?:\*\s+as\s+THREE|\{[^}]*\})\s+from\s+["']@aura3d\/engine["']/, `import { ${importNames.join(", ")} } from "@aura3d/engine"`);
          importWritten = true;
        }
      } else {
        // three/addons/* specifier → TODO comment; the construct rows cover the rewrite
        pushComment(comments, c.line, `// TODO(a3d-migrate): import specifier "${spec}" has no public Aura3D equivalent — resolve manually`);
        rows.push({ construct: `import "${spec}"`, line: c.line, mapping: "none", note: "three/addons specifier is not rewritten; resolve the named export against @aura3d/engine manually." });
      }
    }
  }

  // splice comments (bottom-up so line numbers stay valid)
  const codeLines = code.split("\n");
  for (const [line, texts] of [...comments.entries()].sort((a, b) => b[0] - a[0])) {
    const at = Math.min(line, codeLines.length);
    codeLines.splice(Math.max(0, at - 1), 0, ...texts);
  }
  code = codeLines.join("\n");

  rows.sort((a, b) => a.line - b.line);
  return { code, rows, rewrittenConstructs: rewritten };
}

function rowFor(c: ThreeConstruct, mapping: ThreeMapping | undefined): MigrateRow {
  if (!mapping) {
    return { construct: c.construct, line: c.line, mapping: "none", note: "no Aura3D equivalent in the T6.1 table; resolve manually." };
  }
  return { construct: c.construct, line: c.line, mapping: mapping.mapping, note: `${mapping.target} — ${mapping.note}` };
}

function emitCall(mapping: ThreeMapping, c: ThreeConstruct): string {
  const args = c.args;
  const todo = ` /* TODO(a3d-migrate): ${c.construct} — ${args ? `map args (${args}); ` : ""}${mapping.note} */`;
  switch (mapping.construct) {
    case "Euler": {
      // Euler emits a tuple literal, valid as an expression.
      const xyz = /,\s*['"]?XYZ['"]?\s*$/.test(args)
        ? args.replace(/,\s*['"]?XYZ['"]?\s*$/, "").trim()
        : args;
      return `[${xyz}]${args && xyz !== args ? "" : todo}`;
    }
    case "Vector3":
      return `[${args}]${todo}`;
    case "Color":
      return `(${args}) /* a3d: ${mapping.target} */`;
    default:
      return `${mapping.target}()${todo}`;
  }
}

function pushComment(map: Map<number, string[]>, line: number, text: string): void {
  const list = map.get(line) ?? [];
  list.push(text);
  map.set(line, list);
}
