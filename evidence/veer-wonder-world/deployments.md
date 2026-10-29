# Wonder World preview deployments

The unlisted preview of `apps/<app>/DEPLOYMENT.md` §3 is the Vercel project `aura3d-wonder-world`. It is served at the project's own production domain and at the owner's custom domain (`07` O6 and O7).
- **No addresses here.** The repository is public, so this record names neither address. The Vercel project lists them, and a `--prod` deploy writes the project address to the gitignored `apps/<app>/.preview-url`.
- **Not indexed.** Every response carries `X-Robots-Tag: noindex, nofollow`.
- **Not a public release.** See `07` O5.
- **Per-deployment URLs.** Vercel gives each deployment its own URL, which carries the team's slug. Those URLs stay behind the team login (302), and this record leaves them out.
- **Screenshots.** Captures of the start screen show the welcome name (`07` O8), so none is kept here.

`<app>` stands for the app's folder name, as in every record in this folder.

## Deployments (newest first)

### `dpl_8XbRzzj7pe1L3pGhcQT5kdKG2xoY`: current

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
