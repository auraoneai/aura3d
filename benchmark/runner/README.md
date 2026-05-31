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
- `codex-threejs`
- `claude-aura3d`
- `claude-threejs`

The runner may create a Vite TypeScript app, but the same scaffold policy must
be used for Aura3D and Three.js. Record the exact scaffold command in
`notes.md`.

## Package Installation

Use the current repo commit recorded in the result file for Aura3D package
artifacts. The agent may import published public APIs but may not inspect
implementation source.

Use `three@0.165.0` for raw Three.js runs.

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
Aura3D and raw Three.js measured at 1-8 FPS on scenes that were visually
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

## Standard Cleanliness Check

Before starting a benchmark round, and before committing benchmark protocol
changes, run:

```sh
node benchmark/runner/verify-context-manifests.mjs
git diff --check -- benchmark/protocol.md benchmark/runner benchmark/context docs/agents
git status --short -- packages/engine/src/agent-api/index.ts benchmark/results REMAINING.md
```

The first command verifies bundle manifests, requires `files/llms.txt` in each
context bundle, and checks that the prompt-delivery contract still contains the
finite-execution guardrails. The second command catches whitespace damage in
the owned docs/scripts. The third command must show no benchmark-result or
forbidden engine API edits for this workstream; an unrelated pre-existing
`REMAINING.md` entry should be documented, not modified.
