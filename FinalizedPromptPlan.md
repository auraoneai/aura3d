# Aura3D Finalized Prompt Plan

This document supersedes `ProductContextPRD.md` and `TestV4PlanPRD.md` for the
purpose of deciding what Aura3D is, what counts as done, and how the work is
proven. Earlier PRDs drifted: the standard was rewritten to match what passed.
That is not allowed under this document.

This document is the authoritative product PRD and the authoritative test plan
for the next release decision. It is locked once committed. Mid-run edits void
the in-flight benchmark. Edits between runs require an explicit "amendment"
commit that states what is being changed and why, and the prior benchmark
result is invalidated.

An amendment commit must use the commit-message prefix `PRD-AMENDMENT:` and
must include the reason, exact files changed, prior benchmark result being
invalidated, and user approval from `gchahal1982`.

## Product Statement

Aura3D is a browser 3D library that competes directly with Three.js. Its
advantage is that it gives developers and AI coding agents a higher-level,
typed, agent-readable way to build interactive 3D scenes, geometry, materials,
lighting, animation, physics, effects, assets, diagnostics, and deployable
browser experiences with less boilerplate and fewer mistakes than raw Three.js.

Aura3D is not an agent helper that wraps Three.js. The agent-readable layer is
one pillar of the product. The product is the library.

## Product Hierarchy

1. Aura3D core library competes with Three.js for browser 3D authoring.
2. Aura3D agent context helps AI coding agents use Aura3D better than they use
   raw Three.js.
3. Aura3D templates, docs, CLI, and deploy tooling make adoption faster,
   especially for agents.

The agent layer is a major differentiator. It is not the whole product.

## What This PRD Replaces

`ProductContextPRD.md` and `TestV4PlanPRD.md` framed Aura3D as an agent-readable
SDK for three starter recipes. That is too narrow. It also let evidence drift:
36 self-authored evaluation tools, three "comprehension profiles" graded by a
tool written in-repo, and a release gate that was green because the standard
was edited to fit.

This PRD restores the correct standard:

> Aura3D wins against raw Three.js for representative browser 3D prompts when
> used by an AI coding agent.

If Aura3D does not win that comparison, the product is not done, no matter how
many internal gates pass.

## Five Pillars

### 1. Core 3D Library

Aura3D must provide first-class, public-API support for:

- scene graph and lifecycle
- WebGL2 renderer (baseline)
- WebGPU renderer (where supported)
- cameras (perspective, orthographic, orbit, dolly, follow, turntable)
- lights (ambient, directional, point, spot, area, rigs)
- PBR materials (metal, glass, emissive, clearcoat, transmission)
- geometry primitives and parametric generators
- glTF/GLB loading with typed asset refs
- animation (clip playback, procedural, timeline)
- physics (rigid bodies, contacts, constraints)
- particles and VFX (rain, fog, bloom, trails, sparks)
- postprocess passes
- controls (orbit, pointer, keyboard, drag)
- diagnostics (FPS, draw calls, asset readiness, backend, errors)
- screenshots and route-health helpers
- disposal and resource cleanup

This list is the library scope. A feature is in-scope if it appears here. A
feature is out-of-scope if it does not, regardless of how interesting it
sounds.

### 2. Three.js Competitive Advantage

Aura3D must beat raw Three.js on:

- less boilerplate per scene
- safer typed API (compile-time rejection of invalid scenes and asset refs)
- stronger defaults (resize, pixel ratio, tone mapping, lifecycle)
- built-in workflows (orbit cameras, studio lights, product viewers without
  hand-rolled setup)
- fewer broken scene setups (missing canvas, missing asset, missing dispose)
- more predictable deploy path (asset base path, hashed URLs, static build)
- better agent usability (smaller stable surface, agent rule files, llms.txt)

These are the dimensions on which the benchmark scores Aura3D against
Three.js.

### 3. Agent-Readable Authoring

Aura3D ships:

- `llms.txt` (compact, examples-first, under 25 KB)
- `AGENTS.md`, `.claude/CLAUDE.md`, `.cursor/rules/aura3d.mdc`,
  `.github/copilot-instructions.md`
- `docs/agents/*` for human-readable agent docs
- typed asset refs that reject string asset ids at compile time
- prompt-plan helpers as an optional authoring style, not a required one
- starter templates that are agent-scaffoldable and humanly editable

The agent layer is a feature of the library. It is not the product test.

### 4. Proof Against Raw Three.js

