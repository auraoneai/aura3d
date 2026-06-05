# Aura Clash Launch Readiness

Generated: 2026-06-05T19:29:55.677Z

This report classifies readiness only. It does not mark PRD checkboxes and does not replace generated evidence, deployed proof, or explicit user approval.

## Summary

- Gates ready: 1/9
- Gates open: 8

## Remaining gates

| Gate | Status | Missing artifacts | Command path |
| --- | --- | --- | --- |
| Quaternius-derived fighter visual validation proof: fighters visible, grounded, oriented, readable, and no detached accessories. | OPEN | firstFrameJson, reviewPackage, visualApproval, launchAssetEvidence | `npm run launch:proof, then review launch-evidence/review-package.md, then record visual approval after explicit user approval.` |
| Source manifests and typed assets are separated from screenshot approval, deployed GLB reachability, and human visual approval. | OPEN | firstFrameJson, reviewPackage, deployedRoutes, visualApproval | `Generate screenshot/review evidence, deployed route evidence, and explicit visual approval evidence.` |
| Capture and review first-frame screenshot. | OPEN | firstFrameJson, reviewPackage | `npm run launch:screenshot && npm run launch:review-package` |
| Build app and marketing site. | OPEN | localGates | `npm run launch:local-gates` |
| Deploy to Vercel. | READY | none | `AURA_CLASH_RUN_VERCEL_DEPLOY=1 npm run launch:proof` |
| Confirm deployed route and GLB URLs return 200. | OPEN | deployedRoutes | `AURA_CLASH_RUN_DEPLOYED_EVIDENCE=1 npm run launch:proof` |
| Gameplay smoke passes. | OPEN | localGates | `npm run launch:local-gates` |
| Visual screenshot approved by user. | OPEN | visualApproval | `AURA_CLASH_APPROVED_BY='<name>' AURA_CLASH_VISUAL_APPROVAL_CONFIRMED=1 npm run launch:approve-visual` |
| Deployed route confirmed. | OPEN | deployedRoutes | `AURA_CLASH_RUN_DEPLOYED_EVIDENCE=1 npm run launch:proof` |

## Artifact status

| Artifact | Status | Path |
| --- | --- | --- |
| localGates | MISSING / NOT OK | apps/aura-clash-showcase/launch-evidence/local-gates.json |
| firstFrameJson | MISSING / NOT OK | apps/aura-clash-showcase/launch-evidence/first-frame.json |
| firstFramePng | OK | apps/aura-clash-showcase/launch-evidence/first-frame.png |
| reviewPackage | MISSING / NOT OK | apps/aura-clash-showcase/launch-evidence/review-package.md |
| vercelDeploy | OK | apps/aura-clash-showcase/launch-evidence/vercel-deploy.json |
| deployedRoutes | MISSING / NOT OK | apps/aura-clash-showcase/launch-evidence/deployed-routes.json |
| visualApproval | MISSING / NOT OK | apps/aura-clash-showcase/launch-evidence/visual-approval.json |
| launchAssetEvidence | MISSING / NOT OK | apps/aura-clash-showcase/assets/source/aura-clash-launch-asset-evidence.json |
| prdCoverage | OK | apps/aura-clash-showcase/launch-evidence/prd-evidence-coverage.json |
| wiring | OK | apps/aura-clash-showcase/launch-evidence/evidence-wiring.json |
| crossRuntime | MISSING / NOT OK | apps/aura-clash-showcase/launch-evidence/cross-runtime-evidence.json |
