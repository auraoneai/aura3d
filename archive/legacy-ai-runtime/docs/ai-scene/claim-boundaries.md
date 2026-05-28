# Claim Boundaries

Version: 0.1.0

AI scene claims must stay narrower than current code, route, test, and report evidence.

## Allowed Baseline Wording

Use wording like:

> Aura3D is an AI-native 3D scene runtime that can integrate with OpenAI, Anthropic, Gemini, local models, and other providers to turn structured creative intent into editable browser 3D scenes.

Also acceptable:

- Aura3D is not the LLM; it is the runtime and scene execution layer.
- Aura3D can use deterministic mock providers for no-network local demos and CI.
- Aura3D should report resolved assets, placeholders, approximations, backend choice, and prompt provenance.
- Named AI scene workflows are supported only when their routes, tests, and reports pass.

## Blocked Wording

Do not claim:

- Aura3D is an LLM.
- Aura3D replaces OpenAI, Anthropic, Gemini, or local models.
- Aura3D generates final cinematic or studio-final scenes.
- Aura3D creates production-ready characters, rigs, cloth, hair, fluids, or facial animation from any prompt.
- Aura3D supports every provider, model, browser, GPU, asset format, or WebGPU device.
- Aura3D can use copyrighted studio or artist styles by name in public marketing.
- A single prompt route proves broad production readiness.
- A placeholder scene is a finished asset-backed production scene.

## Preferred Replacements

| Risky claim | Safer claim |
|---|---|
| AI creates final film scenes instantly | AI scene prompts produce realtime previs scenes with diagnostics |
| Aura3D understands natural language | Aura3D integrates with language models and validates structured scene intent |
| All assets are generated | Missing assets become explicit placeholders or unresolved items |
| WebGPU AI scenes work everywhere | WebGPU AI scenes depend on browser/device reports and unsupported-state handling |
| Live AI is required | Mock and precomputed IR paths support local demos and CI |

## Evidence Required

Before promoting an AI scene claim, verify:

- provider contract coverage;
- schema validation coverage;
- compiler coverage;
- route health;
- screenshot quality;
- asset resolver diagnostics;
- security/redaction checks;
- report freshness;
- claim scan results.
