/**
 * `renderer-imports` codemod (PRD-15 T2.11, C-39).
 *
 * Rewrites the four deprecated renderer subpaths
 *   @aura3d/engine/advanced-runtime | @aura3d/engine/production-runtime |
 *   @aura3d/rendering/advanced-runtime | @aura3d/rendering/production-runtime
 * to `@aura3d/engine/renderer`, renames `A3DRenderer`/`A3DRendererOptions`
 * identifiers to `Renderer`/`RendererOptions`, and rewrites member calls the
 * deleted wrapper classes carried to the free functions on the new surface
 * (`a3dRenderFrame`, `a3dRenderFrameAsync`, `rendererProofCapture`,
 * `rendererFeatureReport`, `rendererShadowReport`).
 *
 * Every edit is a surgical splice on the source text — import declarations
 * are rebuilt, everything else keeps its formatting. Constructs the codemod
 * cannot map (names that are not exported on `./renderer`, receiver-dependent
 * members like `.evidence()`/`.backend`, `preserveDrawingBuffer`) are kept
 * and reported with `mapping: "none"`.
 */

import ts from "typescript";

export interface CodemodRow {
  readonly file: string;
  readonly line: number;
  readonly construct: string;
  readonly mapping: "exact" | "approximate" | "none";
  readonly target?: string;
  readonly note?: string;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const TARGET = "@aura3d/engine/renderer";

const SUBPATHS = new Map([
  ["@aura3d/engine/advanced-runtime", TARGET],
  ["@aura3d/engine/production-runtime", TARGET],
  ["@aura3d/rendering/advanced-runtime", TARGET],
  ["@aura3d/rendering/production-runtime", TARGET]
]);

/** Names exported by `packages/engine/src/renderer/index.ts`. */
const RENDERER_EXPORTS = new Set([
  "Renderer", "RendererOptions", "RendererCreateOptions",
  "A3DRenderer", "A3DRendererOptions",
  "AdvancedRenderer", "AdvancedRendererOptions", "AdvancedRendererSource",
  "ProductionWebGL2Renderer", "ProductionRuntimeRenderer",
  "rendererProofCapture", "rendererFeatureReport", "rendererInteractiveFeatureReport",
  "rendererShadowReport", "validateProductionRendererInput",
  "resolveProductionRuntimeRendererBackend",
  "a3dRenderFrame", "a3dRenderFrameAsync", "a3dRenderResult",
  "A3DScene", "A3DSceneMeshOptions", "A3DSceneRenderSourceOptions",
  "createECSRenderSource",
  "Scene", "SceneNode", "Object3D", "Group", "Mesh", "SkinnedMesh", "InstancedMesh",
  "PerspectiveCamera", "OrthographicCamera", "DirectionalLight", "PointLight", "SpotLight",
  "Renderable", "MeshOptions", "Object3DOptions", "RenderableDescriptor",
  "Geometry", "Material", "PBRMaterial", "UnlitMaterial", "TexturedPBRMaterial",
  "TexturedUnlitMaterial", "SkinnedLitMaterial", "InstancedPBRMaterial", "TextureBinding",
  "RenderMaterial",
  "CameraLike", "RenderDeviceDiagnostics", "RenderItem", "RendererInput", "RenderSource",
  "ResizeToDisplayOptions", "ResizeToDisplayResult", "RendererAnimationLoop",
  "RendererFrameCaptureWithMetadata", "RendererFrameResult", "RendererLifecycle",
  "ProductionRendererBackend", "ProductionRendererFeature", "ProductionRendererFeatureState",
  "ProductionRendererInput", "ProductionRenderProof",
  "ProductionRuntimeRendererBackendPreference", "ProductionRuntimeRendererBackendSelection",
  "ProductionRuntimeRendererOptions", "ProductionWebGL2RendererOptions",
  "RendererTimingDiagnostics", "ScenePickHit", "ScenePickOptions"
]);

const RENAMES = new Map([
  ["A3DRenderer", "Renderer"],
  ["A3DRendererOptions", "RendererOptions"]
]);

/**
 * Member calls the deleted classes carried → free function taking the
 * receiver first. Guarded by minimum argument count so unrelated receivers
 * (e.g. `CurrentRoutesFlagshipViewer.renderFrame()`) are left alone.
 */
const MEMBER_MAP: ReadonlyArray<{
  readonly member: string;
  readonly target: string;
  readonly minArgs: number;
  readonly note?: string;
}> = [
  { member: "renderFrameAsync", target: "a3dRenderFrameAsync", minArgs: 1 },
  { member: "renderInteractiveFrame", target: "a3dRenderFrame", minArgs: 1 },
  { member: "renderFrame", target: "a3dRenderFrame", minArgs: 1 },
  { member: "captureProof", target: "rendererProofCapture", minArgs: 1 },
  { member: "renderImportedAsset", target: "rendererProofCapture", minArgs: 1 },
  { member: "renderImportedAssetAsync", target: "rendererProofCapture", minArgs: 1,
    note: "rendererProofCapture is synchronous; awaits transparently through the same proof shape" },
  { member: "getShadowEvidence", target: "rendererShadowReport", minArgs: 0 },
  { member: "getFeatures", target: "rendererFeatureReport", minArgs: 0 }
];

const REPORT_ONLY = new Map([
  ["evidence", "a3dRendererEvidence(renderer, options) in @aura3d/engine/devtools — receiver-dependent, not auto-rewritten"]
]);

function lineOf(sf: ts.SourceFile, pos: number): number {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

function moduleSpecifierText(node: ts.ImportDeclaration | ts.ExportDeclaration): string | null {
  const spec = node.moduleSpecifier;
  if (!spec || !ts.isStringLiteral(spec)) return null;
  return spec.text;
}

export function createRendererImportsCodemod(): {
  readonly name: "renderer-imports";
  readonly owner: "prd15";
  readonly description: string;
  transform(source: string, fileName: string): { readonly code: string; readonly rows: readonly CodemodRow[] };
} {
  return {
    name: "renderer-imports",
    owner: "prd15",
    description:
      "PRD-15 renderer surface consolidation: engine/rendering runtime subpaths → @aura3d/engine/renderer; A3DRenderer → Renderer; deleted wrapper methods → free functions.",
    transform(source: string, fileName: string) {
      // Inline `<script type="module">` blocks in .html files (PRD-15 §6.5:
      // the codemod rewrites apps/public-scene/index.html too).
      if (fileName.endsWith(".html")) {
        const rows: CodemodRow[] = [];
        const code = source.replace(/<script type="module">([\s\S]*?)<\/script>/g, (_m, inner: string, offset: number) => {
          const sub = codemodInner(inner, `${fileName}#script@${offset}`);
          rows.push(...sub.rows);
          return `<script type="module">${sub.code}</script>`;
        });
        return { code, rows };
      }
      return codemodInner(source, fileName);

      function codemodInner(source: string, fileName: string) {
      const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const edits: Edit[] = [];
      const rows: CodemodRow[] = [];
      const neededImports = new Set<string>();
      const replacedRanges: Array<{ start: number; end: number }> = [];

      const insideReplaced = (pos: number, end: number): boolean =>
        replacedRanges.some((r) => pos >= r.start && end <= r.end);

      // --- pass 1: import/export declarations ---
      const specifiers = (node: ts.ImportDeclaration): ts.ImportSpecifier[] => {
        const named = node.importClause?.namedBindings;
        return named && ts.isNamedImports(named) ? [...named.elements] : [];
      };

      for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt) && !ts.isExportDeclaration(stmt)) continue;
        const spec = moduleSpecifierText(stmt);
        if (!spec || (!SUBPATHS.has(spec) && spec !== TARGET)) continue;
        const target = SUBPATHS.get(spec) ?? TARGET;
        // spec === TARGET: already on the new entry — only the named-bindings
        // path matters (deprecated aliases like A3DRenderer rename to Renderer).
        const onTarget = spec === TARGET;

        if (ts.isExportDeclaration(stmt)) {
          if (onTarget) continue;
          // `export { ... } from "<subpath>"` — same split logic, no import clause flags.
          const clause = stmt.exportClause;
          if (!clause || !ts.isNamedExports(clause)) {
            edits.push({ start: stmt.moduleSpecifier!.getStart(sf), end: stmt.moduleSpecifier!.getEnd(), text: `"${target}"` });
            rows.push({ file: fileName, line: lineOf(sf, stmt.getStart(sf)), construct: `export * from "${spec}"`, mapping: "exact", target });
            replacedRanges.push({ start: stmt.getStart(sf), end: stmt.getEnd() });
            continue;
          }
          const moved: string[] = [];
          const kept: string[] = [];
          for (const el of clause.elements) {
            const origName = (el.propertyName ?? el.name).text;
            const renamed = RENAMES.get(origName) ?? origName;
            const alias = el.name.text;
            const text = renamed === alias ? renamed : `${renamed} as ${alias}`;
            if (RENDERER_EXPORTS.has(renamed)) {
              moved.push(el.isTypeOnly ? `type ${text}` : text);
              rows.push({ file: fileName, line: lineOf(sf, el.getStart(sf)), construct: origName, mapping: "exact", target });
            } else {
              kept.push(el.isTypeOnly ? `type ${origName === alias ? origName : `${origName} as ${alias}`}` : origName === alias ? origName : `${origName} as ${alias}`);
              rows.push({ file: fileName, line: lineOf(sf, el.getStart(sf)), construct: origName, mapping: "none", note: `not exported by ${target}; stays on deprecated subpath ${spec}` });
            }
          }
          if (!moved.length) continue;
          const lines: string[] = [];
          if (moved.length) lines.push(`export { ${moved.join(", ")} } from "${target}";`);
          if (kept.length) lines.push(`export { ${kept.join(", ")} } from "${spec}";`);
          edits.push({ start: stmt.getStart(sf), end: stmt.getEnd(), text: lines.join("\n") });
          replacedRanges.push({ start: stmt.getStart(sf), end: stmt.getEnd() });
          continue;
        }

        const clause = stmt.importClause;
        if (onTarget && (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings))) continue;
        if (!clause) {
          // side-effect import — just repoint
          edits.push({ start: stmt.moduleSpecifier!.getStart(sf), end: stmt.moduleSpecifier!.getEnd(), text: `"${target}"` });
          rows.push({ file: fileName, line: lineOf(sf, stmt.getStart(sf)), construct: `import "${spec}"`, mapping: "exact", target });
          replacedRanges.push({ start: stmt.getStart(sf), end: stmt.getEnd() });
          continue;
        }
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          edits.push({ start: stmt.moduleSpecifier!.getStart(sf), end: stmt.moduleSpecifier!.getEnd(), text: `"${target}"` });
          rows.push({ file: fileName, line: lineOf(sf, stmt.getStart(sf)), construct: `import * as ${clause.namedBindings.name.text} from "${spec}"`, mapping: "approximate", target, note: "namespace member availability on the new subpath must be verified" });
          replacedRanges.push({ start: stmt.getStart(sf), end: stmt.getEnd() });
          continue;
        }

        const named = specifiers(stmt);
        if (!named.length && !clause.name) {
          // `import {}` — degenerate; repoint harmlessly.
          edits.push({ start: stmt.moduleSpecifier!.getStart(sf), end: stmt.moduleSpecifier!.getEnd(), text: `"${target}"` });
          replacedRanges.push({ start: stmt.getStart(sf), end: stmt.getEnd() });
          continue;
        }

        const moved: string[] = [];
        const kept: string[] = [];
        for (const el of named) {
          const origName = (el.propertyName ?? el.name).text;
          const renamed = RENAMES.get(origName) ?? origName;
          const alias = el.name.text;
          // Plain `import { A3DRenderer }` becomes `import { Renderer }` and
          // local usages are renamed in pass 3; an explicit `as` alias is kept.
          const text = alias === origName ? renamed : renamed === alias ? renamed : `${renamed} as ${alias}`;
          if (RENDERER_EXPORTS.has(renamed)) {
            moved.push(el.isTypeOnly ? `type ${text}` : text);
            rows.push({ file: fileName, line: lineOf(sf, el.getStart(sf)), construct: `import ${origName}`, mapping: "exact", target });
          } else {
            kept.push(el.isTypeOnly ? `type ${origName === alias ? origName : `${origName} as ${alias}`}` : origName === alias ? origName : `${origName} as ${alias}`);
            rows.push({ file: fileName, line: lineOf(sf, el.getStart(sf)), construct: `import ${origName}`, mapping: "none", note: `not exported by ${target}; stays on deprecated subpath ${spec}` });
          }
        }

        if (!moved.length) continue; // nothing maps — leave the import text untouched
        const lines: string[] = [];
        const typeFlag = clause.isTypeOnly ? "type " : "";
        const defaultPart = clause.name ? `${clause.name.text}, ` : "";
        if (onTarget) {
          // Names already resolve on the target: emit a single import with
          // renames applied; names absent from RENDERER_EXPORTS keep their
          // exported spelling and are reported "none" above.
          lines.push(`import ${typeFlag}{ ${defaultPart}${[...moved, ...kept].join(", ")} } from "${target}";`);
        } else {
          lines.push(`import ${typeFlag}{ ${defaultPart}${moved.join(", ")} } from "${target}";`);
          if (kept.length) lines.push(`import ${typeFlag}{ ${kept.join(", ")} } from "${spec}";`);
        }
        edits.push({ start: stmt.getStart(sf), end: stmt.getEnd(), text: lines.join("\n") });
        replacedRanges.push({ start: stmt.getStart(sf), end: stmt.getEnd() });
      }

