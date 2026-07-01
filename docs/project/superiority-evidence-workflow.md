# Superiority Evidence Workflow

Date: 2026-06-18
Status: required for comparison claims

This workflow governs claims that Aura3D is better, faster, easier, or visually
superior to low-level renderer code, Three.js, Babylon.js, Unity web workflows,
or Unreal web workflows.

## Principle

Comparison claims must be narrow, reproducible, and evidence-backed. Marketing
copy cannot turn a scoped benchmark into universal superiority.

## Workflow

1. Freeze prompts, assets, allowed libraries, device/browser matrix, and scoring
   rubric.
2. Build Aura3D and baseline implementations from clean checkouts.
3. Require the same asset provenance and license standards for both sides.
4. Capture desktop and mobile screenshots or videos from the same environment.
5. Collect route-health/capability metadata for each implementation.
6. Score with neutral reviewers.
7. Run engine parity and source safety checks.
8. Commit or attach immutable artifacts.
9. Write a decision file.
10. Review final copy against the exact result scope.

## Required Evidence

- benchmark protocol path;
- prompt set;
- source paths;
- asset provenance;
- screenshots/captures;
- route-health/capability metadata;
- neutral scores;
- engine parity result;
- final decision file;
- approved public wording.

## Blockers

- owner-only scoring;
- missing baseline source;
- missing screenshots;
- missing provenance;
- non-reproducible local reports;
- source safety violations;
- claims broader than the benchmark.

## Allowed Wording After Passing

Use scoped wording:

"In the frozen [benchmark name] run on [date], Aura3D scored [result] against
[baseline] under [protocol]."

Do not say Aura3D universally replaces or beats another engine unless a future
benchmark explicitly supports that exact claim.