Aura3D's release decision is gated on a head-to-head benchmark against raw
Three.js. The benchmark, the prompts, the rubric, and the scorer are defined
in this PRD and frozen.

### 5. Visual Quality

A scene passes only if:

- the screenshot visibly matches the prompt
- the result is not "one GLB on a grid with labels"
- procedural scenes look intentional, not random primitives
- asset scenes look staged with lighting, contact, and framing
- physics, effects, and animation are visible in the screenshot
- a neutral reviewer can identify the requested scene without reading code

Technical-only passes ("canvas rendered, non-zero pixels") are not sufficient.

## The Primary Test: Aura3D vs Three.js Benchmark

This is the only release-blocking test. Everything else is supporting evidence.

### Setup

Two clean directories. Two agents. Same prompts. No shared context between
runs.

- **Run A:** Codex with Aura3D context (llms.txt, AGENTS.md, agent docs)
- **Run B:** Codex with raw Three.js context (Three.js docs, examples)
- **Run C:** Claude Code with Aura3D context
- **Run D:** Claude Code with raw Three.js context

Four runs. Each run uses only the context bundle it was given. No source
spelunking into Aura3D internals. No human edits during the run. No prompting
hints beyond the listed prompts.

### The Prompts (Locked)

These 10 prompts are frozen. They cannot be edited, replaced, or reordered
without a written amendment to this PRD. Prompts 1–9 do not require external
assets. Prompt 10 uses a provided GLB.

1. Build a physics playground: 50 falling cubes onto a tilted ramp with
   collision response, camera orbit, reset button, and live contact count
   overlay.
2. Build a particle fountain: gravity-affected particles emitted upward from
   a point, colored by lifetime, with a ground plane they collide against and
   a controllable emission rate.
3. Build a procedural solar system: sun, 6 planets at different orbital
   distances and speeds, label each planet, bloom on the sun, orbit camera.
4. Build a neon tunnel flythrough: procedurally generated tube geometry with
   emissive segments, camera animated through the tunnel, bloom postprocess,
   fog falloff.
5. Build a 3D data visualization: a 6x6 grid of bars whose heights animate
   from random values, color by height, hover-highlight, orbit camera, axis
   labels.
6. Build a mini-golf hole: a flat green with one obstacle, a ball with
   physics, click-to-aim-and-shoot, score counter, follow camera on the ball.
7. Build a material lab: 5 spheres with metal, glass, rubber, emissive, and
   clearcoat materials under controlled studio lighting with an environment
   map and orbit controls.
8. Build a procedurally generated city block: 20 box buildings of varying
   heights with windows, streets, street lights, and a day/night toggle that
   changes lighting and sky.
9. Build an animated character placeholder: a humanoid figure built from
   primitive shapes (sphere head, cylinder body, box limbs) with a procedural
   walk-cycle animation moving across the ground plane.
10. Build a product viewer using the provided `sneaker.glb`: centered,
    auto-scaled, on a plinth, with studio lights, orbit controls, and a
    rotating turntable.

### The Rubric (Locked)

Each prompt is scored on these metrics. Lower is better unless noted.

- **Compiles** (yes/no)
- **Runs in browser** (yes/no)
- **Visually matches the prompt** (1–5, neutral reviewer; ≥3 required to count
  as a pass)
- **Lines of user-written code** (count)
- **Files created** (count)
- **Hallucinated APIs** (count of imported or called names that do not exist
  in the documented public API of the library that was given to the agent)
- **Invented asset paths** (count; for prompt 10 only)
- **Repair turns** (count of agent-requested or developer-required fixes
  before the result was usable)
- **Time to first usable render** (wall clock from prompt submission to
  scene visible)
- **Bundle size** (gzipped JS bytes of the built app)
- **Modifiability** (1–5, neutral reviewer: how easy is it to make a
  reasonable follow-up change like "make the camera orbit slower")

A prompt is a **win for Aura3D** if Aura3D scores strictly better than raw
Three.js on a majority of the metrics for that prompt, including a visual
quality score that is at least as high.

A prompt is a **tie** if the metrics split evenly or visual quality is
materially different but other metrics are not.

A prompt is a **loss** if raw Three.js scores strictly better on a majority of
metrics including visual quality.

### Anti-Drift Rules

These rules exist because the prior cycle let evidence drift. Violating any of
them voids the benchmark.

1. **Prompts are frozen.** No additions, removals, or rewordings during a
   run. An amendment commit can change them between runs but cannot change
   them mid-run.
