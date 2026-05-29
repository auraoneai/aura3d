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
Use only the provided context bundle and this prompt file. Build a browser 3D
app that satisfies the prompt. Put the app in the provided clean source
directory. Do not search for assets. Prompt 10 may use only
benchmark/assets/sneaker.glb. After implementation, provide the build command,
run command, and any assumptions. Do not edit files outside the source
directory.

<contents of benchmark/prompts/XX-name.md>
```

Do not add hints, visual suggestions, API names, or repair advice beyond that
text. If the agent asks a question, record it as a repair turn and answer only
by pointing back to the prompt and context bundle.

## Runtime Capture

For each prompt:

1. Install dependencies.
2. Run the build command.
3. Start the app with the recorded run command.
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
