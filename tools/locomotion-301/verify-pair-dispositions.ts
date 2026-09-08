import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolvePairCorrectionDisposition, type PairCorrectionDisposition } from "./rig-pair-evidence.js";

interface RetainedPairReceipt {
  pair?: {
    source?: string;
    target?: string;
    map?: { ok?: boolean; coverage?: number; requiredCoverage?: number };
    correctionValues?: { schema?: string };
  };
  quality?: { pass?: boolean; failures?: unknown[] };
}

export interface VerifiedPairDisposition {
  readonly pair: string;
  readonly receiptPath: string;
  readonly receiptSha256: string;
  readonly receiptBytes: number;
  readonly disposition: PairCorrectionDisposition;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function findPairReceipts(root: string): string[] {
  const results: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name === "pair.json") results.push(path);
    }
  };
  visit(root);
  return results.sort();
}

export function verifyRetainedPairDispositions(root: string): {
  readonly pass: boolean;
  readonly failures: readonly string[];
  readonly pairs: readonly VerifiedPairDisposition[];
} {
  const failures: string[] = [];
  const pairs = findPairReceipts(root).map(path => {
    const bytes = readFileSync(path);
    const parsed = JSON.parse(bytes.toString("utf8")) as RetainedPairReceipt;
    const source = parsed.pair?.source;
    const target = parsed.pair?.target;
    const map = parsed.pair?.map;
    const correctionValues = parsed.pair?.correctionValues;
    const qualityPass = parsed.quality?.pass === true && (parsed.quality?.failures?.length ?? 0) === 0;
    if (!source || !target || typeof map?.ok !== "boolean" || typeof map.coverage !== "number" || typeof map.requiredCoverage !== "number") {
      throw new Error(`${path}: incomplete pair/map receipt`);
    }
    const disposition = resolvePairCorrectionDisposition({ source, target, map: { ok: map.ok, coverage: map.coverage, requiredCoverage: map.requiredCoverage }, correctionValues }, qualityPass);
    const pair = `${source}->${target}`;
    if (correctionValues?.schema !== "aura3d-rig-pair-correction/v1") failures.push(`${pair}: measured correction profile missing`);
    if (disposition.status === "open") failures.push(`${pair}: correction disposition remains open`);
    return { pair, receiptPath: resolve(path), receiptSha256: sha256(bytes), receiptBytes: bytes.length, disposition };
  });
  const unique = new Set(pairs.map(row => row.pair));
  if (pairs.length !== 16 || unique.size !== 16) failures.push(`expected 16 unique ordered pair receipts, received ${pairs.length}/${unique.size}`);
  const sameRig = pairs.filter(row => row.disposition.source === row.disposition.target);
  if (sameRig.length !== 4 || sameRig.some(row => row.disposition.status !== "explicit-no-pair-map-correction")) failures.push("four same-rig explicit no-correction dispositions required");
  const crossRig = pairs.filter(row => row.disposition.source !== row.disposition.target);
  if (crossRig.length !== 12 || crossRig.some(row => row.disposition.status !== "measured-pair-correction-applied")) failures.push("twelve cross-rig measured correction dispositions required");
  return { pass: failures.length === 0, failures, pairs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2];
  const output = process.argv[3];
  if (!root || !output) throw new Error("Usage: verify-pair-dispositions.ts PAIR_ARTIFACT_ROOT OUTPUT_JSON");
  const result = verifyRetainedPairDispositions(root);
  const producerPath = fileURLToPath(import.meta.url);
  const report = {
    schema: "aura3d-rig-pair-correction-dispositions/v1",
    generatedAt: new Date().toISOString(),
    producer: basename(producerPath),
    producerSha256: sha256(readFileSync(producerPath)),
    artifactRoot: resolve(root),
    pass: result.pass,
    failures: result.failures,
    summary: {
      pairCount: result.pairs.length,
      sameRigNoCorrectionCount: result.pairs.filter(row => row.disposition.status === "explicit-no-pair-map-correction").length,
      crossRigCorrectionCount: result.pairs.filter(row => row.disposition.status === "measured-pair-correction-applied").length,
      openCount: result.pairs.filter(row => row.disposition.status === "open").length
    },
    pairs: result.pairs
  };
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}