2. **Rubric is frozen.** Same rule.
3. **Scoring is third-party.** A scorer who did not author Aura3D, did not
   author the agent context, and does not have a stake in the result. The
   scorer can be a human reviewer or an unrelated model (different vendor
   than the agent under test). The scorer sees only the prompt, the
   screenshot, the code listing, and the metrics — not the context bundle.
4. **No tool authored in this repo scores the benchmark.** Codex cannot grade
   Codex's output. Anthropic-built scorer cannot grade Claude Code's output.
   Use the opposite vendor or a human.
5. **No PRD edits mid-run.** If something is broken in the standard, finish
   the run, record the result, and amend the PRD with a fresh commit before
   the next run.
6. **No "optional follow-up" escape hatch.** A pillar named in this PRD is in
   scope. If it is not feasible to test, the PRD is wrong and must be amended
   to remove it, not silently bypassed.
7. **No self-authored evidence as proof.** Tools that grade Aura3D against
   criteria written in this repo are supporting evidence. They are not the
   release gate.
8. **No marketing comprehension as a release gate.** It is a separate
   product-marketing question. It does not gate the library.

### Amendment Commit Template

Any standard change after this PRD is committed must use this format:

```text
PRD-AMENDMENT: <short description>

Reason:
Files changed:
Prior result invalidated:
New benchmark round required: yes
User approval: gchahal1982, <date>
```

An amendment without this format does not change the release standard.

### Pass Criteria

The benchmark passes when, summed across the 10 prompts and across both
agents (Codex and Claude Code), Aura3D wins on at least **7 of 10 prompts**
for each agent, with **at least 4 of the visual-quality scores being ≥4** for
Aura3D and **no prompt scoring below 3** for Aura3D visual quality.

Hard-prompt floor: for each agent, at least **2 of Aura3D's wins must come
from prompts 7, 8, and 10**. Those prompts test PBR/material quality,
procedural scene scale, and real glTF product handling. Aura3D cannot pass by
only winning the simpler toy/procedural prompts.

If those thresholds are not met, the library is not yet a Three.js competitor
and the next work is library improvement, not more evidence.

## What Stays In Scope

The work already shipped is not thrown away. The following remain in scope
because they support the five pillars:

- public agent API in `@aura3d/engine`
- React adapter in `@aura3d/react`
- CLI in `@aura3d/cli`
- `create-aura3d` scaffolder
- the three starter templates (now reframed as agent-friendly example
  scaffolds, not as the product proof)
- typed asset refs and the asset manifest
- llms.txt, agent rule files, AGENTS.md
- diagnostics overlay, screenshot helpers, route-health helpers
- bundle-size measurement with size-limit
- deploy CLI (`check-deploy`, base-path config)
- the parity/superiority engine evidence in `apps/wow-*` (these support
  Pillar 1 by demonstrating Three.js parity for engine features)

These are kept because they map to Pillar 1, 2, or 3. They are no longer
treated as evidence of product completion on their own.

## What Is Explicitly Out Of Scope

These were drift. They are not part of the release decision.

- asset discovery as a product feature (Meshy, Sketchfab search, license
  filtering)
- asset sourcing workflows authored inside Aura3D
- marketing comprehension as a library proof point
- "outside beta dogfood" as a release blocker (it is post-1.0)
- self-scored evidence reports as the release gate
- the "prompt-plan / repair loop" as a required authoring style (it is one
  optional style; the primary style is direct API calls)
- arbitrary prompt-to-polished-3D generation as a claim
- cinematic film-quality VFX as a claim
- AI labs as a customer (the customer is developers and agents building
  browser 3D)

## Engine Ambition Decision

The user has decided: Aura3D is a Three.js competitor. The engine is in scope.
The parity/superiority work in `apps/wow-*` and the rendering packages stay
active and must continue to demonstrate parity. The engine layer is not a
maintenance tax — it is the product.

This decision closes the prior open question of "engine vs. agent layer."
Both. Engine is the product. Agent layer is the differentiator on top of the
engine.

## Engine Parity Benchmark

The agent prompt benchmark measures developer and agent productivity. It does
not, by itself, prove engine quality. Because Aura3D competes with Three.js,
Round 1 also includes a non-agent engine parity benchmark.

Build each reference scene twice: once with Aura3D and once with raw Three.js.
The two versions must aim for the same visual target.

