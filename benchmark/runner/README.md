# Round Runner Contract

This file removes runner discretion from Phase B. A result that does not follow
this contract is not a valid Round 1 result.

## Machine And Tooling

Default local benchmark machine:

- OS: macOS 26.3, build 25D5101c
- CPU: Apple M4 Max
- RAM: 128 GiB
- Node.js: 22.22.0
- pnpm: 11.1.3
- npm: 11.16.0
- Playwright: 1.59.1
- Browser: Playwright Chromium
- Viewport: 1440 x 960
- Device scale factor: 1

If the machine changes, record the replacement machine in the result file
before running every side of the benchmark on that same machine.

## Clean Directory Setup

Create each run under:

```text
benchmark/runs/round-N/<run-id>/prompt-XX/source/
```

Run IDs are fixed:

- `codex-aura3d`
- `claude-aura3d`

The runner may create a Vite TypeScript app, but the same scaffold policy must
be used for Aura3D and manual renderer code. Record the exact scaffold command in
`notes.md`.

## Package Installation

Use the current repo commit recorded in the result file for Aura3D package
artifacts. The agent may import published public APIs but may not inspect
implementation source.

Use `three@0.165.0` for manual renderer code runs.

Lockfiles are allowed for reproducibility but are not counted as user-written
code.

## Prompt Delivery

For every prompt, send this exact instruction shape to the agent:

```text
First read ./context/llms.txt before any other context file.

Use only the provided context bundle and this prompt file. Build a browser 3D
app that satisfies the prompt. Put the app in the provided clean source
directory. Do not search for assets. Prompt 10 may use only
benchmark/assets/sneaker.glb. After implementation, provide the build command,
run command for the runner to execute later, and any assumptions. Do not edit
files outside the source directory.

Benchmark execution rules:
- Read ./context/llms.txt first; if you have not read it yet, stop and read it
  before implementing.
- If ./context/docs/agents/benchmark-recipes.md has a matching recipe, copy
  that recipe shape and make only prompt-required edits.
- Use public helpers and prefabs before custom primitives. Do not build a
  custom physics engine, game engine, chart engine, material renderer, city
  generator, or animation system when the context bundle exposes a matching
  Aura3D API.
- Do not run `npm run dev`, `npm run preview`, Playwright, browser screenshot
  capture, or any other long-running server/manual visual verification inside
  the agent process.
- You may run finite commands such as `npm install` and `npm run build`.
- After `npm run build` completes or fails, stop work and return the build
  command, run command for the runner, and assumptions. Do not continue
  investigating.

<contents of benchmark/prompts/XX-name.md>
```

Do not add prompt-specific hints, visual suggestions, API names, or repair
advice beyond that text. The generic benchmark execution rules above are part
of the amended standard. If the agent asks a question, record it as a repair
turn and answer only by pointing back to the prompt and context bundle.

The agent-provided run command is an instruction to the benchmark runner, not
permission for the agent to start a server. If the agent starts `npm run dev`,
`npm run preview`, Playwright, browser screenshot capture, or manual visual
verification, record an execution-hygiene violation in `notes.md`.

## Runtime Capture

Runtime capture starts only after the agent process has stopped.

For each prompt:

1. Install dependencies.
2. Run the build command.
3. Start the app with the recorded run command. For engine parity captures,
   use production preview after a successful build, not Vite dev server:
   `npm run preview -- --port <assigned-port> --strictPort`.
4. Open it in Playwright Chromium at 1440 x 960.
5. Wait up to 10 seconds after the first successful page load for animation or
   assets to settle.
6. Capture `screenshot.png`.
7. Capture route health from an app-exposed helper if present; otherwise use
   HTTP 200 plus a nonblank canvas/DOM screenshot as the route-health fallback.

Runtime behaviors that cannot be proven by one screenshot must be recorded in
`notes.md` with either an additional screenshot path or a short Playwright trace
description. Do not let runtime notes replace the required screenshot.

## Renderer Proof Artifacts

Renderer proof capture is additive to the existing CLI contract. Existing
commands, required screenshots, `route-health.json`, `metrics.json`, logs, and
exit-code behavior remain unchanged. Capture tools may also write a proof JSON
next to the existing artifacts:

- Engine browser captures write `renderer-proof.json`.
- Visual QA gate runs write `visual-renderer-proof.json`.

Both files use schema `aura3d-renderer-proof/1.0`, implemented by
`benchmark/runner/renderer-proof-artifact.mjs`. The schema is intentionally
small so future prompt runners or visual capture scripts can reuse it without
claiming they ran a full benchmark. It records:

