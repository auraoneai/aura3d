import { createHash } from "node:crypto";
import { basename, dirname, join, normalize } from "node:path/posix";
import ts from "typescript";

/** A packed file as returned by the bounded, non-extracting package reader. */
export interface ArchiveEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export type MathArchiveKind = "engine" | "math";

export interface ArchiveIssue {
  readonly code: string;
  readonly path: string;
  readonly detail: string;
}

export interface RetiredMarker {
  /** An independently supplied identifier; marker bytes are never reported. */
  readonly id: string;
  readonly bytes: Uint8Array;
}

export interface MathArchiveOptions {
  readonly kind: MathArchiveKind;
  readonly entries: readonly ArchiveEntry[];
  /** Digests of the candidate's current packages/math/src files. */
  readonly sourceDigests: Readonly<Record<string, string>>;
  /** Optional review leads, such as synthetic markers in unit tests. */
  readonly retiredMarkers?: readonly RetiredMarker[];
}

export interface MathArchiveReport {
  readonly packageName: "@aura3d/engine" | "@aura3d/math";
  readonly independence: "not-established";
  readonly files: readonly { readonly path: string; readonly sha256: string }[];
  readonly notices: readonly { readonly path: string; readonly sha256: string }[];
  readonly mutablePaths: readonly string[];
  readonly mapsWithoutEmbeddedSources: readonly string[];
  readonly issues: readonly ArchiveIssue[];
  readonly limitations: readonly string[];
}

const WRAPPERS = [
  { name: "OBB", target: "./independent/OrientedBox.js", exports: ["OBB"] },
  { name: "ConvexHull", target: "./independent/ConvexHull.js", exports: ["ConvexHull", "ConvexHullFace", "HalfEdge", "VertexNode", "VertexList"] },
  { name: "ShapeUtils", target: "./independent/PolygonTriangulation.js", exports: ["earcut", "shapeArea", "isClockWise", "triangulateShape", "ShapeUtils"] }
] as const;
const HASH = /^[a-f0-9]{64}$/;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const text = (entry: ArchiveEntry) => Buffer.from(entry.bytes).toString("utf8");

/**
 * Inspect the two explicitly identified math distributions. A passing result
 * establishes only these structural retirement checks, never authorship. The
 * caller must bind entries and source digests to a validated candidate plan.
 */
