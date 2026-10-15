# Aura3D 4.0.0 Quickstart

Boot a verified, type-safe 3D web application with **Aura3D 4.0.0** (`@aura3d/engine@4.0.0` and `@aura3d/cli@4.0.0`) in under two minutes—without wiring raw Three.js loaders, resize loops, or post-processing passes by hand.

---

## 1. Scaffold a New Project

Pick one of the starter templates (`product-viewer`, `cinematic-scene`, `mini-game`, `fighting-game`, `animation-studio`, `prompt-animation-channel`, or any of the 21 templates):

```bash
npx create-aura3d@4.0.0 my-aura-app --template product-viewer
cd my-aura-app
npm install
npm run dev
```

---

## 2. Admit a Typed 3D Asset

Instead of passing untyped string URLs to `GLTFLoader` and hoping Draco/KTX2 workers resolve at runtime, register your asset through `@aura3d/cli@4.0.0`:

```bash
npx @aura3d/cli@4.0.0 assets add damaged-helmet --typegen
```

This updates `aura.assets.json` (with SHA-256 integrity hashes, SPDX license metadata, and bounding-box/animation inspection) and generates `src/aura-assets.ts` so `assets.damagedHelmet` autocompletes in TypeScript.

---

## 3. Author Your Scene in 18 Lines (`src/main.ts`)

Replace ~120 lines of raw Three.js boilerplate with `createAuraApp`:

```ts
import { createAuraApp, environment, light, model, orbitCamera, post } from '@aura3d/engine';
import { assets } from './aura-assets';

const app = await createAuraApp({
  target: '#app',
  scene: [
    environment.studio({ intensity: 1.15, sky: 'procedural-dusk' }),
    orbitCamera({ position: [2.8, 1.9, 3.6], target: [0, 0.85, 0], damping: 0.08 }),
    light.directional({ position: [4, 7, 5], intensity: 3.2, color: '#fff4e6', castShadow: true }),
    model(assets.damagedHelmet, {
      position: [0, 0.85, 0],
      castShadow: true,
      receiveShadow: true,
      clip: 'Idle',
    }),
    post({ toneMapping: 'agx', exposure: 1.1, bloom: { intensity: 0.35, threshold: 0.85 }, ssao: true }),
  ],
});
```

What `createAuraApp` handles automatically:
- **Deterministic lifecycle**: `ResizeObserver`, `devicePixelRatio` clamping, high-performance WebGL2 / WebGPU context negotiation, and single-call `app.dispose()`.
- **Typed asset loading**: Parallel fetch, SHA-256 verification, automatic Draco/Meshopt/KTX2 decoding, and shadow/material binding.
- **Physical lighting & HDR post**: Procedural sky + studio IBL environment map, PCF soft shadow maps, AgX tone mapping, bloom, and SSAO.

---

## 4. Verify Before You Deploy

Run the pre-deploy gate to validate asset manifests, license compliance, bundle budgets, and headless browser rendering health:

```bash
npx @aura3d/cli@4.0.0 check-deploy
```

---

## Next Steps

- **[Aura3D 4.0.0 vs. Raw Three.js](./aura3d-vs-threejs.md)** — See the full 10-category architectural comparison and how to migrate existing Three.js code with `npx @aura3d/cli@4.0.0 migrate three`.
- **[Documentation Hub](./index.md)** — Explore animation studio workflows, physics, navmesh crowd steering, Gaussian splats, and portal worlds.
