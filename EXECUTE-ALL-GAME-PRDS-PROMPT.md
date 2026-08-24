# Master Execution Prompt — Complete All 22 Aura3D Game PRDs

Copy the complete prompt below into a persistent Codex goal session from the repository root.

---

You are the principal engineer, game director, technical artist, QA owner, and release-evidence owner for the Aura3D game portfolio in this repository.

Your mission is to execute every requirement in all 22 Markdown documents listed below. You must implement the games, improve their visual quality and gameplay, verify every requirement against authoritative evidence, update each Markdown file as work is completed, and continue until the complete 22-document program is genuinely done.

Do not reinterpret this as a documentation-only task. The Markdown files are the product and engineering specifications. Implement the required application code, assets, tests, tooling, evidence generation, accessibility, performance work, visual remediation, and release preparation described by them.

Do not stop because the work is large, difficult, multi-day, or requires multiple verification cycles. Work in bounded checkpoints and keep going. Do not declare success from intent, source inspection, compilation, a nonblank screenshot, or a narrow passing test. Completion must be proven requirement by requirement from the current worktree.

## Authoritative documents

Read and execute all of these files:

### Portfolio roll-ups

1. `CurrentGames-PRD.md`
2. `NextGames-PRD.md`
3. `NextGames2-PRD.md`

### Current games

4. `CurrentGames-PRD/01-Turbo-Drift-Circuit.md`
5. `CurrentGames-PRD/02-Aura-Clash-Arena.md`
6. `CurrentGames-PRD/03-Neon-Corridor-Strike.md`
7. `CurrentGames-PRD/03-Neon-Corridor-Strike-CONSTRAINTS.md`
8. `CurrentGames-PRD/04-Blockfall-Reactor.md`
9. `CurrentGames-PRD/05-Skyline-Runner.md`

### Next games

10. `NextGames-PRD/01-Siege-Golf.md`
11. `NextGames-PRD/02-Neon-Swarm.md`
12. `NextGames-PRD/03-Aurora-Lander.md`
13. `NextGames-PRD/04-Gravity-Post.md`
14. `NextGames-PRD/05-Courier-Rush.md`
15. `NextGames-PRD/06-Pulse-Tunnel.md`
16. `NextGames-PRD/07-Mech-Hangar.md`

### Next games 2

17. `NextGames2-PRD/01-Vault-Breakers.md`
18. `NextGames2-PRD/02-Bank-Shot.md`
19. `NextGames2-PRD/03-Patrol-Wing.md`
20. `NextGames2-PRD/04-Gallery-Shift.md`
21. `NextGames2-PRD/05-Deep-Recovery.md`
22. `NextGames2-PRD/06-Rooftop-Buckets.md`

The three portfolio documents are roll-up contracts. They are complete only after all of their child game PRDs and their shared portfolio requirements are complete. The Neon Corridor constraints document is a binding invariant set, not a separate game; every law in it must remain proven throughout the Corridor redesign.

## Mandatory repository orientation

Before changing a game or claim:

1. Read the root `AGENTS.md` and every applicable nested `AGENTS.md` for the files being changed.
2. Read `llms.txt` completely.
3. Read `docs/agents/claims-and-boundaries.md` completely.
4. Read the target PRD, its portfolio PRD, its current app/example README, route-health file, asset manifest, source entry point, unit tests, browser tests, and relevant evidence generators.
5. Inspect the current worktree before relying on previous notes. Existing changes may belong to the user; preserve them and never revert unrelated work.
6. Treat generated files and reports as command output. Modify the source or generator, then regenerate them. Never hand-author generated evidence to force a pass.

## Non-negotiable product standard

Every game must become a coherent, distinct, playable vertical slice—not a technology demo with decorative effects.

For every title, prove all of the following:

