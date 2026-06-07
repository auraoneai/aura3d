# Aura3D Claim Guidelines

Version: 1.0.10
Planning alignment: 1.0.10 release gates

Every public claim must map to a shipped API, CLI command, template, example,
diagnostic, docs artifact, report, or release artifact.

Claim wording is governed by `docs/project/product-studio-claim-registry.md`,
`docs/project/release-tracks.md`, and
`docs/project/frozen-benchmark-release-gates.md`. New public claims must either
map to the registry or add a reviewed registry entry before release copy is
published.

## Aura3D advantage

The current `1.0.10` Aura3D SDK release may claim:

- Aura3D is an agent-friendly browser 3D SDK.
- Agents write TypeScript or JavaScript against `@aura3d/engine`.
- Aura3D supports typed GLB/glTF asset workflows through `@aura3d/cli`.
- Aura3D includes prompt-plan guidance, scene kits, diagnostics, screenshots, and deployment checks.
- `@aura3d/engine@1.0.10` does not install Three.js as a root engine runtime dependency.
- Aura Clash Arena is a development showcase and runtime proof target.
- 1.0.10 is a scoped runtime-foundation release with current npm, docs, deployed-route, and readiness evidence.

The scoped claim must cite `docs/project/release-tracks.md` or the Round 50
scoped release artifacts when used in release notes or operator handoff docs.

Do not claim the following until the neutral benchmark, claim-defense, and
release gates have been satisfied for a committed round:

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
- Aura3D has Babylon.js parity or mature commercial game-engine completeness.
- Aura Clash is flagship-quality, production-ready, world-class, or proof of a mature game engine.
- Aura Clash proves final game art, final combat feel, or final animation quality before the 1.0.10 showcase gates pass.
- The AI prompt/catalog CLI always returns production-ready game assets.
- Aura3D bundles Three.js in the default `@aura3d/engine` runtime.

Three.js migration, parity, and compatibility claims must explicitly name the
separate `@aura3d/three-compat` package or comparison tooling. Do not describe
optional compatibility tooling as part of the default root engine install.

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

## Aura3D 1.1 Cartoon Studio Claims

The 1.1 cartoon-studio track is a planned major release, not a shipped claim surface until the release gates in `docs/project/aura3d-1.1-cartoon-studio-prd.md` pass.

Allowed planning wording:

- Aura3D 1.1 is planned as a browser-native cartoon episode production pipeline.
- Aura3D 1.1 is intended to connect typed assets, show-bible metadata, shot timelines, dialogue/captions, visemes, render queues, video export, package evidence, and review artifacts.
- Generated images can be used as concept art, thumbnails, textures, background plates, or style references.
- The 1.1 gate is intended to reject still-image puppet output and source-only render plans as publish-ready animation proof.

Allowed wording after the 1.1 gates pass, only if the evidence exists:

- Aura3D can package a short browser-rendered cartoon episode from typed assets and a structured episode plan.
- Aura3D can export captions, thumbnail, route proof, asset provenance, render manifest, and review artifacts for a scoped cartoon episode.
- Aura3D can detect and reject global-only still-image motion for the scoped release gate.

Blocked wording:

- Aura3D produces Pixar-quality or final film-quality animation.
- Aura3D is a magic image-to-video engine.
- Aura3D turns any single generated image into a believable 3D cartoon episode.
- Aura3D replaces Blender, Maya, Toon Boom, After Effects, Unity, Unreal, or a full animation studio.
- A CSS-transformed still image, fake parallax plate, subtitle-over-still output, or global image shake is real Aura3D cartoon animation.
- `tests/reports/prompt-animation/cartoon-image-puppet-animation.webm` proves successful 1.1 animation.

The failed still-image puppet output may be cited only as negative evidence or a regression fixture that the 1.1 motion gate must reject.

## Aura Clash Allowed Wording

Allowed before the 1.0.10 gates pass:

- Aura Clash Arena is a browser fighting-game development showcase.
- Aura Clash Arena proves selected runtime mechanics: boot, frame advancement, typed GLB load, input, state changes, hit resolution, HUD updates, screenshots, and evidence.
- Aura Clash Arena still has open visual, gameplay, audio, asset-quality, performance, and deployment-parity blockers.

Not allowed before the 1.0.10 gates pass:

- Aura Clash is a polished flagship game.
- Aura Clash proves Aura3D is a mature game engine.
- Aura Clash is comparable to Unity, Unreal, Babylon.js, or commercial fighting games.
