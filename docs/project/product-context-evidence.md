# Product Context Evidence

Generated: 2026-05-29T07:54:43.004Z

## Summary

- Claims with evidence: 37/37
- Known gaps tracked: 7/7
- Automated checks passing: 31/31

## Claim Matrix

| Claim | Status | Evidence | Next Action |
|---|---|---|---|
| Aura3D is the editable scene layer for agent-written browser 3D. | `automated-pass` | `ProductContextPRD.md`<br>`README.md`<br>`marketing/index.html` |  |
| AI coding agents write TypeScript or JavaScript against a compact public API. | `automated-pass` | `pnpm run check:agent-api`<br>`tests/reports/agent-api-surface.json` |  |
| Users bring their own assets. | `automated-pass` | `tools/asset-corpus/index.ts`<br>`tools/sketchfab-asset-corpus/index.ts`<br>`tests/reports/asset-corpus.json`<br>`tests/reports/sketchfab-asset-corpus.json` | Asset corpus includes authenticated Sketchfab CC0 proof; Meshy exports remain external. |
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
| The three release-facing starter prompt recipes pass product-quality screenshot review. | `automated-pass` | `docs/project/prompt-fidelity-quality-results.md`<br>`tests/reports/prompt-fidelity-quality.json`<br>`tests/reports/prompt-fidelity/contact-sheet.png` |  |
| Each fixed starter has before/after prompt-fidelity evidence with source prompt, corrected failure mode, code path, screenshots, route health, and human verdict. | `automated-pass` | `docs/project/prompt-fidelity-quality-results.md`<br>`tests/reports/prompt-fidelity-quality.json`<br>`tests/reports/prompt-fidelity/before-after-contact-sheet.png` |  |
| Legacy AI-runtime code is outside the active workspace. | `automated-pass` | `archive/legacy-ai-runtime`<br>`tools/product-context-evidence/index.ts` |  |
| The public authoring model is source code plus typed assets. | `automated-pass` | `README.md`<br>`docs/agents/build-playbook.md`<br>`docs/project/fresh-codex-agent-context-results.md` |  |
| The active starter-template directory contains only the three starter templates. | `automated-pass` | `packages/create-aura3d/templates` |  |
| The three starter templates install, build, render, preview, and recover from common asset errors in clean directories. | `automated-pass` | `docs/project/clean-install-results.md`<br>`docs/project/starter-template-visual-review.md`<br>`tests/reports/package-clean-install.json` |  |
| Held-back template experiments are outside the active starter-template directory and documented in archive. | `automated-pass` | `archive/held-back-create-aura3d-templates/README.md` |  |
| Active apps directories are classified. | `automated-pass` | `docs/project/apps-classification.md` |  |
| Marketing speaks in product and workflow language. | `automated-pass` | `marketing/index.html`<br>`tools/marketing-truth/index.ts` |  |
| Public site checks reject draft-copy, internal-status, and version-cycle wording. | `automated-pass` | `tools/docs-site/index.ts`<br>`tools/marketing-truth/index.ts` |  |
| Broad product confidence depends on focused release checks and dogfood, not aggregate monorepo test counts. | `automated-pass` | `ProductContextPRD.md`<br>`TestV4PlanPRD.md` |  |
| Extra apps routes are evidence and not the primary getting-started path. | `automated-pass` | `docs/project/apps-classification.md`<br>`marketing/index.html`<br>`docs/project/starter-example-visual-review.md` |  |
| Bundle-size proof measures built bundles, including starter apps. | `automated-pass` | `tools/bundle-size/index.ts`<br>`tests/reports/bundle-size.json` |  |

## Known Gaps

