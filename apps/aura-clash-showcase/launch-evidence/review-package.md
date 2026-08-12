# Aura Clash Launch Review Package

Generated: 2026-08-11T23:48:06.844Z

This package is for release review. It summarizes generated launch evidence, but it does not approve the visual gate automatically. The visual approval gate still requires explicit human approval.

## Evidence summary

| Gate | Status |
| --- | --- |
| Local gates | PASS |
| 2.0 flagship readiness evidence | PASS |
| First-frame screenshot metadata | PASS |
| First-frame screenshot file | PASS |
| Combat screenshot file | PASS |
| KO/reset screenshot file | PASS |
| Visual review evidence contract | PASS |
| Screenshot compositions | THREE CAPTURED |
| Launch asset visual source evidence | PRESENT FOR REVIEW |
| Vercel deployment | PASS |
| Deployed route and GLB URLs | MISSING / NOT PASSING |
| Workflow evidence | MISSING / NOT PASSING |
| Visual approval artifact | MISSING |
| Launch evidence manifest | PRESENT FOR REVIEW |

## Evidence files

- localGates: apps/aura-clash-showcase/tests/reports/flagship-gates.json
- readiness: apps/aura-clash-showcase/tests/reports/flagship-readiness.json
- screenshotMeta: apps/aura-clash-showcase/launch-evidence/first-frame.json
- screenshotPng: apps/aura-clash-showcase/launch-evidence/aura-clash-arena-first-frame.png
- combatScreenshotPng: apps/aura-clash-showcase/launch-evidence/aura-clash-arena-combat-frame.png
- koResetScreenshotPng: apps/aura-clash-showcase/launch-evidence/aura-clash-arena-ko-frame.png
- vercelDeploy: apps/aura-clash-showcase/launch-evidence/vercel-deploy.json
- deployedRoutes: apps/aura-clash-showcase/launch-evidence/deployed-routes.json
- workflow: apps/aura-clash-showcase/launch-evidence/workflow.json
- visualApproval: missing
- launchAssetEvidence: apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json
- manifest: apps/aura-clash-showcase/launch-evidence.manifest.json

## Screenshot review

- First-frame screenshot: apps/aura-clash-showcase/launch-evidence/aura-clash-arena-first-frame.png
- Combat screenshot: apps/aura-clash-showcase/launch-evidence/aura-clash-arena-combat-frame.png
- KO/reset screenshot: apps/aura-clash-showcase/launch-evidence/aura-clash-arena-ko-frame.png
- Captured target: http://127.0.0.1:5178/playable/?capture=first-frame
- Final URL: http://127.0.0.1:5178/playable/?capture=first-frame
- Page title: Play Aura Clash - Aura3D Browser Fighting Game
- Visual evidence contract: aura-clash-screenshot-review-v1
- Screenshot compositions captured: 3/3
- Machine visual evidence gate: PASS

## Source-only visual evidence contract

This section reports machine-readable screenshot evidence for review. It does not replace human visual approval, and it should not be used to mark the visual gate complete by itself.

Overall machine-readable status: PASS

| Area | Status | Page declaration | Visible DOM signal | Text signal |
| --- | --- | --- | --- | --- |
| Debug overlays | PASS | yes | no | no |
| Readable fighters | PASS | yes | yes | yes |
| Effects | PASS | yes | no | no |
| HUD | PASS | yes | yes | yes |
| Stage depth | PASS | yes | yes | yes |
| Lighting and materials | PASS | yes | no | yes |

Required visual review coverage:

- Debug overlays: debug/collider/hitbox/runtime evidence must be visible or explicitly declared.
- Readable fighters: both fighters must be visible and readable in silhouette, pose, and side.
- Effects: combat VFX, particles, impacts, bloom, trails, or flashes must be visible or explicitly declared.
- HUD: health, timer, round, combo, controls, or pause/status HUD must be readable.
- Stage depth: foreground, midground, background, floor, shadows, parallax, or arena boundaries must be evident.
- Lighting/materials: lighting setup, shadows, reflections, emissive/metal/glass/material contrast, or equivalent checks must be evident.

