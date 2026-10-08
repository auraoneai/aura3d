/**
 * `aura3d assets library list|add|sync` (PRD-05 §6.6 curated library).
 *
 * `add` stages bytes under `assets/library/<kit>/<name>.<ext>` and records the
 * entry in `aura.library.json`; for model formats it then runs the full
 * §6.4 G1–G11 gate set against the staged file and stores the admission
 * record on the entry (mirroring `assets admit`). An entry admitted at
 * `release` resolves ahead of every remote catalog candidate.
 *
 * Look-dev approval is required for `release` (G9). `add` accepts a
 * `--lookdev-review "name[:score[:notes]]"` shorthand that records a human
 * review verdict "accept" bound to the staged file's sha256 — the same shape
 * `assets review` writes — so curated intake is a single command when a human
 * already reviewed the asset.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { AssetQualityCheck } from "../../contracts/assetManifest.js";
import {
  addLibraryEntry,
  readAuraLibrary,
  syncAuraLibrary,
  writeAuraLibrary,
  type AuraLibraryEntry,
} from "../../library-manifest.js";
import type { AuraCliAssetEntry, AuraCliAssetRole } from "../../asset-core-types.js";
import {
  runAdmissionGates,
  type AdmissionEntryContext,
  type AdmissionMeasured,
  type GateG9Result,
} from "../../admission/gates.js";
import { admissionModelFromGltf, readAdmissionGltf } from "../../admission/glb.js";
import { readArtDirectionDocument } from "../../admission/artDirection.js";
import { measureAdmissionInputs } from "./admit.js";

export interface LibraryVerbIo {
  readonly projectDir: string;
  readonly argv: readonly string[];
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}

const USAGE =
  "Usage: aura3d assets library <list|add|sync>\n" +
  "  list [--kit <id>] [--json]\n" +
  "  add <file> --kit <kit-id> --name <entry-id> --license <spdx> " +
  "[--source-page <url>] [--author <name>] [--title <t>] [--role <role>] " +
  "[--art-direction <id>] [--quality prototype|candidate|release] " +
  "[--optimize-state not-needed|derived] [--lookdev-review \"reviewer[:score[:notes]]\"] " +
  "[--tags a,b] [--retrieved-at iso] [--declare-kit --kit-art-direction <id>]\n" +
  "  sync [--json]";

export async function assetsLibraryVerb(io: LibraryVerbIo): Promise<number> {
  const sub = io.argv[0];
  if (sub === "list") return libraryList(io);
  if (sub === "sync") return librarySync(io);
  if (sub === "add") return libraryAdd(io);
  io.stderr(USAGE);
  return 2;
}

function libraryList(io: LibraryVerbIo): number {
  const manifest = readAuraLibrary(io.projectDir);
  if (!manifest) {
    io.stderr("No aura.library.json found — create it or run `assets library add` (it declares kits as needed with --declare-kit).");
    return 1;
  }
  const kitFilter = flag(io.argv, "--kit");
  const kits = manifest.kits.filter((k) => !kitFilter || k.id === kitFilter);
  const entries = manifest.entries.filter((e) => !kitFilter || e.kit === kitFilter);
  if (io.argv.includes("--json")) {
    io.stdout(JSON.stringify({ kits, entries }, null, 2));
    return 0;
  }
  for (const kit of kits) {
    const count = manifest.entries.filter((e) => e.kit === kit.id).length;
    io.stdout(`${kit.id}  (${count} entries)${kit.artDirection ? `  art-direction=${kit.artDirection}` : ""}`);
    if (kit.contents) io.stdout(`    ${kit.contents}`);
    for (const entry of manifest.entries.filter((e) => e.kit === kit.id)) {
      io.stdout(
        `    ${entry.id}  ${entry.format}  ${entry.role ?? "-"}  ${entry.quality ?? "candidate"}${entry.lookDevApproved ? "  look-dev✓" : ""}  ${entry.libraryPath}`,
      );
    }
  }
  return 0;
}

function librarySync(io: LibraryVerbIo): number {
  try {
    const { manifest, issues } = syncAuraLibrary(io.projectDir);
    if (io.argv.includes("--json")) {
      io.stdout(JSON.stringify({ entries: manifest.entries.length, issues }, null, 2));
    } else {
      io.stdout(`${manifest.entries.length} entries checked.`);
      for (const issue of issues) io.stderr(`  ${issue.kit}/${issue.entryId}: ${issue.issue}`);
      if (issues.length === 0) io.stdout("Library sync clean.");
    }
    return issues.length === 0 ? 0 : 1;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function libraryAdd(io: LibraryVerbIo): Promise<number> {
  const file = io.argv[1];
  const kit = flag(io.argv, "--kit");
  const name = flag(io.argv, "--name");
  const license = flag(io.argv, "--license");
  if (!file || file.startsWith("--") || !kit || !name || !license) {
    io.stderr(USAGE);
    return 2;
  }
  const sourcePath = resolve(io.projectDir, file);
  if (!existsSync(sourcePath)) {
    io.stderr(`library add: file not found: ${file}`);
    return 1;
  }

  // --declare-kit appends the kit contract row so intake is one command.
  let manifest = readAuraLibrary(io.projectDir) ?? { schema: "aura3d.library/1.0", kits: [], entries: [] };
  if (!manifest.kits.some((k) => k.id === kit)) {
    if (!io.argv.includes("--declare-kit")) {
      io.stderr(`aura.library.json has no kit "${kit}" — re-run with --declare-kit (and ideally --kit-art-direction <id>).`);
      return 1;
    }
    manifest = {
      ...manifest,
      kits: [...manifest.kits, { id: kit, artDirection: flag(io.argv, "--kit-art-direction") }],
    };
    writeAuraLibrary(io.projectDir, manifest);
    io.stdout(`Declared kit "${kit}".`);
  }
  const kitRecord = manifest.kits.find((k) => k.id === kit)!;

  const quality = (flag(io.argv, "--quality") ?? "candidate") as "prototype" | "candidate" | "release";
  const ext = sourcePath.split(".").pop()?.toLowerCase() ?? "bin";
  const format = ext === "gltf" ? "gltf" : ext === "glb" ? "glb" : ext === "hdr" ? "hdr" : ext === "ktx2" ? "ktx2" : ext === "zip" ? "texture-set" : "image";
  const sha256 = `sha256-${createHash("sha256").update(readFileSync(sourcePath)).digest("hex")}`;

  const optimizeState = flag(io.argv, "--optimize-state");
  const reviewSpec = flag(io.argv, "--lookdev-review");
  const [reviewer, scoreRaw, ...noteParts] = reviewSpec?.split(":") ?? [];
  const lookDev = reviewSpec
    ? {
        runUrl: flag(io.argv, "--lookdev-run") ?? "library-intake",
        derivedHash: sha256,
        reviews: [
          {
            reviewer: reviewer ?? "anonymous",
            verdict: "accept" as const,
            notes: noteParts.join(":") || "curated library intake review",
            at: new Date().toISOString(),
            judge: { kind: "human" as const, id: reviewer ?? "anonymous" },
            score: scoreRaw !== undefined && scoreRaw !== "" ? Number(scoreRaw) : undefined,
          },
        ],
      }
    : undefined;

  const baseEntry = {
    type: ext === "hdr" ? "environment" : ext === "glb" || ext === "gltf" ? "model" : "texture-set",
    format,
    source: "file" as const,
    outputPath: "", // set by addLibraryEntry → libraryPath
    url: "",
    hash: sha256,
    sizeBytes: 0,
    materials: [],
    animations: [],
    textures: [],
    title: flag(io.argv, "--title"),
    role: flag(io.argv, "--role") as AuraCliAssetRole | undefined,
    artDirection: flag(io.argv, "--art-direction") ?? kitRecord.artDirection,
    license,
    sourcePage: flag(io.argv, "--source-page"),
    author: flag(io.argv, "--author"),
    attribution: flag(io.argv, "--author"),
    retrievedAt: flag(io.argv, "--retrieved-at") ?? new Date().toISOString(),
    tags: flag(io.argv, "--tags")?.split(",").map((t) => t.trim()).filter(Boolean),
    lookDev,
    lookDevApproved: lookDev !== undefined,
    quality: "candidate" as const,
    ...(optimizeState === "not-needed" ? { derived: { optimize: "not-needed" as const } } : {}),
  };

  const entry = addLibraryEntry({
    projectDir: io.projectDir,
    kit,
    entryId: name,
    sourceFile: sourcePath,
    entry: { ...baseEntry, outputPath: "" } as unknown as Omit<AuraLibraryEntry, "id" | "kit" | "libraryPath">,
  });
  io.stdout(`Staged ${entry.libraryPath} (${((entry.sizeBytes ?? 0) / 1e6).toFixed(2)} MB).`);

  // Model formats run the full G1–G11 set; non-models (hdr, texture-set)
  // admit on licence + provenance alone — the geometry gates don't apply.
  let checks: readonly AssetQualityCheck[] = [];
  let failures: readonly string[] = [];
  let rendererIssues: readonly string[] = [];
  if (format === "glb" || format === "gltf") {
    const stagedPath = resolve(io.projectDir, entry.libraryPath);
    const glb = readAdmissionGltf(stagedPath);
    const model = admissionModelFromGltf(glb.json);
    const synthEntry = {
      ...baseEntry,
      id: name,
      hash: sha256,
      outputPath: entry.libraryPath,
      lookDev,
    } as unknown as AuraCliAssetEntry;
    const entryCtx: AdmissionEntryContext = {
      id: name,
      role: baseEntry.role,
      quality,
      sourcePath: baseEntry.sourcePage ?? sourcePath,
      derivedPresent: baseEntry.derived !== undefined,
      stylizedFlatApproved: baseEntry.artDirection !== undefined && lookDev !== undefined
        ? (readArtDirectionDocument(io.projectDir, baseEntry.artDirection)?.shading === "stylized-flat")
        : false,
      artDirection: baseEntry.artDirection,
    };
    const measured: AdmissionMeasured = await measureAdmissionInputs(
      io.projectDir, synthEntry, model, glb.json, glb.bin, stagedPath, io.projectDir,
    );
    checks = runAdmissionGates(model, entryCtx, measured);
    failures = checks.filter((c) => c.verdict === "fail").map((c) => c.message);
    rendererIssues = checks
      .filter((c) => (c as GateG9Result).rendererIssue === true)
      .map((c) => c.message);
    for (const c of checks) io.stdout(`  ${c.gate} ${c.verdict} — ${c.message}`);
    for (const issue of rendererIssues) io.stdout(`  renderer-issue: ${issue}`);
  } else if (!baseEntry.sourcePage && !baseEntry.author) {
    failures = ["non-model library entries still require provenance (--source-page or --author)"];
  }

  const admitted = quality === "release" ? failures.length === 0 : true;
  const finalQuality = admitted ? quality : "candidate";

  // Record the admission outcome on the entry (mirrors `assets admit`).
  manifest = readAuraLibrary(io.projectDir)!;
  const nextEntries = manifest.entries.map((e) =>
    e.kit === kit && e.id === name
      ? {
          ...e,
          quality: finalQuality,
          admission: {
            status: admitted ? ("admitted" as const) : ("rejected" as const),
            checks,
            at: new Date().toISOString(),
            derivedHash: sha256,
            quality: finalQuality,
          },
        }
      : e,
  );
  writeAuraLibrary(io.projectDir, { ...manifest, entries: nextEntries });

  if (!admitted) {
    for (const f of failures) io.stderr(`${name}: ${f}`);
    io.stderr(`${name}: admission rejected — entry recorded at quality "candidate".`);
    return 1;
  }
  io.stdout(`${name}: admitted to kit "${kit}" at quality "${finalQuality}".`);
  return 0;
}
