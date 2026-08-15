# Animation episode production workflow

This is the shipped path from a prompt to a silent rendered clip using the
`animation-studio` template. It is not a planned 1.1 contract and it is not an
image-to-video pipeline.

The template turns a sentence into a validated `EpisodeDocument` and plays that
document through a generic renderer. Renders are **silent**. AuraVoice owns
voice, if you add it later.

## 1. Scaffold

```bash
npx create-aura3d@latest my-studio --template animation-studio
cd my-studio
pnpm install
```

The live template scripts (`packages/create-aura3d/templates/animation-studio/package.json`)
are:

| Script | What it runs |
| --- | --- |
| `scene` | `tsx scripts/animation-scene.ts` — Scene-Tool CLI |
| `episode:generate` | `tsx scripts/generate-scene.ts` |
| `episode:render-3d` | `tsx scripts/render-live.ts` — headless live-3D render |
| `studio` | Vite web NLE at `apps`-style local studio |
| `scene:preview` | preview server |
| `scene:determinism` | document-hash → render-hash check |
| `dev` / `build` / `preview` | Vite route |

There is no `episode:plan`, `episode:preview`, `episode:render`,
`episode:package`, `episode:review`, or `episode:verify` script on this
template.

## 2. Author a working document

The Scene-Tool CLI is the director surface. Every command edits
`dist/scene/working.document.json`.

```bash
# Skeleton: set + shots + timeline, empty cast
pnpm scene new --prompt "two office workers arguing about a deadline"

# Or a complete first draft (cast + dialogue + per-beat actions)
pnpm scene new --prompt "a chef teaches a child to bake" --full

pnpm scene cast add --id worker-1 --query "office worker in a shirt"
pnpm scene dialogue --line l0 --speaker worker-1 --text "We are not shipping on Friday." --start 0.4
pnpm scene block --character worker-1 --shot shot-1 --to -1,0 --clip talk
pnpm scene camera --shot shot-1 --preset close-up
pnpm scene validate
```

Implemented commands in `scripts/animation-scene.ts`: `new`, `show`, `block`,
`camera`, `gesture`, `dress`, `clear-props`, `set`, `cast`, `scale`, `shot`,
`prop`, `dialogue`, `retime`, `undo`, `validate`, `render`.

Full command reference: [`docs/animation-studio/guide.md`](../animation-studio/guide.md).

## 3. Optional typed-asset intake

The studio's default cast is the curated procedural humanoid library. To bring
your own rigged GLB:

```bash
npx @aura3d/cli@latest assets add ./assets/hero.glb --name hero
npx @aura3d/cli@latest assets validate-animation --require-license
```

Resolve/search profiles that exist on `@aura3d/cli` are
`animation-character`, `animation-prop`, `animation-set`, and
`animation-environment`. Import the generated `assets.*` keys. Do not pass
string ids or raw `.glb` URLs.

## 4. Render

```bash
# Fast previz
pnpm scene render

# Final silent WebM (1080p / 24fps when AURA_QUALITY=final)
AURA_QUALITY=final pnpm episode:render-3d
```

`episode:render-3d` writes `dist/episodes/live-3d/episode-3d.webm`. The file is
silent by design. Caption / viseme / dialogue timing stays on the document for
AuraVoice; see [`docs/api/auravoice-bridge.md`](../api/auravoice-bridge.md).

## 5. Review what the gates actually measure

Quality is measured on the rendered episode, not on a checklist:

- body motion (not lip-flap-only)
- mouth cycling during dialogue
- caption windows matching speech duration
- prompt-specific set (no moon-garden fallback unless opted in)
- determinism (`document-hash` → `render-hash`)

See [`docs/animation-studio/quality-and-limitations.md`](../animation-studio/quality-and-limitations.md).

Rejected as animation evidence: a still image with subtitles, CSS pan/zoom on
one plate, or a `sourceOnly: true` render plan presented as publish-ready
video.

## Related

- Studio product docs: [`docs/animation-studio/README.md`](../animation-studio/README.md)
- Web NLE: [`docs/animation-studio/studio-app.md`](../animation-studio/studio-app.md)
- Prompt-animation playback APIs (`compilePromptEpisodePlan`,
  `createShotPlaybackPlan`, `installShotPlayback`) live on `@aura3d/engine` and
  are used by the `animation-channel`, `prompt-animation-channel`, and
  `episode-builder` templates — not by the `animation-studio` Scene-Tool lane.
  See [`docs/api/prompt-animation.md`](../api/prompt-animation.md).
