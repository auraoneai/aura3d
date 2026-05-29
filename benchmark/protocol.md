# Benchmark Protocol

This protocol is frozen for a benchmark round. Editing it during a run voids the run.

## Runs

Run the same 10 prompts four times:

1. Codex with Aura3D context.
2. Codex with raw Three.js context.
3. Claude Code with Aura3D context.
4. Claude Code with raw Three.js context.

Each run starts from a clean directory. Do not reuse generated code, screenshots, fixes, or notes from another run.

After the prompt runs, run the engine parity benchmark in `engine/README.md`.
That benchmark does not use agents; it compares hand-authored Aura3D and
Three.js reference scenes.

## Context Bundles

Aura3D context may include:

- `llms.txt`
- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.cursor/rules/aura3d.mdc`
- `.github/copilot-instructions.md`
- `docs/agents/*`
- public package READMEs and public API docs
- the starter templates as examples

Aura3D context may not include:

- private source spelunking in `packages/*/src`
- prior generated benchmark outputs
- hidden repair hints not committed before the run
- edited prompts or rubric

Raw Three.js context may include:

- official Three.js docs
- official Three.js examples
- package installation instructions

Raw Three.js context may not include Aura3D source, Aura3D examples, or Aura3D agent rules.

## Agent Rules

- Give the agent exactly one prompt at a time.
- Do not provide extra hints after seeing failures.
- Do not hand-edit generated code.
- If the agent asks for a fix turn, record it as a repair turn.
- If the run cannot proceed, record the failure instead of changing the prompt.

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

Use `scoring/README.md` for the scoring handoff.

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

Use `results/template.md` for every round. Commit final results as:

```text
benchmark/results/round-N.md
benchmark/results/round-N-decision.md
```

Do not edit a committed result file after the round is complete. If a correction is required, add a new amendment section or run a new round.

Every completed round must include:

- scorer signature
- user signature: `gchahal1982`
- date
- commit SHA