| Scene | Required Coverage |
|---|---|
| `engine-01-material-grid` | PBR materials, glass, metal, clearcoat, emissive, studio lighting, environment reflections |
| `engine-02-city-block` | Procedural geometry scale, many objects, windows, streets, day/night lighting |
| `engine-03-particles-vfx` | Particles, bloom, fog/depth falloff, trails or sparks |
| `engine-04-physics-ramp` | Rigid bodies, contacts, constraints or collision behavior, runtime stability |
| `engine-05-sneaker-product` | glTF/GLB loading, auto-scale/framing, studio lights, orbit controls, turntable |

Record screenshot, route health, first usable render time, p50 FPS after
warmup, p95 frame time after warmup, draw calls, triangle count if available,
JS heap peak, GPU memory if available, gzip build bytes, source lines of code,
and neutral visual parity score.

The engine benchmark passes only if all of these are true:

- Visual parity is at least 4 of 5 for every scene.
- No scene drops below 30 FPS on the agreed local benchmark machine.
- Aura3D p50 FPS is no worse than 20% below Three.js in at least 4 of 5 scenes.
- Aura3D p50 FPS is no worse than 35% below Three.js in any scene.
- Aura3D JS heap peak is no worse than 25% above Three.js in at least 4 of 5
  scenes.
- Aura3D JS heap peak is no worse than 50% above Three.js in any scene.
- Draw-call differences above 25% are explained in the result file.
- Aura3D does not add more than 250 KB gzip over the Three.js reference for any
  scene unless `gchahal1982` accepts the written justification.

`benchmark/engine/README.md` is the executable spec for this benchmark. It may
add detail, but it cannot weaken the requirements above without a
`PRD-AMENDMENT:` commit.

## Implementation Plan

Phases run in order. Each phase has a single explicit exit criterion. No
phase ends because its checkboxes are ticked; it ends because its exit
criterion is met.

### Accountability File Map

The benchmark must be accountable by file, not by a vague checklist. These are
the required files and their owners:

| File | Purpose | Required Before |
|---|---|---|
| `FinalizedPromptPlan.md` | Source of truth for product scope, anti-drift rules, pass criteria, and definition of done. | Any benchmark run |
| `benchmark/README.md` | Human entry point for the benchmark package. | Phase A exit |
| `benchmark/prompts/manifest.md` | Frozen prompt order and filename map. | Phase A exit |
| `benchmark/prompts/01-physics-playground.md` | Frozen prompt 1 with expected visual evidence. | Phase A exit |
| `benchmark/prompts/02-particle-fountain.md` | Frozen prompt 2 with expected visual evidence. | Phase A exit |
| `benchmark/prompts/03-procedural-solar-system.md` | Frozen prompt 3 with expected visual evidence. | Phase A exit |
| `benchmark/prompts/04-neon-tunnel-flythrough.md` | Frozen prompt 4 with expected visual evidence. | Phase A exit |
| `benchmark/prompts/05-3d-data-visualization.md` | Frozen prompt 5 with expected visual evidence. | Phase A exit |
| `benchmark/prompts/06-mini-golf-hole.md` | Frozen prompt 6 with expected visual evidence. | Phase A exit |
| `benchmark/prompts/07-material-lab.md` | Frozen prompt 7 with expected visual evidence. | Phase A exit |
| `benchmark/prompts/08-procedural-city-block.md` | Frozen prompt 8 with expected visual evidence. | Phase A exit |
| `benchmark/prompts/09-animated-primitive-humanoid.md` | Frozen prompt 9 with expected visual evidence. | Phase A exit |
| `benchmark/prompts/10-product-viewer-sneaker.md` | Frozen prompt 10 with the only allowed asset path. | Phase A exit |
| `benchmark/rubric.md` | Frozen scoring rubric and pass thresholds. | Phase A exit |
| `benchmark/protocol.md` | Run protocol, context rules, artifact rules, and neutral scoring rules. | Phase A exit |
| `benchmark/context/README.md` | Frozen context-bundle rules for Aura3D and raw Three.js runs. | Phase A exit |
| `benchmark/context/aura3d/manifest.sha256` | Hash manifest for the Aura3D context bundle. | Phase A exit |
| `benchmark/context/threejs/manifest.sha256` | Hash manifest for the raw Three.js context bundle. | Phase A exit |
| `benchmark/runner/README.md` | Machine, setup, prompt-delivery, runtime-capture, and failure rules. | Phase A exit |
| `benchmark/metrics/README.md` | Exact metric definitions and winner calculations. | Phase A exit |
| `benchmark/engine/README.md` | Engine parity benchmark for Aura3D versus hand-authored Three.js reference scenes. | Phase A exit |
| `benchmark/runs/README.md` | Required output directory and per-prompt artifact contract. | Phase A exit |
| `benchmark/scoring/README.md` | Neutral scorer input and output contract. | Phase A exit |
| `benchmark/assets/README.md` | License and hash record for the required sneaker fixture. | Phase A exit |
| `benchmark/assets/sneaker.glb` | Provided asset for prompt 10. Agents must not search for substitutes. | Phase A exit |
| `benchmark/results/template.md` | Required result format for every round. | Phase A exit |
| `benchmark/results/engine-template.md` | Required engine result format for every round. | Phase A exit |
| `benchmark/results/decision-template.md` | Required Phase C decision format. | Phase A exit |
| `benchmark/results/phase-a-signoff-template.md` | Required user sign-off format before Round 1 can start. | Phase A exit |
| `benchmark/results/amendment-template.md` | Required PRD amendment format. | Phase A exit |
| `benchmark/results/round-1.md` | Signed, dated Round 1 benchmark result. | Phase B exit |
| `benchmark/results/round-1-engine.md` | Signed, dated Round 1 engine parity result. | Phase B exit |
| `benchmark/results/round-1-decision.md` | Written ship/fix/no-ship decision from Round 1. | Phase C exit |

