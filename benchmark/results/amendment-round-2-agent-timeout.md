# PRD Amendment: Round 2 Agent Timeout

Status: approved by `gchahal1982`, 2026-05-30.

This document records an additional Round 2 runner rule required before the
full Round 2 benchmark starts.

## Reason

During the first attempted Round 2 `codex-aura3d` run, prompt 02 generated
source successfully but left a Vite dev server running under the agent process.
That repeated the Round 1 nontermination failure mode and showed that the
runner still depended on manual intervention to finish an otherwise complete
prompt attempt.

Manual process cleanup is not acceptable benchmark evidence. The runner must
record nontermination itself.

## Files Changed

- `benchmark/runs/round-2/_tools/run-agent.mjs`
- `benchmark/results/amendment-round-2-agent-timeout.md`
- `benchmark/results/round-2-phase-a-signoff.md`

## Prior Result Invalidated

No completed Round 2 result exists yet.

The partial local Round 2 attempt that started before this amendment is void
and must not be scored. Round 2 must restart from clean prepared run
directories after this amendment commit.

Round 1 remains the signed failed result and must not be used to ship Aura3D as
a proven Three.js competitor.

## Standard Change

Each agent prompt run has a benchmark timeout of 20 minutes by default.

The timeout can be overridden only by setting `AURA3D_AGENT_TIMEOUT_MS` before
starting a benchmark run, and any override must be recorded in the run
artifacts.

If the timeout is reached, the runner terminates the agent process group and
records:

- `agentTimeoutMs`
- `agentTimedOut: true`
- `agentExitCode: 124`

The prompt remains a failed/noncompliant attempt for that agent/library pair.

## User Approval

`gchahal1982`, 2026-05-30. I approve adding the Round 2 agent timeout rule
recorded in this amendment. I confirm that the partial local Round 2 attempt
before this amendment is void and that Round 2 must restart from clean prepared
run directories after this amendment commit.