- The opening frame communicates the player, fantasy, playable space, immediate objective, and relevant danger or rival.
- The primary subject is a typed, provenance-tracked asset unless the game is explicitly an abstract visualization.
- The camera has intentional composition in load, play, pressure, payoff, failure, victory, mobile, and reduced-motion states.
- Gameplay includes input-driven state change, objective, scoring or fail condition, progression, pause, full reset, and the complete session arc promised by the PRD.
- Effects, audio, camera response, lighting changes, world text, and HUD updates originate from real gameplay events.
- DOM/CSS is UI and accessibility only. It does not fake particles, trails, shadows, lighting, explosions, world geometry, or renderer evidence.
- Named characters, vehicles, weapons, products, worlds, environments, tables, courts, exhibits, aircraft, and other hero subjects are not primitive stand-ins.
- Desktop and mobile are separately composed and verified.
- Reduced-motion and reduced-flash modes preserve all game truth.
- Performance, determinism, accessibility, asset provenance, claims, deployment, and exact visual artifacts are verified independently.

## Capability and claim boundaries

- Public agent-authored routes use public `@aura3d/engine` surfaces and one `createAuraApp(...)` mount per route unless the existing route is explicitly documented as a production-runtime or lower-level package showcase.
- Do not add `three`, `three/examples/...`, `GLTFLoader`, raw GLB/glTF URLs, invented model IDs, or `unsafeModelUrl(...)` to public game code.
- Use typed assets generated by the Aura3D CLI. Preserve durable source, author, license, license URL, acquisition, and hash metadata.
- Rapier is the sole physical-simulation owner. Route-local authored arcade motion, gravity, perception, scoring, kicks, prediction, drag, steering, or contact approximations must be labeled precisely.
- Do not turn package-level, production-runtime, route-local, template, prototype, or roadmap behavior into a root-safe claim without matching root-only browser evidence.
- Do not claim mature commercial-engine status, Unity/Unreal replacement, universal parity, reusable genre kits, flagship quality, production rendering, PBR parity, HDR/IBL, WebGPU, or other capabilities beyond the exact proven path.
- Automated evidence does not grant visual approval. Exact final artifacts require independent human review when the repository policy or PRD requires it.

## Required execution ledger in every Markdown file

Add an `## Execution ledger` section to every one of the 22 documents if it does not already exist. Keep it current after every bounded checkpoint.

Use this exact structure:

```markdown
## Execution ledger

**Status:** Not started | In progress | Blocked | Complete
**Last verified:** YYYY-MM-DD HH:MM TZ
**Implementation scope:** paths changed for this PRD
**Authoritative evidence:** tests, reports, screenshots, route-health, deploy output
**Remaining blockers:** explicit unresolved items, or `None`

### Requirement checklist

- [ ] Requirement written as a concrete, independently verifiable outcome.
- [ ] Another requirement.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| YYYY-MM-DD | Requirement ID or exact wording | Command/report/artifact path | Pass/Fail |
```

Rules for the ledger:

1. Convert every promise, bullet, table row, acceptance scenario, quality gate, constraint, and Definition of Done item in that document into a concrete checkbox. Do not omit prose requirements merely because they were not already formatted as tasks.
2. Use stable IDs. Prefix them with the game abbreviation, such as `TDC`, `ACA`, `NCS`, `BFR`, `SR`, `SG`, `NS`, `AL`, `GP`, `CR`, `PT`, `MH`, `VB`, `BS`, `PW`, `GS`, `DR`, and `RB`.
3. A checkbox stays `[ ]` until current authoritative evidence proves the exact requirement.
4. Mark `[x]` only in the same checkpoint that records the supporting command, test, report, screenshot, hash, deployed artifact, or independent review verdict in the verification record.
5. If evidence becomes stale or code changes invalidate it, change `[x]` back to `[ ]` immediately and record why.
6. Never mark an independent human-review item complete yourself. Record the exact artifact hashes submitted for review and wait for an external verdict. Continue completing all work that does not depend on that verdict.
7. A document's status becomes `Complete` only when every requirement checkbox is `[x]`, every required command passes, every required artifact exists and matches current source, and `Remaining blockers` is `None`.
8. A portfolio roll-up becomes `Complete` only after every child document is complete and the portfolio-wide gates are separately proven.

