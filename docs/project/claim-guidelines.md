# Aura3D launch positioning

Version: 1.0.0

Every public claim must map to a shipped API, CLI command, template, example,
diagnostic, docs artifact, report, or release artifact.

Claim wording is governed by `docs/project/product-studio-claim-registry.md`,
`docs/project/release-tracks.md`, and
`docs/project/frozen-benchmark-release-gates.md`. New public claims must either
map to the registry or add a reviewed registry entry before release copy is
published.

## Aura3D advantage

The Aura3D SDK release may claim:

- Aura3D is an agent-friendly browser 3D SDK.
- Agents write TypeScript or JavaScript against `@aura3d/engine`.
- Aura3D supports typed GLB/glTF asset workflows through `@aura3d/cli`.
- Aura3D includes prompt-plan guidance, scene kits, diagnostics, screenshots, and deployment checks.
- A local/developer-ready Round 50 Aura3D SDK artifact exists.

The scoped claim must cite `docs/project/release-tracks.md` or the Round 50
scoped release artifacts when used in release notes or operator handoff docs.

been satisfied for a committed round:

- Aura3D beats low-level renderer code.
- Aura3D passed the frozen external AI-agent benchmark.
- Aura3D is visually superior to low-level renderer code on the locked benchmark.

## Blocked Prompt-Runtime And Cinematic Claims

- Aura3D is an LLM.
- Aura3D is a provider-backed prompt-to-scene runtime.
- Aura3D has a server-side OpenAI, Anthropic, Gemini, or local-model proxy as a shipped public product surface.
- Aura3D uses `AuraSceneIR` as the primary public authoring contract.
- Aura3D generates production-ready 3D assets from scratch.
- Aura3D produces final film quality or Pixar-quality frames.
- Aura3D replaces Maya, Houdini, Blender, Unreal, Unity, RenderMan, low-level renderer code, or framework-specific renderer layers.

Allowed cinematic wording must stay within `docs/agents/cinematic-scene-quality.md`: agent-written TypeScript, realtime previs-style scenes, camera motion, lighting, materials, atmosphere, typed assets, and browser deployment.

## Allowed Claim Evidence

Allowed scoped evidence includes:

- `pnpm run check:agent-api`
- `pnpm run check:assets-cli`
- `pnpm run check:agent-docs`
- `pnpm run check:templates`
- `pnpm run check:examples`
- `pnpm run check:devtools`
- `pnpm run check:deployment`
- `pnpm run check:docs-site`
- `pnpm run check:bundle-size`
- `pnpm run check:marketing-truth`
- `pnpm run check:marketing-links`
- `pnpm run verify:docs-consistency`
- `npm pack --dry-run --json`
- `npm pack --pack-destination <release-dir> --json`
- `benchmark/releases/round-50-scoped-sdk-product-context/release-artifact-evidence.md`

`docs/project/frozen-benchmark-release-gates.md`.

## Invalid Claim Evidence

Do not use these as proof for broad public claims:

- future roadmap items;
- local smoke screenshots by themselves;
- nonblank screenshot checks;
- self-authored visual QA scores;
- report names or node names without accepted pixels;
- generated reports under ignored `tests/reports/` without regeneration context;
- owner-scoped bypasses for neutral review or external scoring;
- deleted planning PRDs;
- historical provider-runtime PRDs or archived prompt-to-IR plans.

Do not market future roadmap items as shipped.
