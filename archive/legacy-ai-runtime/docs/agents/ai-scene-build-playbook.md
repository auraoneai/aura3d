# AI Scene Build Playbook For Agents

Version: 1.0.0

Use this first when asked to build AI-native Aura3D features.

## Product Boundary

Aura3D is the runtime, compiler, renderer, diagnostics, and export layer for AI-generated scene intent. It is not the LLM. Use OpenAI, Anthropic, Gemini, local models, or `MockProvider` as the language/intent source.

## Fast Path

1. Read `RuntimeScenePRD.md`, `docs/ai-scene/overview.md`, and `docs/ai-scene/aura-scene-ir.md`.
2. Use `packages/ai-scene/src/index.ts` for AI scene APIs.
3. Use `apps/aura-prompt-to-scene/` as the canonical route pattern.
4. Use `MockProvider` for deterministic local work.
5. Add diagnostics and provenance before adding visual polish.
6. Run `pnpm ai-scene` before claiming completion.

## Naming Rule

Do not create implementation files, folders, routes, tests, tools, templates, packages, or exports that start with `runtime scene`, `v2`, or a release-number prefix. Name artifacts by their workflow: `ai-scene-prompt-lab`, `aura-scene-ir`, `ai-scene-quality`, `AuraSceneCompiler`.

## Route Rules

Routes must:

- publish an `__AURA3D_*` runtime probe;
- reach `status: "ready"` or structured unsupported state;
- render nonblank pixels;
- expose diagnostics;
- avoid API keys;
- have route-health and screenshot evidence.