      // --- pass 2: member-call rewrites + report-only constructs ---
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const pae = node.expression;
          const member = pae.name.text;
          const rule = MEMBER_MAP.find((m) => m.member === member);
          if (rule && node.arguments.length >= rule.minArgs) {
            const recv = source.slice(pae.expression.getStart(sf), pae.expression.getEnd());
            const args = node.arguments.length
              ? source.slice(node.arguments[0].getStart(sf), node.arguments[node.arguments.length - 1].getEnd())
              : "";
            edits.push({
              start: node.getStart(sf),
              end: node.getEnd(),
              text: `${rule.target}(${recv}${args ? `, ${args}` : ""})`
            });
            replacedRanges.push({ start: node.getStart(sf), end: node.getEnd() });
            neededImports.add(rule.target);
            rows.push({
              file: fileName,
              line: lineOf(sf, node.getStart(sf)),
              construct: `${recv}.${member}(${args ? "…" : ""})`,
              mapping: "approximate",
              target: `${rule.target}(${recv}, …)`,
              note: rule.note ?? "receiver assumed to be a Renderer — verify"
            });
          } else if (REPORT_ONLY.has(member)) {
            rows.push({
              file: fileName,
              line: lineOf(sf, node.getStart(sf)),
              construct: `${pae.expression.getText(sf)}.${member}(…)`,
              mapping: "none",
              note: REPORT_ONLY.get(member)
            });
          }
        }
        // `Parameters<A3DRenderer["renderFrame"]>[0]` style indexed-access on
        // deleted member types → the free function's parameter list (receiver
        // is param 0, so the requested index shifts by one).
        if (ts.isIndexedAccessTypeNode(node)
          && ts.isTypeReferenceNode(node.objectType)
          && ts.isIdentifier(node.objectType.typeName)
          && ["A3DRenderer", "Renderer", "AdvancedRenderer", "ProductionWebGL2Renderer", "ProductionRuntimeRenderer"].includes(node.objectType.typeName.text)
          && ts.isLiteralTypeNode(node.indexType)
          && ts.isStringLiteral(node.indexType.literal)) {
          const className = node.objectType.typeName.text;
          const member = node.indexType.literal.text;
          const rule = MEMBER_MAP.find((m) => m.member === member);
          if (rule) {
            const parent = node.parent;
            if (ts.isTypeReferenceNode(parent) && parent.typeName.getText(sf) === "Parameters"
              && ts.isIndexedAccessTypeNode(parent.parent)) {
              const idx = parent.parent.indexType.getText(sf);
              const shifted = `Parameters<typeof ${rule.target}>[${idx === "0" ? "1" : idx}]`;
              edits.push({ start: parent.parent.getStart(sf), end: parent.parent.getEnd(), text: shifted });
              replacedRanges.push({ start: parent.parent.getStart(sf), end: parent.parent.getEnd() });
              neededImports.add(rule.target);
              rows.push({ file: fileName, line: lineOf(sf, node.getStart(sf)), construct: `Parameters<${className}["${member}"]>[${idx}]`, mapping: "approximate", target: shifted, note: "receiver injected as param 0 — index shifted" });
            } else if (ts.isTypeReferenceNode(parent) && parent.typeName.getText(sf) === "ReturnType") {
              edits.push({ start: parent.getStart(sf), end: parent.getEnd(), text: `ReturnType<typeof ${rule.target}>` });
              replacedRanges.push({ start: parent.getStart(sf), end: parent.getEnd() });
              neededImports.add(rule.target);
              rows.push({ file: fileName, line: lineOf(sf, node.getStart(sf)), construct: `ReturnType<${className}["${member}"]>`, mapping: "approximate", target: `ReturnType<typeof ${rule.target}>` });
            } else {
              rows.push({ file: fileName, line: lineOf(sf, node.getStart(sf)), construct: `${className}["${member}"]`, mapping: "none", note: `member type moved to ${rule.target}; manual indexed-access rewrite needed` });
            }
          } else if (member === "evidence") {
            rows.push({ file: fileName, line: lineOf(sf, node.getStart(sf)), construct: `${className}["evidence"]`, mapping: "none", note: "→ a3dRendererEvidence in @aura3d/engine/devtools" });
          }
        }
        // `preserveDrawingBuffer` option key — dropped: `Renderer.create`
        // rejects it (excess property) and capture goes through the C-05
        // toBlob stub after a synchronous render. Removed with its comma.
        if (ts.isPropertyAssignment(node) && node.name.getText(sf) === "preserveDrawingBuffer") {
          const start = node.getStart(sf);
          let end = node.getEnd();
          while (end < source.length && /[ \t]/.test(source[end])) end++;
          if (source[end] === ",") end++;
          if (source[end] === "\n") end++;
          edits.push({ start, end, text: "" });
          replacedRanges.push({ start, end });
          rows.push({
            file: fileName,
            line: lineOf(sf, start),
            construct: "preserveDrawingBuffer",
            mapping: "approximate",
            note: "removed on Renderer.create — capture goes through the C-05 toBlob stub after a synchronous render"
          });
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);

      // --- pass 3: identifier renames. Import/export declarations are
      // handled by pass 1 only — an identifier inside an untouched import on
      // a deprecated subpath must keep its exported name (e.g. `A3DRenderer`
      // on ./advanced-runtime still resolves, `Renderer` does not).
      const rename = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
        if (ts.isIdentifier(node)) {
          const to = RENAMES.get(node.text);
          if (to && !insideReplaced(node.getStart(sf), node.getEnd())) {
            edits.push({ start: node.getStart(sf), end: node.getEnd(), text: to });
            rows.push({ file: fileName, line: lineOf(sf, node.getStart(sf)), construct: node.text, mapping: "exact", target: to });
          }
        }
        ts.forEachChild(node, rename);
      };
      rename(sf);

      // --- emit: apply edits descending, then inject needed imports ---
      edits.sort((a, b) => b.start - a.start);
      let code = source;
      for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end);

      if (neededImports.size) {
        const want = [...neededImports].filter((n) => !new RegExp(`\\b${n}\\b`).test(
          // already imported from ./renderer after the rewrite?
          code.match(/import[^;]*from\s+["']@aura3d\/engine\/renderer["']/g)?.join("\n") ?? ""
        ));
        if (want.length) {
          const existing = code.match(/import\s+\{([^}]*)\}\s+from\s+["']@aura3d\/engine\/renderer["'];/);
          if (existing) {
            code = code.replace(existing[0], `import { ${[...existing[1].split(",").map((s) => s.trim()).filter(Boolean), ...want].sort().join(", ")} } from "${TARGET}";`);
          } else {
            code = `import { ${want.sort().join(", ")} } from "${TARGET}";\n${code}`;
          }
        }
      }

      return { code, rows };
      }
    }
  };
}
