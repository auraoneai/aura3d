# AI Scene Verification For Agents

Version: 1.0.0

Run these gates when touching AI scene code, docs, templates, routes, or marketing copy.

```sh
pnpm typecheck
pnpm exec vitest run tests/unit/ai-scene tests/unit/tools/ai-provider-contracts.test.ts tests/unit/tools/scene-ir-schema-audit.test.ts tests/unit/tools/ai-scene-readiness.test.ts tests/unit/tools/ai-scene-claim-scan.test.ts tests/unit/tools/ai-scene-completion-audit.test.ts
pnpm exec playwright test tests/browser/aura-prompt-to-scene.spec.ts tests/browser/aura-cinematic-prompt-lab.spec.ts tests/browser/aura-scene-diff-editor.spec.ts tests/browser/aura-shot-director.spec.ts tests/browser/aura-world-builder.spec.ts --reporter=line
pnpm ai-scene
```

Reports are written under `tests/reports/ai-scene/`.

## What To Check

- `providerMode` is `mock` unless the task explicitly uses a configured live provider.
- `networkUsed` is `false` for default local/CI runs.
- screenshots are nonblank and colorful enough to inspect.
- claim scan passes.
- secret audit passes.
- completion audit passes.
