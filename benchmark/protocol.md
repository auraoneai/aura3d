# Benchmark Protocol

This protocol is frozen for a benchmark round. Editing it during a run voids the run.

## Runs

Run the same 10 prompts four times:

1. Codex with Aura3D context.
2. Codex with raw Three.js context.
3. Claude Code with Aura3D context.
4. Claude Code with raw Three.js context.

Each run starts from a clean directory. Do not reuse generated code,
screenshots, fixes, or notes from another run. Use `runner/README.md` for the
exact machine, clean-directory setup, package installation, prompt-delivery,
runtime-capture, and failure-sentinel rules. Agent generation is finite:
agents read `./context/llms.txt` first, edit only the provided source
directory, run only finite install/build commands, return the build/run
commands plus assumptions, and stop. Dev servers, preview servers,
Playwright, browser screenshot capture, and manual visual verification belong
to runner capture after the agent has stopped.

After the prompt runs, run the engine parity benchmark in `engine/README.md`.
That benchmark does not use agents; it compares hand-authored Aura3D and
Three.js reference scenes.

## Context Bundles

Aura3D context is frozen under:

```text
benchmark/context/aura3d/
```

Before a round starts, verify `benchmark/context/aura3d/manifest.sha256`
matches the files under `benchmark/context/aura3d/files/`. The bundle must
contain `files/llms.txt`; the prompt-delivery contract requires the agent to
read that file before any other context file.

Aura3D context may not include:

- private source spelunking in `packages/*/src`
- prior generated benchmark outputs
- hidden repair hints not committed before the run
- edited prompts or rubric
- any file outside `benchmark/context/aura3d/files/` unless a `PRD-AMENDMENT:`
  commit changes the bundle and restarts the round

Raw Three.js context is frozen under:

```text
benchmark/context/threejs/
```

Before a round starts, verify `benchmark/context/threejs/manifest.sha256`
matches the files under `benchmark/context/threejs/files/`. The bundle must
contain `files/llms.txt`; the prompt-delivery contract requires the agent to
read that file before any other context file.

Raw Three.js context may not include Aura3D source, Aura3D examples, or Aura3D agent rules.
Raw Three.js context may not include online browsing during Round 1.

## Agent Rules

- Give the agent exactly one prompt at a time using the message shape in
  `runner/README.md`.
- The first benchmark instruction must be to read `./context/llms.txt`.
- Do not provide extra hints after seeing failures.
- Do not hand-edit generated code.
- If the agent asks for a fix turn, record it as a repair turn.
- If the run cannot proceed, record the failure instead of changing the prompt.
- Invalid agent-side commands include `npm run dev`, `npm run preview`,
  Playwright, browser screenshot capture, and manual visual verification.
  Runtime capture is runner-only.

## Required Artifacts Per Prompt

For each prompt and each run, capture:

- prompt filename
- agent name and version if available
- context bundle used
- start time and finish time
- generated source tree
- build command and output summary
- run command and route URL
- screenshot path
- route-health result if available
- bundle-size result if available
- repair-turn count
- notes on hallucinated APIs
- notes on invented asset paths
- scorer identity and scoring date

Artifacts must follow the directory contract in `runs/README.md`.
Metric meanings and winner calculations must follow `metrics/README.md`.

## Scoring

Scoring must be done by a neutral human reviewer or opposite-vendor model.

The scorer receives only:

- the prompt
- the screenshot
- the generated code listing
- the captured metrics

The scorer must not receive:

- the agent context bundle
- claims from `FinalizedPromptPlan.md`
- prior in-repo evidence reports
- hidden notes about which output is expected to win

Use `scoring/README.md` for the scoring handoff. The scorer must produce the
per-metric winner table needed to support the majority-of-metrics result.

## Anti-Drift

- No PRD edits during a run.
- No prompt edits during a run.
- No rubric edits during a run.
- No in-repo scorer decides visual quality or final wins.
- No self-authored evidence report can replace the benchmark.
- Any standard change requires an amendment commit before a new run starts.
- No Round 1 run can start until Phase A is signed off by `gchahal1982` using
  `results/phase-a-signoff-template.md`.

## Amendment Commits

Any standard change after Phase A sign-off must use the commit-message prefix:

```text
PRD-AMENDMENT: <short description>
```

The commit body must include:

- reason
- files changed
- prior benchmark result invalidated
- `New benchmark round required: yes`
- `User approval: gchahal1982, <date>`

Use `results/amendment-template.md`. A commit that does not follow this format
does not change the release standard.

## Results

Use `results/template.md` for every prompt round. Commit final prompt and
engine results as:

```text
benchmark/results/round-N.md
benchmark/results/round-N-engine.md
```

After Phase C, commit the decision as:

```text
benchmark/results/round-N-decision.md
```

Do not edit a committed result file after the round is complete. If a
correction is required, add a new amendment section or run a new round.

Every completed round must include:

- scorer signature
- user signature: `gchahal1982`
- date
- commit SHA