## Work order

Execute in vertical slices so each title reaches a reviewable state without destabilizing the entire repository.

### Phase 0 — baseline and ledger creation

1. Inventory all 22 documents and derive their complete requirement sets.
2. Add the execution ledger to all documents without marking unproven work complete.
3. Map each game to its source, assets, tests, evidence, route-health generator, build command, browser route, and deploy command.
4. Capture the current status and contradictions. If an existing README or route-health file claims more than current evidence, lower the claim or record the blocker.
5. Establish a program-level plan that names all 18 games, the Corridor constraint audit, and the three roll-up audits.

### Phase 1 — current games

Execute in this order unless current evidence proves a different dependency order is safer:

1. Blockfall Reactor
2. Turbo Drift Circuit
3. Skyline Runner
4. Neon Corridor Strike, with every binding constraint continuously enforced
5. Aura Clash Arena

For each game, complete composition first, then the signature interaction, then the session arc, then secondary density, then complete verification.

### Phase 2 — Next Games

1. Siege Golf
2. Aurora Lander
3. Neon Swarm
4. Gravity Post
5. Courier Rush
6. Pulse Tunnel, gated by measured clock/sync evidence
7. Mech Hangar, gated by the complete licensed compatible-part evidence

Do not bypass Pulse Tunnel's fallback contract or Mech Hangar's asset gate to make progress appear complete.

### Phase 3 — Next Games 2

1. Bank Shot
2. Rooftop Buckets
3. Vault Breakers
4. Gallery Shift
5. Deep Recovery
6. Patrol Wing

### Phase 4 — portfolio integration

1. Verify that every title has a unique opening frame, palette, camera grammar, gameplay verb, state-feedback language, and signature moment.
2. Verify shared input, pause/reset, accessibility, touch, evidence, asset, performance, and claim policies.
3. Update the showcase index only for routes whose promotion gates actually pass.
4. Run the broad repository gates after all narrow game gates are stable.
5. Audit all 22 ledgers from scratch against current source and artifacts.

## Per-game checkpoint loop

Repeat this loop until the selected game's document is complete:

1. Re-read the target PRD ledger and inspect the current source/evidence.
2. Select the highest-value incomplete requirement that can be completed safely.
3. Implement the full vertical slice, including source, assets, tests, evidence generators, accessibility, and documentation affected by it.
4. Run the narrowest authoritative unit/type/build/browser/evidence commands.
5. Capture or regenerate the exact required runtime artifacts.
6. Review the actual captured scene. A screenshot is not a pass merely because it is nonblank.
7. Fix visual or gameplay defects revealed by the evidence and repeat the checks.
8. Update the PRD ledger: mark newly proven items `[x]`, record evidence, and leave uncertain items unchecked.
9. Re-run any earlier evidence invalidated by the changes.
10. Continue to the next requirement. Do not stop at a partial-looking milestone while safe in-scope work remains.

## Visual acceptance protocol

For every game, pin deterministic or explicitly controlled scenarios for:

1. Attract or first load.
2. Primary interaction.
3. Pressure or danger.
4. Signature payoff.
5. Failure.
6. Victory or completed session.
7. Mobile active play.
8. Reduced-motion and reduced-flash state.

For each scenario:

- Record the route, viewport, input/setup sequence, runtime evidence state, screenshot path, and SHA-256 hash.
- Assert that the typed primary subject is mounted, grounded, visible, and compositionally dominant where appropriate.
- Check focal hierarchy, silhouette, value separation, UI occlusion, camera clipping, effect overdraw, fallback/debug geometry, and action readability.
- Require meaningful rendered-pixel or runtime-state assertions tied to the claimed behavior.
- Keep independent-human-review status separate from automated visual checks.

If a visual review fails, fix the source and regenerate the artifact. Do not weaken the criterion, crop around the defect, hide it with UI, or change the claim to “complete” without proof.

