# AI Scene Runtime Overview

Version: 0.1.0

Aura3D's AI scene runtime is a provider-neutral 3D execution layer. It is not the LLM. Aura3D integrates with OpenAI, Anthropic, Gemini, local models, and other providers, then turns structured creative intent into live, editable browser 3D scenes.

The product loop is:

```text
prompt -> model -> provider adapter -> Aura Scene IR -> compiler -> Aura3D runtime scene
```

The model understands language. Aura3D owns the world execution layer: schema validation, asset resolution, scene graph construction, materials, lights, cameras, timeline cues, diagnostics, route evidence, and export metadata.

## Doc Set

| Topic | Doc |
|---|---|
| Provider adapters | [provider-adapters.md](provider-adapters.md) |
| Scene IR schema | [scene-ir-schema.md](scene-ir-schema.md) |
| Scene compiler | [scene-compiler.md](scene-compiler.md) |
| Asset resolver | [asset-resolver.md](asset-resolver.md) |
| Cinematic director | [cinematic-director.md](cinematic-director.md) |
| Scene patching | [scene-patching.md](scene-patching.md) |
| Security | [security.md](security.md) |
| Quality ladder | [quality-ladder.md](quality-ladder.md) |
| Deployment | [deployment.md](deployment.md) |
| Claim boundaries | [claim-boundaries.md](claim-boundaries.md) |

## First Release Target

The first AI scene release should prove prompt-to-scene previs, not final offline rendering.

- A user prompt becomes valid structured scene intent.
- The scene compiles without needing a live model connection.
- Missing assets become explicit placeholders, not silent failures.
- Cinematic terms become camera, lighting, timeline, and VFX plans.
- Conversational edits become validated scene patches.
- Every result reports provenance, unresolved items, approximations, backend choice, and export readiness.

## Runtime Boundaries

Aura3D should provide:

- provider-neutral prompt and patch contracts;
- deterministic mock-provider behavior for tests and local demos;
- strict `AuraSceneIR` validation;
- a scene compiler targeting current Aura3D packages;
- local asset resolution plus placeholder generation;
- cinematic direction planners;
- patch history and diagnostics;
- safe deployment patterns for live providers.

Aura3D should not claim:

- that it is an LLM;
- that it replaces OpenAI, Anthropic, Gemini, or local models;
- final cinematic or studio-final offline rendering;
- universal WebGPU/device coverage;
- automatic generation of production-ready rigs, cloth, hair, or fluid simulation;
- hidden network calls or hidden API-key requirements.

## First Useful Demo

The north-star AI scene demo is a prompt-to-scene route where this prompt produces a nonblank, editable, diagnosable scene:

```text
A tiny robot discovers a glowing flower inside an abandoned greenhouse at sunrise.
Make it emotional and cinematic with dust in the air, warm rim light,
soft fog, broken glass, overgrown vines, and a slow push-in camera move.
```

The accepted result may use placeholders. It must identify which parts are real assets, generated primitives, approximations, or unresolved requests.
