# Stock `vite build` / `vite dev` of the packed @aura3d tarballs (commit 04b7726ef)

Run: serverless ACR build (`picassostagingacr`, no agent pool, no local Docker), Node 24, pnpm 11.1.3. The workspace was built (`pnpm build`), packed with `node tools/release/publish-all.mjs --pack-only`, and `tools/release/consumer-build-smoke.mjs` installed those tarballs into fresh temp projects (npm, `--ignore-scripts`) and ran a stock `vite build` with the template's own config, an import-graph check for reachable `node:*` imports, and a `vite dev` transform of the entry and of `@aura3d/engine`.

Result: every project passes on both Vite versions, with no extra plugin and no `@aura3d/assets/vite`.

| Project | Vite | Result | JS+CSS raw | gzip | Largest chunk |
|---|---|---|---|---|---|
| hello-world (config-less `createAuraApp` cube) | 7.3.2 / 7.3.7 | PASS | 3,258 kB | 963 kB | 921 kB |
| mini-game | 7.3.2 / 7.3.7 | PASS | 4,064 kB | 1,166 kB | 1,171 kB |
| racing-starter | 7.3.2 / 7.3.7 | PASS | 4,061 kB | 1,165 kB | 1,167 kB |
| falling-blocks-starter | 7.3.2 / 7.3.7 | PASS | 4,064 kB | 1,165 kB | 1,171 kB |
| product-viewer | 7.3.2 / 7.3.7 | PASS | 3,815 kB | 1,082 kB | 922 kB |

Notes
- Raw lines are in `results.txt`. The other templates under `packages/create-aura3d/templates` (15 more) were not run; the default smoke list covers the four above plus hello-world.
- Software only: this checks that the build and dev transform work, not rendering. Bundle size is unchanged by the fix (the cube app is still about 3.3 MB raw / 963 kB gzip; reducing it is plan WP-3).
- The `mini-game` template has no `package-lock.json` in the repo, so the lockfile mismatch reported by the benchmark was not reproducible here (the smoke installs fresh).
- Reproduce: `--vite 7.3.2` pins the Vite version in the smoke script (added with this run).
- Packing in the container needed the repo's `dist/`, `node_modules/` and `tests/reports/` excluded from git (`.git/info/exclude`); otherwise `source-identity.mjs` overflows `execFileSync`'s default 1 MB buffer on `git ls-files`. A normal checkout already ignores them.