## Screenshot composition evidence

Captured compositions: 3/3
Optional compositions available from route/env: 0
Fallback compositions available from capture source: 2
Total composition targets available before capture limit: 2
Three-composition evidence available: yes

| Composition | Role | Status | Screenshot | Target |
| --- | --- | --- | --- | --- |
| First-frame screenshot | arena-establishing | PASS | apps/aura-clash-showcase/launch-evidence/first-frame.png | http://127.0.0.1:5178/playable/?capture=first-frame |
| Fighter readability composition | fighter-readability | PASS | apps/aura-clash-showcase/launch-evidence/first-frame.fighter-readability.png | http://127.0.0.1:5178/playable/?capture=match-start |
| Effects, HUD, and debug composition | effects-hud-debug | PASS | apps/aura-clash-showcase/launch-evidence/first-frame.effects-hud-debug.png | http://127.0.0.1:5178/playable/?capture=combat-impact |

| Expected composition | Must show |
| --- | --- |
| Arena establishing | full stage composition, stage depth, lighting/material context |
| Fighter readability | both fighters, readable silhouettes/poses, HUD relationship |
| Effects, HUD, and debug | combat effects, HUD, debug overlays |

## Fighter visual validation source evidence

This source evidence helps reviewers check Quaternius-derived fighter provenance, typed asset coverage, bounds, material readability, and no-fallback policy. It still does not replace browser screenshot review or user approval.

```json
{
  "ok": null,
  "generatedAt": null,
  "assetCount": null,
  "launchGlbCount": null,
  "fighterCount": null,
  "playableFighterCount": null,
  "routeUsageCount": null
}
```

## Visual approval artifact

_Missing._

User decision:

- [ ] Approved visually
- [ ] Needs visual changes

Approval command after explicit user approval:

```bash
AURA_CLASH_APPROVED_BY="<name>" AURA_CLASH_VISUAL_APPROVAL_CONFIRMED=1 npm run launch:approve-visual
npm run launch:documentation-check
```

## Local gate details

```json
{
  "ok": true,
  "commandCount": 8,
  "completedCount": 8,
  "failedCount": 0,
  "generatedAt": "2026-08-11T22:08:03.535Z"
}
```

## 2.0 flagship readiness details

