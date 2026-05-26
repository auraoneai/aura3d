# Decision Gates

Version: 1.0.0

This file is retained because docs verification tooling still reads `docs/project/product-studio-decision-gates.md`. It now records the current documentation gate boundary rather than a historical product-studio roadmap.

## Current Documentation Gate

The current docs gate is evidence-scoped:

- current package exports must match `docs/api/public-api.md`;
- current docs must use `tests/reports/threejs-parity/` for Three.js parity report paths;
- Three.js superiority claims must match `docs/project/threejs-superiority-status.md`;
- old roadmap/prompt/checklist docs should not be used as current product evidence.

## Current Status

The latest local generated report set shows the measured Three.js parity and superiority gates passing in this workspace. Because `tests/reports/` is ignored by git, a clean checkout or release job must regenerate the relevant reports before using the same public claim.

## Required Before Strong Public Claims

- Regenerate the relevant Three.js parity reports.
- Regenerate the relevant Three.js superiority reports.
- Confirm `pnpm superiority` passes before using full measured Three.js superiority language.
- Keep `docs/project/claim-guidelines.md` and `docs/project/threejs-superiority-status.md` in sync with generated reports.
