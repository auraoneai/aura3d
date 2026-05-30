# Run Artifact Contract

Every benchmark round must write artifacts into this structure:

```text
benchmark/runs/round-N/
  codex-aura3d/
    prompt-01/
      source/
      build.log
      run.log
      metrics.json
      screenshot.png
      notes.md
  codex-threejs/
    prompt-01/
      ...
  claude-aura3d/
    prompt-01/
      ...
  claude-threejs/
    prompt-01/
      ...
  engine/
    engine-01-material-grid/
      aura3d/
        source/
        build.log
        run.log
        metrics.json
        screenshot.png
      threejs/
        source/
        build.log
        run.log
        metrics.json
        screenshot.png
      scorer-notes.md
      notes.md
```

Repeat `prompt-01` through `prompt-10` for every run.
Repeat `engine-01` through `engine-05` for the engine parity benchmark.

## `metrics.json`

Each `metrics.json` must include:

```json
{
  "prompt": "01-physics-playground",
  "agent": "Codex",
  "library": "Aura3D",
  "compiles": true,
  "runsInBrowser": true,
  "linesOfUserCode": 0,
  "filesCreated": 0,
  "hallucinatedApis": 0,
  "inventedAssetPaths": 0,
  "repairTurns": 0,
  "timeToFirstUsableRenderMs": 0,
  "bundleSizeGzipBytes": 0,
  "screenshot": "screenshot.png"
}
```

These metrics can be gathered by scripts, but scripts must not score visual match, modifiability, prompt wins, or release readiness.

Use `null` for unavailable numeric fields after a failure. Do not use `0` as a
failure placeholder.

## Engine `metrics.json`

Each engine-side `metrics.json` must include:

```json
{
  "scene": "engine-01-material-grid",
  "library": "Aura3D",
  "routeHealth": "pass",
  "firstUsableRenderMs": 0,
  "p50Fps": 0,
  "p95FrameTimeMs": 0,
  "fpsInstrumentationStatus": "pass",
  "fpsCalibration": {
    "emptyRaf": { "p50Fps": 120, "p95FrameTimeMs": 9 },
    "webglControl": { "p50Fps": 60, "p95FrameTimeMs": 18 },
    "verdict": { "status": "pass", "failures": [] }
  },
  "drawCalls": 0,
  "triangleCount": 0,
  "jsHeapPeakBytes": 0,
  "gpuMemoryBytes": null,
  "bundleSizeGzipBytes": 0,
  "sourceLoc": 0,
  "screenshot": "screenshot.png"
}
```

Use `metrics/README.md` for measurement definitions.

If FPS calibration fails, set `fpsInstrumentationStatus` to `"invalid"`, record
`fpsInstrumentationFailures`, and set `p50Fps` and `p95FrameTimeMs` to `null`.

## `notes.md`

Each `notes.md` must record:

- exact prompt file used
- context bundle path
- install command
- build command
- run command
- screenshot timestamp
- failures or repair turns
- any agent questions or assumptions

Do not rewrite notes after scoring except by adding a dated correction section.

## Runtime Evidence

When the prompt depends on motion or interaction, keep the required
`screenshot.png` and add one of:

- `runtime-notes.md` describing the observed interaction or animation.
- extra screenshots named `screenshot-02.png`, `screenshot-03.png`.
- a Playwright trace path recorded in `notes.md`.

Runtime evidence can support scoring but cannot replace the main screenshot.