```json
{
  "ok": true,
  "generatedAt": "2026-08-11T22:06:30.561Z",
  "route": null,
  "release": null,
  "contextualRoute": null,
  "gates": [
    {
      "id": "flagship-playwright-suite-present",
      "title": "Flagship Playwright suite covers the manual failure modes",
      "ok": true,
      "summary": "The flagship Playwright suite exists and names controls, KO/reset, artifact, performance, and audio gates.",
      "evidencePaths": [
        "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "control-key-coverage",
      "title": "A/D/S/Space/Shift/Q/J/K/L/P/R controls are release-gated",
      "ok": true,
      "summary": "The flagship suite must exercise every shipped keyboard control, including down, guard, special, pause, and reset.",
      "evidencePaths": [
        "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "runtime-controls-proof",
      "title": "Runtime proof publishes controls evidence every frame",
      "ok": true,
      "summary": "window.__AURA_CLASH_ARENA_PROOF__ must include controls.lastInput, downSupported, specialRequiresMeter, koLocked, and resetCount in the normal writeProof path.",
      "evidencePaths": [
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "distinct-release-fighter-assets",
      "title": "Flagship proof rejects same-model tinting and training mannequin fighters",
      "ok": true,
      "summary": "The flagship route must publish player/rival typed fighter asset ids, URLs, hashes, distinctness, and release readiness. Same-model tinting and the training mannequin must fail release gates.",
      "evidencePaths": [
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
        "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "ko-lock-reset-gated",
      "title": "KO lock and reset behavior are release-gated",
      "ok": true,
      "summary": "The flagship suite must prove KO cannot keep taking damage or repeat attacks until reset, and reset clears the round.",
      "evidencePaths": [
        "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "normal-hit-vfx-no-debug-cubes",
      "title": "Normal-play hit VFX are not debug cubes or generic box artifacts",
      "ok": true,
      "summary": "The normal hit-effect path must be a designed VFX path, not lit cube render items.",
      "evidencePaths": [
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
        "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "performance-proof-contract",
      "title": "Flagship proof exposes explicit performance budgets",
      "ok": true,
      "summary": "The playable route must publish performance.frameTimeMs, fps, drawCalls, and budgetOk and the test suite must enforce thresholds.",
      "evidencePaths": [
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
        "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "audio-proof-contract",
      "title": "Flagship proof exposes audio readiness instead of silent placeholders",
      "ok": true,
      "summary": "The playable route must publish audio readiness with music, SFX, mute, and last cue evidence.",
      "evidencePaths": [
        "apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts",
        "apps/aura-clash-showcase/tests/flagship-readiness.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "dedicated-visual-regression-spec",
      "title": "Dedicated visual-regression spec captures the required Aura Clash states",
      "ok": true,
      "summary": "The PRD-required visual states must live in a dedicated Playwright spec and write contextual screenshot artifacts.",
      "evidencePaths": [
        "apps/aura-clash-showcase/tests/visual-regression.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "dedicated-performance-budget-spec",
      "title": "Dedicated performance-budget spec enforces frame, draw, JS, CSS, and GLB budgets",
      "ok": true,
      "summary": "Performance proof must be a dedicated Playwright gate instead of only route text.",
      "evidencePaths": [
        "apps/aura-clash-showcase/tests/performance-budget.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "dedicated-asset-quality-spec",
      "title": "Dedicated asset-quality spec validates final fighter assets",
      "ok": true,
      "summary": "Final fighter assets must be validated independently from the broad flagship suite.",
      "evidencePaths": [
        "apps/aura-clash-showcase/tests/asset-quality.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "dedicated-audio-spec",
      "title": "Dedicated audio spec validates unlock and gameplay cue proof",
      "ok": true,
      "summary": "Audio readiness must prove user-gesture unlock and gameplay cue publication.",
      "evidencePaths": [
        "apps/aura-clash-showcase/tests/audio.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "dedicated-deployed-playable-spec",
      "title": "Dedicated deployed-playable spec probes route, assets, console, and controls",
      "ok": true,
      "summary": "Deployment parity must be represented by a dedicated Playwright spec that can target local or deployed origins.",
      "evidencePaths": [
        "apps/aura-clash-showcase/tests/deployed-playable.spec.ts"
      ],
      "blockers": [],
      "status": "pass"
    },
    {
      "id": "script-wiring",
      "title": "Flagship gates are runnable from app and root package scripts",
      "ok": true,
      "summary": "The readiness tool, dedicated Playwright specs, and flagship gate runner must be reachable through stable package scripts.",
      "evidencePaths": [
        "apps/aura-clash-showcase/package.json",
        "package.json",
        "apps/aura-clash-showcase/scripts/run-flagship-readiness-gates.mjs"
      ],
      "blockers": [],
      "status": "pass"
    }
  ]
}
```

## Deployment details

```json
{
  "ok": true,
  "deploymentUrls": [
    "https://marketing-wnjnbc58p-veerone.vercel.app",
    "https://vercel.com/veerone/marketing/8cUHmwebRWJyHDtB2UzzNcmjzZrX"
  ],
  "generatedAt": "2026-06-06T22:52:05.391Z",
  "durationMs": 12247
}
```

## Deployed route details

```json
{
  "ok": false,
  "origin": "https://aura3d.auraone.ai",
  "canonicalBasePath": "/showcase/aura-clash",
  "routeCount": 6,
  "manifestGlbCount": 12,
  "targetCount": 33,
  "failedCount": 1,
  "generatedAt": "2026-07-31T16:53:51.756Z"
}
```

## Workflow details

```json
{
  "ok": false,
  "stepCount": 4,
  "completedCount": 2,
  "failedCount": 1,
  "generatedAt": "2026-07-30T08:16:09.097Z"
}
```
