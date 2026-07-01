# Frozen Benchmark Release Gates

Date: 2026-06-18
Status: required for benchmark/superiority claims

The frozen benchmark exists to prevent broad comparison claims from drifting
with local prompts, subjective screenshots, or owner-only scoring.

## When This Gate Applies

Use this gate before claiming:

- Aura3D beats low-level renderer code;
- Aura3D is visually superior to Three.js/Babylon-style code;
- Aura3D passes an external AI-agent benchmark;
- Aura3D has market-leading or best-in-class visual quality.

## Required Artifacts

- Frozen prompt set and benchmark protocol.
- Aura3D implementation source for each prompt.
- Baseline implementation source for each prompt.
- Browser screenshots or captures generated from the same environment.
- Route-health or equivalent metadata for every route.
- Neutral scorer outputs committed or attached as immutable artifacts.
- Engine parity result showing the comparison is fair.
- Decision file with explicit `Decision: ship` or `Decision: no-ship`.
- Claim review showing the final wording matches the benchmark scope.

## Passing Criteria

- Every benchmark route builds and runs from a clean checkout.
- Screenshots are current and reproducible.
- The main subject is readable in each compared route.
- No route uses raw asset IDs, invented URLs, direct loader hacks, or CSS scene
  effects in violation of the product boundary.
- Neutral scoring is present; owner-only scoring is not enough.
- The final decision file cites exact result paths.

## Blocking Conditions

- Missing neutral scorer artifacts.
- Missing human review where required by the protocol.
- Any decision file that says `pending`, `blocked`, or `no-ship`.
- Screenshots that prove only nonblank output.
- Claims broader than the prompt set, device matrix, or scoring rubric.

## Allowed Output

After a passing benchmark, public copy may describe only the exact benchmark:

"Aura3D passed the frozen [benchmark name] on [date] under [protocol path]."

Do not generalize a scoped benchmark into universal renderer superiority.
