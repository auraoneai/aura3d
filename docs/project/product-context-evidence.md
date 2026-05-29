# Product Context Evidence

Generated: 2026-05-29T09:34:53.842Z

## Summary

- Claims with evidence: 39/39
- Known gaps tracked: 0/0
- Optional external follow-ups tracked: 6
- Automated checks passing: 34/34

## Claim Matrix

| Claim | Status | Evidence | Next Action |
|---|---|---|---|
| Aura3D is the editable scene layer for agent-written browser 3D. | `automated-pass` | `ProductContextPRD.md`<br>`README.md`<br>`marketing/index.html` |  |
| AI coding agents write TypeScript or JavaScript against a compact public API. | `automated-pass` | `pnpm run check:agent-api`<br>`tests/reports/agent-api-surface.json` |  |
| Users bring their own assets. | `automated-pass` | `tools/asset-corpus/index.ts`<br>`tools/sketchfab-asset-corpus/index.ts`<br>`tests/reports/asset-corpus.json`<br>`tests/reports/sketchfab-asset-corpus.json` | Asset corpus includes authenticated Sketchfab CC0 download/import/typegen/browser-render proof; Meshy exports remain external. |
| Aura3D provides typed asset references. | `automated-pass` | `pnpm run check:assets-cli`<br>`tests/unit/aura3d-cli/assets.test.ts` |  |
| Aura3D provides starter templates. | `automated-pass` | `pnpm run check:templates`<br>`packages/create-aura3d/templates` |  |
| Starter templates render through WebGL2 and have scene-specific render-plumbing screenshot profile checks. | `automated-pass` | `packages/create-aura3d/templates/*/tests/screenshot.spec.ts`<br>`tests/reports/create-aura3d-scaffold-smoke/*/tests/reports/screenshot.json`<br>`docs/project/starter-template-visual-review.md` |  |
| Aura3D provides diagnostics. | `automated-pass` | `pnpm run check:devtools`<br>`packages/engine/src/devtools` |  |
| Aura3D provides screenshots. | `automated-pass` | `pnpm run check:examples`<br>`tests/browser/examples-route-health.spec.ts`<br>`docs/project/starter-example-visual-review.md` |  |
| Aura3D provides static deployment checks. | `automated-pass` | `pnpm run check:deployment`<br>`packages/aura3d-cli/src/index.ts` |  |
| Public packages work from packed artifacts in clean npm projects. | `automated-pass` | `pnpm run check:clean-install`<br>`tests/reports/package-clean-install.json` |  |
| @aura3d/engine exposes the public engine surface. | `automated-pass` | `packages/engine/src/agent-api/index.ts`<br>`tools/public-api-contract/index.ts` |  |
| @aura3d/react is an optional thin React adapter. | `automated-pass` | `packages/react/src/index.ts`<br>`tools/public-api-contract/index.ts` |  |
| @aura3d/cli supports asset, doctor, deployment, serve, and agent-file flows. | `automated-pass` | `packages/aura3d-cli/src/cli.ts`<br>`packages/aura3d-cli/src/index.ts` |  |
| create-aura3d scaffolds product-viewer, cinematic-scene, and mini-game. | `automated-pass` | `packages/create-aura3d`<br>`tools/agent-templates/index.ts` |  |
| Agent-readable context is useful. | `automated-pass` | `docs/agents/*`<br>`tests/reports/agent-context/codex-self-test.json`<br>`tests/reports/agent-context/claude-code-eval.json` | Codex and Claude Code context evals pass; run Cursor and Copilot separately when available. |
| A fresh Codex context-only run can build a compiling WebGL2 app with typed assets. | `manual-pass` | `docs/project/fresh-codex-agent-context-results.md` | Run Cursor and Copilot separately; this only proves a fresh Codex run and not product-quality visual fidelity. |
| Claude Code can complete the five-task context-only eval from agent context and public tarballs. | `manual-pass` | `docs/project/claude-code-agent-context-results.md`<br>`tests/reports/agent-context/claude-code-eval.json` | This is one external-agent pass; Cursor and Copilot remain separate subscription runs. |
| Codex dogfood uses prompt-plan helpers, typed assets, route health, screenshot profile checks, and product-quality visual review for the deterministic self-test. | `automated-pass` | `tests/reports/agent-context/codex-self-test.json`<br>`tests/reports/agent-context/codex-self-test-workspace/tests/reports/screenshot.json`<br>`tools/agent-dogfood/index.ts`<br>`docs/project/prompt-visual-quality-gap.md`<br>`tests/reports/prompt-fidelity-quality.json` |  |
| Codex five-task context eval completes product viewer, camera/rain, reflective floor, click-swap, and static preview tasks with typed assets and no API hallucinations. | `automated-pass` | `docs/project/agent-dogfood-results.md`<br>`tests/reports/agent-context/codex-self-test.json`<br>`tests/reports/agent-context/codex-five-task-workspace/tests/reports/screenshot.json`<br>`tools/agent-dogfood/index.ts` | This is local Codex evidence only; run the same five-task eval with external agents before claiming cross-agent proof. |
| Codex repair eval improves a failed screenshot to product-quality by applying prompt-plan repair hints with a recorded repair turn. | `automated-pass` | `docs/project/agent-dogfood-results.md`<br>`tests/reports/agent-context/codex-self-test.json`<br>`tests/reports/agent-context/codex-repair-workspace/tests/reports/initial-screenshot.json`<br>`tests/reports/agent-context/codex-repair-workspace/tests/reports/repaired-screenshot.json`<br>`tools/agent-dogfood/index.ts` | This is local Codex evidence only; run external agent repair turns separately before claiming broad repair-loop behavior. |
| The public agent API includes prompt-plan helpers and the three starter templates use that prompt-plan flow. | `automated-pass` | `packages/engine/src/agent-api/index.ts`<br>`packages/create-aura3d/templates/*/src/main.ts`<br>`templates/*/src/main.ts`<br>`tools/prompt-fidelity-quality/index.ts` |  |
| Prompt-plan reports warn when required visual information is missing from vague plans. | `automated-pass` | `packages/engine/src/agent-api/index.ts`<br>`tests/unit/agent-api/agent-api.test.ts` |  |
| Prompt-facing rain and bloom effects have renderer-owned visual implementations beyond the previous symbolic/no-op path. | `automated-pass` | `packages/engine/src/agent-api/index.ts`<br>`docs/project/effects-vfx-visual-audit.md`<br>`tests/reports/effects-vfx-visual-audit.json` | Keep screenshot regression review on the starter and dogfood routes; this does not prove premium VFX parity. |
| The effects/VFX surface is audited for visual acceptability instead of assuming named effects are finished. | `automated-pass` | `docs/project/effects-vfx-visual-audit.md`<br>`tests/reports/effects-vfx-visual-audit.json`<br>`tools/effects-vfx-visual-audit/index.ts` | The audit passes at starter/helper level; route-level screenshots and human review are still required for premium VFX claims. |
| Current demos, tests, animations, visuals, physics, and effects meet the current scoped ProductContext visual expectation. | `automated-pass` | `docs/project/visual-systems-proof-summary.md`<br>`tests/reports/visual-systems-proof-summary.json` | This proves the scoped demos and evidence routes; it does not claim arbitrary prompt generation or premium VFX parity. |
| The three release-facing starter prompt recipes pass product-quality screenshot review. | `automated-pass` | `docs/project/prompt-fidelity-quality-results.md`<br>`tests/reports/prompt-fidelity-quality.json`<br>`tests/reports/prompt-fidelity/contact-sheet.png` |  |
| Each fixed starter has before/after prompt-fidelity evidence with source prompt, corrected failure mode, code path, screenshots, route health, and human verdict. | `automated-pass` | `docs/project/prompt-fidelity-quality-results.md`<br>`tests/reports/prompt-fidelity-quality.json`<br>`tests/reports/prompt-fidelity/before-after-contact-sheet.png` |  |
| Legacy AI-runtime code is outside the active workspace. | `automated-pass` | `archive/legacy-ai-runtime`<br>`tools/product-context-evidence/index.ts` |  |
| The public authoring model is source code plus typed assets. | `automated-pass` | `README.md`<br>`docs/agents/build-playbook.md`<br>`docs/project/fresh-codex-agent-context-results.md` |  |
| The active starter-template directory contains only the three starter templates. | `automated-pass` | `packages/create-aura3d/templates` |  |
| The three starter templates install, build, render, preview, and recover from common asset errors in clean directories. | `automated-pass` | `docs/project/clean-install-results.md`<br>`docs/project/starter-template-visual-review.md`<br>`tests/reports/package-clean-install.json` |  |
| Held-back template experiments are outside the active starter-template directory and documented in archive. | `automated-pass` | `archive/held-back-create-aura3d-templates/README.md` |  |
| Active apps directories are classified. | `automated-pass` | `docs/project/apps-classification.md` |  |
| Marketing speaks in product and workflow language. | `automated-pass` | `marketing/index.html`<br>`tools/marketing-truth/index.ts` |  |
| Marketing comprehension passes the three target-reader rubric. | `automated-pass` | `docs/project/marketing-comprehension-results.md`<br>`tests/reports/marketing-comprehension.json` |  |
| Public site checks reject draft-copy, internal-status, and version-cycle wording. | `automated-pass` | `tools/docs-site/index.ts`<br>`tools/marketing-truth/index.ts` |  |
| Broad product confidence depends on focused release checks and dogfood, not aggregate monorepo test counts. | `automated-pass` | `ProductContextPRD.md`<br>`TestV4PlanPRD.md` |  |
| Extra apps routes are evidence and not the primary getting-started path. | `automated-pass` | `docs/project/apps-classification.md`<br>`marketing/index.html`<br>`docs/project/starter-example-visual-review.md` |  |
| Bundle-size proof measures built bundles, including starter apps. | `automated-pass` | `tools/bundle-size/index.ts`<br>`tests/reports/bundle-size.json` |  |

