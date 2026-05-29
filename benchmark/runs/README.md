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
      threejs/
      metrics.json
      screenshot-aura3d.png
      screenshot-threejs.png
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
