# Claude Code Agent Context Results

Generated: 2026-05-29T05:06:17Z

## Status

Manual external-agent pass for Claude Code. Together with the Codex self-test,
five-task eval, repair eval, and fresh Codex context-only run, this completes
the required Round 7 local/external-agent proof. Cursor and GitHub Copilot are
optional subscription follow-up runs.

## Controlled Input

Claude Code was run headlessly in `/tmp/aura3d-claude-code-eval` with only:

- `llms.txt`
- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.cursor/rules/aura3d.mdc`
- `.github/copilot-instructions.md`
- `docs/agents/*`
- Local public package tarballs from `tests/reports/package-clean-install-workspace/tarballs`
- `assets/sneaker.glb`
- `assets/shoe2.glb`

The prompt instructed Claude Code not to read `/Users/gurbakshchahal/aura3d`
or any active repo source path. Verification after generation found no active
repo source path in the generated app.

## Task Set

| Task | Result | Evidence |
|---|---:|---|
| Build a product viewer for `sneaker.glb` with orbiting and studio lighting. | pass | Generated `src/main.ts` uses `model(assets.sneaker)`, `lights.studio()`, key/fill/rim point lights, softboxes, and `interactions.orbit`. |
| Add a slow camera dolly and rain effect. | pass | Generated scene uses `camera.dolly`, `timeline.loop`, `effects.rain`, fog, and bloom. |
| Make the floor reflective. | pass | Generated scene uses a low-roughness metallic PBR floor. Screenshot shows a dark reflective studio floor. |
| Add a click handler that changes the model to `shoe2.glb`. | pass | Playwright test confirmed the active typed asset URL changes from `/aura-assets/sneaker...glb` to `/aura-assets/shoe2...glb`. |
| Produce a static deployment bundle. | pass | `npm run build` produced `dist/`; `aura3d check-deploy --dist dist` passed using the CLI tarball. |

## Score

| Agent | Compiles | Runs | Visual/Bundle Pass | API Hallucinations | Asset Path Errors | User Prompt Turns | Claude Tool Turns | Manual Corrections | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Claude Code | yes | yes | yes | 0 | 0 | 1 | 47 | 0 | Claude Code generated and internally repaired the app in one headless run. One intermediate canvas-stacking issue was fixed by Claude before final verification. |

## Independent Verification

Commands rerun by Codex after Claude completed:

```bash
npm run build
npm test
npm exec --package ../tarballs/aura3d-cli-1.0.0.tgz -- aura3d assets validate
npm exec --package ../tarballs/aura3d-cli-1.0.0.tgz -- aura3d check-deploy --dist dist
```

Results:

- `npm run build`: passed.
- `npm test`: passed, 2/2 Playwright tests.
- `aura3d assets validate`: passed.
- `aura3d check-deploy --dist dist`: passed.
- Route health: `ready=true`, `backend=webgl2`, `drawCalls=9`.
- Screenshot report: `bytes=226437`, `litPixels=35009`, `uniqueBuckets=54`.
- Source SHA-256: `f80d20a0a8844880f89101d2d2186b10851d5b0b4a8dce146e7fb436c54b4029`.
- Screenshot SHA-256: `be07cac9fe43d4989fc1cf94f02947a566b5b7f700cf97c8b971ac69e6fb0e5d`.

## Visual Review

Human review label: `product-quality-pass` for the five-task evaluation scope.

The screenshot shows a real sneaker GLB centered in a studio scene with visible
softboxes, rain volume, a dark reflective floor, and a click hint. It is not as
polished as the curated starter-template screenshots, and it should not be used
as marketing hero proof. It does prove that Claude Code could use the agent
context plus public packages to create a visually coherent Aura3D scene without
hallucinating archived APIs or raw asset URLs.

## Optional Agent Runs

- Cursor: optional subscription run, not a local release blocker.
- GitHub Copilot: optional subscription run, not a local release blocker.