## Known Gaps

| Gap | Owner | Next Action | Target Evidence |
|---|---|---|---|

## Optional External Follow-Ups

| Item | Why Optional | Evidence | Next Action |
|---|---|---|---|
| Cursor and Copilot context-only agent runs | Subscription/external-tool runs; Codex local and Claude Code external-agent five-task evidence pass. | `docs/project/agent-dogfood-results.md`<br>`docs/project/claude-code-agent-context-results.md`<br>`tests/reports/agent-context/codex-self-test.json`<br>`tests/reports/agent-context/claude-code-eval.json` | Run the same five-task script when subscribed Cursor and Copilot environments are available. |
| Meshy export corpus | The current free-user account has no Meshy API access; authenticated Sketchfab CC0 browser-render proof passes. | `docs/project/asset-corpus-results.md`<br>`docs/project/sketchfab-asset-corpus-results.md`<br>`tests/reports/asset-corpus.json`<br>`tests/reports/sketchfab-asset-corpus.json` | Add Meshy exports with source/license notes if API access becomes available. |
| Netlify deployment smoke | No Netlify token or project target is available; Vercel and Cloudflare Pages public smoke pass. | `docs/project/external-deployment-results.md`<br>`tests/reports/external-deployment-smoke.json` | Run Netlify public smoke when credentials or a project target are provided. |
| Outside beta dogfood | Requires beta publication and outside users; local release proof is complete without claiming outside-user adoption. | `docs/project/outside-beta-dogfood-results.md`<br>`docs/project/external-proof-readiness.md`<br>`.github/ISSUE_TEMPLATE` | Publish beta artifacts and recruit outside testers as a post-local-proof research step. |
| Live human marketing interviews | The local gate now has a controlled three-profile comprehension pass; recruited live-human research remains useful but is not a terminal-executable blocker. | `docs/project/marketing-comprehension-results.md`<br>`tests/reports/marketing-comprehension.json` | Repeat the six-question rubric with live participants before major public campaign spend. |
| Arbitrary prompt-to-visual quality beyond the approved recipes | The current product claim is scoped to approved starter recipes and recorded dogfood, not universal generated-scene quality. | `docs/project/visual-systems-proof-summary.md`<br>`docs/project/prompt-visual-quality-gap.md`<br>`tests/reports/prompt-fidelity-quality.json` | Add more positive prompt fixtures and live-user prompts before expanding the marketing claim. |

