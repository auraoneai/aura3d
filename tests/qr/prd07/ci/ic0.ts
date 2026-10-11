// 07-IC0 CLI — flag-off identity of a prd07-vfx.yml run against the IC-0
// baseline captured by an earlier run on the SAME provider (GitHub macos-14,
// program lead ruling 2026-10-10). Compares:
//   scenes: <capture>/<scene>/aura3d.png vs <baseline-capture>/<scene>/aura3d.png
//   games:  every games[].runs[].shots[].file vs the same file in the baseline
// against noise floors measured in THIS run from a second flag-off capture
// (`--repeat`, `--repeat-games`). A missing baseline, missing repeat or
// provider mismatch is reported, never passed.
//
// Usage:
//   pnpm exec tsx tests/qr/prd07/ci/ic0.ts --capture <dir> --repeat <dir>
//     [--baseline-capture <dir>] [--games <dir> --repeat-games <dir> [--baseline-games <dir>]]
//     --out <file.json> [--strict]
// Exit: 1 on any `fail` or provider mismatch; with --strict also on any
// non-pass item (missing baseline, unmeasured noise floor).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { decodePng } from "../../../../tools/quality-gate/src/png";
import { deltaE2000P99, ic0Verdict, noiseFloorFrom, sameProvider, type Ic0Item, type ProviderIdentity, type RgbaFrame } from "./ic0-lib";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface CaptureReport {
  readonly environment?: { readonly ciProvider?: string; readonly runnerImage?: string; readonly browserChannel?: string; readonly gpu?: { readonly renderer?: string } | null; readonly githubRunId?: string; readonly sha?: string };
  readonly scenes?: readonly { readonly scene: string; readonly engines?: Record<string, { readonly status?: string; readonly screenshot?: string | null }> }[];
}

interface GamesReport {
  readonly environment?: { readonly ciProvider?: string; readonly browserChannel?: string; readonly probeRenderer?: string; readonly githubRun?: string; readonly sha?: string };
  readonly games?: readonly { readonly id: string; readonly runs?: readonly { readonly run: string; readonly shots?: readonly { readonly name: string; readonly file?: string; readonly error?: string }[] }[] }[];
}

function readJson<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
}

function frame(file: string): RgbaFrame | null {
  if (!existsSync(file)) return null;
  try {
    return decodePng(readFileSync(file));
  } catch {
    return null;
  }
}

function p99(a: string, b: string): number | null {
  const fa = frame(a);
  const fb = frame(b);
  return fa && fb ? deltaE2000P99(fa, fb) : null;
}

function captureIdentity(r: CaptureReport | null): ProviderIdentity {
  return {
    ciProvider: r?.environment?.ciProvider ?? null,
    runnerImage: r?.environment?.runnerImage ?? null,
    browserChannel: r?.environment?.browserChannel ?? null,
    gpuRenderer: r?.environment?.gpu?.renderer ?? null
  };
}

function gamesIdentity(r: GamesReport | null): ProviderIdentity {
  // capture-games records no runner image; the probe renderer pins the GPU.
  return { ciProvider: r?.environment?.ciProvider ?? null, runnerImage: null, browserChannel: r?.environment?.browserChannel ?? null, gpuRenderer: r?.environment?.probeRenderer ?? null };
}

function sceneItems(captureDir: string, repeatDir: string | undefined, baselineDir: string | undefined): { items: Ic0Item[]; floor: number | null } {
  const report = readJson<CaptureReport>(join(captureDir, "report.json"));
  const scenes = (report?.scenes ?? []).map((s) => s.scene);
  const shot = (dir: string, scene: string) => join(dir, scene, "aura3d.png");
  const repeats = repeatDir ? scenes.map((s) => p99(shot(captureDir, s), shot(repeatDir, s))).filter((v): v is number => v !== null) : [];
  const floor = noiseFloorFrom(repeats);
  const items = scenes.map((scene): Ic0Item => {
    if (!baselineDir) return { kind: "scene", id: scene, p99: null, status: "missing", detail: "no IC-0 baseline run supplied" };
    const value = p99(shot(captureDir, scene), shot(baselineDir, scene));
    return { kind: "scene", id: scene, p99: value, status: ic0Verdict(value, floor), ...(value === null ? { detail: "frame missing in candidate or baseline" } : {}) };
  });
  return { items, floor };
}

