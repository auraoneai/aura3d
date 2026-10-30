# Wonder World preview deployments

The unlisted preview of `apps/<app>/DEPLOYMENT.md` §3 is the Vercel project `aura3d-wonder-world`. It is served at the project's own production domain and at the owner's custom domain (`07` O6 and O7).
- **No addresses here.** The repository is public, so this record names neither address. The Vercel project lists them, and a `--prod` deploy writes the project address to the gitignored `apps/<app>/.preview-url`.
- **Not indexed.** Every response carries `X-Robots-Tag: noindex, nofollow`.
- **Not a public release.** See `07` O5.
- **Per-deployment URLs.** Vercel gives each deployment its own URL, which carries the team's slug. Those URLs stay behind the team login (302), and this record leaves them out.
- **Screenshots.** Captures of the start screen show the welcome name (`07` O8), so none is kept here.

`<app>` stands for the app's folder name, as in every record in this folder.

## Deployments (newest first)

### `dpl_8GyNJtcfikawYF7BbCLaQ7dYYpM7`: current

- **Commit:** `b4bef89bb`, main after #1400 merged, deployed with `deploy-preview.sh --prod origin/main`.
- **Deployed:** 2026-10-30 00:26 UTC.
- **Change:** the same app on main's engine sources. Main had moved to Aura3D 4.6.0 and the audit-fix lanes while #1400 was open. #1400 merged main in (`b5d5158f8`, whose tree is main's), so the app now builds against the 4.6.0 workspace engine.
- **Gates on the deploy host:** content lint OK. `check-dist` OK: 1002 files, 26 text files, 0 source maps, 1 welcome literal, 0 host variables, 0 class static blocks, noindex kept.
- **Before deploying:** the full remote suite ran on that tree (fan-out `20261029T233812Z`, 21 runs) and every run passed:
  - start-screen 13 at 13 sizes;
  - first-frame build 4;
  - touch-and-layout 3;
  - playback-episodes 3, playback-episodes-2 2, playback-activities 4;
  - no-speech-required 2, no-speech-required-2 2;
  - low-motion and low-motion-2;
  - look, stills, stills-2, stills-3 and stills-4;
  - characters, characters-2 and characters-3;
  - audio-and-pausing, parent-panel and consumer-smoke.

  Locally the tree passes:
  - both typechecks (published 4.5.0 types and workspace sources);
  - 549 of 549 unit tests;
  - the content lint, the generated-file check and the game checks (21).
- **The captures against the earlier ones:**
  - **Overall.** The 92 frames this suite shares with the records here differ from them by a median of 0.14/255 per pixel.
  - **`first-frame-diag`.** The `?diag=1` panel now shows the measured frame rate; before, it showed a constant 60.
  - **`low-motion-idle`.** Momo is drawn as her stand-in. `wonder-world-low-motion.spec.ts` opens a third browser context at `1024x768` and, unlike the capture specs, does not call `remountIfModelsLate`, so the capture keeps a late model's stand-in. A standalone rerun (`wonder-low-motion-20261030T002634Z`) passed with the same idle stillness (`maxJump: 1.764`, `meanAbsLumaDiff: 0.024`, `changedRatio: 0`). A diagnostic run (`wonder-diag-models-20261030T005705Z`: E17 at `640x480` and `1024x768`, each with and without `?reducedMotion=1`) found why the model was late. At `1024x768` in reduced motion, Momo's and Sheru's GLBs arrived in under 40 ms (Resource Timing), yet the preloader still reported them `pending` when the story's 10 s wait ended: the engine's frames held the page's main thread, so reading and hash-checking the bytes had not run. Both were drawn as stand-ins; in the other three cases both were models. `07` B41 pauses the engine's frames while a story's models download.
- **Engine changes that reach the app** (a review of 851238973..7d61bcc63, each finding re-checked):
  - On a lost and restored WebGL context, the stage now skips frames and then mounts the story again. Before, it stopped drawing until the next story.
  - Instanced shadow receivers may now pick a farther sun cascade, for example the station's sleepers. That could soften their contact shadows, but no capture shows a difference.
  - The diagnostics panel's frame rate is real.
- **Live check:** run `wonder-live-20261030T002732Z` passed against this deployment. The spec ran from `b5d5158f8`, whose tree is main's.
  - Start label 7.37:1.
  - 32 cards and 32 portraits.
  - E17 on stage and speaking, with the JPEG-normal-map Momo and Sheru.
  - 0 console errors, 0 page errors, 0 bad responses and 0 failed requests.
  - 49 requests, all same-origin. Nothing stored.
  - Hosting rules: 0 problems.

### `dpl_2WbTkXTiPBrR6vS867ZnFXB3Xwzw`: replaced

