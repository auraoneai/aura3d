# Product Context Evidence

Generated: 2026-05-28T12:58:24.546Z

## Summary

- Claims with evidence: 23/23
- Automated checks passing: 15/15

## Claim Matrix

| Claim | Status | Evidence | Next Action |
|---|---|---|---|
| Aura3D is the editable scene layer for agent-written browser 3D. | `automated-pass` | `ProductContextPRD.md`<br>`README.md`<br>`marketing/index.html` |  |
| AI coding agents write TypeScript or JavaScript against a compact public API. | `automated-pass` | `pnpm run check:agent-api`<br>`tests/reports/agent-api-surface.json` |  |
| Users bring their own assets. | `automated-pass` | `tools/asset-corpus/index.ts`<br>`tests/reports/asset-corpus.json` | Run and expand asset corpus against real external GLBs. |
| Aura3D provides typed asset references. | `automated-pass` | `pnpm run check:assets-cli`<br>`tests/unit/aura3d-cli/assets.test.ts` |  |
| Aura3D provides starter templates. | `automated-pass` | `pnpm run check:templates`<br>`packages/create-aura3d/templates` |  |
| Aura3D provides diagnostics. | `automated-pass` | `pnpm run check:devtools`<br>`packages/engine/src/devtools` |  |
| Aura3D provides screenshots. | `automated-pass` | `pnpm run check:examples`<br>`tests/browser/examples-route-health.spec.ts` |  |
| Aura3D provides static deployment checks. | `automated-pass` | `pnpm run check:deployment`<br>`packages/aura3d-cli/src/index.ts` |  |
| @aura3d/engine exposes the public engine surface. | `automated-pass` | `packages/engine/src/agent-api/index.ts`<br>`tools/agent-api-surface/index.ts` |  |
| @aura3d/react is an optional thin React adapter. | `automated-pass` | `packages/react/src/index.ts`<br>`tests/unit/react-adapter/react-adapter.test.ts` |  |
| @aura3d/cli supports asset, doctor, deployment, serve, and agent-file flows. | `automated-pass` | `packages/aura3d-cli/src/cli.ts`<br>`packages/aura3d-cli/src/index.ts` |  |
| create-aura3d scaffolds product-viewer, cinematic-scene, and mini-game. | `automated-pass` | `packages/create-aura3d`<br>`tools/agent-templates/index.ts` | Align package name with public npx command or update every public command. |
| Agent-readable context is useful. | `automated-pass` | `docs/agents/*`<br>`tests/reports/agent-context/codex-self-test.json` | Run Codex self-test, then Claude Code, Cursor, and Copilot. |
| Legacy AI-runtime code is outside the active workspace. | `automated-pass` | `archive/legacy-ai-runtime`<br>`tools/product-context-evidence/index.ts` |  |
| The public authoring model is source code plus typed assets. | `automated-pass` | `README.md`<br>`docs/agents/build-playbook.md` | Verify with generated app and typed assets. |
| The active starter-template directory contains only the three starter templates. | `automated-pass` | `packages/create-aura3d/templates` |  |
| Held-back template experiments are outside the active starter-template directory and documented in archive. | `automated-pass` | `archive/held-back-create-aura3d-templates/README.md` |  |
| Active apps directories are classified. | `automated-pass` | `docs/project/apps-classification.md` |  |
| Marketing speaks in product and workflow language. | `automated-pass` | `marketing/index.html`<br>`tools/marketing-truth/index.ts` |  |
| Public site checks reject draft-copy, internal-status, and version-cycle wording. | `automated-pass` | `tools/docs-site/index.ts`<br>`tools/marketing-truth/index.ts` |  |
| Broad product confidence depends on focused release checks and dogfood, not aggregate monorepo test counts. | `automated-pass` | `ProductContextPRD.md`<br>`TestV4PlanPRD.md` |  |
| Extra apps routes are evidence and not the primary getting-started path. | `automated-pass` | `docs/project/apps-classification.md`<br>`marketing/index.html` |  |
| Bundle-size proof measures built bundles, including starter apps. | `automated-pass` | `tools/bundle-size/index.ts`<br>`tests/reports/bundle-size.json` |  |

## Automated Checks

| Check | Result | Detail |
|---|---:|---|
| `product-context-prd-exists` | pass | ProductContextPRD.md is present |
| `test-plan-prd-exists` | pass | TestV4PlanPRD.md is present |
| `release-gate-script-exists` | pass | check:release=pnpm typecheck && pnpm check:product-cutover && pnpm check:agent-api && pnpm check:assets-cli && pnpm check:asset-corpus && pnpm check:agent-docs && pnpm check:templates && pnpm check:examples && pnpm check:devtools && pnpm check:deployment && pnpm check:docs-site && pnpm check:bundle-size && pnpm check:marketing-truth && pnpm dogfood:agent && pnpm build && pnpm check:tarballs && pnpm check:docs-codeblocks && pnpm check:marketing-links && pnpm check:error-quality && pnpm check:product-context |
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
| `claim-evidence-matrix-complete` | pass | 23/23 claims have pass evidence; known gaps: none |

