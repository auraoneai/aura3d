# Wonder World deployment (PRD 04 J16)

**Status: deployed as an unlisted preview, not publicly released.** At the owner's request (2026-10-29, after PR #1398 merged) the app is served at an unlisted preview address: the Vercel project's own production domain and the owner's custom domain (`07` O6 and O7; section 3). This repository is public, so it never writes either address down. The address is linked from nowhere. The app is not in the public site build (`showcaseRoutes` in `marketing/scripts/build-showcase-routes.mjs`), the site catalog (`tools/site/games.catalog.json`), the showcase index, the game inventory or the sitemap. `index.html` carries `<meta name="robots" content="noindex">`, and every response carries `X-Robots-Tag: noindex, nofollow`. Publishing a children's app is a separate owner decision (`docs/prds/veer-wonder-world/07-autonomous-decisions-and-build-record.md` section 4.3). Until then, keep the address unlisted and use it, or a private address, for device testing.

**Owner:** Aura3D product + game engineering (the PRD owner). The public-release decision belongs to the project owner.

## 1. Build

Heavy builds stay off developer Macs. The build and its `check-deploy --browser` pass run on the remote runner as `tests/browser/wonder-world-build.spec.ts`:

```bash
apps/veer-wonder-world/tools/remote-run.sh build
```

A deploy host (not a developer Mac) runs the same build from the repo root. Inside the monorepo the app builds from the workspace sources through the root aliases:

```bash
pnpm exec vite build apps/veer-wonder-world
```

The preview's deploy host runs `apps/veer-wonder-world/tools/deploy-build.sh` after `pnpm install --frozen-lockfile`. It runs these steps in order:
1. the content lint;
2. that build;
3. `tools/check-dist.mjs`, which checks that noindex is kept, no source map was built, no served text file carries the child's name (beyond the one welcome literal, `07` O8) or a deploy-host variable, and no script holds a class static block;
4. the static check-deploy (section 2).

A failed step stops the deploy.

Output, in `apps/veer-wonder-world/dist/` (`vite.config.ts`):

| Path | What | Name |
| --- | --- | --- |
| `index.html` | The page (relative URLs, `base: "./"`) | fixed |
| `assets/*.js`, `assets/*.css` | App and engine code, styles | content-hashed |
| `assets/*.glb`, `assets/*.mp3` | The 54 admitted models and 907 audio files (module-relative URLs, never inlined) | content-hashed |
| `fonts/local.css`, `fonts/graphik/*.woff2`, `fonts/tt-commons-mono/*.woff2` | Licensed fonts, copied from the repo `public/fonts/` | fixed |
| `hdri/autumn_field_puresky_1k.hdr`, `hdri/studio_small_08_1k.hdr`, `hdri/ATTRIBUTION.md` | The look HDRIs (Poly Haven, CC0), copied from the repo `public/hdri/` | fixed |
| `assets/*.wasm`, `assets/*.mjs`, `assets/*.cjs`, `assets/README-*.md` | The engine's decoders (Basis, Draco, meshopt) and their vendored notes, loaded only for compressed models or textures, which the app's models do not use | content-hashed |

No source maps are built. Nothing else from the shared `public/` tree is copied.

**Browsers.** The build targets Safari 15 and Chrome, Edge and Firefox 100 (`vite.config.ts`). Running the app needs WebGL 2 and three JavaScript features Safari has had since 15.4 (`Array.prototype.at`, `Object.hasOwn` and `structuredClone`). On an iPad that means iPadOS 15.4 or later; any current desktop browser works.
- **The page checks first.** An inline script in `index.html` looks for all four before the bundle runs. Where one is missing, the splash shows a notice ("This browser is too old ...") instead of waiting.
- **No class static blocks.** Safari before 16.4 cannot parse them, so a single one stops the whole app on iPadOS 15 and 16.0-16.3. The Safari 15 target lowers them, and `tools/check-dist.mjs` fails a build that still has one.

## 2. Check before serving

```bash
cd apps/veer-wonder-world
node tools/check-dist.mjs                                                # noindex, no source maps, no child name
npx -y @aura3d/cli@4.6.2 check-deploy --dist dist --no-assets          # static check; safe anywhere
# Remote runner only (it opens the build in a headless browser):
npx -y @aura3d/cli@4.6.2 check-deploy --dist dist --no-assets --browser --route /
```

`--no-assets` reflects that the app's `aura.assets.json` lists no entries, so check-deploy has no model list to check.
- **The file must still exist.** The 4.6.2 CLI fails with "Missing aura.assets.json" without it, even with `--no-assets`.
- **Do not run `aura3d assets add` or `aura3d assets typegen` in this folder.** The file's `typegen` points at `src/aura-assets.ts`, which `tools/gen-aura-assets.mjs` writes, and either command would overwrite that module.

