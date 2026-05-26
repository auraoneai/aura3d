# Editor Diagnostics Workflow

Version: `1.0.0`

Editor diagnostics should be treated as runtime evidence for specific editor state, command, selection, export, or route behavior.

## Current Sources

- `packages/editor-runtime/src/index.ts`
- `packages/debug/src/index.ts`
- `tests/browser/editor-*.spec.ts`

## Guidance

- Keep diagnostics structured enough for tests and reports.
- Do not convert editor diagnostics into claims about unsupported editor features.
- Link new editor claims to package code and browser tests.
