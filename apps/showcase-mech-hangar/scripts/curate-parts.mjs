/**
 * Authoritative Mech Hangar MH-2M curation gate.
 *
 * Proves that all sixteen GLBs came from the in-repository modular generator,
 * carry exact slot/socket/unit metadata, occupy a tight authored envelope, are
 * geometrically distinct, and have current release-grade rendered probes.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "aura.assets.json"), "utf8"));

const SLOT_DEFS = {
  chassis: { assemblyRole: "base-body", socket: "root", role: "character", range: [[1.05, 1.45], [0.84, 0.97], [0.58, 0.80]], names: ["Aegis Core", "Vanguard Hull", "Sentinel Shell", "Raptor Frame"] },
  arms: { assemblyRole: "accessory", socket: "chest", role: "prop", range: [[1.85, 2.15], [0.50, 0.70], [0.24, 0.46]], names: ["Aegis Manipulators", "Vanguard Gauntlets", "Sentinel Barricade Arms", "Raptor Talons"] },
  legs: { assemblyRole: "shoes", socket: "hips", role: "prop", range: [[0.78, 1.00], [0.65, 0.78], [0.40, 0.52]], names: ["Aegis Struts", "Vanguard Treads", "Sentinel Pillars", "Raptor Springs"] },
  weapon: { assemblyRole: "weapon", socket: "right-hand", role: "weapon", range: [[0.25, 0.68], [0.28, 0.70], [0.70, 1.28]], names: ["Bolt Repeater", "Arc Cannon", "Plasma Lance", "Siege Maul"] }
};

const MATRIX = Object.entries(SLOT_DEFS).flatMap(([slot, definition]) => definition.names.map((displayName, index) => {
  const letter = String.fromCharCode(65 + index);
  return { slot, letter, displayName, name: `mech${slot[0].toUpperCase()}${slot.slice(1)}${letter}`, ...definition };
}));

function inspectGlb(path) {
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 4).toString("ascii") !== "glTF" || bytes.readUInt32LE(4) !== 2) throw new Error("not a glTF 2.0 GLB");
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
  const boundsMin = [Infinity, Infinity, Infinity];
  const boundsMax = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    const accessor = primitive.attributes?.POSITION === undefined
      ? undefined
      : json.accessors?.[primitive.attributes.POSITION];
    if (!Array.isArray(accessor?.min) || !Array.isArray(accessor?.max)) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      boundsMin[axis] = Math.min(boundsMin[axis], Number(accessor.min[axis]));
      boundsMax[axis] = Math.max(boundsMax[axis], Number(accessor.max[axis]));
    }
  }
  return {
    sha256: `sha256-${createHash("sha256").update(bytes).digest("hex")}`,
    sizeBytes: bytes.length,
    meshCount: json.meshes?.length ?? 0,
    materialCount: json.materials?.length ?? 0,
    boundsMin: boundsMin.every(Number.isFinite) ? boundsMin : undefined,
    boundsMax: boundsMax.every(Number.isFinite) ? boundsMax : undefined,
    metadata: json.extras?.aura3dMechPart,
    orientation: json.asset?.extras?.aura3d?.orientation
  };
}

const inRange = (value, range) => Number.isFinite(value) && value >= range[0] && value <= range[1];
const usedHashes = new Set();
const parts = [];

for (const expected of MATRIX) {
  const failures = [];
  const entry = manifest.assets.find((asset) => asset.id === expected.name);
  const sourcePath = resolve(appDir, `assets/models/${expected.name}.glb`);
  let inspection;
  if (!existsSync(sourcePath)) failures.push("authored source GLB missing");
  else {
    try { inspection = inspectGlb(sourcePath); }
    catch (error) { failures.push(`GLB inspection failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (!entry) failures.push("root typed manifest entry missing");
  if (entry && inspection) {
    if (entry.hash !== inspection.sha256) failures.push("manifest hash does not bind authored source GLB");
    if (usedHashes.has(entry.hash)) failures.push("geometry hash duplicates another modular option");
    usedHashes.add(entry.hash);
    if (entry.type !== "model") failures.push(`manifest type is ${String(entry.type)}`);
    if (entry.role !== expected.role) failures.push(`role ${String(entry.role)} does not equal ${expected.role}`);
    if (!String(entry.provenance?.license ?? "").startsWith("CC0")) failures.push("license is not CC0");
    if (entry.provenance?.author !== "Aura3D synthesis") failures.push("author does not bind original synthesis");
    if (!String(entry.provenance?.sourcePage ?? "").includes("showcase-mech-hangar/scripts/build-models.mjs")) failures.push("source page does not bind generator");
    if (!String(entry.provenance?.downloadUrl ?? "").endsWith(`/assets/models/${expected.name}.glb`)) failures.push("durable download URL does not bind generated file");
    if (!String(entry.provenance?.sourcePath ?? "").endsWith(`apps/showcase-mech-hangar/assets/models/${expected.name}.glb`)) failures.push("manifest sourcePath is not the authored file");
    if ((entry.suitabilityReason?.length ?? 0) < 120) failures.push("role/socket suitability rationale is missing or too weak");
    if (!Array.isArray(entry.bounds) || entry.bounds.length !== 3) failures.push("manifest bounds missing");
    else entry.bounds.forEach((value, axis) => { if (!inRange(value, expected.range[axis])) failures.push(`axis ${axis} bound ${value} outside ${expected.range[axis][0]}-${expected.range[axis][1]}m envelope`); });
    if (inspection.meshCount < 3 || inspection.materialCount < 3) failures.push("part lacks three authored silhouette/material layers");
    if (inspection.sizeBytes < 7_000 || inspection.sizeBytes > 40_000) failures.push(`GLB byte size ${inspection.sizeBytes} outside family budget`);
    const metadata = inspection.metadata ?? {};
    if (metadata.schema !== "aura3d.mech-hangar.modular-part/1.0") failures.push("modular-part schema missing");
    if (metadata.family !== "MH-2M") failures.push("family is not MH-2M");
    if (metadata.id !== expected.name || metadata.slot !== expected.slot || metadata.variant !== expected.letter) failures.push("embedded identity/slot/variant mismatch");
    if (metadata.unitMeters !== 1 || metadata.origin !== "part-center") failures.push("embedded metre scale/origin mismatch");
    if (metadata.compatibleSocket !== expected.socket) failures.push(`embedded socket is not ${expected.socket}`);
    if (inspection.orientation?.forwardAxis !== "+Z" || inspection.orientation?.upAxis !== "+Y") failures.push("axis declaration is not +Z forward/+Y up");
  }

  const geometryAccepted = failures.length === 0;
  const releaseFailures = [...failures];
  if (entry?.quality !== "release") releaseFailures.push(`quality is ${String(entry?.quality ?? "missing")}; release required`);
  if (!entry?.renderedProbe?.url) releaseFailures.push("hash-bound rendered probe missing");
  else {
    if (entry.renderedProbe.assetHash !== entry.hash) releaseFailures.push("rendered probe asset hash is stale");
    if (!existsSync(resolve(repoRoot, entry.renderedProbe.url))) releaseFailures.push("rendered probe PNG missing on disk");
    if (!entry.renderedProbe.foregroundBounds) releaseFailures.push("rendered probe foreground bounds missing");
  }

  parts.push({
    name: expected.name,
    status: geometryAccepted ? "accepted" : "missing",
    releaseStatus: releaseFailures.length === 0 ? "accepted" : "blocked",
    slot: expected.slot,
    assemblyRole: expected.assemblyRole,
    socket: expected.socket,
    letter: expected.letter,
    displayName: expected.displayName,
    identity: inspection?.sha256,
    candidateId: `aura3d-original:MH-2M:${expected.slot}:${expected.letter}`,
    title: `${expected.displayName} — MH-2M original modular part`,
    source: "aura3d-original",
    author: entry?.provenance?.author ?? null,
    attribution: entry?.provenance?.attribution ?? entry?.provenance?.author ?? null,
    license: entry?.provenance?.license ?? "unverified",
    sizeBytes: inspection?.sizeBytes,
    hash: entry?.hash,
    bounds: entry?.bounds,
    boundsMin: inspection?.boundsMin,
    boundsMax: inspection?.boundsMax,
    retrievedAt: entry?.provenance?.retrievedAt ?? null,
    compatibility: { family: "MH-2M", unitMeters: 1, origin: "part-center", socket: expected.socket, forwardAxis: "+Z", upAxis: "+Y", meshCount: inspection?.meshCount, materialCount: inspection?.materialCount },
    failures,
    releaseFailures
  });
}

const compatible = parts.filter((part) => part.status === "accepted").length;
const releaseAccepted = parts.filter((part) => part.releaseStatus === "accepted").length;
const verdict = compatible === 16 && releaseAccepted === 16 && usedHashes.size === 16 ? "GO" : "NO-GO";
const report = {
  schema: "aura3d.mech-hangar.part-curation/2.0",
  generatedAt: new Date().toISOString(),
  sourceGenerator: "apps/showcase-mech-hangar/scripts/build-models.mjs",
  gate: { required: 16, compatibilityAccepted: compatible, releaseAccepted, uniqueGeometryHashes: usedHashes.size, threshold: 16, verdict },
  contract: { family: "MH-2M", unitMeters: 1, origins: "part-center", sockets: ["root", "chest", "hips", "right-hand"], requiredPerSlot: 4, proof: "embedded GLB metadata + exact hash + tight per-slot bounds + distinct geometry + retained root createAuraApp rendered probe" },
  parts
};
writeFileSync(resolve(appDir, "parts-curation-report.json"), `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  "/* GENERATED by scripts/curate-parts.mjs - do not edit by hand. */",
  "export interface CuratedPartRecord {",
  "  readonly name: string; readonly status: \"accepted\" | \"missing\"; readonly releaseStatus: \"accepted\" | \"blocked\";",
  "  readonly slot: \"chassis\" | \"arms\" | \"legs\" | \"weapon\"; readonly assemblyRole?: string; readonly socket?: string; readonly letter?: string; readonly displayName?: string;",
  "  readonly identity?: string; readonly candidateId?: string; readonly title?: string; readonly source?: string; readonly author?: string | null; readonly attribution?: string | null; readonly license?: string;",
  "  readonly sizeBytes?: number; readonly hash?: string; readonly bounds?: readonly number[]; readonly retrievedAt?: string | null; readonly compatibility?: Readonly<Record<string, unknown>>;",
  "  readonly boundsMin?: readonly number[]; readonly boundsMax?: readonly number[];",
  "  readonly failures?: readonly string[]; readonly releaseFailures?: readonly string[];",
  "}", "", "export const CURATED_PART_RECORDS: readonly CuratedPartRecord[] = ["
];
for (const part of parts) lines.push(`  ${JSON.stringify(part)},`);
lines.push("] as const;", "", `export const PART_CURATION_VERDICT: \"GO\" | \"NO-GO\" = ${JSON.stringify(verdict)};`, "");
writeFileSync(resolve(appDir, "src/parts-generated.ts"), lines.join("\n"));

console.log(`compatible ${compatible}/16; release-proven ${releaseAccepted}/16; unique ${usedHashes.size}/16; verdict ${verdict}`);
if (compatible !== 16) {
  for (const part of parts.filter((candidate) => candidate.failures.length > 0)) console.error(part.name, part.failures.join("; "));
  process.exitCode = 1;
}