- `runtimeDiagnostics.backend`
- `runtimeDiagnostics.runtimeStatus`
- `runtimeDiagnostics.actualPasses`
- `runtimeDiagnostics.fallbackPasses`
- `runtimeDiagnostics.passNames`
- `webglContextEvidence` when a browser canvas exposes a WebGL context
- `metadataHooks.png` with PNG container metadata such as dimensions, chunk
  types, size, and freshness
- `metadataHooks.contactShadow` reserved for renderer-provided contact shadow
  diagnostics
- `metadataHooks.tone` reserved for renderer-provided tone mapping, exposure,
  color-space, or grading diagnostics

The helper must not infer renderer behavior from a nonblank screenshot. If a
runtime does not expose backend/pass/contact-shadow/tone data, the proof file
must store `null` or `not-collected`. The current runner directory does not
contain a full prompt runner; this helper is the artifact contract such a runner
can call after it has real browser/runtime evidence.

## Failure Sentinels

If a step fails, still create the artifact directory and write:

- `build.log` with the failure.
- `run.log` if a run command was attempted.
- `metrics.json` with `null` for unavailable numeric fields.
- `notes.md` with `status: failed` and the failure stage.

Use `screenshot.png` only when an actual browser screenshot exists. Do not
create placeholder screenshots.

## Engine FPS Calibration

Engine FPS is valid only if the browser measurement path is calibrated before
scene sampling. Run the controls in `benchmark/runner/fps-calibration.mjs` in
the same Playwright browser instance and record the result in each engine
`metrics.json` under `fpsCalibration`.

Required controls:

- Empty `requestAnimationFrame` page: p50 FPS must be at least 55.
- Minimal WebGL control scene: p50 FPS must be at least 45 and p95 frame time
  must be no worse than 34 ms.

If either control fails, set scene `p50Fps` and `p95FrameTimeMs` to `null`, set
`fpsInstrumentationStatus` to `"invalid"`, record
`fpsInstrumentationFailures`, and do not use the FPS threshold to make an
engine-quality claim for that run. The result file must still report that the
frozen threshold was unavailable because instrumentation failed.

Scene sampling must also fail closed. The runner must not sample scene FPS until
the page has loaded, `__ENGINE_READY__` is true, route health has passed, and a
real canvas route is present. If scene sampling does not run, times out, or does
not produce finite p50 FPS and p95 frame-time values, set scene `p50Fps` and
`p95FrameTimeMs` to `null`, set `fpsInstrumentationStatus` to `"invalid"`, and
record the scene-sampling failure in `fpsInstrumentationFailures`.

The calibration requirement prevents the Round 1 failure mode where both
Aura3D and manual renderer code measured at 1-8 FPS on scenes that were visually
rendering, making the FPS numbers browser/sampling evidence rather than
credible renderer-performance evidence.

Engine setup/capture tools for the next proof round live in this directory:

```sh
node benchmark/runner/setup-engine.mjs --round=round-N
node benchmark/runner/capture-engine-batch.mjs --round=round-N
```

`setup-engine.mjs` writes fresh hand-authored parity scenes under
`benchmark/runs/round-N/engine/`, packs the current Aura3D package once for that
round, and keeps scene setup intentionally lean enough for the FPS floor while
preserving the benchmark visual targets. It does not reuse prior captured
artifacts.

PRD-2 validation must use the one-pass workflow unless a human explicitly asks
for a lower-level command:

```sh
node benchmark/runner/validate-engine-round.mjs --round=round-N
```

The validation workflow verifies context manifests, runs `pnpm build` before
`npm pack`, extracts the packed tarball, audits the exact consumer dist paths,
captures each engine scene once, writes screenshot freshness evidence, generates
contact sheets, prints the contact sheet paths, writes `validation-summary.json`,
and exits. If a validation pass fails, do not rerun it immediately; inspect the
recorded failures and return to implementation.

Package integrity is release-blocking:

```sh
node benchmark/runner/tarball-audit.mjs --tarball=benchmark/runs/round-N/_packages/aura3d-engine-1.0.0.tgz --round-root=benchmark/runs/round-N
```

The tarball audit fails when `dist/engine/agent-api/index.js` is missing required
helper markers or is older than `packages/engine/src/agent-api/index.ts`. It
also records git SHA, dirty-state evidence, build timestamp, package tarball
hash, dist helper hash, and context manifest hash in `round-metadata.json`.

