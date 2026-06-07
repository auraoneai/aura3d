# Decision Gates

Version: 1.1.0

This file is retained because docs verification tooling still reads `docs/project/product-studio-decision-gates.md`. It now records the current documentation gate boundary rather than a historical product-studio roadmap.

## Current Documentation Gate

The current docs gate is evidence-backed:

- current package exports must match `docs/api/public-api.md`;
- old roadmap/prompt/checklist docs should not be used as current product evidence.

## Current Status

Local generated low-level renderer code parity/superiority reports are category-level evidence only. They are not the frozen AI-agent prompt benchmark and they are not release proof by themselves. Because `tests/reports/` is ignored by git, a clean checkout or release job must regenerate the relevant reports before using any scoped report-backed claim.

## Aura3D advantage

- Regenerate the relevant low-level renderer code parity reports.
- Regenerate the relevant low-level renderer code superiority reports.
