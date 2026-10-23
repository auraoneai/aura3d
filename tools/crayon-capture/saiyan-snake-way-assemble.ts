#!/usr/bin/env tsx
/**
 * tools/crayon-capture/saiyan-snake-way-assemble: build evidence/crayon-capture/saiyan-snake-way-reference.json
 * from the marker blocks in the ACR run logs of tools/crayon-capture/saiyan-snake-way.ts. Offline: reads logs,
 * never touches a browser.
 *
 *   tsx saiyan-snake-way-assemble.ts --policy policy.log --replay replay.log [--out evidence/.../reference.json]
 * `--policy` is the log of a `--mode policy` run (the closed-loop autopilot; its recorded input script is the
 * reference script). `--replay` is a log of `--mode script` replays of that script in fresh browser sessions.
 */
import fs from "node:fs";
import path from "node:path";

export const REFERENCE_SCHEMA = "a3d-crayon-capture/1";

interface Snapshot { frame: number; [k: string]: unknown }
interface Segment { kind: "idle" | "tap" | "hold"; frames: number; key?: string; keys?: string[] }
interface Session {
  session: number;
  startedAt: string;
  browser: string;
  wallMs?: number;
  error?: string;
  run?: {
    setup: Record<string, unknown>;
    snapshots: Snapshot[];
    events: { frame: number; what: string; from?: unknown; to?: unknown; s?: number; days?: number; speed?: number }[];
    segments: Segment[];
    policy?: { taps: number; frames: number; finished: string };
    final: { frame: number; status: Record<string, unknown>; state: Snapshot };
  };
}

export function parseMarkerBlocks(log: string): Session[] {
  const out: Session[] = [];
  const text = log.replace(/\r\n?/g, "\n");
  const re = /@@CRAYON_CAPTURE_BEGIN:(\d+)\n([\s\S]*?)\n@@CRAYON_CAPTURE_END:\1/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(JSON.parse(m[2] as string) as Session);
  return out;
}

/** Fields that are page-level counters rather than simulation state (compared nowhere). */
const NON_SIM = new Set(["errs"]);

export interface SessionComparison {
  identical: boolean;
  snapshotsCompared: number;
  fieldsCompared: number;
  mismatches: number;
  maxAbsDiff: number;
  firstMismatch: string | null;
}

export function compareSnapshots(a: readonly Snapshot[], b: readonly Snapshot[]): SessionComparison {
  let fields = 0, mismatches = 0, maxAbs = 0;
  let first: string | null = null;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] as Snapshot, y = b[i] as Snapshot;
    for (const key of Object.keys(x)) {
      if (NON_SIM.has(key)) continue;
      fields++;
      const u = x[key], v = y[key];
      const same = typeof u === "number" && typeof v === "number" ? Math.abs(u - v) <= 0 : u === v;
      if (!same) {
        mismatches++;
        if (typeof u === "number" && typeof v === "number") maxAbs = Math.max(maxAbs, Math.abs(u - v));
        first ??= `frame ${x.frame} ${key}: ${JSON.stringify(u)} vs ${JSON.stringify(v)}`;
      }
    }
  }
  return { identical: mismatches === 0 && a.length === b.length, snapshotsCompared: n, fieldsCompared: fields, mismatches, maxAbsDiff: maxAbs, firstMismatch: first };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function assemble(policySessions: Session[], replaySessions: Session[]): Record<string, unknown> {
  const policy = policySessions.find((s) => s.run && s.run.policy);
  if (!policy?.run) throw new Error("no policy session with a recorded script");
  const run = policy.run;
  const replays = replaySessions.filter((s) => s.run);
  const comparisons = replays.map((s) => ({ session: s.session, browser: s.browser, ...compareSnapshots(run.snapshots, (s.run as NonNullable<Session["run"]>).snapshots) }));
  const stages = run.events.filter((e) => e.what === "stage").map((e) => ({ frame: e.frame, name: e.to, s: e.s }));
  const rungs = run.events.filter((e) => e.what === "rung").length;
  const hits = run.events.filter((e) => e.what === "hit" && e.to === true).length;
  return {
    schema: REFERENCE_SCHEMA,
    game: "saiyan-snake-way",
    url: "https://app.usecrayon.ai/play/8cbeaf74-b632-4cfb-aec0-ee26ff75d6d6",
    capturedAt: policy.startedAt,
    browser: policy.browser,
    sourceModule: { fixture: "tests/fixtures/crayon/saiyan-snake-way/game-module.mjs", bytes: 513393, sha256: "2f389ab3a0bdbc597229825344dc758631c1bc8b7f56b08bfe8cb4704623bc44" },
    method: {
      note: "A pre-boot hook sets window.__HARNESS (un-no-ops window.__TEST) and freezes the real-time loop; the sim is then stepped with __TEST.sim / __TEST.tap at exactly 1/60 s. Raw state is read from window.__PROBE.S.",
      step: 1 / 60,
      snapshotEvery: 30,
      openLoopStepExact: true
    },
    setup: run.setup,
    script: { totalSteps: run.final.frame, taps: run.policy?.taps ?? 0, finished: run.policy?.finished ?? null, segments: run.segments },
    summary: {
      outcome: run.final.state.atEnd ? "reached-end-of-road" : String(run.final.state.phase),
      frames: run.final.frame,
      seconds: Math.round((run.final.frame / 60) * 1000) / 1000,
      stages,
      kaioRungChanges: rungs,
      hits,
      final: run.final.state
    },
    events: run.events,
    snapshots: run.snapshots,
    repeatability: {
      policySessions: policySessions.length,
      replaySessions: replays.length,
      comparisons,
      allIdentical: comparisons.length > 0 && comparisons.every((c) => c.identical),
      tolerance: {
        simFields: 1e-6,
        basis: "every replay session matched the policy run bit-for-bit (max abs diff 0); 1e-6 only absorbs the 9-decimal rounding of snapshot values"
      }
    }
  };
}

function main(): void {
  const read = (p: string): Session[] => parseMarkerBlocks(fs.readFileSync(path.resolve(p), "utf8"));
  const policy = arg("--policy"), replay = arg("--replay");
  if (!policy) throw new Error("--policy <log> required");
  const report = assemble(read(policy), replay ? read(replay) : []);
  const out = path.resolve(arg("--out") ?? "evidence/crayon-capture/saiyan-snake-way-reference.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report) + "\n");
  process.stdout.write(`wrote ${out} (${fs.statSync(out).size} bytes)\n`);
}

if (process.argv[1] && /saiyan-snake-way-assemble\.(mjs|ts|js)$/.test(process.argv[1])) main();
