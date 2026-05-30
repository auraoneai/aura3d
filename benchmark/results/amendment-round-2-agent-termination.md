# PRD Amendment: Round 2 Agent Termination Instruction

Status: approved by `gchahal1982`, 2026-05-30.

This document records a Round 2 runner instruction change made before any
completed Round 2 benchmark result exists.

## Reason

The first clean Round 2 prompt attempt after the timeout amendment immediately
showed the same nontermination pattern seen in Round 1: the agent started a
Vite dev server and stayed attached to it. The timeout rule records that
failure, but the direct benchmark instruction also needs to state the expected
process behavior plainly so compliant agents can finish without relying on a
timeout.

## Files Changed

- `benchmark/runs/round-2/_tools/setup-round.mjs`
- `benchmark/results/amendment-round-2-agent-termination.md`
- `benchmark/results/round-2-phase-a-signoff.md`

## Prior Result Invalidated

No completed Round 2 result exists yet.

The partial local Round 2 attempts before this amendment are void and must not
be scored. Round 2 must restart from clean prepared run directories after this
amendment commit.

Round 1 remains the signed failed result and must not be used to ship Aura3D as
a proven Three.js competitor.

## Standard Change

Every generated prompt instruction now includes this benchmark process rule:

```text
Benchmark process rule: do not leave a long-running dev server attached to
your agent process. You may run finite commands such as npm install, npm run
typecheck, and npm run build. If you start npm run dev or another server for
manual verification, stop it before your final response.
```

This does not change any prompt requirement, scoring rubric, library context,
or allowed asset rule. It only makes the process-compliance expectation
explicit.

## User Approval

`gchahal1982`, 2026-05-30. I approve adding the Round 2 agent termination
instruction recorded in this amendment. I confirm that the partial local Round
2 attempts before this amendment are void and that Round 2 must restart from
clean prepared run directories after this amendment commit.
