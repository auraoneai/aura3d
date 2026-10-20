# aura3d Go-Live Checklist

**2026-10-20 truth-audit status** (portfolio-wide truth audit; master record: `platforms/platforms-portfolio-status.md`)

- **Overall feature score: 8.5/10** (judged as engine + static showcase, not a SaaS app) — Core 9.5 · Data 6 · Integrations 6.5 · UI/SEO 9.5 · Deploy-readiness 8.
- **Built state (verified from disk/git):** branch `main`, HEAD `4f79433` (2026-10-20, SEO lastmod refresh), pushed; 1 untracked scratch file `tools/filmstrip/side-by-side.mjs` (owner: review/commit/discard — left in place). `@aura3d/engine` **4.0.2 LIVE on npm** (24 public packages); 136 `apps/` entries + 30+ `packages/`; static marketing/docs site (Vite → `marketing/dist`, 36-route sitemap with bijection guards + git-derived lastmod; robots.txt with 14 named AI-crawler groups; llms.txt). 2,776 test/spec files; 40+-gate `check:release` green at the 4.0.2 release.
- **Top-3 blockers to fully live:**
  1. Execute the owner-gated Vercel deploy of `marketing/dist` + DNS/TLS cutover (swap `ORIGIN` placeholder `https://aura3d.auraone.ai` in `marketing/scripts/gen-seo.mjs` at the real domain).
  2. Per-game art-direction pass (canvas scenes are content, deliberately outside the UI/UX pass).
  3. Owner decision on untracked `tools/filmstrip/side-by-side.mjs` (commit or discard).
- **2026-10-20 doc rename pass:** 18 renames (root: verification-matrix, skills-prd, design, go-live-checklist, marketing-10-of-10-plan, g2-racing-lane-notes de-dotted; docs: migration-4.0, e3-stage2b-trace, parity-capture-runbook, scores; process: owner-actions, track-p-status; plus spike-flipper, licenses, khronos-licenses, capture-notes, asset-licenses). Tool-mandated names left as-is: `SKILL.md` (runtime-required by create-aura3d agent-skills loader), `AUTHORING.md` (CANONICAL_ONLY), `ATTRIBUTION.md` (TEMPLATE_HDRI_ATTRIBUTION), `BUNDLE_SIZES.md` (generated), `CONTRACTS.md` (read by tools/agent-skills/check.ts + cited in 300+ source files), README/CHANGELOG/CONTRIBUTING. Archive trees and hidden tool dirs untouched.

## UI/UX upgrade 2026-10-17 — 2026-10-19

Scope: marketing site (1 page), docs (15 pages), showcase-index, 20 showcase game routes, aura-clash pages judged to the Wave V rubric — full history in `visual-verdicts/aura3d.md` (Round 0 static 3/10 — dark-only platform, Inter in apps — → Round 1 fixes → capture/judge, see verdict for the final round).

- Round 1 gates: zero Inter / zero sub-12px / zero uppercase+tracking / zero 700-in-UI in scope by grep; committed fonts md5-verified.
- Capture set: `artifacts/visual-qa/` (36 shots ×2 from a fresh `marketing build` incl. all showcase routes; WebGL game shots use the harness `noScroll` path — software rendering blocks their JS loops).
- Judge citation: `visual-verdicts/aura3d.md` final round.
- Owner-gated live actions (NOT executed): review + push the local commit; Vercel deploy of `marketing/dist`; per-game art direction (canvas scenes are content and untouched).
