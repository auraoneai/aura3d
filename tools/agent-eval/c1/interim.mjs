#!/usr/bin/env node
// C1 interim results while a batch is still running (owner request, 2026-11-09). Loop: score every finished run that
// has no score yet (score.mjs --only, one at a time, so its CDP/HTTP ports never collide), and when a task replicate has
// all three arms scored, append its rows to tests/reports/benchmark-c1/INTERIM.md, commit and push. Prints one line per
// appended replicate ("INTERIM ...") and per completed task ("TASKDONE ..."), with running medians per arm.
// Interim fps/load numbers are measured while agent runs are still going; the final report rescores every run serially.
//   node tools/agent-eval/c1/interim.mjs <batch> [--until-runs 72] [--no-git]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { median } from "../lib/metrics.mjs";
import { C1_DIR, loadTasks } from "./run-c1.mjs";

const REPO = resolve(C1_DIR, "..", "..", "..");
const ARMS = ["aura", "three", "bridge"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const k = (v) => (v == null ? "-" : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : `${Math.round(v / 1000)}K`);

const [batch, ...rest] = process.argv.slice(2);
const untilRuns = Number(rest.includes("--until-runs") ? rest[rest.indexOf("--until-runs") + 1] : 72);
const git = !rest.includes("--no-git");
const batchDir = resolve(REPO, "evidence/agent-eval-c1", batch);
const outFile = join(REPO, "tests/reports/benchmark-c1/INTERIM.md");
const tasks = loadTasks();
const byId = Object.fromEntries(tasks.tasks.map((t) => [t.id, t]));
const branch = "exp/551-c1bench";

const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d);
function finishedRuns() {
  const dir = join(batchDir, "runs");
  if (!existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).filter((id) => existsSync(join(dir, id, "run.json"))).map((id) => [id, readJson(join(dir, id, "run.json"))]));
}

function row(run, sc) {
  const t = byId[run.task];
  const ph = sc?.phases ?? {};
  const pm = ph.main?.probes?.[t.probe];
  const pf = ph.followup?.probes?.[t.followUp.probe];
  const main = run.phases?.find((p) => p.name === "main");
  return {
    arm: run.arm,
    invalid: Boolean(run.invalid),
    end: `${run.endReason}/${run.followUpEndReason}`,
    turns: run.usage?.turns ?? null,
    turnsMain: main?.turns ?? null,
    tokensIn: run.usage?.input ?? null,
    tokensOut: run.usage?.output ?? null,
    usd: run.cost?.listUsd ?? null,
    credits: run.cost?.providerCredits ?? null,
    wallSec: run.wallMs == null ? null : Math.round(run.wallMs / 1000),
    build: ph.main?.build?.ok ?? false,
    main: pm ? `${pm.passed}/${pm.total}` : "0 (no probe result)",
    mainAll: Boolean(pm && pm.total && pm.passed === pm.total),
    follow: pf ? `${pf.passed}/${pf.total}` : "0 (no probe result)",
    followAll: Boolean(pf && pf.total && pf.passed === pf.total),
    frames: [1, 2].map((n) => `evidence/agent-eval-c1/${batch}/frames/${run.runId}-main-${n}.png`).filter((f) => existsSync(join(REPO, f)))
  };
}

function medians(rows) {
  return Object.fromEntries(
    ARMS.map((a) => {
      const rs = rows.filter((r) => r.arm === a && !r.invalid);
      const m = (key) => median(rs.map((r) => r[key]).filter((v) => typeof v === "number"));
      return [a, { n: rs.length, turns: m("turns"), turnsMain: m("turnsMain"), tokensIn: m("tokensIn"), tokensOut: m("tokensOut"), usd: m("usd"), mainAll: rs.length ? rs.filter((r) => r.mainAll).length / rs.length : null, followAll: rs.length ? rs.filter((r) => r.followAll).length / rs.length : null }];
    })
  );
}
const medLine = (m) => ARMS.map((a) => `${a} n=${m[a].n} turns ${m[a].turns ?? "-"} (task ${m[a].turnsMain ?? "-"}) in ${k(m[a].tokensIn)} out ${k(m[a].tokensOut)} $${m[a].usd?.toFixed(2) ?? "-"} main-all ${m[a].mainAll == null ? "-" : Math.round(m[a].mainAll * 100)}% fu-all ${m[a].followAll == null ? "-" : Math.round(m[a].followAll * 100)}%`).join(" | ");

function header() {
  return [
    "# Benchmark C1: interim results (appended while the batch runs)",
    "",
    `Batch \`${batch}\`. One section per task replicate once all three arms (aura = Aura3D 5.5.1 native, three = three.js 0.185.1, bridge = three.js content via \`aura3d import-three\` + native behaviour) have finished and been scored. Turns and tokens cover the task plus the follow-up edit. Cost is list price (Prism reports Kiro credits only, and no cache fields, so every input token is priced uncached). Checks = scripted probe checks passed on the real-GPU build (main / follow-up). Frames: two main-phase frames 3 s apart. These are preliminary: blind visual judging, the checklist judge and the final rescore (fps and load measured with no agent runs going) come in \`REPORT.md\`. Spec: \`SPEC.md\` (frozen).`,
    ""
  ].join("\n");
}

