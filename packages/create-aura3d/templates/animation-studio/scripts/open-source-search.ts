/**
 * open-source-search.ts: find rigged characters, props and motion clips from OPEN, licence-clear
 * sources (Khronos samples, Poly Haven, the jsDelivr CC0 mirror and similar) through the Aura3D
 * CLI's build-time search (`aura3d assets search --json`).
 *
 * There is no hosted catalog. Nothing is fetched at runtime: this runs when you add a cast
 * member, a prop or build the clip library, and every accepted file is graded, hashed and
 * recorded with the licence and author the provider reported.
 *
 * When nothing matches, callers get an error that says so plainly and names the next steps
 * (`noMatchMessage`): add a licensed GLB, or generate with Meshy by passing `--allow-meshy
 * --budget N`. This module never falls back to a network endpoint on its own.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");

/** One downloadable candidate, as the resolver and the clip-library builder consume it. */
export interface OpenSourceResult {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  /** Directly downloadable .glb URL reported by the provider. */
  readonly url: string;
  /** Licence the provider reported (always present: candidates without one are dropped). */
  readonly license: string;
  /** Author to credit, when the provider reports one. */
  readonly attribution?: string;
}

export interface CliRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

/** Test seam: run the Aura3D CLI with these arguments. */
export type CliRunner = (args: readonly string[]) => CliRun;

/** Open sources had nothing suitable (as opposed to the search failing to run). */
export class OpenSourceNoMatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenSourceNoMatchError";
  }
}

export class OpenSourceSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenSourceSearchError";
  }
}

/** The CLI binary: `AURA3D_CLI` if set, otherwise this project's installed `@aura3d/cli`. */
export function locateCli(root: string = TEMPLATE_ROOT, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.AURA3D_CLI) return env.AURA3D_CLI;
  const local = resolve(root, "node_modules", ".bin", process.platform === "win32" ? "aura3d.cmd" : "aura3d");
  return existsSync(local) ? local : undefined;
}

export const defaultCliRunner: CliRunner = (args) => {
  const cli = locateCli();
  if (!cli) {
    return {
      status: null,
      stdout: "",
      stderr: "",
      error: new Error("the Aura3D CLI is not installed in this project (run `npm install --save-dev @aura3d/cli`, or set AURA3D_CLI to its path)")
    };
  }
  const run = spawnSync(cli, [...args], { cwd: TEMPLATE_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 240_000 });
  return { status: run.status, stdout: run.stdout ?? "", stderr: run.stderr ?? "", ...(run.error ? { error: run.error } : {}) };
};

/** What to do when open sources have nothing: honest, concrete, copy-pasteable. */
export function noMatchMessage(query: string, id: string, role: "character" | "prop"): string {
  const meshyBudget = role === "character" ? 40 : 30;
  const addFlag = role === "character" ? `--file ./your-rigged-character.glb` : `--file ./your-prop.glb`;
  return [
    `No open-source model matched "${query}" (nothing licence-clear, downloadable and suitable for a ${role}).`,
    `Next: add a licensed GLB you have the rights to:  animation-scene ${role === "character" ? "cast" : "prop"} add --id ${id} ${role === "character" ? addFlag : '--query "..." (or admit the file with `aura3d assets add ./your-prop.glb --name ' + id + "`)"}`,
    `  or generate one with Meshy (opt-in, costs credits):  animation-scene ${role === "character" ? "cast" : "prop"} add --id ${id} --query ${JSON.stringify(query)} --allow-meshy --budget ${meshyBudget}`
  ].join("\n");
}

interface SearchCandidateJson {
  readonly id?: string;
  readonly source?: string;
  readonly title?: string;
  readonly license?: string;
  readonly autoPullable?: boolean;
  readonly downloadUrl?: string;
  readonly author?: string;
  readonly format?: string;
}

function parseCandidates(stdout: string): SearchCandidateJson[] {
  const start = stdout.indexOf("{");
  if (start < 0) throw new OpenSourceSearchError("the Aura3D CLI search printed no JSON report");
  let report: { candidates?: SearchCandidateJson[] };
  try {
    report = JSON.parse(stdout.slice(start)) as { candidates?: SearchCandidateJson[] };
  } catch {
    throw new OpenSourceSearchError("the Aura3D CLI search printed a report that is not valid JSON");
  }
  return report.candidates ?? [];
}

/** Keep only candidates we can honestly download, credit and record. */
export function toOpenSourceResults(candidates: readonly SearchCandidateJson[], limit: number): OpenSourceResult[] {
  const out: OpenSourceResult[] = [];
  for (const c of candidates) {
    const url = c.downloadUrl;
    if (!c.id || !c.title || !c.source || typeof url !== "string") continue;
    if (c.autoPullable === false) continue;
    if (!/\.glb($|\?)/i.test(url) && c.format !== "glb") continue;
    if (!c.license) continue; // not licence-clear: never invent one
    out.push({ id: c.id, title: c.title, source: c.source, url, license: c.license, ...(c.author ? { attribution: c.author } : {}) });
    if (out.length >= limit) break;
  }
  return out;
}

