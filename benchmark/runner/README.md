# Aura3D 2.0 benchmark runner

The runner directory contains finite utilities used by the scripts listed in
the root `package.json`. Read the source of the selected command before running
it; no removed Markdown PRD or prompt packet governs these tools.

## Frozen workload delivery

Agent workload instructions, asset permissions, order, and required visual
evidence are read from `benchmark/workloads.json`. A delivery packet must copy
the selected workload object without adding prompt-specific hints, API names,
repair advice, or visual suggestions. Changing a workload during a run voids
that run.

For workloads 1-9, no prompt-provided external asset is allowed. Workload 10
may use only `benchmark/assets/sneaker.glb`. Library-bundled helpers/assets
exposed through the supplied context remain part of the library under test.

## Execution boundary

- Use a clean output directory and the exact frozen context manifest.
- The authoring agent may install dependencies and run finite builds.
- Browser servers, capture, metrics, and visual review run after authoring has
  stopped so the authoring agent cannot tune against hidden measurements.
- Record command, exit status, runtime errors, asset/network failures, browser,
  viewport, DPR, machine, dependency lock, and source commit.
- Do not count generated assets/configuration as authored application code.
- Do not replace a failed workload with a different asset or easier scene.

## Evidence boundary

Machine screenshots establish only visible facts. Human visual approval must
identify reviewer, date, commit, exact artifact hashes, scope, verdict, and
blocking issues. Benchmark outputs do not become public claims until the
current installed-package comparison and release claim gates accept them.
