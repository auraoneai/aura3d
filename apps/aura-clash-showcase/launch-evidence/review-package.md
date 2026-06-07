# Aura Clash Launch Review Package

Generated: 2026-06-06T19:52:41.020Z

This package is for release review. It summarizes generated launch evidence, but it does not approve the visual gate automatically. The visual approval gate still requires explicit human approval.

## Evidence summary

| Gate | Status |
| --- | --- |
| Local gates | PASS |
| 1.0.6 readiness evidence | PASS |
| First-frame screenshot metadata | NOT USED BY CURRENT 1.0.6 FLOW |
| First-frame screenshot file | PASS |
| Combat screenshot file | PASS |
| KO/reset screenshot file | PASS |
| Visual review evidence contract | MISSING |
| Screenshot compositions | MISSING |
| Launch asset visual source evidence | PRESENT FOR REVIEW |
| Vercel deployment | PASS |
| Deployed route and GLB URLs | PASS |
| Workflow evidence | MISSING / NOT PASSING |
| Visual approval artifact | MISSING |
| Launch evidence manifest | PRESENT FOR REVIEW |

## Evidence files

- localGates: apps/aura-clash-showcase/tests/reports/flagship-gates.json
- readiness: apps/aura-clash-showcase/launch-evidence/aura-clash-106-readiness.json
- screenshotMeta: missing
- screenshotPng: apps/aura-clash-showcase/launch-evidence/playable-106-first-frame.png
- combatScreenshotPng: apps/aura-clash-showcase/launch-evidence/playable-106-combat-frame.png
- koResetScreenshotPng: apps/aura-clash-showcase/launch-evidence/playable-106-ko-reset.png
- vercelDeploy: apps/aura-clash-showcase/launch-evidence/vercel-deploy.json
- deployedRoutes: apps/aura-clash-showcase/launch-evidence/deployed-routes.json
- workflow: missing
- visualApproval: missing
- launchAssetEvidence: apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json
- manifest: apps/aura-clash-showcase/launch-evidence.manifest.json

## Screenshot review

- First-frame screenshot: apps/aura-clash-showcase/launch-evidence/playable-106-first-frame.png
- Combat screenshot: apps/aura-clash-showcase/launch-evidence/playable-106-combat-frame.png
- KO/reset screenshot: apps/aura-clash-showcase/launch-evidence/playable-106-ko-reset.png
- Captured target: missing
- Final URL: missing
- Page title: missing
- Visual evidence contract: missing
- Screenshot compositions captured: missing
- Machine visual evidence gate: missing

## Source-only visual evidence contract

This section reports machine-readable screenshot evidence for review. It does not replace human visual approval, and it should not be used to mark the visual gate complete by itself.

_Missing screenshot metadata visualReviewEvidence._

## Screenshot composition evidence

_Missing screenshot metadata compositionEvidence._

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
  "generatedAt": "2026-06-06T13:50:06.504Z"
}
```

## 1.0.6 readiness details

```json
{
  "ok": true,
  "generatedAt": "2026-06-06T14:17:11.796Z",
  "route": "/playable/",
  "release": "1.0.6",
  "contextualRoute": "Aura Clash Arena",
  "gates": {
    "flagshipGates": {
      "ok": true,
      "status": "flagship-ready",
      "generatedAt": "2026-06-06T13:50:06.504Z",
      "commandCount": 8,
      "failedCount": 0
    },
    "flagshipReadiness": {
      "ok": true,
      "status": "flagship-ready",
      "generatedAt": "2026-06-06T13:48:02.865Z",
      "gateCount": 14
    },
    "deployedProof": {
      "ok": true,
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
    "https://marketing-nwvgxkbrc-veerone.vercel.app",
    "https://vercel.com/veerone/marketing/HXXttjau5rekZd9arTgBi2VVJ83D"
  ],
  "generatedAt": "2026-06-06T14:16:19.075Z",
  "durationMs": 16239
}
```

## Deployed route details

```json
{
  "ok": true,
  "origin": "https://aura3d.auraone.ai",
  "canonicalBasePath": "/showcase/aura-clash",
  "routeCount": 6,
  "manifestGlbCount": 11,
  "targetCount": 32,
  "failedCount": 0,
  "generatedAt": "2026-06-06T14:17:11.793Z"
}
```

## Workflow details

_Missing._
