# PRD Amendment: Round 2 Standard

Status: approved by `gchahal1982`, 2026-05-30.

This document records the standard changes needed before Round 2 can start.

## Required Body

Reason:

Round 1 failed honestly and identified concrete library and benchmark-harness
gaps. Phase D changed the Aura3D agent context bundle to expose the new public
repair helpers, and changed the engine FPS measurement rules to require browser
calibration before FPS can be used as renderer-performance evidence. Those are
standard changes between rounds and must be documented before Round 2 starts.

Files changed:

- `benchmark/context/aura3d/files/README.md`
- `benchmark/context/aura3d/files/llms.txt`
- `benchmark/context/aura3d/files/docs/agents/agent-context.md`
- `benchmark/context/aura3d/files/docs/agents/api-surface.md`
- `benchmark/context/aura3d/files/docs/agents/build-playbook.md`
- `benchmark/context/aura3d/files/docs/agents/templates.md`
- `benchmark/context/aura3d/files/docs/agents/troubleshooting.md`
- `benchmark/context/aura3d/manifest.sha256`
- `benchmark/runner/README.md`
- `benchmark/metrics/README.md`
- `benchmark/engine/README.md`
- `benchmark/runs/README.md`
- `benchmark/runner/fps-calibration.mjs`
- `benchmark/runner/fps-calibration.d.mts`

Prior result invalidated:

- `benchmark/results/round-1.md`
- `benchmark/results/round-1-engine.md`
- `benchmark/results/round-1-decision.md`

Round 1 remains the signed failed result and must not be used to ship Aura3D as
a proven Three.js competitor. The Phase D changes do not retroactively improve
or rescore Round 1. They require a fresh Round 2 run from Phase A.

New benchmark round required: yes

User approval: `gchahal1982`, 2026-05-30. I, gchahal1982, approve the Round 2 standard amendment recorded in benchmark/results/amendment-round-2-standard.md and the Round 2 Phase A sign-off recorded in benchmark/results/round-2-phase-a-signoff.md. I confirm that Round 1 remains failed and invalid for shipping, and I approve a PRD-AMENDMENT commit to start Round 2 from the amended standard.

## Manifest Verification

Current Aura3D context manifest hash:

```text
42258bd06a283a5c28baef0ec4e8914ce76782c78390313f250a2f3be3fd5072  benchmark/context/aura3d/manifest.sha256
```

Verification command:

```bash
cd benchmark/context/aura3d/files
shasum -a 256 -c ../manifest.sha256
```

Result: all files passed locally on 2026-05-30.

## Round 2 Standard Changes

- Aura3D context now documents the Phase D public repair helpers:
  `effects.particles`, `primitives.cylinder`, material presets, `prefabs.*`,
  `scene().addMany`, and procedural animation via `.animate(...)`.
- Engine FPS measurement now requires calibration controls from
  `benchmark/runner/fps-calibration.mjs`.
- If FPS calibration fails, future engine metrics must set `p50Fps` and
  `p95FrameTimeMs` to `null`, set `fpsInstrumentationStatus: "invalid"`, and
  record `fpsInstrumentationFailures`. Invalid FPS measurements cannot be used
  as renderer-quality evidence.

## Activation Rule

Round 2 can start only from the `PRD-AMENDMENT:` commit that includes this
document, the updated Aura3D context manifest, and the Round 2 sign-off in
`benchmark/results/round-2-phase-a-signoff.md`.
