
## UI/UX upgrade 2026-10-17 — 2026-10-19

Scope: marketing site (1 page), docs (15 pages), showcase-index, 20 showcase game routes, aura-clash pages judged to the Wave V rubric — full history in `visual-verdicts/aura3d.md` (Round 0 static 3/10 — dark-only platform, Inter in apps — → Round 1 fixes → capture/judge, see verdict for the final round).

- Round 1 gates: zero Inter / zero sub-12px / zero uppercase+tracking / zero 700-in-UI in scope by grep; committed fonts md5-verified.
- Capture set: `artifacts/visual-qa/` (36 shots ×2 from a fresh `marketing build` incl. all showcase routes; WebGL game shots use the harness `noScroll` path — software rendering blocks their JS loops).
- Judge citation: `visual-verdicts/aura3d.md` final round.
- Owner-gated live actions (NOT executed): review + push the local commit; Vercel deploy of `marketing/dist`; per-game art direction (canvas scenes are content and untouched).