function gameItems(gamesDir: string, repeatDir: string | undefined, baselineDir: string | undefined): { items: Ic0Item[]; floor: number | null } {
  const report = readJson<GamesReport>(join(gamesDir, "report.json"));
  const files = (report?.games ?? []).flatMap((g) => (g.runs ?? []).flatMap((r) => (r.shots ?? []).filter((s) => s.file && !s.error).map((s) => ({ id: `${g.id}/${r.run}/${s.name}`, file: s.file! }))));
  const repeats = repeatDir ? files.map((f) => p99(join(gamesDir, f.file), join(repeatDir, f.file))).filter((v): v is number => v !== null) : [];
  const floor = noiseFloorFrom(repeats);
  const items = files.map((f): Ic0Item => {
    if (!baselineDir) return { kind: "game-shot", id: f.id, p99: null, status: "missing", detail: "no IC-0 baseline run supplied" };
    const value = p99(join(gamesDir, f.file), join(baselineDir, f.file));
    return { kind: "game-shot", id: f.id, p99: value, status: ic0Verdict(value, floor), ...(value === null ? { detail: "shot missing in candidate or baseline" } : {}) };
  });
  return { items, floor };
}

function main(): void {
  const captureDir = arg("--capture");
  const out = arg("--out");
  if (!captureDir || !out) {
    console.error("::error::usage: ic0.ts --capture <dir> --repeat <dir> [--baseline-capture <dir>] [--games <dir> --repeat-games <dir> [--baseline-games <dir>]] --out <file> [--strict]");
    process.exit(2);
  }
  const strict = process.argv.includes("--strict");
  const baselineCapture = arg("--baseline-capture");
  const gamesDir = arg("--games");
  const baselineGames = arg("--baseline-games");
  const problems: string[] = [];

  const candidateReport = readJson<CaptureReport>(join(captureDir, "report.json"));
  if (!candidateReport) problems.push(`${captureDir}: no report.json`);
  const provider: Record<string, unknown> = { candidate: captureIdentity(candidateReport) };
  if (baselineCapture) {
    const baseReport = readJson<CaptureReport>(join(baselineCapture, "report.json"));
    provider.baseline = captureIdentity(baseReport);
    provider.baselineRun = baseReport?.environment?.githubRunId ?? null;
    const check = sameProvider(captureIdentity(candidateReport), captureIdentity(baseReport));
    if (!check.same) problems.push(`scene baseline is a different provider: ${check.reason}`);
  }
  const scenes = sceneItems(captureDir, arg("--repeat"), baselineCapture);
  let games: { items: Ic0Item[]; floor: number | null } = { items: [], floor: null };
  if (gamesDir) {
    if (baselineGames) {
      const check = sameProvider(gamesIdentity(readJson<GamesReport>(join(gamesDir, "report.json"))), gamesIdentity(readJson<GamesReport>(join(baselineGames, "report.json"))));
      if (!check.same) problems.push(`games baseline is a different provider: ${check.reason}`);
    }
    games = gameItems(gamesDir, arg("--repeat-games"), baselineGames);
  }

  const items = [...scenes.items, ...games.items];
  const count = (s: string) => items.filter((i) => i.status === s).length;
  const result = {
    schema: "aura3d.prd07.ic0/1",
    row: "07-IC0",
    generatedAt: new Date().toISOString(),
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    sha: process.env.GITHUB_SHA ?? null,
    provider,
    noiseFloor: { scenesDeltaE2000P99: scenes.floor, gamesDeltaE2000P99: games.floor, source: "pairwise flag-off repeat in this run" },
    counts: { scenes: scenes.items.length, gameShots: games.items.length, pass: count("pass"), fail: count("fail"), missing: count("missing"), unmeasured: count("noise-floor-unmeasured") },
    verdict: problems.length === 0 && items.length > 0 && items.every((i) => i.status === "pass") ? "pass" : count("fail") > 0 || problems.length > 0 ? "fail" : "pending",
    problems,
    items
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 2));
  for (const p of problems) console.error(`::error::07-IC0 ${p}`);
  for (const i of items.filter((x) => x.status === "fail")) console.error(`::error::07-IC0 ${i.kind} ${i.id} ΔE2000 p99 ${i.p99?.toFixed(3)} > noise floor`);
  console.log(`07-IC0 verdict=${result.verdict} ${JSON.stringify(result.counts)} floors=${JSON.stringify(result.noiseFloor)}`);
  const hardFail = problems.length > 0 || count("fail") > 0;
  process.exit(hardFail || (strict && result.verdict !== "pass") ? 1 : 0);
}

main();