- **Commit:** `a71c82708`.
- **Deployed:** 2026-10-29 22:45 UTC.
- **Change:** the model preloader lets a slow download run for 15 minutes instead of 2 (`07` B21). Runs `wonder-exp-a/b/c-20261029T222803Z` showed what the 2-minute cap had done: on software WebGL2 it aborted a model the page had not read yet, which failed `check-deploy --browser`.
- **Gates on the deploy host:** content lint OK. `check-dist` OK: 1002 files, 26 text files, 0 source maps, 1 welcome literal, 0 host variables, 0 class static blocks, noindex kept.
- **Live check:** run `wonder-live-20261029T224622Z` passed, at this commit with a clean tree:
  - Start label 7.37:1.
  - 32 cards and 32 portraits.
  - E17 on stage and speaking.
  - 0 console errors, 0 page errors, 0 bad responses and 0 failed requests.
  - 49 requests, all same-origin. Nothing stored.
  - Hosting rules: 0 problems.

### `dpl_H5yArKAQaUmqpxsx6XE6KoU8SUiq`: replaced

- **Commit:** `216a19967`.
- **Deployed:** 2026-10-29 22:36 UTC.
- **Changes:** the follow-ups from a cloud-browser review of the welcome at 12 sizes:
  - each portrait centred on its character, with GoGo's view moved down;
  - "Wonder World" kept on one line;
  - soft backings for the question and the hint;
  - the note card no wider than the controls;
  - opaque clouds kept clear of the edges, the portraits and the controls;
  - larger portraits in phone landscape.
- **Gates on the deploy host:** content lint OK, `check-dist` OK (as above).
- **Live check:** run `wonder-live-20261029T223644Z` passed, at this commit with a clean tree:
  - Start label 7.37:1.
  - 32 cards and 32 portraits.
  - E17 on stage and speaking.
  - 0 console errors, 0 page errors, 0 bad responses and 0 failed requests.
  - 49 requests, all same-origin. Nothing stored.
  - Hosting rules: 0 problems.

### `dpl_Cj4Rj6Q4ph8Zy8TLBipdnq8G1C7Z`: replaced

- **Commit:** `633f58a73`.
- **Deployed:** 2026-10-29 21:58 UTC.
- **Changes** (`07` B36-B39):
  - Songs play as loud as the voice lines.
  - The main cast's normal maps are stored as JPEG.
  - The "too old" notice also covers iPadOS 15.0-15.3.
  - The welcome's layout is reworked after a design review: two columns on short landscape screens, the rainbow sized by the window's height, a clean gradient, and clouds kept to the corners.
- **Gates on the deploy host:** content lint OK. `check-dist` OK: 1002 files, 26 text files, 0 source maps, 1 welcome literal, 0 host variables, 0 class static blocks, noindex kept.
- **Served files:**
  - The main script has 0 class static blocks and the song level, and names the new model files only. The page has the browser check.
  - Momo's GLB downloads as 939,394 bytes (brotli), down from 1,865,289.
