# Wonder World evidence (prototype)

Wonder World is the toddler story app in `apps/<app>/`, with its PRDs in `docs/prds/<app>/`. `<app>` stands for the app's folder name, which every record here redacts. Its label is **prototype**. It carries `noindex` and is not in the site catalog, sitemap or game inventory.

**What these runs are.** Every browser result here comes from headless Chromium on the remote runner (`tools/remote-acr/run.sh`, ACR Tasks) with software WebGL2:

> ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)

That is **not real-GPU or physical-device evidence**. Frame times and load times from it are not performance numbers. The physical-device runs are the open item in the build record, `docs/prds/<app>/07-autonomous-decisions-and-build-record.md` §4.3.

**Privacy.** No real child's image, audio or name appears in any file here. The specs pass everything they print through `redact()`, and `apps/<app>/tools/extract-remote-evidence.mjs` redacts again: the app folder becomes `<app>` and the dev-server origin is dropped. The screenshots show only the app's own 3D scenes and UI.

| | |
| --- | --- |
| Commit under test | The app at `7e1986801`, with a clean tree in every run (each record's `commit` field). Sixteen runs ran at `7e1986801`; `first-frame-build` ran again at `2ae4125d1` and the three character-sheet runs at `498c32f63`, after fixes to `tests/browser/wonder-world-build.spec.ts`, `wonder-world-capture-lib.ts` and `wonder-world-timeline.ts`. Those spec files are the only difference between the three commits (`git diff --stat 7e1986801 498c32f63`), so every run tested the same app |
| Engine | `@aura3d/engine` 4.5.0: the remote runs serve the app from the monorepo's workspace packages; the consumer smoke installs the published 4.5.0 packages |
| Runner | `apps/<app>/tools/remote-run.sh`, one ACR run per line of the run list in `tests/browser/wonder-world-lib.ts` (20 runs). Fan-outs `20261029T172337Z`, `20261029T174544Z` and `20261029T182623Z` each shared one image (`wonder-suite-<stamp>`), deleted after their runs |
| Viewports | each record's `viewport`: 1024x768 (first frame, stills, look), 390x844 (look, touch), 320x568 and 800x600 (character sheets), 768x1024 and 1024x768 (touch), 800x600 (grown-up panel), 640x480 (playback, no-speech, low motion, audio) |

| Folder | What |
| --- | --- |
| [`p0/`](p0/README.md) | Foundation: build, content lint, privacy scan, `check-deploy --browser`, first frame with models and with stand-ins, the `?diag=1` panel, consumer smoke on `create-aura3d@4.5.0` |
| [`p1/`](p1/README.md) | P1 pilot (E01, E02, E05, E06, E09, E17, G01-G03) and every app-wide run: playback, no-speech, touch and layout, audio and pausing, low motion, grown-up panel, character sheets, look-dev, stills, issue log |
| [`p2/`](p2/README.md) | The other 14 episodes and 9 activities: the same runs, story by story |

Screenshots live under `<phase>/screens/2026-10-29/<run>/` next to their JSON records, the only image folder the repo tracks (`.gitignore`: `!evidence/**/screens/**/*.jpg`).