### Cleanup Checklist

These files from the prior cycle must not be used as release proof. Checked
items are only valid if the deletion or script change lands in the same commit
as this PRD. If any listed cleanup item is missing from the commit, the
checkbox is invalid and must be reset to `[ ]`.

- [x] Remove `check:product-context` from `package.json`.
- [x] Remove `check:test-plan-status` from `package.json`.
- [x] Remove `check:marketing-comprehension` from `package.json`.
- [x] Remove `check:prompt-fidelity` from `package.json`.
- [x] Remove `check:visual-systems-proof` from `package.json`.
- [x] Remove `dogfood:agent` from `check:release`; keep it only as a
      debugging aid, not release proof.
- [x] Delete `tools/product-context-evidence/index.ts`.
- [x] Delete `tools/test-plan-execution-status/index.ts`.
- [x] Delete `tools/marketing-comprehension-eval/index.ts`.
- [x] Delete `tools/prompt-fidelity-quality/index.ts`.
- [x] Delete `tools/visual-systems-proof-summary/index.ts`.
- [x] Delete the generated docs and JSON reports from those tools.
- [x] Mark `ProductContextPRD.md` and `TestV4PlanPRD.md` as superseded.

### Phase A: Lock the Benchmark Infrastructure

Goal: the benchmark can be run and scored without writing any new code in the
core library.

- [x] Commit this PRD as the source of truth.
- [x] Commit the prompt manifest under `benchmark/prompts/manifest.md`.
- [x] Commit the 10 prompts as plain-text files under `benchmark/prompts/`.
- [x] Commit the rubric as a plain-text file under `benchmark/rubric.md`.
- [x] Commit the run protocol under `benchmark/protocol.md`: how to set up the
      clean directory, how to give the agent its context bundle, how to record
      results.
- [x] Commit the frozen context bundles under `benchmark/context/`.
- [x] Commit the runner contract under `benchmark/runner/README.md`.
- [x] Commit the metric definitions under `benchmark/metrics/README.md`.
- [x] Commit the engine parity benchmark under `benchmark/engine/README.md`.
- [x] Commit the run artifact contract under `benchmark/runs/README.md`.
- [x] Commit the neutral scoring handoff under `benchmark/scoring/README.md`.
- [x] Commit a `sneaker.glb` fixture under `benchmark/assets/sneaker.glb` from
      a clearly-licensed source.
- [x] Set up a results template at `benchmark/results/template.md`.
- [x] Set up an engine results template at
      `benchmark/results/engine-template.md`.
- [x] Set up a decision template at `benchmark/results/decision-template.md`.
- [x] Set up Phase A sign-off template at
      `benchmark/results/phase-a-signoff-template.md`.
- [x] Set up amendment template at `benchmark/results/amendment-template.md`.
- [x] Get written Phase A approval from `gchahal1982` before starting Round 1.

Exit: a third party who has not seen this repo can run the benchmark using
only the `benchmark/` directory, and `gchahal1982` has confirmed in writing
that the benchmark package is ready to run. Without that user sign-off, Phase A
is not complete and Round 1 cannot start.

### Phase B: Run Round 1

