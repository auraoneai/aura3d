# Test Plan Execution Status

Generated: 2026-05-29T01:24:32.933Z

This document tracks `TestV4PlanPRD.md` round coverage. It is intentionally
stricter than `check:release`: local automation can pass while external
dogfood, external deployments, and human comprehension work remain open.

## Summary

- Rounds classified: 21/21
- Fully proven by current local/manual evidence: 14/21
- Rounds with remaining manual/external work: 7

## Round Matrix

| Round | Status | Evidence | Remaining Work |
|---|---|---|---|
| Round 0: Product Context Evidence Matrix | `automated-pass` | `docs/project/product-context-evidence.md`<br>`tests/reports/product-context-evidence.json` |  |
| Round 1: Release Gate Verification | `automated-pass` | `pnpm run check:release`<br>`pnpm run typecheck`<br>`tests/reports/product-context-evidence.json` |  |
| Round 2: Product-Cycle Language Guard | `automated-pass` | `tests/reports/marketing-truth.json`<br>`tests/reports/docs-site.json` |  |
| Round 3: Archive Isolation | `automated-pass` | `tests/reports/product-cutover.json`<br>`tests/reports/package-tarball-audit.json` |  |
| Round 4: Package Tarball Audit | `automated-pass` | `tests/reports/package-tarball-audit.json` |  |
| Round 5: Clean Install Smoke | `automated-pass` | `docs/project/clean-install-results.md`<br>`tests/reports/package-clean-install.json` |  |
| Round 6: Public API Compactness And Correctness | `automated-pass` | `docs/project/public-api-contract.md`<br>`tests/reports/public-api-contract.json` |  |
| Round 7: Agent Context Evaluation | `partial` | `docs/project/agent-dogfood-results.md`<br>`docs/project/fresh-codex-agent-context-results.md`<br>`tests/reports/agent-context/codex-self-test.json` | Codex prompt-plan self-test is proven; Claude Code, Cursor, and Copilot remain external/subscription runs. |
| Round 8: Raw Three.js Baseline | `manual-pass` | `tests/reports/agent-baseline-comparison.json`<br>`docs/project/agent-baseline-comparison.md` |  |
| Round 9: Asset Corpus Validation | `partial` | `docs/project/asset-corpus-results.md`<br>`tests/reports/asset-corpus.json` | Generated/adversarial assets plus pinned Khronos, product-form, material-extension, Blender-export, animation, textured-PBR, and KTX2 local fixtures are proven; separately licensed Sketchfab CC0, Poly Haven, Meshy, and real Draco-compressed variants remain external corpus work. |
| Round 10: Typed Asset Reference IDE Test | `automated-pass` | `tests/reports/asset-cli.json`<br>`tests/reports/public-api-contract.json` |  |
| Round 11: Template Lifecycle Dogfood | `automated-pass` | `docs/project/clean-install-results.md`<br>`tests/reports/package-clean-install.json` |  |
| Round 12: Diagnostics And Screenshot Quality | `partial` | `tests/reports/package-clean-install.json`<br>`tests/reports/agent-devtools.json`<br>`tests/reports/error-message-quality.json`<br>`docs/project/starter-template-visual-review.md`<br>`docs/project/starter-example-visual-review.md`<br>`docs/project/prompt-visual-quality-gap.md`<br>`docs/project/prompt-fidelity-quality-results.md`<br>`tests/reports/prompt-fidelity-quality.json` | Current screenshots prove rendering, diagnostics, and basic visual cues. Prompt-fidelity audit now rejects object-plus-symbolic-effect fixtures, but current screenshots do not prove product-quality prompt-to-visual fidelity. |
| Round 13: Static Deployment Checks | `partial` | `tests/reports/agent-deployment.json`<br>`tests/reports/package-clean-install.json`<br>`docs/project/external-deployment-results.md`<br>`tests/reports/external-deployment-smoke.json` | Local static/deploy checks are proven. Vercel deploy was attempted but blocked by HTTP 401 deployment protection; Cloudflare Pages and Netlify credentials are missing. |
| Round 14: Built Bundle Size Proof | `automated-pass` | `BUNDLE_SIZES.md`<br>`tests/reports/bundle-size.json` |  |
| Round 15: Docs Codeblock Execution | `automated-pass` | `tests/reports/docs-codeblocks.json` |  |
| Round 16: Error Message Quality | `automated-pass` | `tests/reports/error-message-quality.json` |  |
| Round 17: Marketing Link And Copy-Button Audit | `automated-pass` | `tests/reports/marketing-link-audit.json` |  |
| Round 18: Marketing Comprehension Test | `external-gap` | `docs/project/marketing-comprehension-results.md` | Requires three real participants who do not know the codebase. |
| Round 19: Product Rebuild From Context Alone | `partial` | `docs/project/fresh-codex-agent-context-results.md`<br>`docs/project/agent-dogfood-results.md`<br>`docs/project/prompt-visual-quality-gap.md` | Fresh Codex context-only work compiled, ran, used typed assets, and avoided hallucinated APIs. The deterministic Codex self-test now uses prompt plans. Visual output remains partial rather than product-quality prompt fidelity. |
| Round 20: Outside Beta Dogfood | `partial` | `docs/project/outside-beta-dogfood-results.md` | Requires beta publication and external users. |

## Checks

| Check | Result | Detail |
|---|---:|---|
| `test-plan-rounds-classified` | pass | 21/21 rounds classified |
| `local-evidence-does-not-hide-external-gaps` | pass | 7 rounds have remaining manual/external evidence noted |
| `local-automated-proof-present` | pass | 14/21 rounds are fully proven by current local/manual evidence; remaining rounds are classified instead of hidden |

