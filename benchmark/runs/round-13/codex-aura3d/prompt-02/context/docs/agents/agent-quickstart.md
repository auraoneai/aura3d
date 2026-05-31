# Agent Quickstart

1. Scaffold with `npx create-aura3d@latest my-scene --template product-viewer`.
2. Add user assets with `npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot`.
3. Import `assets` from `src/aura-assets.ts`.
4. Compose a scene with `scene()`, `model()`, `camera`, `lights`, `material`,
   `effects`, `timeline`, and `interactions`.
5. Run `npm run build`, `npm run test`, and `npx @aura3d/cli@latest check-deploy`.
