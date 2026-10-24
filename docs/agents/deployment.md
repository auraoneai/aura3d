# Deployment

Build normally with Vite:

```bash
npm run build
npx @aura3d/cli@latest check-deploy --dist dist
```

Use `--public-path` when assets are served from a CDN or base path:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot --public-path /cdn/aura-assets/
```

The deploy check fails before upload when hashed asset files are missing.
This works for static hosting, Vite preview, Next.js public assets, Cloudflare
Pages, Netlify, Vercel, S3, R2, and CDN-backed public paths.

## Shipping a game route (4.1)

- Deploy from a clean export of a committed revision (`git worktree` or `git
  archive`), not the working tree: half-finished edits otherwise reach production,
  and a tree with generated evidence can exceed an upload limit (a 16,143-file
  upload failed a 15,000-file cap; the clean export was 13,772).
- Model assets must be same-origin URLs with a valid `sha256` (`defineModelAssets`):
  the production bridge refuses http(s) and unhashed models and the scene draws
  nothing. After deploying, request every asset URL and expect 200.
- Install `installSafetyNet` from `@aura3d/debug`. With it, `?diag=1` shows the
  GPU, limits, draw calls, shader failures and recent errors, `?post=0`,
  `?shadow=0`, `?env=0`, `?sky=0` and `?quality=low` isolate a failing feature on a
  player's machine, and a canvas that stays black reloads itself one rung down
  (`SAFETY_BLACK_FRAME`, then `SAFETY_COMPAT_MODE`). Do not ship a blanket
  `qualityRebuild` pin that disables post-processing for everyone.
- Run the browser gate against the deployed URL in a remote runner with a
  production build; label software-GL results as software GL.
