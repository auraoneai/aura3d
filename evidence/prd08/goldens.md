# C-14 legacy golden recordings

`tests/qr/prd08/fixtures/legacy-frames.json` pins `resolveCameraFrame`
(legacy, flag-off path) eye+target for every (case, time) tuple shared by
S4. Re-recording requires a written reason and a diff note here.

| Date | Base commit | Reason | Notes |
|---|---|---|---|
| 2026-10-09 | `7da675d5f` (branch tip; content recorded from `origin/main` `afb475c2f` code paths) | Initial recording — the fixture did not exist (C-14 spec row). `resolveCameraFrame` is unchanged legacy code on `main`; recorded via `QR_RECORD_LEGACY=1 vitest run tests/qr/prd08/unit/camera-controller.test.ts`. | 90 tuples over 40 cases |
