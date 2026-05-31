# Codebase Map

| Area | Path | Purpose |
|---|---|---|
| Agent API | `packages/engine/src/agent-api/` | Scene, model, camera, lights, materials, effects, timeline, interactions, diagnostics, screenshots |
| Asset CLI | `packages/aura3d-cli/src/` | Manifest, add, validate, typegen, thumbnails, doctor, deploy checks, agent onboarding |
| React adapter | `packages/react/src/` | Thin React wrapper over the same core scene concepts |
| Scaffolder | `packages/create-aura3d/` | `product-viewer`, `cinematic-scene`, `mini-game` templates |
| Starter examples | `apps/hello-world-typed-asset/`, `apps/material-lighting/`, `apps/camera-path/` | Live API proof routes |
| Agent docs | `docs/agents/` and `llms.txt` | Agent-readable instructions and anti-hallucination rules |
| Legacy archive | `archive/legacy-ai-runtime/` | Historical pre-cutover work, not active product surface |
