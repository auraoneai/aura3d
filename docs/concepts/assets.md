# Assets

Version: `1.0.0`

Aura3D uses a bring-your-own-assets pipeline:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
```

The CLI validates, hashes, copies, extracts bounds/material/animation metadata,
generates a thumbnail, writes `aura.assets.json`, and writes typed imports in
`src/aura-assets.ts`.

Agents reference real generated ids such as `assets.robot`.

## Boundary

Asset ownership stays with the app. The `@aura3d/cli` package validates and
copies local files, writes the manifest, and generates typed asset references.
The runtime consumes those references; it does not invent asset URLs, fetch from
an Aura-hosted catalog, or silently replace missing production assets.

## Current Limits

Asset support is scoped to declared project assets and the metadata the CLI
can inspect from local files. Compression, CDN upload, DCC repair, license
management, and provider-driven asset search require separate tooling and
evidence before they can be described as supported.