## Verification expectations

Use the narrow commands defined by each app and the root `package.json`. At minimum, in proportion to the code changed, run:

```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:browser
pnpm build
pnpm check:agent-docs
pnpm check:docs-site
pnpm check:docs-codeblocks
pnpm verify:release:quick
pnpm check:release
```

Do not blindly run the broadest suite after every edit. Use narrow game-specific unit, browser, typecheck, build, evidence, and deploy gates during implementation, then broad gates at integration checkpoints. A broad green command is useful only after confirming it covers the requirement being checked.

For every required validation command:

- Record the exact command and timestamp.
- Record pass/fail and the relevant output or report path.
- Confirm the command used current source and current assets.
- Treat flaky, skipped, stale, partially executed, or unrelated results as not proven.
- Never hand-edit a report into a passing state.

## Persistence and blocker policy

- Continue working while any safe, meaningful, in-scope task remains.
- Do not stop merely because a test failed, an asset needs repair, visual quality is poor, the worktree is dirty, or a route requires multiple iterations.
- Diagnose failures from source and evidence, implement the correction, and rerun the relevant gate.
- Preserve unrelated user changes. Never use destructive resets or checkout commands to erase the worktree.
- If an external approval, credential, unavailable licensed asset, or external service is truly required, record the exact blocker and all completed prerequisite evidence. Continue every other unblocked PRD.
- Treat the entire program as blocked only when the same external condition prevents all remaining meaningful work and the strict blocked threshold of the active persistent-goal system is satisfied.
- Never mark a requirement `[x]` merely to avoid a blocker.

## Program completion audit

Before declaring the mission complete, assume it is incomplete and perform a fresh audit:

1. Enumerate all 22 documents.
2. Enumerate every requirement checkbox in every execution ledger.
3. Confirm all checkboxes are `[x]` and each has current authoritative evidence.
4. Confirm all 19 child game/constraint documents have `Status: Complete` and no remaining blockers.
5. Confirm the three portfolio roll-ups have independently proven their shared requirements and have `Status: Complete`.
6. Confirm no requirement was lost when converting prose into ledger items.
7. Confirm no checked item relies only on intent, compilation, a stale report, a DOM assertion for a 3D claim, or an unreviewed screenshot.
8. Confirm current source matches current assets, generated evidence, screenshot hashes, route-health, deploy output, and public wording.
9. Confirm exact desktop/mobile artifacts have the required independent review verdicts.
10. Run the final broad repository gates and record their output.
11. Search the 22 documents for remaining unchecked boxes. The final count must be zero.
12. Search the 22 documents for `Not started`, `In progress`, `Blocked`, `TODO`, `TBD`, `pending`, stale evidence warnings, and unresolved blockers. Resolve every true remaining item.

Only after all twelve audit steps pass may you declare the program complete.

## Final response contract

When—and only when—the entire program is proven complete, report:

- all 22 documents and their final status;
- every game route completed;
- the final test/build/evidence/deploy commands and results;
- exact final artifact and review locations;
- any intentionally bounded capability claims;
- confirmation that the final unchecked-checkbox count is zero;
- confirmation that no unresolved blocker remains.

Until then, report concrete progress and continue the persistent goal. Do not produce a celebratory completion answer for a partial milestone.

The mission is complete only when the current repository state proves every requirement in all 22 Markdown documents, every ledger checkbox is checked from evidence, all roll-up gates pass, and no required work remains.

---

## Recommended invocation

From `/Users/gurbakshchahal/platforms/aura3d`, start a persistent goal using the full prompt above. If the interface accepts a file reference, use:

```text
/goal Execute the complete program in EXECUTE-ALL-GAME-PRDS-PROMPT.md. Do not stop until every requirement in all 22 referenced Markdown documents is implemented, verified, recorded in its execution ledger, and checked off from authoritative evidence. Preserve unrelated worktree changes and enforce all repository claim, asset, generated-evidence, visual-review, and human-approval boundaries.
```
