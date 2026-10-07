# Q-11-5 — forced edits inside `tools/bundle-size/` (11-owned) driven by PRD-15 Phase 4

**Owner:** 11 (GPU/tiers) · **Requester:** 15 · **SLA:** 2 working days
**Status of edits:** already applied by lane 15 because the tool could not run
otherwise; this request records the boundary crossing so you can review, amend,
or take ownership of the wording.

Two edits on your files:

1. **`tools/bundle-size/index.ts`** — removed the esbuild alias rows for
   `@aura3d/rendering/lean-runtime` and `.../lean-core-runtime`. T4.8 deleted
   both source files; leaving the aliases made every measurement crash on
   ENOENT. No behaviour change for surviving targets.

2. **`tools/bundle-size/markdown.mjs`** — T4.10 requires deleting the
   "77,458 B pass" framing and the "new-app budget applies to
   `@aura3d/lean`" claim from `BUNDLE_SIZES.md`. That text is emitted by your
   generator, so the "Known Overrun" paragraph was rewritten there: the lean
   row now explains that the T4.6 shim pulls the engine critical path
   (~516 KB gzip vs the 80,000 B legacy budget — visible fail, not hidden)
   until consumers import engine subpaths directly (Q-13-1) and the shim is
   removed at 4.0.0.

If you prefer different wording or want the lean target re-shaped (e.g.
dropped or pointed at a subpath), amend freely — the numbers are generated,
the doc is `tests/reports/bundle-size.json`, and no budget was raised to
manufacture a pass.
