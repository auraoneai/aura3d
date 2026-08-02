# Aura Clash Launch Review Package

Generated: 2026-07-31T17:07:09.137Z

This package is for release review. It summarizes generated launch evidence, but it does not approve the visual gate automatically. The visual approval gate still requires explicit human approval.

## Evidence summary

| Gate | Status |
| --- | --- |
| Local gates | PASS |
| 1.0.6 readiness evidence | MISSING / NOT PASSING |
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
- readiness: apps/aura-clash-showcase/launch-evidence/aura-clash-106-readiness.json
- screenshotMeta: apps/aura-clash-showcase/launch-evidence/first-frame.json
- screenshotPng: apps/aura-clash-showcase/launch-evidence/playable-106-first-frame.png
- combatScreenshotPng: apps/aura-clash-showcase/launch-evidence/playable-106-combat-frame.png
- koResetScreenshotPng: apps/aura-clash-showcase/launch-evidence/playable-106-ko-reset.png
- vercelDeploy: apps/aura-clash-showcase/launch-evidence/vercel-deploy.json
- deployedRoutes: apps/aura-clash-showcase/launch-evidence/deployed-routes.json
- workflow: apps/aura-clash-showcase/launch-evidence/workflow.json
- visualApproval: missing
- launchAssetEvidence: apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json
- manifest: apps/aura-clash-showcase/launch-evidence.manifest.json

## Screenshot review

- First-frame screenshot: apps/aura-clash-showcase/launch-evidence/playable-106-first-frame.png
- Combat screenshot: apps/aura-clash-showcase/launch-evidence/playable-106-combat-frame.png
- KO/reset screenshot: apps/aura-clash-showcase/launch-evidence/playable-106-ko-reset.png
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
| Debug overlays | PASS | yes | no | yes |
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
npm run launch:update-prd
```

## Local gate details

```json
{
  "ok": true,
  "commandCount": 8,
  "completedCount": 8,
  "failedCount": 0,
  "generatedAt": "2026-06-07T20:10:37.904Z"
}
```

## 1.0.6 readiness details

```json
{
  "ok": false,
  "generatedAt": "2026-07-31T16:53:51.780Z",
  "route": "/playable/",
  "release": "1.0.6",
  "contextualRoute": "Aura Clash Arena",
  "gates": {
    "flagshipGates": {
      "ok": true,
      "status": "flagship-ready",
      "generatedAt": "2026-06-07T20:10:37.904Z",
      "commandCount": 8,
      "failedCount": 0
    },
    "flagshipReadiness": {
      "ok": true,
      "status": "flagship-ready",
      "generatedAt": "2026-06-07T20:09:20.786Z",
      "gateCount": 14
    },
    "deployedProof": {
      "ok": false,
      "source": "collect-launch-evidence-probes"
    }
  }
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
