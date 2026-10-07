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