Goal: get a real result.

- [x] Run Codex + Aura3D across all 10 prompts. Record results.
- [x] Run Codex + raw Three.js across all 10 prompts. Record results.
- [x] Run Claude Code + Aura3D across all 10 prompts. Record results.
- [x] Run Claude Code + raw Three.js across all 10 prompts. Record results.
- [x] Run the engine parity benchmark in `benchmark/engine/README.md`.
- [x] Submit each prompt's outputs to a neutral scorer (human or
      opposite-vendor model). Record scores.
- [x] Submit each engine scene's screenshots and metrics to a neutral scorer.
- [x] Commit results to `benchmark/results/round-1.md`.
- [x] Commit engine results to `benchmark/results/round-1-engine.md`.

Exit: Round 1 results are committed, signed by the neutral scorer, signed by
the user (`gchahal1982`), and dated. No edits permitted after commit.

### Phase C: Read the Result

Goal: decide what the result means.

- [ ] If pass criteria are met for both agents: Aura3D is a Three.js
      competitor in measurable terms. Ship 1.0.0. Move to public beta with
      real users.
- [ ] If pass criteria are met for one agent but not the other: investigate
      the per-agent gap. Either the context bundle for that agent needs work,
      or that agent has model-specific limits. Decide which.
- [x] If pass criteria are not met: the library is not yet a Three.js
      competitor. Identify the specific prompts where Aura3D lost and the
      specific metrics it lost on. Library work targets those gaps.
- [x] If the engine parity benchmark fails: do not ship as a Three.js
      competitor. Identify renderer, material, VFX, physics, performance, or
      bundle-size gaps and fix the library before rerunning.

Exit: a written decision in `benchmark/results/round-1-decision.md` saying
"ship," "fix specific gaps and re-run," or "library not competitive,
significant work required."

### Phase D: Iterate Until Pass (if needed)

If Round 1 did not pass, the next phase is library work, not more
benchmarking. Specifically:

- [ ] For each prompt where Aura3D lost on lines-of-code: identify the API
      change that would shrink the user code.
- [ ] For each prompt where Aura3D lost on hallucinations: identify the docs
      or API change that would prevent the hallucination.
- [ ] For each prompt where Aura3D lost on visual quality: identify the
      defaults, lighting, materials, or rendering change that would close the
      gap.
- [ ] Ship the library changes.
- [ ] Re-run the entire benchmark (Phase B) from scratch. Partial re-runs are
      not allowed.

Exit: the benchmark passes per Phase C, or the user explicitly decides to
ship below the bar with a written acknowledgment.

## Definition Of Done

Aura3D 1.0.0 is releasable when:

1. The benchmark in Phase B has been run with the rules in this PRD.
2. The scorer was a neutral third party (human or opposite-vendor model).
3. The pass criteria in the Primary Test section are met for both Codex and
   Claude Code.
4. The engine parity benchmark in `benchmark/engine/README.md` has passed.
5. The five pillars in this PRD are all represented in the public API.
6. The library work that was done to pass the benchmark has not regressed any
   shipped feature.
7. The 1.0.0 release notes explicitly cite the benchmark result and link to
   `benchmark/results/round-1.md` (or whichever round passed).

This is the standard. It does not change without an amendment commit. An
amendment commit must justify the change and must invalidate any benchmark
result obtained under the prior standard.

## What This PRD Forbids

To prevent the drift that occurred in the prior cycle, the following are
forbidden until the benchmark passes:

- adding new "check:*" scripts that grade Aura3D against Aura3D-authored
  criteria
- editing this PRD mid-benchmark-run
- claiming completion based on internal evidence tools
- expanding the prompt list to include prompts that match existing template
  recipes after seeing Round 1 results
- declaring any pillar "optional" or "follow-up" to make the standard pass
- using marketing comprehension, outside-user counts, or aggregate test
  counts as evidence the library competes with Three.js
- treating Codex's own evaluation of its own output as proof

If any of these happen, the in-flight benchmark is void and a new one must
start from Phase A.

## Short Version

> Aura3D is a browser 3D library that competes with Three.js. The release
> decision is made by a head-to-head benchmark of 10 prompts, run by Codex
> and Claude Code against Aura3D and raw Three.js, scored by a neutral third
> party. The benchmark is frozen. The PRD is frozen until amended in a
> separate commit. No self-scored evidence counts. No "optional follow-up"
> framing is allowed. The agent layer is the differentiator; the engine is
> the product; the benchmark is the proof.
