# Wonder World deployment (PRD 04 J16)

**Status: not deployed, and not to be deployed publicly without an owner decision.** Wonder World is a prototype children's app. It is not in the public site build (`showcaseRoutes` in `marketing/scripts/build-showcase-routes.mjs`), the site catalog (`tools/site/games.catalog.json`), the showcase index, the game inventory or the sitemap, and `index.html` carries `<meta name="robots" content="noindex">`. Publishing a children's app is a separate owner decision (`docs/prds/veer-wonder-world/07-autonomous-decisions-and-build-record.md` section 4.3). Until then a build may only be served at a private address for device testing.

**Owner:** Aura3D product + game engineering (the PRD owner). The public-release decision belongs to the project owner.

## 1. Build

Heavy builds stay off developer Macs. The build and its `check-deploy --browser` pass run on the remote runner as `tests/browser/wonder-world-build.spec.ts`:

```bash
apps/veer-wonder-world/tools/remote-run.sh build
```

A deploy host (not a developer Mac) runs the same build from the repo root; inside the monorepo the app builds from the workspace sources through the root aliases:

```bash
pnpm exec vite build apps/veer-wonder-world
```

Output, in `apps/veer-wonder-world/dist/` (`vite.config.ts`):

| Path | What | Name |
| --- | --- | --- |
| `index.html` | The page (relative URLs, `base: "./"`) | fixed |
| `assets/*.js`, `assets/*.css` | App and engine code, styles | content-hashed |
| `assets/*.glb`, `assets/*.mp3` | The 53 admitted models and 882 audio files (module-relative URLs, never inlined) | content-hashed |
| `fonts/local.css`, `fonts/graphik/*.woff2`, `fonts/tt-commons-mono/*.woff2` | Licensed fonts, copied from the repo `public/fonts/` | fixed |
| `hdri/autumn_field_puresky_1k.hdr`, `hdri/studio_small_08_1k.hdr`, `hdri/ATTRIBUTION.md` | The look HDRIs (Poly Haven, CC0), copied from the repo `public/hdri/` | fixed |

No source maps are built. Nothing else from the shared `public/` tree is copied.

## 2. Check before serving

```bash
cd apps/veer-wonder-world
npx -y @aura3d/cli@4.5.0 check-deploy --dist dist --no-assets          # static check; safe anywhere
# Remote runner only (it opens the build in a headless browser):
npx -y @aura3d/cli@4.5.0 check-deploy --dist dist --no-assets --browser --route /
```

`--no-assets` states what is true: the app has no `aura.assets.json`, so check-deploy has no model list to check. The models and sounds are covered instead by the regenerate-and-diff check (`node tools/gen-aura-assets.mjs && node tools/gen-audio-manifest.mjs && git diff --exit-code src`, which ties every file to its sha256 and provenance record) and by the browser pass, which fails on any HTTP error, failed request, uncaught error or console error. Also run `tools/check-all.sh` and the remote specs (README) on the commit being served, and record the commit SHA, the run id and the renderer string in `evidence/veer-wonder-world/`.

## 3. Hosting requirements

- **Serve `dist/` at an origin root** (for example `https://<private-preview-host>/`). The engine requests the look HDRIs at the absolute path `/hdri/` and `fonts/local.css` names its font files under `/fonts/`; everything else is relative. Under a sub-path the HDRIs fall back to the engine's procedural studio light and the text falls back to the next font in the stack.
- **Same origin only.** The app fetches nothing from another origin; keep it that way (no CDN rewrite of asset URLs to another host unless that host serves the whole `dist/`).
- **HTTPS**, and these content types: `.glb` `model/gltf-binary`, `.mp3` `audio/mpeg`, `.hdr` `application/octet-stream`, `.woff2` `font/woff2`, `.js` `text/javascript`, `.css` `text/css`.
- **No SPA fallback is needed** (one `index.html`); a missing file should answer 404, as check-deploy's own server does.
- **Not indexed:** keep the `noindex` meta tag and add `X-Robots-Tag: noindex` on every response while the app is a prototype. Do not link the address from any public page.
- **Optional hardening:** a Content-Security-Policy that allows only `'self'` for scripts, styles, fonts, media and connections (plus `blob:` and `data:` where the engine needs them). Validate any policy with `check-deploy --browser` before relying on it.

## 4. Caching

| Files | Cache-Control |
| --- | --- |
| `assets/*` (content-hashed) | `public, max-age=31536000, immutable` |
| `index.html` | `no-cache` (revalidate on every load, so a new build is picked up at once) |
| `fonts/*`, `hdri/*` (fixed names) | `public, max-age=86400` with an ETag (they change only when the repo's shared files change) |

The app does not use a service worker and keeps nothing offline. The models and audio total about 45 MB but are fetched on demand: a story loads only its own world's models and the lines, songs and sounds it plays. Test the first load of each world on the slowest target network.

## 5. Rollback

There is no server state, account or data migration: the only thing the app stores is the parent-settings record `wonder-world.parent-settings.v1` in the browser's local storage, which every version reads field by field and falls back to defaults on anything it does not recognise.

1. Deploy each build to its own folder or bucket prefix named by the commit SHA, and point the private address at it (an alias, symlink or routing rule), so switching versions is one atomic change.
2. Keep the previous build in place. To roll back, point the address at the previous SHA; `index.html` is `no-cache`, so the next load uses the old build, and its hashed assets are still there.
3. Keep old hashed `assets/` for at least a day after a switch, so a tab that is still open can finish loading its story.
4. Record the switch (old SHA, new SHA, reason) next to the evidence in `evidence/veer-wonder-world/`.

## 6. Logging and privacy (no PII)

- The app logs nothing to the console, sends no analytics, error reports or beacons, and makes no request besides its own files (J07, `tests/unit/privacy/no-child-data.test.ts`, checks the source for this).
- It never asks for the microphone, camera, location or notifications, and stores no name, photo, voice or age.
- Host access logs are the only record a deployment creates. Keep them off for this route, or keep only what operations need (status codes and byte counts) for a short time, without IP addresses or user agents tied to sessions. URLs carry only QA switches (`?story=`, `?mode=`, ...), never a child's data.
- The `?diag=1` diagnostics panel shows renderer information on the device itself and sends nothing.
- Screenshots, recordings and device reports kept as evidence must not show a child or a family member, and must not carry a child's voice.

## 7. Before any public release

All of these, then the owner's decision (`07` section 4.3):

- external privacy and legal review for children's privacy rules (for example COPPA);
- a trademark search for "Wonder World" and the six character names;
- a legal check of the Meshy and ElevenLabs terms for public redistribution;
- every free-tier or unknown-tier audio file re-rendered on a paid tier;
- a human speech-language pathologist and caregiver review before any educational wording;
- physical-device evidence (iPad and iPhone Safari, Android Chrome, desktop Chrome);
- no efficacy or therapy claim anywhere.

Only after that decision: remove `noindex`, add the app to `docs/workflows/game-names.md`, `tools/site/games.catalog.json` (then `node tools/site/gen-game-inventory.mjs`), `showcaseRoutes` in `marketing/scripts/build-showcase-routes.mjs` and the sitemap route manifest in `marketing/scripts/gen-seo.mjs`, then run `node marketing/scripts/check-site.mjs` and `aura3d check-deploy --release`.
