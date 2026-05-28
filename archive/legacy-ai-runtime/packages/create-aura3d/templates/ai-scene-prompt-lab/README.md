# A3D AI Scene Prompt Lab

This starter turns a creative prompt into a deterministic Aura Scene IR draft and renders it in the browser. It uses the local `MockProvider` by default, so it runs without API keys, network calls, or model access.

## Run

```sh
pnpm install
pnpm build
pnpm preview
```

Open the preview URL printed by Vite.

## Provider Modes

Default mode:

```sh
VITE_AURA_AI_PROVIDER=mock
```

Optional provider environment variables are documented for wiring your own server-side adapter:

```sh
VITE_AURA_AI_PROVIDER=openai
VITE_OPENAI_MODEL=gpt-4.1-mini
OPENAI_API_KEY=server-side-only

VITE_AURA_AI_PROVIDER=anthropic
VITE_ANTHROPIC_MODEL=claude-3-5-sonnet-latest
ANTHROPIC_API_KEY=server-side-only

VITE_AURA_AI_PROVIDER=gemini
VITE_GEMINI_MODEL=gemini-1.5-pro
GEMINI_API_KEY=server-side-only

VITE_AURA_AI_PROVIDER=local
VITE_LOCAL_MODEL_ENDPOINT=http://127.0.0.1:11434
```

This browser template intentionally does not send provider API keys directly from client code. Use a server proxy or local model bridge for live providers, and keep secrets out of browser bundles.

## Security Notes

- Do not place real API keys in `VITE_*` variables for a browser build unless the value is safe to expose publicly.
- Use `MockProvider` for CI, demos, screenshots, and offline development.
- Route all live provider calls through a trusted server endpoint that redacts secrets from logs.
- Treat prompts as user input. Do not execute generated script text, HTML, shader source, or URLs without validation.
- Keep prompt provenance with provider, model, prompt hash, generated time, and patch history, but never store raw secrets.

## What The Template Shows

- Provider-neutral prompt interface.
- Deterministic `MockProvider` implementation.
- Structured scene IR with provenance, camera, lights, materials, objects, timeline, warnings, and patches.
- Browser rendering of the generated scene draft.
- Prompt panel with provider status, diagnostics, generated IR, and export.
- Conversational edit input that creates a deterministic scene patch.

The generated scene is a draft for previs and product exploration. It is not a claim of final film quality, perfect asset resolution, or live provider support until those adapters and reports are added.
