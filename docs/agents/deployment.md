# Deployment

Version: 4.6.1

Build with Vite, check, deploy a clean export, then verify the live URL.

```bash
npm run build
npx @aura3d/cli@latest check-deploy --dist dist
```

Add `--release` for the provenance and license gates. Use a CDN or base path for assets with `--public-path`:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot --public-path /cdn/aura-assets/
```

## What `check-deploy` gates

- every hashed asset in `aura.assets.json` exists in `dist` or its public path;
- derived files the manifest points at (mobile, collision) exist, and are copied into `dist`;
- with a schema 1.1 manifest, no file under the asset base path is unreferenced;
- the asset validation passes (`--release` adds provenance, license and placeholder gates);
- warnings for URLs that are not fingerprinted;
- with `--browser`, every route (`/` by default, repeat `--route /path`) loads in headless Chromium with no HTTP error, failed request, uncaught error or console error (needs `playwright` in the project).

It checks assets and, with `--browser`, that the page loads clean; it does not check pixels. It does not prove the page draws; pair it with the browser gate in [verification.md](verification.md). It works for static hosting, Vite preview, Next.js public assets, Cloudflare Pages, Netlify, Vercel, S3, R2 and CDN paths.

## Shipping a game route

- **Deploy from a clean export of a committed revision** (`git worktree add --detach <dir> <tag-or-sha>` or `git archive`), not the working tree. Half-finished edits otherwise reach production, and a tree full of generated evidence can exceed an upload limit (a 16,143-file upload failed a 15,000-file cap; the clean export was 13,772).
- **Model assets** must be same-origin URLs with a valid `sha256` (`defineModelAssets`). The production bridge refuses http(s) and unhashed models, and the scene draws nothing. After deploying, request every asset URL and expect 200.
- **Install `installSafetyNet`** from `@aura3d/debug`. With it, `?diag=1` shows the GPU, limits, draw calls, shader failures and recent errors; `?post=0`, `?shadow=0`, `?env=0`, `?sky=0` and `?quality=low` isolate a failing feature on a player's machine; and a canvas that stays black reloads itself one rung down (`SAFETY_BLACK_FRAME`, then `SAFETY_COMPAT_MODE`). Do not ship a blanket `qualityRebuild` pin that disables post-processing for everyone.
- **Browser gate against the deployed URL** runs on a remote runner with the production build (`tools/remote-acr/run.sh` in the Aura3D repo; see [verification.md](verification.md)). Label software-GL results "software GL"; ask for a real-device `?diag=1` screenshot before claiming GPUs.
- **Rollback** is redeploying the previous tag from its own clean export.

## CI and runners

This project does not use GitHub Actions or standing runners. Use the serverless remote runner (`tools/remote-acr/run.sh`) or your own CI. Provider and credential rules for AuraOne machines are in the machine policy, not in project docs.