Two other checks cover the models and sounds instead:
- the regenerate-and-diff check (`node tools/gen-aura-assets.mjs && node tools/gen-audio-manifest.mjs && git diff --exit-code src`), which ties every file to its sha256 and provenance record;
- the browser pass, which fails on any HTTP error, failed request, uncaught error or console error.

Also run `tools/check-all.sh` and the remote specs (README) on the commit being served, and record the commit SHA, the run ID and the renderer string in `evidence/veer-wonder-world/`.

## 3. Hosting requirements

- **Serve `dist/` at an origin root** (for example `https://<private-preview-host>/`). The engine requests the look HDRIs at the absolute path `/hdri/`, and `fonts/local.css` names its font files under `/fonts/`; everything else is relative. Under a sub-path the HDRIs fall back to the engine's procedural studio light, and the text falls back to the next font in the stack.
- **Neutral names.** No child's name in the host name, path, bucket prefix or alias: use `wonder-world` (for example `wonder-world/<commit-sha>/`). The source folder name is not part of any served URL. The one exception is the preview's custom domain, whose host name the owner chose (`07` O7). The project and its paths stay neutral.
- **Same origin only.** The app fetches nothing from another origin; keep it that way. Do not let a CDN rewrite asset URLs to another host unless that host serves the whole `dist/`.
- **HTTPS**, and these content types: `.glb` `model/gltf-binary`, `.mp3` `audio/mpeg`, `.hdr` `application/octet-stream`, `.woff2` `font/woff2`, `.js` a JavaScript type (`text/javascript` or `application/javascript`, which the preview sends), `.css` `text/css`.
- **No SPA fallback is needed** (one `index.html`); a missing file should answer 404, as check-deploy's own server does.
- **Not indexed:** keep the `noindex` meta tag and add `X-Robots-Tag: noindex` on every response while the app is a prototype. Do not link the address from any public page.
- **Optional hardening:** a Content-Security-Policy that allows only `'self'` for scripts, styles, fonts, media and connections (plus `blob:` and `data:` where the engine needs them). Validate any policy with `check-deploy --browser` before relying on it.

### The preview (Vercel)

