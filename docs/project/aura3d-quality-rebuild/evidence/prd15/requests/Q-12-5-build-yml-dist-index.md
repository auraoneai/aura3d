# Q-12-5 → to:prd12 (qr-request, CONTRACTS §6.5)

**File:** `.github/workflows/build.yml`
**Owner:** lane 12 (`.github/workflows/` default)
**Contract served:** PRD-15 T1.7 / §2.3 — the root `dist/index.{js,js.map,d.ts,d.ts.map}` aggregate is deleted (unreachable `export *` aggregate, unpublished).

## Requested change

Delete these two lines from the "Verify build outputs" step (~lines 50–51):

```diff
       - name: Verify build outputs
         run: |
-          test -f dist/index.js || exit 1
-          test -f dist/index.d.ts || exit 1
           test -f packages/aura3d-cli/dist/index.js || exit 1
           test -f packages/create-aura3d/dist/cli.js || exit 1
           echo "All build outputs verified!"
```

`pnpm build:raw` no longer emits `dist/index.js`/`dist/index.d.ts` — the writer at
`tools/finalize-dist/index.ts:62-63` was removed and the files were dropped from
`package.json#files` per T1.7. `dist/engine/index.js` remains and is asserted by the
15-owned `.github/workflows/test.yml` instead.

## Status

OPEN — this session cannot create GitHub issues (no `gh` auth, browser not signed
in); the request is recorded here and in the lane-15 checkpoint report until it can
be filed as an issue labelled `qr-request` + `to:prd12`.

Until it lands, PR #31's "Build and Test on Node 22" check fails on the same two
lines. The failure exists only on the PR branch and resolves as soon as either this
request or the PR's merge lands the workflow edit.
