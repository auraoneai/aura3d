import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export type BrowserReportField = "sourceConsumerReport" | "matrixSourceReport" | "examplesSourceReport";
export interface BrowserGateRecord {
  status: string;
  candidatePlan: { path: string; sha256: string };
  sourceConsumerReport?: { path: string; sha256: string };
  matrixSourceReport?: { path: string; sha256: string };
  examplesSourceReport?: { path: string; sha256: string };
}
export interface BrowserBindings {
  candidatePlan: string;
  reports: Partial<Record<BrowserReportField, string>>;
}

/** The native launcher owns the canonical consumer report variable. */
export function consumerReportFromEnvironment(env: Record<string, string | undefined>): string {
  const report = env.NATIVE_CONSUMER_SOURCE_REPORT;
  if (!report) throw new Error("NATIVE_CONSUMER_SOURCE_REPORT is required");
  for (const legacy of [env.AURA3D_SOURCE_REPORT, env.A3D_SOURCE_REPORT]) {
    if (legacy && legacy !== report) throw new Error("Consumer source report variables disagree");
  }
  return report;
}

/** Call the real gate validator before comparing the caller's exact inputs. */
export function bindBrowserGate<G extends BrowserGateRecord>(validate: () => G, bindings: BrowserBindings): G {
  const gate = validate();
  if (gate.status !== "CODE_COMPLETE_GO" || !bindings.candidatePlan ||
      gate.candidatePlan?.path !== bindings.candidatePlan || !/^[a-f0-9]{64}$/.test(gate.candidatePlan.sha256)) {
    throw new Error("Browser candidate plan is not bound to the validated code-complete gate");
  }
  const fields = Object.keys(bindings.reports) as BrowserReportField[];
  if (!fields.length) throw new Error("A gate-bound browser source report is required");
  for (const field of fields) {
    if (!(["sourceConsumerReport", "matrixSourceReport", "examplesSourceReport"] as string[]).includes(field) ||
        !bindings.reports[field] || gate[field]?.path !== bindings.reports[field] ||
        !/^[a-f0-9]{64}$/.test(gate[field]?.sha256 ?? "")) {
      throw new Error(`Browser source report is not bound to the validated gate: ${field}`);
    }
  }
  return gate;
}

/** Restore only after the gate passes; the caller owns the returned cleanup. */
export async function restoreGatedBrowserConsumer<G extends BrowserGateRecord>(
  validate: () => G,
  bindings: BrowserBindings,
  restore: (destination: string, gate: G) => Promise<void>
): Promise<{ gate: G; directory: string; cleanup(): void }> {
  const gate = bindBrowserGate(validate, bindings);
  const workspace = mkdtempSync(join(tmpdir(), "aura3d-browser-consumer-"));
  const directory = join(workspace, "project");
  try {
    await restore(directory, gate);
    return { gate, directory, cleanup: () => rmSync(workspace, { recursive: true, force: true }) };
  } catch (error) {
    try { rmSync(workspace, { recursive: true, force: true }); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "Consumer restoration and cleanup failed"); }
    throw error;
  }
}

export interface BrowserOutputFile { path: string; size: number; sha256: string }

/** Snapshot only gate-bound output files, so the server cannot serve later changes. */
export function snapshotBrowserOutput(directory: string, inventory: readonly BrowserOutputFile[]): {
  files: ReadonlyMap<string, Buffer>;
  sha256: string;
} {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Browser output is not a real directory");
  const root = realpathSync(directory);
  if (!Array.isArray(inventory) || !inventory.length || inventory.length > 2000) throw new Error("Browser output inventory is empty or too large");
  const rows = [...inventory].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const files = new Map<string, Buffer>();
  let total = 0;
  for (const row of rows) {
    if (!row || typeof row.path !== "string" || !row.path || isAbsolute(row.path) || /[\\\x00-\x1f\x7f]/.test(row.path) ||
        row.path.split("/").some((part: string) => !part || part === "." || part === "..") || files.has(row.path) ||
        !Number.isSafeInteger(row.size) || row.size < 0 || !/^[a-f0-9]{64}$/.test(row.sha256)) {
      throw new Error("Invalid browser output inventory entry");
    }
    total += row.size;
    if (total > 512 * 1024 * 1024) throw new Error("Browser output inventory exceeds its size bound");
    let current = root;
    const parts = row.path.split("/");
    for (let index = 0; index < parts.length; index++) {
      current = resolve(current, parts[index]!);
      const item = lstatSync(current);
      if (item.isSymbolicLink() || (index < parts.length - 1 ? !item.isDirectory() : !item.isFile())) {
        throw new Error("Browser output contains an unsafe path");
      }
      if (index === parts.length - 1 && item.size !== row.size) throw new Error(`Browser output differs from its source report: ${row.path}`);
    }
    const bytes = readFileSync(current);
    if (bytes.byteLength !== row.size || createHash("sha256").update(bytes).digest("hex") !== row.sha256) {
      throw new Error(`Browser output differs from its source report: ${row.path}`);
    }
    files.set(row.path, bytes);
  }
  return { files, sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") };
}