async function main() {
  const done = new Set();
  const tasksDone = new Set();
  if (existsSync(outFile)) for (const m of readFileSync(outFile, "utf8").matchAll(/^## Task (\d+) \S+ replicate (\d+)/gm)) done.add(`${m[1]}-${m[2]}`);
  for (;;) {
    const runs = finishedRuns();
    const score = readJson(join(batchDir, "c1-score.json"), {});
    const unscored = Object.keys(runs).filter((id) => !score[id] && !runs[id].invalid).sort();
    for (const id of unscored) spawnSync(process.execPath, [join(C1_DIR, "score.mjs"), batch, "--only", id], { stdio: ["ignore", "ignore", "inherit"], env: process.env });
    const scored = readJson(join(batchDir, "c1-score.json"), {});
    const all = Object.values(runs);
    const rowsAll = all.filter((r) => scored[r.runId] || r.invalid).map((r) => ({ ...row(r, scored[r.runId]), task: r.task, idx: r.idx }));
    let appended = false;
    for (const t of tasks.tasks) {
      for (const idx of [1, 2, 3]) {
        const key = `${t.id}-${idx}`;
        if (done.has(key)) continue;
        const reps = ARMS.map((a) => all.find((r) => r.task === t.id && r.idx === idx && r.arm === a));
        if (reps.some((r) => !r || (!r.invalid && !scored[r.runId]))) continue;
        const rs = reps.map((r) => row(r, scored[r.runId]));
        const L = [`## Task ${t.id} ${t.slug} replicate ${idx} (${t.coverage})`, "", "| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |", "|---|---|---|---|---|---|---|---|---|---|---|---|"];
        for (const r of rs) L.push(`| ${r.arm} | ${r.invalid ? "invalid (infra)" : r.end} | ${r.turns ?? "-"} (${r.turnsMain ?? "-"}) | ${k(r.tokensIn)} | ${k(r.tokensOut)} | ${r.wallSec ?? "-"} | ${r.usd?.toFixed(2) ?? "-"} | ${r.credits?.toFixed(1) ?? "-"} | ${r.build ? "yes" : "no"} | ${r.main} | ${r.follow} | ${r.frames.map((f, i) => `[${i + 1}](../../../${f})`).join(" ") || "none"} |`);
        const m = medians(rowsAll.filter((x) => done.has(`${x.task}-${x.idx}`) || (x.task === t.id && x.idx === idx)));
        L.push("", `Running medians over the ${done.size + 1} complete replicate(s) so far: ${medLine(m)}`, "");
        writeFileSync(outFile, `${existsSync(outFile) ? readFileSync(outFile, "utf8") : header()}\n${L.join("\n")}`);
        done.add(key);
        appended = true;
        console.log(`INTERIM t${t.id} r${idx}: ${rs.map((r) => `${r.arm} ${r.turns}t $${r.usd?.toFixed(2)} main ${r.main} fu ${r.follow}`).join("; ")} || running: ${medLine(m)}`);
      }
      if (!tasksDone.has(t.id) && [1, 2, 3].every((i) => done.has(`${t.id}-${i}`))) {
        tasksDone.add(t.id);
        console.log(`TASKDONE t${t.id} (${tasksDone.size}/8 tasks) running medians: ${medLine(medians(rowsAll.filter((x) => done.has(`${x.task}-${x.idx}`))))}`);
      }
    }
    if (appended && git) {
      try {
        execFileSync("git", ["add", outFile, join(batchDir, "runs"), join(batchDir, "frames"), join(batchDir, "c1-score.json")], { cwd: REPO, stdio: "ignore" });
        execFileSync("git", ["commit", "-q", "-m", `agent-eval C1 interim: ${done.size} task replicate(s) complete in ${batch}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`], { cwd: REPO, stdio: "ignore" });
        execFileSync("git", ["push", "-q", "-o", "ci.skip", "origin", `${branch}:refs/heads/${branch}`], { cwd: REPO, stdio: "ignore" });
      } catch (error) {
        console.log(`GITFAIL ${String(error.message).slice(0, 200)}`);
      }
    }
    const runsNow = Object.keys(finishedRuns()).length;
    if (done.size >= 24 || runsNow >= untilRuns && !Object.keys(finishedRuns()).some((id) => !readJson(join(batchDir, "c1-score.json"), {})[id] && !finishedRuns()[id].invalid)) {
      console.log(`INTERIM-END ${done.size}/24 replicates`);
      return;
    }
    await sleep(30000);
  }
}

main().catch((e) => {
  console.log(`INTERIM-ERROR ${e.stack ?? e}`);
  process.exit(1);
});
