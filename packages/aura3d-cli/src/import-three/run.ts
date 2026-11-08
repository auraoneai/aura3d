/**
 * B1 three.js asset bridge: `aura3d import-three` orchestration.
 *
 * factory module --(headless, seeded, readiness wait)--> three scene
 *   --(stable ids, analysis)--> GLTFExporter GLB (hidden nodes + clips explicit)
 *   --> `assets add` (typed asset in aura.assets.json / src/aura-assets.ts)
 *   --> <name>.bridge.ts (regenerated) + <name>.scene.ts (native, written once)
 *   --> <name>.bridge.json (generator path + hash, params, seed, three revision, ids, report)
 *
 * three is never a dependency of @aura3d/cli: it is resolved from the factory
 * module's own location (or --three <dir>), so it stays a dev/build dependency
 * of the project that owns the recipe.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { addAssetAsync } from "../index.js";
import { analyzeAndPrepare, assignStableIds, retargetClipTracks } from "./analyze.js";
import type { BridgeSceneData, CompatRow, ThreeBridgeFactory, ThreeBridgeFactoryResult, ThreeLike } from "./contract.js";
import { emitBridgeModule, emitNativeSceneModule } from "./emit.js";
import { installHeadlessExportShims, seededRandom, withRandom } from "./headless.js";

export const IMPORT_THREE_BRIDGE_VERSION = 1;

export interface ImportThreeOptions {
  /** Project root that owns aura.assets.json (default cwd). */
  readonly projectDir?: string;
  /** Factory module path (relative to projectDir). */
  readonly factory: string;
  /** Asset key and file stem (default: factory file stem). */
  readonly name?: string;
  readonly seed?: number;
  readonly params?: Readonly<Record<string, unknown>>;
  /** Where the bridge writes .bridge.ts/.scene.ts/.bridge.json (default src/three-bridge). */
  readonly outDir?: string;
  /** Where the raw exported GLB is staged before admission (default .aura3d/three-bridge). */
  readonly stageDir?: string;
  /** Directory containing a `three` install to use instead of resolving from the factory. */
  readonly threeDir?: string;
  /** Skip `assets add` (export, emit and report only). */
  readonly admit?: boolean;
  readonly license?: string;
}

export interface ImportThreeResult {
  readonly name: string;
  readonly glbPath: string;
  readonly glbSha256: string;
  readonly bridgeModule: string;
  readonly sceneModule: string;
  readonly sceneModuleWritten: boolean;
  readonly manifestPath: string;
  readonly reportPath: string;
  readonly counts: Readonly<Record<CompatRow["status"], number>>;
  readonly ids: { readonly kept: number; readonly added: readonly string[]; readonly removed: readonly string[] };
  readonly rows: readonly CompatRow[];
  readonly data: BridgeSceneData;
  readonly admitted: boolean;
}

interface BridgeManifest {
  readonly bridgeVersion: number;
  readonly name: string;
  readonly generator: { readonly path: string; readonly sha256: string; readonly export: string };
  readonly seed: number;
  readonly params: Readonly<Record<string, unknown>>;
  readonly three: { readonly revision: string };
  readonly glb: { readonly path: string; readonly sha256: string; readonly bytes: number };
  readonly nodeIds: readonly string[];
  readonly materials: readonly string[];
  readonly clips: readonly string[];
  readonly counts: Readonly<Record<CompatRow["status"], number>>;
}

