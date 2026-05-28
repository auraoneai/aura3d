# Quality Gates

Version: 0.1.0

AI scene routes are accepted only when automated gates prove they are visible, diagnosable, and evidence-backed.

## Required Gates

- TypeScript build check: `pnpm typecheck`
- AI scene unit tests: `pnpm exec vitest run tests/unit/ai-scene`
- Provider contracts: `pnpm ai-scene:provider-contracts`
- Scene IR schema audit: `pnpm ai-scene:schema-audit`
- Route health: `pnpm ai-scene:route-health`
- Screenshot quality: `pnpm ai-scene:screenshot-quality`
- Prompt evidence: `pnpm ai-scene:prompt-evidence`
- Scene diff audit: `pnpm ai-scene:scene-diff`
- Claim scan: `pnpm ai-scene:claims`
- Secret audit: `pnpm ai-scene:secret-audit`
- Completion audit: `pnpm ai-scene:completion-audit`

The full gate is:

```sh
pnpm ai-scene
```

## Screenshot Expectations

Screenshots must be nonblank, colorful enough for visual inspection, and large enough to catch layout or rendering failures. They are not final film-quality proof.