Full prompt benchmark reruns are guarded:

```sh
node benchmark/runner/full-benchmark-guard.mjs --non-release
```

Official release benchmark runs must not start from a dirty or stale package.
Non-release validation still requires a code diff touching a failed PRD-2
workstream area unless `AURA3D_ALLOW_FULL_BENCHMARK_RERUN=1` is set.

Full prompt matrix generation and capture use a separate finite runner path:

```sh
node benchmark/runner/full-prompt-matrix.mjs --round=round-N
node benchmark/runner/run-prompt-agent.mjs --round=round-N --runId=codex-aura3d --concurrency=1
node benchmark/runner/run-prompt-agent.mjs --round=round-N --runId=codex-manual renderer code --concurrency=1
node benchmark/runner/run-prompt-agent.mjs --round=round-N --runId=claude-aura3d --concurrency=1
node benchmark/runner/run-prompt-agent.mjs --round=round-N --runId=claude-manual renderer code --concurrency=1
node benchmark/runner/capture-prompt-batch.mjs --round=round-N --portStart=7200
node benchmark/runner/prompt-contact-sheets.mjs --round=round-N
```

`run-prompt-agent.mjs` is the only runner-owned bridge from prompt-delivery
packets to agent-authored source. It links the selected frozen context bundle as
`./context`, exposes the prompt-10 asset as `./benchmark/assets/sneaker.glb`,
invokes the matching non-interactive agent CLI, records `agent-status.json`,
`agent.stdout.log`, `agent.stderr.log`, `agent-response.txt` where available,
`source-audit.json`, and `asset-audit.json`, and enforces a finite per-prompt
timeout. The agent process may run finite install/build commands but must not
run dev/preview/browser capture. Browser screenshot capture remains runner-owned
and starts only in `capture-prompt.mjs` after the agent process has stopped.

## Standard Cleanliness Check

Before starting a benchmark round, and before committing benchmark protocol
changes, run:

```sh
node benchmark/runner/verify-context-manifests.mjs
git diff --check -- benchmark/protocol.md benchmark/runner benchmark/context docs/agents
git status --short -- packages/engine/src/agent-api/index.ts benchmark/results UnifiedPRD.md
```

The first command verifies bundle manifests, requires `files/llms.txt` in each
context bundle, and checks that the prompt-delivery contract still contains the
finite-execution guardrails. The second command catches whitespace damage in
the owned docs/scripts. The third command must show no benchmark-result or
forbidden engine API edits for this workstream; an unrelated pre-existing
`UnifiedPRD.md` entry should be documented, not modified.

## Full Prompt Matrix Setup

The official prompt matrix setup helper creates the clean artifact tree and
the exact prompt-delivery packets for all four required sides:

```sh
node benchmark/runner/full-prompt-matrix.mjs --round=round-N
```

The helper verifies frozen context manifests, creates
writes each `prompt-delivery.md`, and writes
`benchmark/runs/round-N/prompt-matrix-manifest.json`.

It does not run Codex, Claude Code, browser capture, neutral scoring, or user
approval. Those remain separate required steps under this runner contract.

After an agent has stopped and the generated app source exists, capture each
prompt with:

```sh
node benchmark/runner/capture-prompt.mjs --promptDir=benchmark/runs/round-N/<run-id>/prompt-XX --port=<unique-port>
```

The prompt capture helper runs finite install/build/production-preview steps,
then writes `screenshot.png`, `route-health.json`, `metrics.json`, `run.log`,
and `renderer-proof.json`. The renderer proof captures runtime diagnostics,
WebGL context evidence, pass names when exposed by the app runtime, PNG
metadata, and fallback status. It still does not score visual quality; neutral
scoring remains required under `benchmark/scoring/README.md`.

To capture all prompt directories that already contain generated source, use:

```sh
node benchmark/runner/capture-prompt-batch.mjs --round=round-N --portStart=7200
```

This batch helper writes `prompt-capture-batch-summary.json` at the round root.
It does not generate source and will fail any prompt whose app cannot install,
build, preview, render, or write required artifacts.

After screenshots exist for both Aura3D and manual renderer code sides, generate the
prompt comparison contact sheets with:

```sh
node benchmark/runner/prompt-contact-sheets.mjs --round=round-N
```

This writes side-by-side Codex and Claude Code contact sheets under
`benchmark/runs/round-N/contact-sheets/`. Missing screenshots are shown as
missing; the helper does not invent or score evidence.
