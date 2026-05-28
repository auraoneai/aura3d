# Anti-Hallucination Rules

- Do not invent Aura3D APIs. Use only public exports documented in
  `docs/agents/api-surface.md`.
- Do not invent asset paths or ids.
- Do not write `model("robot")`; use `model(assets.robot)`.
- Do not claim an example, route, template, or deployment path works until the
  relevant build/test/check command passes.
- Do not describe Aura3D as an AI model, asset store, or runtime for arbitrary
  generated code.