| Gap | Owner | Next Action | Target Evidence |
|---|---|---|---|
| The broader effects/VFX/postprocess surface is contact-sheet proven only at starter/helper level. | Runtime/VFX QA | Keep check:effects-vfx passing, then add route-level screenshots and human review before marketing particle presets, cinematic approximations, or compatibility VFX as premium production VFX. | `docs/project/effects-vfx-visual-audit.md`<br>`tests/reports/effects-vfx-visual-audit.json`<br>`tools/effects-vfx-visual-audit/index.ts` |
| Broad prompt-to-visual product quality beyond approved starter recipes is not fully proven. | Product/Runtime QA | Keep the starter product-quality screenshots under regression review, then add more positive prompt fixtures, broader asset coverage, repair-loop evidence, and external agent/user dogfood before claiming broad arbitrary prompt-to-visual quality. | `docs/project/prompt-visual-quality-gap.md`<br>`docs/project/starter-template-visual-review.md`<br>`docs/project/prompt-fidelity-quality-results.md`<br>`tests/reports/prompt-fidelity-quality.json` |
| Cursor and Copilot context-only agent runs are not complete. | Product QA | Codex five-task local evidence and Claude Code external-agent evidence now pass. Run the same five-task context-only script against subscribed Cursor and Copilot environments. | `docs/project/agent-dogfood-results.md`<br>`docs/project/claude-code-agent-context-results.md`<br>`docs/project/external-proof-readiness.md`<br>`tests/reports/agent-context/*.json` |
| Licensed wild-asset corpus is not broad enough. | Assets QA | The asset corpus now covers generated/adversarial assets, pinned Khronos/product-form/material-extension/Blender-export/animation/textured-PBR/KTX2 fixtures, downloaded Poly Haven CC0 glTF, downloaded Khronos Draco-compressed glTF, and an authenticated Sketchfab CC0 GLB. Add Meshy exports with source/license notes, then run add/validate/typegen/render. | `fixtures/asset-corpus/README.md`<br>`docs/project/asset-corpus-results.md`<br>`docs/project/sketchfab-asset-corpus-results.md`<br>`docs/project/external-proof-readiness.md`<br>`tests/reports/asset-corpus.json`<br>`tests/reports/sketchfab-asset-corpus.json` |
| Real external deployment smoke is not complete across Vercel, Cloudflare Pages, and Netlify. | Release Engineering | Vercel and Cloudflare Pages public smoke now render WebGL2 Aura3D canvases from deployed product-viewer artifacts. Provide Netlify credentials or a project target, then record public URL, route health, screenshot, MIME checks, and deployment-check output for that host. | `docs/project/external-deployment-results.md`<br>`docs/project/external-proof-readiness.md`<br>`tests/reports/external-deployment-smoke.json` |
| Marketing comprehension interviews are not complete. | Product Marketing | Show the marketing site to an indie React developer, a Three.js-experienced 3D artist, and a non-technical product manager, then record answers to the comprehension rubric. | `docs/project/marketing-comprehension-results.md` |
| Outside beta dogfood is not complete. | Product/Community | Publish beta artifacts, recruit at least five external install/scaffold attempts, record feedback in issues or dogfood docs, and fix or document critical bugs. | `docs/project/outside-beta-dogfood-results.md`<br>`docs/project/external-proof-readiness.md`<br>`.github/ISSUE_TEMPLATE` |

## Automated Checks

| Check | Result | Detail |
|---|---:|---|
| `product-context-prd-exists` | pass | ProductContextPRD.md is present |
| `test-plan-prd-exists` | pass | TestV4PlanPRD.md is present |
| `release-gate-script-exists` | pass | check:release=pnpm typecheck && pnpm check:product-cutover && pnpm check:agent-api && pnpm check:public-api && pnpm check:assets-cli && pnpm check:asset-corpus && pnpm check:agent-docs && pnpm check:templates && pnpm check:examples && pnpm check:devtools && pnpm check:deployment && pnpm check:docs-site && pnpm check:bundle-size && pnpm check:marketing-truth && pnpm dogfood:agent && pnpm check:tarballs && pnpm check:clean-install && pnpm check:docs-codeblocks && pnpm check:marketing-links && pnpm check:error-quality && pnpm check:prompt-fidelity && pnpm check:effects-vfx && pnpm check:product-context && pnpm check:test-plan-status |
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
| `codex-dogfood-screenshot-profile-present` | pass | codex profile={"yellowPixels":5342,"rainPixels":4149,"centerObjectPixels":11684,"uniqueBuckets":162} |
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
| `known-gaps-have-owners-next-actions-and-target-evidence` | pass | 7/7 known gaps have owner, next action, and target evidence |
| `claim-evidence-matrix-complete` | pass | 37/37 claims have pass evidence; 0/0 claim gaps and 7/7 known gaps are tracked |

