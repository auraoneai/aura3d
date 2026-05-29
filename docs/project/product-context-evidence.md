# Product Context Evidence

Generated: 2026-05-29T02:31:28.337Z

## Summary

- Claims with evidence: 30/30
- Known gaps tracked: 6/6
- Automated checks passing: 24/24

## Claim Matrix

| Claim | Status | Evidence | Next Action |
|---|---|---|---|
| Aura3D is the editable scene layer for agent-written browser 3D. | `automated-pass` | `ProductContextPRD.md`<br>`README.md`<br>`marketing/index.html` |  |
| AI coding agents write TypeScript or JavaScript against a compact public API. | `automated-pass` | `pnpm run check:agent-api`<br>`tests/reports/agent-api-surface.json` |  |
| Users bring their own assets. | `automated-pass` | `tools/asset-corpus/index.ts`<br>`tests/reports/asset-corpus.json` | Run and expand asset corpus against real external GLBs. |
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
| Agent-readable context is useful. | `automated-pass` | `docs/agents/*`<br>`tests/reports/agent-context/codex-self-test.json` | Run Claude Code, Cursor, and Copilot separately; Codex self-test already passed. |
| A fresh Codex context-only run can build a compiling WebGL2 app with typed assets. | `manual-pass` | `docs/project/fresh-codex-agent-context-results.md` | Run Claude Code, Cursor, and Copilot separately; this only proves a fresh Codex run and not product-quality visual fidelity. |
| Codex dogfood uses prompt-plan helpers, typed assets, route health, screenshot profile checks, and product-quality visual review for the deterministic self-test. | `automated-pass` | `tests/reports/agent-context/codex-self-test.json`<br>`tests/reports/agent-context/codex-self-test-workspace/tests/reports/screenshot.json`<br>`tools/agent-dogfood/index.ts`<br>`docs/project/prompt-visual-quality-gap.md`<br>`tests/reports/prompt-fidelity-quality.json` |  |
| The public agent API includes prompt-plan helpers and the three starter templates use that prompt-plan flow. | `automated-pass` | `packages/engine/src/agent-api/index.ts`<br>`packages/create-aura3d/templates/*/src/main.ts`<br>`templates/*/src/main.ts`<br>`tools/prompt-fidelity-quality/index.ts` |  |
| The three release-facing starter prompt recipes pass product-quality screenshot review. | `automated-pass` | `docs/project/prompt-fidelity-quality-results.md`<br>`tests/reports/prompt-fidelity-quality.json`<br>`tests/reports/prompt-fidelity/contact-sheet.png` |  |
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
| Broad prompt-to-visual product quality beyond approved starter recipes is not fully proven. | Product/Runtime QA | Keep the starter product-quality screenshots under regression review, then add more positive prompt fixtures, broader asset coverage, repair-loop evidence, and external agent/user dogfood before claiming broad arbitrary prompt-to-visual quality. | `docs/project/prompt-visual-quality-gap.md`<br>`docs/project/starter-template-visual-review.md`<br>`docs/project/prompt-fidelity-quality-results.md`<br>`tests/reports/prompt-fidelity-quality.json` |
| Claude Code, Cursor, and Copilot context-only agent runs are not complete. | Product QA | Run the same five-task context-only script against subscribed Claude Code, Cursor, and Copilot environments. | `docs/project/agent-dogfood-results.md`<br>`tests/reports/agent-context/*.json` |
| Licensed wild-asset corpus is not broad enough. | Assets QA | The asset corpus now covers generated/adversarial assets plus selected pinned Khronos, product-form, material-extension, Blender-export, animation, textured-PBR, and KTX2 local fixtures. Add separately licensed Sketchfab CC0, Poly Haven, Meshy, and real Draco-compressed variants with source/license notes, then run add/validate/typegen/render. | `fixtures/asset-corpus/README.md`<br>`docs/project/asset-corpus-results.md`<br>`tests/reports/asset-corpus.json` |
| Real external deployment smoke is not complete across Vercel, Cloudflare Pages, and Netlify. | Release Engineering | Vercel deploy was attempted but blocked by HTTP 401 deployment protection; disable protection or provide a public smoke project, then provide Cloudflare Pages and Netlify credentials and record public URLs, route health, screenshots, MIME checks, and deployment-check output. | `docs/project/external-deployment-results.md`<br>`tests/reports/external-deployment-smoke.json` |
| Marketing comprehension interviews are not complete. | Product Marketing | Show the marketing site to an indie React developer, a Three.js-experienced 3D artist, and a non-technical product manager, then record answers to the comprehension rubric. | `docs/project/marketing-comprehension-results.md` |
| Outside beta dogfood is not complete. | Product/Community | Publish beta artifacts, recruit at least five external install/scaffold attempts, record feedback in issues or dogfood docs, and fix or document critical bugs. | `docs/project/outside-beta-dogfood-results.md`<br>`.github/ISSUE_TEMPLATE` |

## Automated Checks

| Check | Result | Detail |
|---|---:|---|
| `product-context-prd-exists` | pass | ProductContextPRD.md is present |
| `test-plan-prd-exists` | pass | TestV4PlanPRD.md is present |
| `release-gate-script-exists` | pass | check:release=pnpm typecheck && pnpm check:product-cutover && pnpm check:agent-api && pnpm check:public-api && pnpm check:assets-cli && pnpm check:asset-corpus && pnpm check:agent-docs && pnpm check:templates && pnpm check:examples && pnpm check:devtools && pnpm check:deployment && pnpm check:docs-site && pnpm check:bundle-size && pnpm check:marketing-truth && pnpm dogfood:agent && pnpm check:tarballs && pnpm check:clean-install && pnpm check:docs-codeblocks && pnpm check:marketing-links && pnpm check:error-quality && pnpm check:prompt-fidelity && pnpm check:product-context && pnpm check:test-plan-status |
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
| `codex-dogfood-screenshot-profile-present` | pass | codex profile={"yellowPixels":5799,"rainPixels":1761,"centerObjectPixels":10690,"uniqueBuckets":148} |
| `codex-dogfood-prompt-plan-evidence-present` | pass | recipe=cinematic-scene, visualSystems=7, repairHints=6 |
| `fresh-codex-context-result-documented` | pass | fresh Codex context-only result is documented |
| `starter-template-visual-review-present` | pass | starter-template visual review documents current starter product-quality screenshots and boundary |
| `starter-example-visual-review-present` | pass | starter-example visual review documents active example screenshots and product-quality boundary |
| `prompt-visual-quality-gap-tracked` | pass | prompt-to-visual quality boundary is documented with starter pass and broad remaining gaps |
| `prompt-fidelity-quality-report-present` | pass | productQualityReady=true, releaseFacingPasses=4 |
| `prompt-plan-api-and-starters-present` | pass | prompt-plan API exports and active packaged starters are present |
| `known-gaps-have-owners-next-actions-and-target-evidence` | pass | 6/6 known gaps have owner, next action, and target evidence |
| `claim-evidence-matrix-complete` | pass | 30/30 claims have pass evidence; 0/0 claim gaps and 6/6 known gaps are tracked |