| | |
| --- | --- |
| Addresses | The owner's custom domain (`07` O7) and the project's own production domain, `<project>.vercel.app`. Both serve the current production deployment, and anyone who has an address can open it. Neither is written in this repository, which is public: the Vercel project lists them (`vercel-auraone domains ls`), and `tools/deploy-preview.sh --prod` writes the project address to `apps/veer-wonder-world/.preview-url` (gitignored) for the live check. |
| DNS | The custom domain is a DNS-only CNAME in the Cloudflare zone `auraone.ai`, pointing at the Vercel target that `vercel-auraone domains inspect` recommends. Vercel issues its certificate (Let's Encrypt), which puts the host name into public certificate-transparency logs. |
| Project | `aura3d-wonder-world`, in the Vercel team that hosts the Aura3D site (`team_peHZvhHKYn5UsgYkLDOeaDm0`) |
| Configuration | `deploy/vercel.json` (install, build, output directory and headers) and `deploy/vercelignore` (the upload list) |
| Deploy | `apps/veer-wonder-world/tools/deploy-preview.sh --prod [<commit>]` (default `origin/main`), then `apps/veer-wonder-world/tools/remote-run.sh live` |
| Headers | `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` on every response, the caching of section 4, and the `.glb` and `.hdr` content types above |
| Other URLs | Vercel also gives every deployment its own URL, which carries the team's slug. Those URLs stay behind the Vercel team login (they answer 302 to it, project setting `all_except_custom_domains`), and they are never written down or shared. |
| Build log | Visible to the Vercel team only. It shows repo paths, which include the app folder. |
| Analytics | None. Web Analytics and Speed Insights are off, and the team has no log drain. |
| Build variables | None reach the bundle. Vercel passes its own `VITE_VERCEL_*` variables (deployment URL, IDs, production URL) to the build, and the engine reads `import.meta.env` as one object, so Vite would inline them all. `tools/deploy-build.sh` unsets every `VITE_` variable before the build, and `tools/check-dist.mjs` fails a build that still holds one. |

The deploy script works from a clean temporary worktree of the commit, without LFS content:
1. It puts the commit's `deploy/vercel.json` and `deploy/vercelignore` at the worktree root.
2. It uploads about 3,950 files: the workspace, the root Vite config and the two files it imports, the shared fonts and HDRIs, and the app without its tests.
3. It removes the worktree.

The Vercel CLI tests directories by their path without a trailing slash, so no rule in `deploy/vercelignore` may end in `/`.

## 4. Caching

| Files | Cache-Control |
| --- | --- |
| `assets/*` (content-hashed) | `public, max-age=31536000, immutable` |
| `index.html` | `no-cache` (revalidate on every load, so a new build is picked up at once) |
| `fonts/*`, `hdri/*` (fixed names) | `public, max-age=86400` with an ETag (they change only when the repo's shared files change) |

The app uses no service worker and keeps nothing offline. The models (18 MB) and audio (22 MB) total about 40 MB but are fetched on demand: a story loads only its own world's models and the lines, songs and sounds it plays. A story's models come to 1.0-5.8 MB (2.6 MB for the median story), most of it the characters at 0.9-1.2 MB each; the main cast's normal maps are stored as JPEG (`tools/jpeg-normal-maps.mjs`). Test the first load of each world on the slowest target network.

## 5. Rollback

There is no server state, account or data migration to undo. The only thing the app stores is the parent-settings record `wonder-world.parent-settings.v1` in the browser's local storage. Every version reads that record field by field and falls back to defaults on anything it does not recognise. The engine may keep its own device caches, with no personal data in any of them: the quality tier (`aura3d.quality.v1`, local storage), a safety-net flag (`aura3d-safety-heal-stage`, session storage) and an animation-retarget cache (IndexedDB `aura3d-retarget`).

1. Deploy each build to its own folder or bucket prefix named by the commit SHA, and point the private address at it (an alias, symlink or routing rule), so switching versions is one atomic change.
2. Keep the previous build in place. To roll back, point the address at the previous SHA. `index.html` is `no-cache`, so the next load uses the old build, and its hashed assets are still there.
3. Keep old hashed `assets/` for at least a day after a switch, so a tab that is still open can finish loading its story.
4. Record the switch (old SHA, new SHA, reason) in `evidence/veer-wonder-world/deployments.md`.

On the preview, Vercel keeps every deployment and never changes it.
- **List the deployments:** `vercel-auraone ls aura3d-wonder-world --scope team_peHZvhHKYn5UsgYkLDOeaDm0`.
- **Roll back:** `vercel-auraone rollback <deployment> --scope team_peHZvhHKYn5UsgYkLDOeaDm0`, or Promote in the dashboard. Either moves the address back to an earlier deployment without a rebuild. Roll back only to a deployment recorded as clean in `evidence/veer-wonder-world/deployments.md`.
- **Old assets:** unlike step 3, the address serves only the current deployment's files, so the old hashed `assets/` go at a switch. A tab left open across a deploy can fail to load a story it had not loaded yet; a reload fixes it, because the new `index.html` names new files. A 404 under `assets/` carries the immutable header too, which is harmless for the same reason.

## 6. Logging and privacy (no PII)

- The app logs nothing to the console. It sends no analytics, error reports or beacons, and requests nothing but its own files. J07 (`tests/unit/privacy/no-child-data.test.ts`) checks the source for this.
- It never asks for the microphone, camera, location or notifications, and stores no name, photo, voice or age.
- Host access logs are the only record a deployment creates. Keep them off for this route, or keep only what operations need (status codes and byte counts) for a short time, without IP addresses or user agents tied to sessions. On the preview, Vercel keeps its own request logs for the team for its plan's short retention, and nothing exports them. URLs carry only QA switches (`?story=`, `?mode=`, ...), never a child's data.
- The `?diag=1` diagnostics panel shows renderer information on the device itself and sends nothing.
- Screenshots, recordings and device reports kept as evidence must not show a child or a family member, and must not carry a child's voice.

## 7. Before any public release

All of these come first:

- external privacy and legal review for children's privacy rules (for example COPPA);
- a trademark search for "Wonder World" and the six character names;
- a legal check of the Meshy and ElevenLabs terms for public redistribution;
- every free-tier or unknown-tier audio file re-rendered on a paid tier;
- a human speech-language pathologist and caregiver review before any educational wording;
- physical-device evidence (iPad and iPhone Safari, Android Chrome, desktop Chrome);
- no efficacy or therapy claim anywhere.

Then the owner decides (`07` section 4.3).

Only after that decision:
1. Remove `noindex`, from `index.html` and from the headers in `deploy/vercel.json`.
2. Add the app to:
   - `docs/workflows/game-names.md`;
   - `tools/site/games.catalog.json`, then run `node tools/site/gen-game-inventory.mjs`;
   - `showcaseRoutes` in `marketing/scripts/build-showcase-routes.mjs`;
   - the sitemap route manifest in `marketing/scripts/gen-seo.mjs`.
3. Run `node marketing/scripts/check-site.mjs` and `aura3d check-deploy --release`.