- **Live check:** run `wonder-live-20261029T215919Z` passed, at this commit with a clean tree:
  - Start label `rgb(255, 255, 255)` on `rgb(91, 70, 163)`, 7.37:1.
  - 32 cards, with 32 portraits loaded.
  - E17 on stage and speaking, with the new Momo and Sheru models (and the next story's Peeko and Lulu prefetched).
  - 0 console errors, 0 page errors, 0 bad responses and 0 failed requests.
  - 49 requests, all same-origin. Nothing stored.
  - Hosting rules: 0 problems.

### `dpl_8XbRzzj7pe1L3pGhcQT5kdKG2xoY`: replaced

- **Commit:** `deabb582a`.
- **Deployed:** 2026-10-29 21:21 UTC.
- **Change:** the app loads on older iPads. The build had kept class static blocks, which Safari parses only from 16.4, so iPadOS 15 and 16.0-16.3 stopped before drawing anything. The build now targets Safari 15, and a browser without WebGL 2 gets a notice instead of the splash.
- **Gates on the deploy host:** content lint OK. `check-dist` OK, with 1 welcome literal, 0 host variables and 0 class static blocks.
- **Served bundle:** 0 class static blocks in the main script (8 before) and in every lazy chunk; the WebGL 2 check is in the page.

### `dpl_6cQbqKKboREo8pZMyCysrr4B47Wv`: replaced

- **Commit:** `bbf9b2e3c`.
- **Deployed:** 2026-10-29 21:10 UTC.
- **Change:** the stage boot waits for the first drawn frame, so the start screen is never blank.
- **Gates on the deploy host:** content lint OK. `check-dist` OK: 1002 files, 26 text files, 0 source maps, 0 name hits besides the 1 welcome literal, 0 host variables, noindex kept.
- **Live check:** run `wonder-live-20261029T211056Z` passed:
  - Start label `rgb(255, 255, 255)` on `rgb(91, 70, 163)`, 7.37:1.
  - 32 cards, with 32 portraits loaded.
  - E17 on stage and speaking.
  - 0 console errors, 0 page errors, 0 bad responses and 0 failed requests.
  - 49 requests, all same-origin. Nothing stored.
  - Hosting rules: 0 problems.

### `dpl_H1ZjupPKS9LpqDrNCdeAak3gbQsb`: replaced

- **Commit:** `40cc00692`.
- **Deployed:** 2026-10-29 21:00 UTC.
- **Change:** the dramatic welcome, which greets the child by name (`07` O8).
- **Gates on the deploy host:** `check-dist` OK, with 1 welcome literal and 0 host variables.
- **Served bundle:** the name appears once, as the one string literal; `VITE_VERCEL` appears 0 times.

### `dpl_GJbSPpKFmZ9Gcmw6aGcCZe5V4Gbn`: clean rollback target

- **Commit:** `e992aa822`.
- **Deployed:** 2026-10-29 20:41 UTC.
- **Changes:** white labels on the purple buttons, the static splash, and the build-variable guard.
- **Gates on the deploy host:** `check-dist` OK, with 0 name hits and 0 host variables.
- **Live check:** run `wonder-live-20261029T204204Z` passed:
  - Start label `rgb(255, 255, 255)` on `rgb(91, 70, 163)`, 7.37:1.
  - 32 cards, with 32 portraits loaded.
  - E17 on stage.
  - 0 console errors, 0 page errors, 0 bad responses and 0 failed requests.
  - 49 requests, all same-origin. Nothing stored.
  - Hosting rules: 0 problems.
- **Fan-out at this commit (`20261029T204204Z`):** all six runs passed: `first-frame-build` (4 tests, including the production build and `check-deploy`), `touch-and-layout` (3), `audio-and-pausing`, `parent-panel`, `low-motion` and `live`.

### Removed deployments

**`dpl_3A8sie6ukq2V2pyFLW5BXP5ZurYT`** (`632416b05`, 20:01 UTC), the first deploy. Two problems found by independent verification:
1. The engine reads `import.meta.env` as one object, so its bundle had the deploy host's `VITE_VERCEL_*` values inlined. These included the per-deployment URL, the project and deployment IDs, and the production address.
2. Its purple buttons had dark labels, at about 2:1.

The same verification found that its 1,002 served files matched the repo by sha256: 54 of 54 GLB, 907 of 907 MP3, 6 of 6 WebP, 2 of 2 HDR, and the fonts. All of them had the hosting headers.

Run `wonder-live-20261029T201217Z` passed on it: 32 cards, E17 on stage, 0 errors, and every request same-origin. It was removed once a clean deployment existed, so it can never be a rollback target.

**Three failed attempts** served nothing and were removed:
- `0b5207094`: the upload rules ended in slashes, so only 12 files were uploaded and the install failed (`07` B35).
- `b03be4604` and `85e4a80b1`: `check-dist` stopped both builds. The deploy host's `VITE_VERCEL_PROJECT_PRODUCTION_URL` had been inlined, and it was the custom domain, which carries the name. The second run printed the masked context that traced it, and `e992aa822` fixed the cause.

## Hosting checks on the live addresses (curl, 2026-10-29)

| Path | Status | Content-Type | Cache-Control | X-Robots-Tag |
| --- | --- | --- | --- | --- |
| `/` and `/index.html` | 200 | `text/html; charset=utf-8` | `no-cache` | `noindex, nofollow` |
| `/fonts/local.css` | 200 | `text/css; charset=utf-8` | `public, max-age=86400` | `noindex, nofollow` |
| `/hdri/autumn_field_puresky_1k.hdr`, `/hdri/studio_small_08_1k.hdr` | 200 | `application/octet-stream` | `public, max-age=86400` | `noindex, nofollow` |
| a missing path (`/does-not-exist.js`, `/robots.txt`) | 404 | `text/plain; charset=utf-8` | `public, max-age=0, must-revalidate` | `noindex, nofollow` |

- **Other headers on every response:** `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and HSTS.
- **Custom domain:** it answers like the project domain. It has a Let's Encrypt certificate and is a DNS-only CNAME to Vercel.
- **Project settings:** Web Analytics and Speed Insights are off (Vercel API), and the team has no log drain. Speed Insights' script route answers 200 on this project as it does on the public site, so the route alone shows nothing.

## Checking again

```bash
apps/<app>/tools/deploy-preview.sh --prod <commit>      # deploy; the deploy host runs the build gates above
apps/<app>/tools/remote-run.sh live                     # the live check on the remote runner
```

To roll back, follow `apps/<app>/DEPLOYMENT.md` §5, then add a row here: the old and new deployment, and the reason.
