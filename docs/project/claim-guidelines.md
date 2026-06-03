# Claim Guidelines

Version: 1.0.0

Every public claim must map to a shipped API, CLI command, template, example,
diagnostic, docs artifact, report, or release artifact.

Claim wording is governed by `docs/project/product-studio-claim-registry.md`,
`docs/project/release-tracks.md`, and
`docs/project/frozen-benchmark-release-gates.md`. New public claims must either
map to the registry or add a reviewed registry entry before release copy is
published.

## Allowed Scoped Product Claims

The scoped SDK/product-context release may claim:

- Aura3D is an agent-friendly browser 3D SDK.
- Agents write TypeScript or JavaScript against `@aura3d/engine`.
- Aura3D supports typed GLB/glTF asset workflows through `@aura3d/cli`.
- Aura3D includes prompt-plan guidance, scene kits, diagnostics, screenshots, and deployment checks.
- A local/private-beta Round 50 scoped SDK/product-context artifact exists.

The scoped claim must cite `docs/project/release-tracks.md` or the Round 50
scoped release artifacts when used in release notes or operator handoff docs.

## Blocked Benchmark-Superiority Claims

Do not claim these unless `docs/project/frozen-benchmark-release-gates.md` has
been satisfied for a committed round:

- Aura3D beats manual renderer code.
- Aura3D passed the frozen external AI-agent benchmark.
- Aura3D is visually superior to manual renderer code on the locked benchmark.
- Round 50 is a benchmark-superiority ship decision.
- Owner-skipped neutral review or external scoring is equivalent to neutral benchmark proof.

## Blocked Prompt-Runtime And Cinematic Claims

Do not claim these from the current scoped SDK/product-context release:

- Aura3D is an LLM.
- Aura3D is a provider-backed prompt-to-scene runtime.
- Aura3D has a server-side OpenAI, Anthropic, Gemini, or local-model proxy as a shipped public product surface.
- Aura3D uses `AuraSceneIR` as the primary public authoring contract.
- Aura3D generates production-ready 3D assets from scratch.
- Aura3D produces final film quality or Pixar-quality frames.
- Aura3D replaces Maya, Houdini, Blender, Unreal, Unity, RenderMan, manual renderer code, or framework-specific renderer layers.

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

Benchmark-superiority evidence must use the external artifacts listed in
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
