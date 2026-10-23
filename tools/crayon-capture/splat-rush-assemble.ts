#!/usr/bin/env tsx
/**
 * tools/crayon-capture/splat-rush-assemble: turn ACR run logs of `splat-rush.ts` into
 * `evidence/crayon-capture/splat-rush-reference.json`. Exits non-zero and writes nothing unless the report
 * validates (finished trace, parseable script, >= 2 independent sessions that reproduce the reference).
 *
 *   tsx tools/crayon-capture/splat-rush-assemble.ts --log runA.log --log runB.log \
 *     --probe evidence/crayon-probes/splat-rush.json --out evidence/crayon-capture/splat-rush-reference.json \
 *     [--fixture tests/browser/data/splat-rush-reference-replay.json]
 */
import fs from "node:fs";
import path from "node:path";
import {
  SPLAT_RUSH_CAPTURE_SCHEMA,
  TRACE_FIELDS,
  compareTraces,
  deriveEvents,
  deriveTolerance,
  validateReport,
  type CaptureReport,
  type SessionReport,
  type TraceDelta
} from "./splat-rush-lib";

interface SessionFile {
  runId: string;
  seed: number;
  steps: number;
  warmup: number;
  viewport: { width: number; height: number };
  params: Record<string, unknown>;
  capturedAt: string;
  session: SessionReport;
  extra: { gateLog?: unknown[]; hud?: Record<string, unknown>[]; rowsPassed?: number };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const args = (name: string): string[] => process.argv.flatMap((a, i, all) => (a === name ? [all[i + 1] as string] : []));

/** Reassemble `@@SPLAT_CHUNK <id> <i> <n> <b64>` lines (ACR truncates long log lines) into session files. */
export function parseChunkedLog(text: string): SessionFile[] {
  // The container runtime can inject a stderr progress line into the middle of a long stdout line, leaving
  // `<chunk head>[splat-rush] ...\n<chunk tail>`; splice the two halves back together.
  text = text.replace(/(@@SPLAT_CHUNK \S+ \d+ \d+ [A-Za-z0-9+/=]*)\[splat-rush\][^\n]*\n([A-Za-z0-9+/=]+)(?=\n)/g, "$1$2");
  const parts = new Map<string, { n: number; chunks: Map<number, string> }>();
  for (const line of text.split("\n")) {
    const m = /@@SPLAT_CHUNK (\S+) (\d+) (\d+) ([A-Za-z0-9+/=]+)/.exec(line);
    if (!m) continue;
    const entry = parts.get(m[1] as string) ?? { n: Number(m[3]), chunks: new Map<number, string>() };
    entry.chunks.set(Number(m[2]), m[4] as string);
    parts.set(m[1] as string, entry);
  }
  const out: SessionFile[] = [];
  for (const [id, { n, chunks }] of parts) {
    if (chunks.size !== n) {
      process.stderr.write(`splat-rush-assemble: session ${id} incomplete (${chunks.size}/${n} chunks); skipped\n`);
      continue;
    }
    const b64 = Array.from({ length: n }, (_, i) => chunks.get(i) as string).join("");
    out.push(JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as SessionFile);
  }
  return out;
}

function main(): void {
  const logs = args("--log");
  const outPath = path.resolve(arg("--out") ?? "evidence/crayon-capture/splat-rush-reference.json");
  const probePath = arg("--probe");
  const sessions = logs.flatMap((l) => parseChunkedLog(fs.readFileSync(path.resolve(l), "utf8")));
  if (sessions.length === 0) throw new Error("no sessions found in the supplied logs");
  const refKind = (arg("--reference-kind") ?? "input") as "input" | "idle";
  const reference = sessions.find((s) => s.session.kind === refKind && s.session.ok);
  if (!reference) throw new Error(`no successful ${refKind} session to use as the reference`);
  const ref = reference.session;

  const deltas: TraceDelta[] = [];
  const sessionRows = sessions.map((s) => {
    const x = s.session;
    const isRef = s === reference;
    const exactScript = x.scriptRepr === ref.scriptRepr;
    const comparable = refKind === "idle" ? x.kind === "idle" : x.kind !== "idle";
    const delta = !isRef && comparable && x.ok ? compareTraces(ref.trace, x.trace) : null;
    if (delta) deltas.push(delta);
    return {
      id: x.id,
      kind: x.kind,
      runId: s.runId,
      ok: x.ok && (isRef || (comparable ? (delta?.exact ?? false) || x.kind === "input" : true)),
      error: x.error ?? null,
      reference: isRef,
      preGameDraws: x.preGameDraws,
      endPhase: x.endPhase,
      endScore: x.endScore,
      endLives: x.endLives,
      scriptEqualsReference: exactScript,
      traceEqualsReference: isRef ? true : delta ? delta.exact : null,
      firstDivergence: delta ? delta.firstDivergence : null
    };
  });

  const idle = refKind === "idle" ? undefined : sessions.find((s) => s.session.kind === "idle");
  const inputEffect = idle ? ref.trace.filter((row, i) => (idle.session.trace[i] ? row.some((v, c) => v !== (idle.session.trace[i] as number[])[c]) : true)).length : null;
  const probe = probePath ? (JSON.parse(fs.readFileSync(path.resolve(probePath), "utf8")) as { liveObjects?: { sceneTraversal?: Record<string, unknown> } }) : null;
  const events = deriveEvents(ref.trace);

  const report: CaptureReport = {
    schema: SPLAT_RUSH_CAPTURE_SCHEMA,
    game: "splat-rush",
    capturedAt: reference.capturedAt,
    url: "https://app.usecrayon.ai/play/e53a6e07-a4a1-465e-b546-0fb6c9b787c0",
    setup: {
      seed: reference.seed,
      warmupSteps: reference.warmup,
      scriptedSteps: reference.steps,
      viewport: reference.viewport,
      policy: reference.params,
      preGameDraws: ref.preGameDraws,
      stepSeconds: 1 / 60,
      gameStreamOnly: true,
      audioDisabled: true,
      config: "tests/fixtures/crayon/splat-rush/game-module.formatted.js (CONFIG object)",
      engineSurfaces: probe?.liveObjects?.sceneTraversal ?? null
    },
    script: ref.scriptRepr,
    traceFields: TRACE_FIELDS,
    reference: { trace: ref.trace, events: events as unknown as Record<string, unknown>[], gates: reference.extra.gateLog ?? [], hud: reference.extra.hud ?? [] },
    sessions: sessionRows,
    variance: {
      sessionsCompared: deltas.length,
      allBitIdentical: deltas.length > 0 && deltas.every((d) => d.exact),
      maxAbsPerField: Object.fromEntries(TRACE_FIELDS.map((f) => [f, Math.max(0, ...deltas.map((d) => d.maxAbs[f] ?? 0))])),
      idleControl: idle ? { endPhase: idle.session.endPhase, endScore: idle.session.endScore, endLives: idle.session.endLives, inputEffectRows: inputEffect } : null
    },
    tolerance: deriveTolerance(deltas),
    limitations: [
      "Audio is disabled in the capture (AudioContext removed): the original draws a 0.4 s noise buffer from Math.random on the first noise sound effect, a count that depends on the sample rate.",
      "The game stream is the draws made from the game's own module; three.js UUID draws and boot-runtime draws use a separate stream and are not modelled.",
      "Pixels are not captured: the virtual-time loop is stepped by the harness, so the reference is state and event parity, not image parity.",
      "The closed-loop steering policy produced the input script; replaying the script (not the policy) is the contract."
    ]
  };
  validateReport(report);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report)}\n`);
  const fixturePath = arg("--fixture");
  if (fixturePath) {
    // compact replay fixture for the remote browser spec (evidence/ is not part of the remote build context)
    fs.mkdirSync(path.dirname(path.resolve(fixturePath)), { recursive: true });
    fs.writeFileSync(path.resolve(fixturePath), `${JSON.stringify({ seed: reference.seed, warmup: reference.warmup, script: ref.scriptRepr, columns: TRACE_FIELDS, trace: ref.trace })}\n`);
  }
  process.stdout.write(`wrote ${outPath}: ${ref.trace.length} rows, ${events.length} events, ${sessions.length} sessions, tolerance ${report.tolerance}\n`);
}

if (process.argv[1] && /splat-rush-assemble\.[cm]?[jt]s$/.test(process.argv[1])) main();
