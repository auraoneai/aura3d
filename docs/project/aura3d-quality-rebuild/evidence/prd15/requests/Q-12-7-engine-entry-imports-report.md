# Q-12-7 — `engine-entry-imports` / `devtools-imports` codemod report (benchmarks + parity tools)

**From:** PRD 15 (T5.9) · **To:** lane 12 (`benchmarks/`, `tools/threejs-parity-*`,
`tools/head-to-head-*`, `tools/showcase-library/game-visual-qa.mjs`) ·
**Filed:** 2026-10-06 · **SLA:** 2 working days

T5.9 collapsed `@aura3d/engine` subpaths to the §6.1 list (17 live subpaths).
Your files still import deprecated subpaths or "." names that now live on a
deeper entry point. The codemods are registered in C-39 — run:

```
aura3d codemod engine-entry-imports "<paths>" --write --report
aura3d codemod devtools-imports "<paths>" --write --report
```

- Names with a disposition destination are moved to `@aura3d/engine/<sub>`.
- Names only reachable through a deprecated subpath stay on that stub
  specifier until 4.0.0 (`console.warn` once on first import).
- `to: "deleted"` names are reported, not moved — they leave the surface in
  4.0.0 and need a real replacement.

Dry-run report (27 files, 38 planned rows):
`docs/project/aura3d-quality-rebuild/evidence/prd15/reports/engine-entry-imports-lane-12.json`

Disposition source of truth: `docs/architecture/root-export-dispositions.json`.