export function inspectMathArchive(options: MathArchiveOptions): MathArchiveReport {
  if (options.kind !== "engine" && options.kind !== "math") throw new Error("Unknown math archive kind");
  const packageName = options.kind === "engine" ? "@aura3d/engine" : "@aura3d/math";
  const mathRoot = options.kind === "engine" ? "package/dist/math" : "package/dist";
  const entries = new Map<string, ArchiveEntry>();
  for (const entry of options.entries) {
    if (!entry.path.startsWith("package/") || entry.path.includes("\\") || entry.path.split("/").some((part) => part === "." || part === "..") || entries.has(entry.path)) {
      throw new Error(`Invalid or duplicate archive entry: ${entry.path}`);
    }
    entries.set(entry.path, entry);
  }
  for (const [path, digest] of Object.entries(options.sourceDigests)) {
    if (!path.startsWith("packages/math/src/") || !HASH.test(digest)) throw new Error(`Invalid staged source digest: ${path}`);
  }
  const markers = options.retiredMarkers ?? [];
  if (new Set(markers.map((item) => item.id)).size !== markers.length || markers.some((item) => !/^[\w.-]+$/.test(item.id) || !(item.bytes instanceof Uint8Array) || item.bytes.length === 0)) {
    throw new Error("Retired markers require unique identifiers and nonempty bytes");
  }

  const issues: ArchiveIssue[] = [];
  const issue = (code: string, path: string, detail: string) => issues.push({ code, path, detail });
  const manifest = entries.get("package/package.json");
  try {
    if (!manifest || JSON.parse(text(manifest)).name !== packageName) issue("PACKAGE_IDENTITY", "package/package.json", `Expected ${packageName}`);
  } catch { issue("PACKAGE_IDENTITY", "package/package.json", "Invalid package manifest"); }

  const files = [...entries.values()].map((entry) => ({ path: entry.path, sha256: hash(entry.bytes) })).sort((a, b) => a.path.localeCompare(b.path));
  const notices = files.filter(({ path }) => /(?:^|\/)(?:LICEN[CS]E|NOTICE|COPYING|COPYRIGHT)(?:[.-].*)?$/i.test(path));
  function scanMarkers(path: string, bytes: Uint8Array): void {
    for (const marker of markers) {
      if (Buffer.from(bytes).includes(Buffer.from(marker.bytes))) issue("RETIRED_MARKER", path, marker.id);
    }
  }
  for (const entry of entries.values()) scanMarkers(entry.path, entry.bytes);

  for (const rule of WRAPPERS) {
    const js = `${mathRoot}/${rule.name}.js`, declaration = `${mathRoot}/${rule.name}.d.ts`;
    checkWrapper(js, rule.target, rule.exports);
    checkWrapper(declaration, rule.target, rule.exports);
    for (const ext of ["js", "d.ts"]) {
      const target = `${mathRoot}/independent/${rule.target.split("/").at(-1)!.replace(/\.js$/, `.${ext}`)}`;
      if (!entries.has(target)) issue("MISSING_REPLACEMENT", target, `Required by ${rule.name}.${ext}`);
      if (!entries.has(`${target}.map`)) issue("MISSING_MAP", `${target}.map`, "Expected replacement source map");
      if (!entries.has(`${mathRoot}/${rule.name}.${ext}.map`)) issue("MISSING_MAP", `${mathRoot}/${rule.name}.${ext}.map`, "Expected generated source map");
    }
  }

  const mutablePaths = [...entries.keys()].filter((path) => path.startsWith(`${mathRoot}/three/`) && /\.(?:js|mjs|cjs|d\.ts)$/i.test(path)).sort();
  for (const path of mutablePaths) {
    const entry = entries.get(path)!;
    if (path.endsWith(".mjs") || path.endsWith(".cjs")) {
      issue("RETIRED_MUTABLE_BODY", path, "Unexpected legacy-path module format");
      continue;
    }
    const sibling = path.endsWith(".d.ts") ? path.replace(/\.d\.ts$/, ".js") : path.replace(/\.js$/, ".d.ts");
    if (!entries.has(sibling)) issue("MISSING_MUTABLE_SIBLING", sibling, `Required by ${path}`);
    if (!entries.has(`${path}.map`)) issue("MISSING_MAP", `${path}.map`, "Expected generated source map");
    const result = reexports(text(entry), path);
    if (!result.ok || result.targets.some((target) => !/^\.\.\/independent\/mutable\/[\w-]+\.js$/.test(target))) {
      issue("RETIRED_MUTABLE_BODY", path, "Legacy-path modules must be absent or contain only reviewed mutable re-exports");
      continue;
    }
    for (const target of result.targets) {
      const emitted = normalize(join(dirname(path), target.replace(/\.js$/, path.endsWith(".d.ts") ? ".d.ts" : ".js")));
      if (!entries.has(emitted)) issue("MISSING_REPLACEMENT", emitted, `Referenced by ${path}`);
      if (!entries.has(`${emitted}.map`)) issue("MISSING_MAP", `${emitted}.map`, "Expected replacement source map");
    }
  }

  const mapsWithoutEmbeddedSources: string[] = [];
  for (const entry of entries.values()) {
    if (!entry.path.startsWith(`${mathRoot}/`)) continue;
    if (entry.path.endsWith(".map")) {
      const pairedPath = entry.path.slice(0, -4);
      const paired = entries.get(pairedPath);
      if (!paired) { issue("ORPHAN_MAP", entry.path, "No emitted file corresponds to this map"); continue; }
      inspectMap(entry, paired);
    } else if (/\.(?:js|mjs|cjs|d\.ts)$/i.test(entry.path)) {
      const pattern = /sourceMappingURL=data:application\/json(?:;charset=[\w-]+)?(;base64)?,([^\s*]+)/gi;
      let index = 0;
      for (const match of text(entry).matchAll(pattern)) {
        const path = `${entry.path}#inline-${index++}`;
        try {
          if (match[1] && !/^[A-Za-z0-9+/]*={0,2}$/.test(match[2]!)) throw new Error();
          const bytes = match[1] ? Buffer.from(match[2]!, "base64") : Buffer.from(decodeURIComponent(match[2]!));
          scanMarkers(path, bytes);
          inspectMap({ path, bytes }, entry);
        } catch { issue("INVALID_MAP", path, "Inline source map could not be decoded"); }
      }
    }
  }

  return {
    packageName, independence: "not-established", files, notices, mutablePaths,
    mapsWithoutEmbeddedSources: mapsWithoutEmbeddedSources.sort(), issues,
    limitations: [
      "Structural wrapper and marker checks cover identified retirement paths only; they do not establish authorship or exclude arbitrary renamed copies.",
      "Maps without embedded source content cannot prove the original source bytes from the map alone.",
      "Notice inventory does not determine licensing or attribution obligations."
    ]
  };

  function checkWrapper(path: string, target: string, required: readonly string[]): void {
    const entry = entries.get(path);
    if (!entry) { issue("MISSING_WRAPPER", path, "Expected the public compatibility wrapper"); return; }
    const result = reexports(text(entry), path);
    if (!result.ok || result.targets.some((actual) => actual !== target) || (!result.star && required.some((name) => !result.names.has(name)))) {
      issue("RETIRED_PUBLIC_BODY", path, "Expected only re-exports to the identified replacement");
    }
  }

  function inspectMap(entry: ArchiveEntry, paired: ArchiveEntry): void {
    let map: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(text(entry));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      map = value as Record<string, unknown>;
    } catch { issue("INVALID_MAP", entry.path, "Source map is not a JSON object"); return; }
    if (map.version !== 3 || (map.file !== basename(paired.path) && !(entry.path.includes("#inline-") && map.file === undefined)) || !Array.isArray(map.sources) ||
        !map.sources.every((source) => typeof source === "string") || typeof map.mappings !== "string" ||
        (map.sourceRoot !== undefined && typeof map.sourceRoot !== "string")) {
      issue("INVALID_MAP", entry.path, "Unsupported source-map fields"); return;
    }
    if (map.mappings.split(";").length > text(paired).split("\n").length + 1) {
      issue("STALE_MAP", entry.path, "Map has more generated lines than its emitted file");
    }
    const content = map.sourcesContent;
    if (content !== undefined && (!Array.isArray(content) || content.length !== map.sources.length)) {
      issue("INVALID_MAP", entry.path, "sourcesContent does not match sources"); return;
    }
    for (let index = 0; index < map.sources.length; index += 1) {
      const source = `${map.sourceRoot ?? ""}/${map.sources[index]}`.replaceAll("\\", "/");
      const matches = Object.keys(options.sourceDigests).filter((path) => source.endsWith(`/${path}`));
      if (matches.length !== 1) { issue("UNBOUND_MAP_SOURCE", entry.path, "Map source is not uniquely bound to staged math source"); continue; }
      const embedded = Array.isArray(content) ? content[index] : undefined;
      if (embedded === undefined || embedded === null) mapsWithoutEmbeddedSources.push(`${entry.path}#${index}`);
      else if (typeof embedded !== "string") issue("INVALID_MAP", entry.path, "Embedded source is not text");
      else {
        scanMarkers(`${entry.path}#source-${index}`, Buffer.from(embedded));
        if (hash(Buffer.from(embedded)) !== options.sourceDigests[matches[0]!]) {
          issue("STALE_MAP_SOURCE", entry.path, `Embedded source differs from ${matches[0]}`);
        }
      }
    }
  }
}

/** Ignore comments and map trailers, but reject executable or declaration bodies. */
function reexports(source: string, path: string): { ok: boolean; targets: string[]; names: Set<string>; star: boolean } {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const targets: string[] = [];
  const names = new Set<string>();
  let star = false;
  const diagnostics = (file as ts.SourceFile & { readonly parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  const ok = diagnostics.length === 0 && file.statements.length > 0 && file.statements.every((statement) => {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    targets.push(statement.moduleSpecifier.text);
    if (!statement.exportClause) {
      if (!statement.isTypeOnly) star = true;
    } else if (ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.length > 0) {
      if (!statement.isTypeOnly) for (const element of statement.exportClause.elements) if (!element.isTypeOnly) names.add(element.name.text);
    } else return false;
    return true;
  });
  return { ok, targets, names, star };
}
