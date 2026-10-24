import { countLoc, countTokens, editsToGreen } from "./metrics.mjs";

/** Deterministic probe checks per task, from the remote browser result. Returns { items, passed, total }. */
export function probeChecks(task, remote) {
  const p = remote?.probes ?? {};
  const rendered = Boolean(remote?.build?.ok && !remote?.readyTimeout && remote?.probes && p.blank === false && !(remote?.page?.pageErrors?.length > 0));
  const items = { builds: Boolean(remote?.build?.ok), rendersNonBlank: rendered, noPageErrors: !(remote?.page?.pageErrors?.length > 0) };
  // orbitResponds is recorded in the raw probes but not scored: with an auto-rotating subject the frame-diff/silhouette check is not reliable (the same code scored differently across passes); the model judge decides the orbit item from source.
  if (task === 1) Object.assign(items, { rotates: p.animated === true });
  if (task === 2) Object.assign(items, { animated: p.animated === true, instanced: (p.gl?.maxInstances ?? 0) >= 2000 || (p.gl?.draws ?? 0) >= 10000 });
  if (task === 3) Object.assign(items, { animated: p.animated === true, clipSwitchWorks: p.clipSwitchWorks === true });
  if (task === 4)
    Object.assign(items, {
      hasState: p.hasState === true,
      hudIds: p.hudIds === true,
      stepAdvancesTime: p.stepAdvancesTime === true,
      pauseFreezes: p.pauseFreezes === true,
      restartResets: p.restartResets === true,
      roundEndsAt30: p.roundEndsAt30 === true,
      hudFollowsState: p.hudFollowsState === true
    });
  if (task === 5) Object.assign(items, { animated: p.animated === true });
  if (task === 6)
    Object.assign(items, {
      hasState: p.hasState === true,
      replayDeterministic: p.replayDeterministic === true,
      pauseButton: p.pauseButton === true,
      mobileNoHScroll: p.mobile?.noHorizontalScroll === true
    });
  if (task === 7) Object.assign(items, { animated: p.animated === true });
  const values = Object.values(items);
  return { items, passed: values.filter(Boolean).length, total: values.length };
}

const rendered = (r) => Boolean(r?.build?.ok && !r?.readyTimeout && r?.probes && r.probes.blank === false && !(r?.page?.pageErrors?.length > 0));

export function computeRunMetrics({ run, remoteDraft, remoteFinal, sources = {}, judge = null }) {
  const events = run.events ?? [];
  const e2g = editsToGreen(events);
  const srcText = Object.entries(sources)
    .filter(([name]) => name.startsWith("src/"))
    .map(([, text]) => text)
    .join("\n");
  const tok = countTokens(srcText);
  const draft = run.draftIsFinal || remoteDraft?.draftAliasesFinal ? remoteFinal : (remoteDraft ?? remoteFinal);
  const probes = probeChecks(run.task, remoteFinal);
  const reads = events.filter((e) => e.type === "read").length;
  const metrics = {
    runId: run.runId,
    arm: run.arm,
    task: run.task,
    valid: !run.invalid,
    invalidReason: run.invalidReason ?? null,
    endReason: run.endReason,
    hitTurnCap: run.endReason === "max_turns",
    firstTryTypecheck: run.firstTryTypecheck ?? null,
    finalTypecheck: run.finalTypecheckPass ?? null,
    typechecked: e2g.typechecked,
    editsToGreen: e2g.editsToGreen,
    firstTryBuild: draft ? Boolean(draft.build?.ok) : null,
    firstTryRender: draft ? rendered(draft) : null,
    finalBuild: remoteFinal ? Boolean(remoteFinal.build?.ok) : null,
    finalRender: remoteFinal ? rendered(remoteFinal) : null,
    readyTimeout: remoteFinal?.readyTimeout === true,
    captureFailed: Boolean(remoteFinal?.build?.ok && !remoteFinal?.readyTimeout && !remoteFinal?.probes),
    probeItems: probes.items,
    probePassFraction: remoteFinal ? probes.passed / probes.total : null,
    turns: run.usage?.turns ?? null,
    agentWallSec: run.wallMs == null ? null : Math.round(run.wallMs / 100) / 10,
    tokensIn: run.usage?.input ?? null,
    tokensOut: run.usage?.output ?? null,
    docsFilesOpened: (run.docsOpened ?? []).length,
    typesFilesOpened: (run.typesOpened ?? []).length,
    readCalls: reads,
    searchCalls: events.filter((e) => e.type === "search").length,
    writeCalls: events.filter((e) => e.type === "write").length,
    srcLines: countLoc(srcText),
    srcTokens: tok.tokens,
    srcTokensEstimated: tok.estimate,
    bundleRawKB: remoteFinal?.bundle?.rawKB ?? null,
    bundleGzipKB: remoteFinal?.bundle?.gzipKB ?? null,
    readyMs: remoteFinal?.readyMs ?? null,
    consoleErrors: remoteFinal?.page?.consoleErrorCount ?? null,
    docsSha256: run.docs?.sha256 ?? null
  };
  if (judge) {
    const items = judge.checklist ?? [];
    Object.assign(metrics, {
      checklistPassFraction: items.length ? items.filter((c) => c.pass).length / items.length : null,
      silentNoOps: judge.silentNoOps?.length ?? null,
      glueLines: judge.glue?.glueLines ?? null,
      judged: true
    });
  } else {
    Object.assign(metrics, { checklistPassFraction: null, silentNoOps: null, glueLines: null, judged: false });
  }
  return metrics;
}
