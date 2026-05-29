# Scoring Handoff

Benchmark scoring must be neutral. Codex cannot grade Codex. Claude cannot grade Claude. Aura3D-authored tools cannot grade benchmark output.

## Scorer Inputs

Give the scorer only:

- prompt file
- screenshot
- generated code listing
- `metrics.json`
- `notes.md`

Do not give the scorer:

- Aura3D agent context
- Three.js agent context
- `FinalizedPromptPlan.md` claims
- old in-repo evidence reports
- comments saying which output should win

## Required Scorer Output

For each prompt and agent pair, the scorer writes:

```text
Prompt:
Agent:
Visual match Aura3D:
Visual match Three.js:
Modifiability Aura3D:
Modifiability Three.js:
Metric winner:
Final result: Aura3D win / tie / Aura3D loss
Reason:
```

The scorer must explain visual scores in plain language. A screenshot that reads as random primitives, symbolic lines, labels standing in for effects, or one object on a grid cannot score above 2.

The scorer must also fill a per-metric table:

```text
Metric:
Aura3D value:
Three.js value:
Winner: Aura3D / Three.js / tie
Reason:
```

Repeat that table for all 11 prompt metrics. The final prompt result must be
derived from the non-tied metric winners and the visual-score rule in
`rubric.md`.

## Conflict Rule

If a scorer is unsure, record `tie` and explain why. Do not guess a win to preserve the release plan.