function posix(p: string): string {
  return p.split(sep).join("/");
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Resolve three's ESM build and GLTFExporter from the factory's location (same module instances the factory imports). */
export function resolveThree(fromFile: string, threeDir?: string): { readonly threeUrl: string; readonly exporterUrl: string } {
  let exporterPath: string;
  if (threeDir) {
    exporterPath = resolve(threeDir, "examples/jsm/exporters/GLTFExporter.js");
    if (!existsSync(exporterPath)) exporterPath = resolve(threeDir, "node_modules/three/examples/jsm/exporters/GLTFExporter.js");
  } else {
    try {
      exporterPath = createRequire(fromFile).resolve("three/addons/exporters/GLTFExporter.js");
    } catch {
      throw new Error(`IMPORT_THREE_NO_THREE: three is not resolvable from ${fromFile}. Install it as a dev dependency next to the factory (npm i -D three) or pass --three <dir>. @aura3d/cli does not ship three.`);
    }
  }
  if (!existsSync(exporterPath)) throw new Error(`IMPORT_THREE_NO_THREE: no GLTFExporter at ${exporterPath}.`);
  const root = resolve(dirname(exporterPath), "../../..");
  return { threeUrl: pathToFileURL(join(root, "build/three.module.js")).href, exporterUrl: pathToFileURL(exporterPath).href };
}

async function settle(result: ThreeBridgeFactoryResult): Promise<void> {
  const pending: Promise<unknown>[] = [];
  if (Array.isArray(result.assets)) pending.push(...(result.assets as Promise<unknown>[]));
  else if (result.assets) pending.push(...Object.values(result.assets as Record<string, Promise<unknown>>));
  if (result.ready) pending.push(result.ready);
  await Promise.all(pending);
}

function countRows(rows: readonly CompatRow[]): Record<CompatRow["status"], number> {
  const counts = { supported: 0, approximated: 0, unsupported: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export function formatCompatReport(name: string, manifest: Pick<BridgeManifest, "generator" | "seed" | "params" | "three" | "glb">, rows: readonly CompatRow[]): string {
  const counts = countRows(rows);
  const lines = [
    `# three.js bridge report: ${name}`,
    ``,
    `Generator \`${manifest.generator.path}\` (sha256 ${manifest.generator.sha256.slice(0, 12)}), seed ${manifest.seed}, params \`${JSON.stringify(manifest.params)}\`, three r${manifest.three.revision}.`,
    `GLB \`${manifest.glb.path}\` (${manifest.glb.bytes} bytes, sha256 ${manifest.glb.sha256.slice(0, 12)}).`,
    ``,
    `Supported ${counts.supported}, approximated ${counts.approximated}, unsupported ${counts.unsupported}. Nothing is silently substituted: unsupported constructs are not reproduced, and each row says what the Aura3D output shows instead (hidden node, detached texture, or the unpatched base material).`,
    ``
  ];
  for (const status of ["unsupported", "approximated", "supported"] as const) {
    const group = rows.filter((row) => row.status === status);
    if (group.length === 0) continue;
    lines.push(`## ${status} (${group.length})`, ``, `| construct | subject | note | native route |`, `|---|---|---|---|`);
    for (const row of group) lines.push(`| ${row.construct} | \`${row.subject}\` | ${row.note.replace(/\|/g, "\\|")} | ${row.nativeTarget ?? ""} |`);
    lines.push(``);
  }
  return lines.join("\n");
}

export async function importThree(options: ImportThreeOptions): Promise<ImportThreeResult> {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const factoryPath = resolve(projectDir, options.factory);
  if (!existsSync(factoryPath)) throw new Error(`IMPORT_THREE_FACTORY_MISSING: ${factoryPath}`);
  const factorySource = readFileSync(factoryPath);
  const name = options.name ?? (factoryPath.split(sep).pop() ?? "scene").replace(/\.(m?[jt]s)$/, "").replace(/[^A-Za-z0-9_-]+/g, "-");
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) throw new Error(`IMPORT_THREE_BAD_NAME: "${name}" must start with a letter and use letters, digits, - or _.`);
  const seed = options.seed ?? 1;
  const outDir = resolve(projectDir, options.outDir ?? "src/three-bridge");
  const stageDir = resolve(projectDir, options.stageDir ?? ".aura3d/three-bridge");

  const { threeUrl, exporterUrl } = resolveThree(factoryPath, options.threeDir);
  const THREE = (await import(threeUrl)) as ThreeLike;
  const { GLTFExporter } = (await import(exporterUrl)) as { GLTFExporter: new () => { parseAsync(input: unknown, options: Record<string, unknown>): Promise<ArrayBuffer | object> } };
  const mod = (await import(`${pathToFileURL(factoryPath).href}?bridge=${sha256(factorySource).slice(0, 12)}`)) as { default?: ThreeBridgeFactory; createScene?: ThreeBridgeFactory; params?: Record<string, unknown> };
  const exportName = typeof mod.default === "function" ? "default" : "createScene";
  const factory = mod.default ?? mod.createScene;
  if (typeof factory !== "function") throw new Error(`IMPORT_THREE_NO_FACTORY: ${options.factory} must export a default function (or createScene) returning { scene, camera?, clips?, assets? }.`);
  const params = { ...(mod.params ?? {}), ...(options.params ?? {}) };

  const random = seededRandom(seed);
  const result = await withRandom(random, async () => {
    const built = await factory({ THREE, seed, random, params, mode: "headless" });
    if (!built || typeof built !== "object" || !(built as ThreeBridgeFactoryResult).scene) throw new Error("IMPORT_THREE_BAD_RESULT: the factory must return { scene }.");
    await settle(built);
    return built;
  });

  const rows: CompatRow[] = [];
  const renamed = new Map<string, string>();
  const nodeIds = assignStableIds(result.scene, rows, renamed);
  retargetClipTracks(result.clips ?? [], renamed);
  const analysis = analyzeAndPrepare(THREE, name, result, rows, nodeIds);
  let glb: Uint8Array;
  const restoreShims = installHeadlessExportShims();
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
  try {
    const exported = await new GLTFExporter().parseAsync(result.scene, {
      binary: true,
      onlyVisible: false,
      animations: [...(result.clips ?? [])],
      includeCustomExtensions: false
    });
    if (!(exported instanceof ArrayBuffer)) throw new Error("IMPORT_THREE_EXPORT_FAILED: GLTFExporter did not return a binary GLB.");
    glb = new Uint8Array(exported);
  } finally {
    console.warn = originalWarn;
    restoreShims();
    analysis.restore();
  }
  for (const warning of [...new Set(warnings)]) rows.push({ status: "approximated", construct: "GLTFExporter", subject: "export", note: warning.replace(/\s+/g, " ").slice(0, 240) });

  mkdirSync(stageDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const glbPath = join(stageDir, `${name}.glb`);
  writeFileSync(glbPath, glb);
  const glbSha = sha256(glb);

  const manifestPath = join(outDir, `${name}.bridge.json`);
  const previous = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<BridgeManifest>) : undefined;
  const prevIds = new Set(previous?.nodeIds ?? []);
  const nextIds = new Set(nodeIds);
  const ids = {
    kept: nodeIds.filter((id) => prevIds.has(id)).length,
    added: previous ? nodeIds.filter((id) => !prevIds.has(id)) : [],
    removed: [...prevIds].filter((id) => !nextIds.has(id))
  };

  const manifest: BridgeManifest = {
    bridgeVersion: IMPORT_THREE_BRIDGE_VERSION,
    name,
    generator: { path: posix(relative(projectDir, factoryPath)), sha256: sha256(factorySource), export: exportName },
    seed,
    params,
    three: { revision: String(THREE.REVISION) },
    glb: { path: posix(relative(projectDir, glbPath)), sha256: glbSha, bytes: glb.byteLength },
    nodeIds,
    materials: analysis.data.materials,
    clips: analysis.data.clips,
    counts: countRows(rows)
  };

  let admitted = false;
  if (options.admit !== false) {
    const priorOutput = readAdmittedOutputPath(projectDir, name);
    await addAssetAsync({
      projectDir,
      file: posix(relative(projectDir, glbPath)),
      name,
      type: "model",
      license: options.license ?? "LicenseRef-project-generated",
      author: "aura3d import-three",
      sourceFamily: "three-bridge",
      suitabilityReason: `procedural three.js recipe ${manifest.generator.path} (seed ${seed})`,
      replaceProvenanceEvidence: true,
      provenanceEvidence: [posix(relative(projectDir, manifestPath))],
      generation: {
        provider: "three-bridge",
        providerCli: "aura3d import-three",
        operation: "three-scene-factory",
        settings: { seed, params, threeRevision: String(THREE.REVISION), generatorSha256: manifest.generator.sha256 },
        localMetadata: posix(relative(projectDir, manifestPath)),
        rightsEvidence: manifest.generator.path
      }
    });
    admitted = true;
    // The admitted file is content-hashed; drop the superseded copy this bridge admitted earlier.
    const nextOutput = readAdmittedOutputPath(projectDir, name);
    if (priorOutput && nextOutput && priorOutput !== nextOutput && previous) rmSync(resolve(projectDir, priorOutput), { force: true });
  }

  const typegenPath = resolve(projectDir, readTypegenPath(projectDir));
  let assetsImport = posix(relative(outDir, typegenPath)).replace(/\.ts$/, "");
  if (!assetsImport.startsWith(".")) assetsImport = `./${assetsImport}`;
  const regenerateCommand = formatRegenerateCommand(manifest.generator.path, name, seed, options);
  const bridgeModule = join(outDir, `${name}.bridge.ts`);
  writeFileSync(bridgeModule, emitBridgeModule(analysis.data, { assetKey: name, assetsImport, regenerateCommand }));
  const sceneModule = join(outDir, `${name}.scene.ts`);
  const sceneModuleWritten = !existsSync(sceneModule);
  if (sceneModuleWritten) writeFileSync(sceneModule, emitNativeSceneModule(analysis.data));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const reportPath = join(outDir, `${name}.report.md`);
  writeFileSync(reportPath, formatCompatReport(name, manifest, rows));

  return { name, glbPath, glbSha256: glbSha, bridgeModule, sceneModule, sceneModuleWritten, manifestPath, reportPath, counts: manifest.counts, ids, rows, data: analysis.data, admitted };
}

/** Shell-quote one argument (POSIX single quotes). */
function shellArg(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The exact command that reproduces this import, including every non-default location and option. */
export function formatRegenerateCommand(generatorPath: string, name: string, seed: number, options: Pick<ImportThreeOptions, "params" | "outDir" | "stageDir" | "threeDir" | "admit" | "license">): string {
  const parts = ["aura3d", "import-three", shellArg(generatorPath), "--name", shellArg(name), "--seed", String(seed)];
  if (Object.keys(options.params ?? {}).length) parts.push("--params", shellArg(JSON.stringify(options.params)));
  if (options.outDir) parts.push("--out", shellArg(posix(options.outDir)));
  if (options.stageDir) parts.push("--stage", shellArg(posix(options.stageDir)));
  if (options.threeDir) parts.push("--three", shellArg(posix(options.threeDir)));
  if (options.license) parts.push("--license", shellArg(options.license));
  if (options.admit === false) parts.push("--no-admit");
  return parts.join(" ");
}

function readTypegenPath(projectDir: string): string {
  const manifestFile = join(projectDir, "aura.assets.json");
  if (existsSync(manifestFile)) {
    try {
      const parsed = JSON.parse(readFileSync(manifestFile, "utf8")) as { typegen?: string };
      if (typeof parsed.typegen === "string") return parsed.typegen;
    } catch { /* fall through to the default */ }
  }
  return "src/aura-assets.ts";
}

function readAdmittedOutputPath(projectDir: string, name: string): string | undefined {
  const manifestFile = join(projectDir, "aura.assets.json");
  if (!existsSync(manifestFile)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(manifestFile, "utf8")) as { assets?: { id?: string; outputPath?: string }[] };
    return parsed.assets?.find((asset) => asset.id === name)?.outputPath;
  } catch {
    return undefined;
  }
}
