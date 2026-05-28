# Cinematic Previs Runtime

Aura3D cinematic previs is a cinematic realtime previs workflow. It turns structured AI scene intent into an inspectable browser scene with assets, lighting, camera motion, timeline data, diagnostics, and exportable provenance. It is not a final-film renderer and should not be described as producing finished offline animation, final VFX, or studio-final cinematic imagery.

## runtime scene To cinematic previs Boundary

runtime scene routes proved architecture:

- provider-neutral prompt handling;
- deterministic mock behavior for local demos and CI;
- `AuraSceneIR` validation;
- diagnostics, provenance, and patch mechanics;
- route health without API keys.

runtime scene did not prove the visual product promise. Primitive or `canvas2d-previs` routes are architecture proofs, not the cinematic previs cinematic result. They can remain useful for contract tests, but they are not sufficient evidence for asset-backed cinematic realtime previs.

cinematic previs raises the bar from symbolic scene diagrams to renderer-owned cinematic scenes. A cinematic previs route must show visible world content, real or high-quality procedural assets, intentional lighting, materials, camera motion, VFX, postprocess, and quality evidence.

## Runtime Modes

The cinematic route must make its provider mode visible in the UI, diagnostics, and reports.

| Mode | Network | API keys | Purpose | Expected output |
|---|---:|---:|---|---|
| `fixture` | No | No | Public demo, screenshots, route health, release baseline | Curated asset-backed north-star scene |
| `mock` | No | No | CI, contract tests, deterministic prompt variations | Structured scene IR from deterministic rules |
| `live` | Yes, through server proxy | Server only | Optional OpenAI, Anthropic, Gemini, or local model evaluation | Validated scene IR returned by the proxy |

Fixture mode is the default for public cinematic quality. It is a curated target scene, not a fake provider result. Mock mode is deterministic provider behavior used to exercise contracts. Live mode is optional and must be explicitly configured through a trusted server endpoint.

## Runtime Flow

The cinematic previs cinematic path is:

1. User enters a cinematic concept.
2. Browser selects `fixture`, `mock`, or server-proxy-backed `live` mode.
3. Provider result is normalized into `AuraSceneIR`.
4. The cinematic planner resolves camera, lighting, VFX, materials, and timeline intent.
5. The asset resolver maps semantic requirements to a local cinematic asset manifest.
6. The runtime renders through WebGL2 or WebGPU for the public cinematic route.
7. Diagnostics, asset provenance, screenshots, quality metrics, and export bundle data are generated.

The public route must not depend on DOM or CSS overlays for the cinematic proof. Labels and panels can explain the scene, but rain, fog, glow, hero props, materials, and lighting need to be owned by the renderer or documented as renderer inputs.

## Asset-Backed Route Requirements

The north-star route should include:

- a nonzero hero object count;
- a nonzero environment or set geometry count;
- a nonzero practical or cinematic light count;
- a cinematic camera path or timeline;
- material intent beyond flat colors;
- VFX intent such as fog, rain, glow, haze, particles, or wet reflections;
- asset provenance for every resolved fixture, generated procedural asset, and placeholder.

Placeholders are allowed only when they are explicit diagnostics, not silent substitutes for the claimed visual result. The public cinematic fixture should have zero hero placeholders.

## Provider Result Handling

Provider output must be treated as untrusted structured input. The browser route and server proxy should validate:

- schema version;
- required camera, lighting, object, material, environment, and timeline fields;
- quality target;
- asset requirements;
- diagnostics and provider provenance;
- absence of secrets in returned metadata.

Provider failures must not blank the scene. The route should fall back to the fixture scene, show a clear provider-status diagnostic, and avoid claiming that the fallback came from the failed live provider.

## No Final-Film Claim Boundary

Allowed claim:

> Aura3D turns AI-generated scene intent into cinematic realtime previs scenes that run in the browser and can be inspected, patched, and exported with diagnostics and asset provenance.

Blocked claims:

- final film quality;
- Pixar-quality or studio-final output;
- fully resolved production animation;
- offline path-traced rendering;
- replacement for director, layout, lighting, animation, or VFX departments;
- guaranteed live-provider quality without evidence from configured provider reports.

Use "cinematic realtime previs" consistently. If a screenshot, route, report, or export bundle does not pass the cinematic quality gates, describe it as a draft, fixture, mock, or architecture proof.
