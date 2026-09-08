# Native macOS CI evidence for 3.0.1

The adapter probe establishes whether the existing `macos-latest` GitHub runner
can execute real WebGPU work through Metal. It does not certify Aura3D rendering
or performance. The functional workflow then runs the existing HDR numerical
oracle, R03 temporal sequence, and P01 sustained particle workload without
changing their acceptance thresholds.

The first measured adapter run was
[33999331604](https://github.com/auraoneai/aura3d/actions/runs/33999331604), on
macOS 26.6.2, arm64, `Apple M1 (Virtual)`, 3 virtual CPUs and 7 GB memory.
Default headless Chromium returned no WebGPU adapter. Launching Chromium
147.0.7727.15 with `--use-angle=metal --enable-unsafe-webgpu` produced an Apple
adapter with `isFallbackAdapter: false`; CDP reported `ANGLE_METAL`,
`Apple Paravirtual device`, and WebGPU enabled. Actual compute/readback returned
`[17, 18, 21, 26]`, matching the shader's expected output without validation errors.
The artifact preserves both attempts, browser/CDP evidence, runner information,
probe hash, and the installation lockfile.

The hosted VM's physical GPU allocation, contention, thermal state and power mode
are not exposed. Measurements must disclose those unknowns and retain the exact
runner identity; this result does not prove equivalence to an earlier reference
machine. The P01 workflow records those facts in its hardware attestation and the
test independently measures foreground visibility throughout the sample.

## Immutable source transport

The functional workflow receives a task-scoped, expiring archive URL through the
masked repository secret `AURA3D_NATIVE_SOURCE_URL` and an independently recorded
SHA-256 through `AURA3D_NATIVE_SOURCE_SHA256`. Its source archive contains root
relative source/configuration/assets and authentic Git identity, excludes
credentials and installed dependencies, and is hash checked before extraction.
Never print the URL or place it in committed workflow input. Remove the temporary
secrets after the run. The isolated orchestration branch is
`codex/native-webgpu-probe-301`; it does not alter the shared working tree's HEAD
or stage unrelated changes.

Each workload has an independent JSON report and output directory. All reports,
screenshots and failure traces are uploaded even when a workload fails; the final
job fails if any workload did not pass. The functional workflow records archive
SHA-256, workflow commit, source HEAD and source status so adapter evidence cannot
be confused with evidence for another source snapshot.