export interface OpenSourceSearchOptions {
  /** Prefer assets that ship animation clips (motion library, animated characters). */
  readonly animated?: boolean;
  readonly role?: "character" | "prop" | "motion";
  readonly limit?: number;
  readonly runner?: CliRunner;
}

/**
 * Search open, licence-clear sources for downloadable GLBs. Tries the animation profile for the
 * role first and retries without a profile if that finds nothing, so a strict profile cannot hide
 * a usable model. Throws `OpenSourceSearchError` when the search itself cannot run; returns an
 * empty list (never a guess) when it ran and found nothing.
 */
export function searchOpenSources(query: string, options: OpenSourceSearchOptions = {}): OpenSourceResult[] {
  const runner = options.runner ?? defaultCliRunner;
  const limit = options.limit ?? 60;
  const profile = options.role === "prop" ? "animation-prop" : options.role === "character" || options.role === "motion" ? "animation-character" : undefined;
  const attempts: (readonly string[])[] = [];
  const base = ["assets", "search", query, "--json", ...(options.animated ? ["--animated"] : [])];
  if (profile) attempts.push([...base, "--profile", profile]);
  attempts.push(base);

  let lastError: string | undefined;
  for (const args of attempts) {
    const run = runner(args);
    if (run.error) throw new OpenSourceSearchError(`open-source search could not run: ${run.error.message}`);
    if (run.status !== 0 && !run.stdout.includes("{")) {
      lastError = (run.stderr || `exit ${run.status}`).trim().split("\n")[0];
      continue;
    }
    const results = toOpenSourceResults(parseCandidates(run.stdout), limit);
    if (results.length > 0) return results;
  }
  if (lastError) throw new OpenSourceSearchError(`open-source search failed: ${lastError}`);
  return [];
}

export interface MeshyGenerated {
  /** Absolute path of the generated GLB. */
  readonly file: string;
  readonly prompt: string;
  readonly credits: number;
}

/**
 * Generate with Meshy through the CLI ladder. Only called when the user passed `--allow-meshy`
 * with a budget. The CLI never handles Meshy credentials: it runs the generator configured in
 * `AURA3D_MESHY_CMD` (for example one that goes through Kiro Prism with ledger caps).
 */
export function generateWithMeshy(
  query: string,
  id: string,
  role: "character" | "prop",
  budget: number,
  runner: CliRunner = defaultCliRunner,
  listGlbs: (dir: string) => string[] = (dir) => (existsSync(dir) ? readdirSync(dir).map((f) => join(dir, f)) : [])
): MeshyGenerated {
  const run = runner(["assets", "resolve", query, "--name", id, "--role", role, "--allow", "meshy", "--budget", String(budget), "--json"]);
  if (run.error) throw new OpenSourceSearchError(`Meshy generation could not run: ${run.error.message}`);
  const start = run.stdout.indexOf("{");
  if (start < 0) throw new OpenSourceSearchError(`Meshy generation printed no report${run.stderr ? `: ${run.stderr.trim().split("\n")[0]}` : ""}`);
  const report = JSON.parse(run.stdout.slice(start)) as {
    chosen?: string;
    messages?: string[];
    meshy?: { prompt?: string; estimateCredits?: number; commands?: string[]; ran?: boolean };
    costCredits?: number;
    skipped?: { rung: string; reason: string }[];
  };
  if (report.chosen !== "meshy" || !report.meshy?.ran) {
    const why = (report.skipped ?? []).filter((s) => s.rung === "meshy").map((s) => s.reason).join("; ") || (report.messages ?? []).join(" ");
    throw new OpenSourceSearchError(`Meshy did not generate a model (${why || "no reason reported"}). Check AURA3D_MESHY_CMD and the budget (needs about ${role === "character" ? 38 : 30} credits).`);
  }
  const outDir = /--out\s+(\S+)/.exec(report.meshy.commands?.[0] ?? "")?.[1];
  if (!outDir) throw new OpenSourceSearchError("Meshy ran but the CLI did not report where it wrote the model");
  const glb = listGlbs(outDir).find((f) => /\.glb$/i.test(f));
  if (!glb) throw new OpenSourceSearchError(`Meshy reported success but no .glb is in ${outDir}`);
  return { file: glb, prompt: report.meshy.prompt ?? query, credits: report.costCredits ?? report.meshy.estimateCredits ?? 0 };
}