## Automated Checks

| Check | Result | Detail |
|---|---:|---|
| `product-context-prd-exists` | pass | ProductContextPRD.md is present |
| `test-plan-prd-exists` | pass | TestV4PlanPRD.md is present |
| `release-gate-script-exists` | pass | check:release=pnpm typecheck && pnpm check:product-cutover && pnpm check:agent-api && pnpm check:public-api && pnpm check:assets-cli && pnpm check:asset-corpus && pnpm check:agent-docs && pnpm check:templates && pnpm check:examples && pnpm check:devtools && pnpm check:deployment && pnpm check:docs-site && pnpm check:bundle-size && pnpm check:marketing-truth && pnpm dogfood:agent && pnpm check:tarballs && pnpm check:clean-install && pnpm check:docs-codeblocks && pnpm check:marketing-links && pnpm check:marketing-comprehension && pnpm check:error-quality && pnpm check:prompt-fidelity && pnpm check:effects-vfx && pnpm check:visual-systems-proof && pnpm check:product-context && pnpm check:test-plan-status |
| `product-context-script-registered` | pass | check:product-context=pnpm exec tsx --tsconfig tsconfig.base.json tools/product-context-evidence/index.ts |
| `active-template-directory-exactly-three` | pass | active template dirs: cinematic-scene, mini-game, product-viewer |
| `held-back-template-archive-present` | pass | archive/held-back-create-aura3d-templates/README.md documents held-back templates |
| `apps-classification-covers-active-apps` | pass | 33 active app dirs are classified |
| `public-product-language-no-release-cycle` | pass | no banned text found |
| `public-site-no-draft-status-language` | pass | no banned text found |
| `active-code-no-archived-runtime-surface` | pass | no banned text found |
| `archive-not-workspace-package` | pass | pnpm workspace does not include archive paths |
| `create-aura3d-public-install-name` | pass | packages/create-aura3d/package.json name is create-aura3d |
| `aura3d-cli-user-facing-bin` | pass | @aura3d/cli bin entries: aura3d, aura, cli |
| `root-package-ships-only-starter-templates` | pass | root template files: templates/product-viewer, templates/cinematic-scene, templates/mini-game |
| `codex-dogfood-screenshot-profile-present` | pass | codex profile={"yellowPixels":4840,"rainPixels":4867,"centerObjectPixels":11457,"uniqueBuckets":164} |
| `codex-dogfood-prompt-plan-evidence-present` | pass | recipe=cinematic-scene, visualSystems=7, repairHints=6 |
| `codex-five-task-eval-present` | pass | tasks=5/5, backend=webgl2, swap=sneaker->shoe2 |
| `codex-repair-eval-present` | pass | initial=fail, repaired=product-quality-pass, turns=1 |
| `fresh-codex-context-result-documented` | pass | fresh Codex context-only result is documented |
| `claude-code-context-result-documented` | pass | Claude Code checks=9/9 |
| `starter-template-visual-review-present` | pass | starter-template visual review documents current starter product-quality screenshots and boundary |
| `starter-example-visual-review-present` | pass | starter-example visual review documents active example screenshots and product-quality boundary |
| `prompt-visual-quality-gap-tracked` | pass | prompt-to-visual quality boundary is documented with starter pass and broad remaining gaps |
| `prompt-fidelity-quality-report-present` | pass | productQualityReady=true, releaseFacingPasses=4 |
| `starter-before-after-evidence-present` | pass | 3 starter before/after cases recorded |
| `prompt-plan-api-and-starters-present` | pass | prompt-plan API exports and active packaged starters are present |
| `prompt-plan-vague-plan-warnings-tested` | pass | agent API test covers warnings for vague prompt plans |
| `prompt-facing-effects-upgraded` | pass | public prompt-facing rain and bloom have renderer-owned Three paths beyond symbolic lines/no-op |
| `effects-vfx-visual-audit-present` | pass | effects audit total=25, pass=25, partial=0, fail=0, contactSheet=tests/reports/effects-vfx-visual-audit-contact-sheet.png |
| `visual-systems-proof-summary-present` | pass | 9/9 visual proof areas pass |
| `marketing-comprehension-profile-eval-present` | pass | 3/3 target-reader profiles pass marketing comprehension |
| `known-gaps-have-owners-next-actions-and-target-evidence` | pass | 0/0 known gaps have owner, next action, and target evidence |
| `optional-external-followups-are-visible` | pass | 6/6 optional external follow-ups are recorded without blocking local release proof |
| `claim-evidence-matrix-complete` | pass | 39/39 claims have pass evidence; 0/0 claim gaps and 0/0 known gaps are tracked |

