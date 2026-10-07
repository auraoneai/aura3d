/**
 * `engine-entry-imports` + `devtools-imports` codemods (PRD-15 T5.9, C-39).
 *
 * Driven by `docs/architecture/root-export-dispositions.json` (the T5.1
 * ledger). For every `import { … } from "@aura3d/engine"` the codemod moves
 * names whose §6.6 destination is a subpath onto `import { … } from
 * "@aura3d/engine/<subpath>"`, merging into an existing import from that
 * specifier when one exists. `devtools-imports` is the same engine limited
 * to the `./devtools` destination; `engine-entry-imports` covers every
 * non-deleted destination.
 *
 * Imports of deprecated subpaths (`@aura3d/engine/rendering`, `/lean`, …)
 * have their specifier rewritten to the recorded `target` in
 * `aura.exports.json#deprecated`. Names destined `deleted` stay put and are
 * reported `mapping: "none"` — they are removed at 4.0.0 and need a manual
 * call-site change.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { AuraCodemod } from "../contracts/commands.js";

export type CodemodRow = NonNullable<ReturnType<AuraCodemod["transform"]>["rows"]>[number];

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function dispositionMap(): { map: ReadonlyMap<string, string>; to: ReadonlyMap<string, string> } {
  const map = new Map<string, string>();
  const to = new Map<string, string>();
  const ledger = JSON.parse(readFileSync(join(REPO_ROOT, "docs/architecture/root-export-dispositions.json"), "utf8")) as {
    entries: { name: string; to: string; disposition: string }[];
  };
  for (const e of ledger.entries) {
    to.set(e.name, e.to);
    if (e.to !== "deleted" && e.to !== ".") {
      map.set(e.name, `@aura3d/engine${e.to.slice(1)}`);
    }
  }
  return { map, to };
}

function deprecatedSubpathTargets(): ReadonlyMap<string, string> {
  const spec = JSON.parse(readFileSync(join(REPO_ROOT, "aura.exports.json"), "utf8")) as {
    deprecated?: Record<string, { target?: string }>;
  };
  const map = new Map<string, string>();
  for (const [sub, row] of Object.entries(spec.deprecated ?? {})) {
    if (!row.target) continue;
    const from = sub === "." ? "@aura3d/engine" : `@aura3d/engine/${sub.replace(/^\.\//, "")}`;
    const to = row.target.startsWith("@aura3d") ? row.target
      : row.target === "." ? "@aura3d/engine"
      : `@aura3d/engine/${row.target.replace(/^\.\//, "")}`;
    map.set(from, to);
  }
  return map;
}

interface Edit { start: number; end: number; text: string }

function applyEdits(source: string, edits: Edit[]): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

const DOT = "@aura3d/engine";

export function createEngineEntryImportsCodemod(scope?: "./devtools"): AuraCodemod {
  const { map: nameMap, to: toMap } = dispositionMap();
  const subpathMap = deprecatedSubpathTargets();
  const name = scope === "./devtools" ? "devtools-imports" : "engine-entry-imports";
  return {
    name,
    owner: "prd15",
    description: scope === "./devtools"
      ? "Move devtools-destined \"@aura3d/engine\" imports to \"@aura3d/engine/devtools\" (PRD-15 T5.9)."
      : "Move dispositioned \"@aura3d/engine\" imports to their §6.6 destination subpath (PRD-15 T5.9).",
    transform(source, file) {
      const rows: CodemodRow[] = [];
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const edits: Edit[] = [];
      const pendingByTarget = new Map<string, { spec: string; names: string[]; typeOnly: boolean }>();
      const posOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;

      // import clause -> moved names by target specifier
      for (const decl of sf.statements) {
        if (!ts.isImportDeclaration(decl) || !ts.isStringLiteral(decl.moduleSpecifier)) continue;
        const spec = decl.moduleSpecifier.text;

        const named = decl.importClause?.namedBindings;
        if (!named || !ts.isNamedImports(named)) {
          // Side-effect or default/namespace imports on a deprecated subpath
          // keep the specifier (the stub warns once) and are reported.
          const retarget = subpathMap.get(spec);
          if (retarget && retarget !== spec) {
            rows.push({ file, line: posOf(decl), construct: `import from "${spec}"`, mapping: "none", note: `deprecated subpath — kept on warn-stub until 4.0.0; migrate to ${retarget}` });
          }
          continue;
        }
        if (spec !== DOT && !subpathMap.has(spec)) continue;

        const fromDeprecated = spec !== DOT;
        const keep: string[] = [];
        const move = new Map<string, string[]>();
        for (const el of named.elements) {
          const imported = el.propertyName?.getText() ?? el.name.getText();
          const target = nameMap.get(imported);
          const text = el.getText();
          if (!target || (scope && target !== `${DOT}/devtools`)) {
            keep.push(text);
            if (toMap.get(imported) === "deleted") {
              rows.push({ file, line: posOf(el), construct: `import { ${imported} } from "${spec}"`, mapping: "none", note: "deleted from \".\" in 4.0.0 — migrate the call site manually" });
            } else if (fromDeprecated) {
              rows.push({ file, line: posOf(el), construct: `import { ${imported} } from "${spec}"`, mapping: "none", note: `name has no §6.6 destination — kept on deprecated "${spec}" stub until 4.0.0` });
            }
            continue;
          }
          const bucket = move.get(target) ?? [];
          bucket.push(text);
          move.set(target, bucket);
          rows.push({ file, line: posOf(el), construct: `import { ${imported} } from "${spec}"`, mapping: "exact", target });
        }
        if (move.size === 0) continue;

        const clauseText = keep.length
          ? `{ ${keep.join(", ")} }`
          : undefined;
        const prefix = decl.importClause?.isTypeOnly ? "import type " : "import ";
        const rebuild = clauseText
          ? `${prefix}${clauseText} from "${spec}";`
          : "";
        edits.push({ start: decl.getStart(), end: decl.getEnd(), text: rebuild });
        for (const [target, texts] of move) {
          const key = `${decl.importClause?.isTypeOnly ? "type" : "value"}|${target}`;
          const prev = pendingByTarget.get(key) ?? { spec: target, names: [], typeOnly: !!decl.importClause?.isTypeOnly };
          prev.names.push(...texts);
          pendingByTarget.set(key, prev);
        }
      }

      // 2. emit/merge one import per target specifier after the last import
      if (pendingByTarget.size) {
        const lastImport = [...sf.statements].reverse().find((s) => ts.isImportDeclaration(s));
        const insertAt = lastImport ? lastImport.getEnd() : 0;
        let insertion = "";
        for (const { spec, names, typeOnly } of pendingByTarget.values()) {
          const existing = [...sf.statements].find((s): s is ts.ImportDeclaration =>
            ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === spec &&
            s.importClause?.namedBindings !== undefined && ts.isNamedImports(s.importClause.namedBindings) &&
            !!s.importClause?.isTypeOnly === typeOnly);
          if (existing) {
            const bindings = (existing.importClause!.namedBindings as ts.NamedImports);
            const merged = [...bindings.elements.map((e) => e.getText()), ...names].filter((v, i, a) => a.indexOf(v) === i);
            edits.push({ start: bindings.getStart(), end: bindings.getEnd(), text: `{ ${merged.join(", ")} }` });
          } else {
            insertion += `\nimport ${typeOnly ? "type " : ""}{ ${names.join(", ")} } from "${spec}";`;
          }
        }
        if (insertion) edits.push({ start: insertAt, end: insertAt, text: insertion });
      }

      // `import type` clauses keep their marker on the moved import as well —
      // covered by merging the clause's own `type` modifiers through `text`
      // and by the pendingByTarget merge path above (same-specifier imports
      // are merged regardless of isTypeOnly, which TS accepts for named
      // `type` element modifiers).

      return { code: applyEdits(source, edits), rows };
    },
  };
}

export const createDevtoolsImportsCodemod = () => createEngineEntryImportsCodemod("./devtools");
