# Q-13-2 — run `renderer-imports` (and later codemods) on templates/examples

**GitHub issue:** #706

**From:** PRD 15 (T2.12) · **To:** lane 13 (`templates/`, `examples/`,
`packages/create-aura3d/`) · **Filed:** 2026-10-06 · **SLA:** 2 working days

Run `aura3d codemod renderer-imports "<paths>" --write --report` on
`templates/`, `examples/`, and `packages/create-aura3d/` sources that import
`@aura3d/engine/{advanced,production}-runtime` or
`@aura3d/rendering/{advanced,production}-runtime`. Deprecated aliases keep
them compiling in the meantime.

The same command shape applies to the other lane-15 codemods as they land
(`engine-entry-imports`, `devtools-imports`, `create-a3d-app`,
`lean-imports`, `renderer-mode`) — each is registered on C-39 and reports
per-construct rows (`exact` / `approximate` / `none`).

Dry-run coverage of the current app tree is attached to Q-ALL-1
(`evidence/prd15/codemod-reports/renderer-imports-non-owner-apps.json`);
`rg -l "@aura3d/engine/advanced-runtime" templates examples packages/create-aura3d`
is the equivalent consumer set here.

---

## T5.9 follow-up — `engine-entry-imports` / `devtools-imports` codemods

T5.9 collapsed `@aura3d/engine` subpaths to the §6.1 list. In addition to
`renderer-imports`, run `aura3d codemod engine-entry-imports "<paths>" --write --report`
and `aura3d codemod devtools-imports "<paths>" --write --report` on your files.
Dry-run report (91 files, 82 planned rows):
`docs/project/aura3d-quality-rebuild/evidence/prd15/reports/engine-entry-imports-lane-13.json`
