# Final Proof And Release Readiness

Version: 1.0.0

This is the release-operator inventory for the `FinalizedPromptPlan.md`
standard. It does not weaken the benchmark. Internal verification commands are
regression evidence only; they cannot replace the neutral Aura3D versus raw
Three.js benchmark.

## Current State

- Latest complete prompt benchmark result: `benchmark/results/round-7.md`.
- Latest complete engine result: `benchmark/results/round-7-engine.md`.
- Latest complete decision: `benchmark/results/round-7-decision.md`.
- Round 7 decision: do not ship as a proven Three.js competitor.
- Round 8 status: Phase A sign-off exists in
  `benchmark/results/round-8-phase-a-signoff.md`; no completed Round 8 result
  file is present.
- Release state: not go-live ready until a later full round passes and is
  signed.

## Final Proof Pipeline

Run this pipeline from a clean commit after any benchmark-standard amendments
are committed and signed.

1. Confirm the benchmark standard.
   - `FinalizedPromptPlan.md` is unchanged during the run.
   - `benchmark/prompts/manifest.md`, `benchmark/rubric.md`, and
     `benchmark/protocol.md` are frozen for the round.
   - The round has a committed Phase A sign-off from `gchahal1982`.

2. Verify context bundles.

   ```bash
   cd benchmark/context/aura3d/files
   shasum -a 256 -c ../manifest.sha256

   cd ../../threejs/files
   shasum -a 256 -c ../manifest.sha256
   ```

3. Run the four prompt sides from clean directories according to
   `benchmark/runner/README.md`.
   - Codex + Aura3D context.
   - Codex + raw Three.js context.
   - Claude Code + Aura3D context.
   - Claude Code + raw Three.js context.
   - Store artifacts under `benchmark/runs/round-N/` using
     `benchmark/runs/README.md`.

4. Run the engine parity benchmark according to `benchmark/engine/README.md`.
   - Build each of the five reference scenes in Aura3D and raw Three.js.
   - Capture screenshots, route health, first usable render time, calibrated
     FPS, p95 frame time, draw calls, triangle count, JS heap, bundle gzip
     bytes, source LOC, and neutral visual parity.

5. Hand off scoring to neutral scorers.
   - Codex outputs cannot be scored by Codex.
   - Claude Code outputs cannot be scored by Claude Code.
   - In-repo tools cannot score visual quality, modifiability, prompt wins, or
     release readiness.
   - Scorers receive only the prompt, screenshot, generated code listing,
     `metrics.json`, and `notes.md`.
   - Scorers must not receive context bundles, product claims, prior evidence
     reports, or hints about expected winners.

6. Commit final result artifacts.
   - `benchmark/results/round-N.md`
   - `benchmark/results/round-N-engine.md`
   - `benchmark/results/round-N-decision.md`
   - Neutral scorer outputs under `benchmark/scoring/round-N-scores/`
   - Prompt and engine run artifacts under `benchmark/runs/round-N/`

7. Check pass criteria before any release claim.
   - Aura3D wins at least 7 of 10 prompts for Codex.
   - Aura3D wins at least 7 of 10 prompts for Claude Code.
   - Each agent has at least 2 Aura3D wins among prompts 7, 8, and 10.
   - Aura3D has at least 4 visual-quality scores of 4 or higher for each
     agent.
   - Aura3D has no visual-quality score below 3.
   - Engine parity passes every threshold in `benchmark/engine/README.md`.
   - The decision file says `ship`.

## Regression Verification Commands

These commands support release confidence after code fixes. They are not
benchmark proof.

Focused commands from the current Round 8 sign-off and amendments:

```bash
pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=default
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
pnpm build
pnpm run check:agent-docs
pnpm run check:agent-api
pnpm run check:public-api
git diff --check
```

General package and release verification inventory:

```bash
pnpm install
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:browser
pnpm build
pnpm verify:api-docs -- --write
pnpm verify:package-install-smoke:fresh
pnpm verify:package-provenance
pnpm verify:release:quick
pnpm verify:release
pnpm verify:release:repeat
```

Use `pnpm test:integration` when integration behavior changed and
`pnpm test:browser` when browser routes, rendering, screenshots, or deployment
behavior changed. Use `pnpm verify:api-docs -- --write` after export or public
API changes.

## Release Notes Requirement

The 1.0.0 release notes must explicitly cite the passing benchmark result and
link to the passing result file:

```text
benchmark/results/round-N.md
benchmark/results/round-N-engine.md
benchmark/results/round-N-decision.md
```

Do not cite Round 7 or any earlier failed round as shipping evidence. Do not
cite local smoke screenshots, generated internal reports, `pnpm verify:release`,
or aggregate test counts as proof that Aura3D beats raw Three.js.

## Go-Live Checklist

- [ ] Passing full prompt benchmark result exists and is committed.
- [ ] Passing full engine parity result exists and is committed.
- [ ] `benchmark/results/round-N-decision.md` says `ship`.
- [ ] Neutral scorer signatures are committed under
      `benchmark/scoring/round-N-scores/`.
- [ ] `gchahal1982` user signature is present in all final result files.
- [ ] Release notes cite the passing round result files by path.
- [ ] Regression verification commands above have passed for the final commit.
- [ ] `docs/project/release-artifacts.json` references the final package
      artifact, version, path or URL, SHA-256, and creation time.
- [ ] Public copy does not claim benchmark success beyond the committed passing
      result.
