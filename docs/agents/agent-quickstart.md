# Agent Quickstart

Aura3D Agent Quickstart: prompt to browser 3D with TypeScript, scene kits, typed GLB/glTF assets, Vite templates, diagnostics, screenshots, and static deploy checks.

Use this quickstart to build AI-generated browser 3D scenes, GLB product viewers, and Vite 3D apps with Codex, Claude Code, Cursor, Copilot-style agents, or any coding agent that writes TypeScript.

Aura3D is a scaffolded path from a 3D product prompt to an app a team can keep.

The workflow is intentionally simple:

1. Describe the 3D experience.
2. Add the real GLB/glTF asset.
3. Generate typed asset refs.
4. Compose the scene with the public Aura3D API.
5. Capture evidence and deploy.

## Golden path

1. Scaffold with `npx create-aura3d@latest my-scene --template product-viewer`.
2. Add user assets with `npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot`.
3. Import `assets` from `src/aura-assets.ts`.
4. Compose a scene with `scene()`, `model()`, `camera`, `lights`, `material`,
   `effects`, `timeline`, and `interactions`.
5. Run `npm run build`, `npm run test`, and `npx @aura3d/cli@latest check-deploy`.

## Prompt-to-code pattern

Use this when the user gives a product prompt rather than a hand-written scene
plan.

```ts
import {
  createAuraApp,
  definePromptPlan,
  promptPlanToScene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = definePromptPlan({
  sceneType: "product-viewer",
  subject: { asset: assets.robot },
  camera: { preset: "product-orbit" },
  lighting: { preset: "studio-softbox" },
  interaction: "orbit",
  acceptanceCriteria: ["asset is centered", "lighting and shadows are visible"]
} as const);

createAuraApp("#app", {
  scene: promptPlanToScene(plan),
  diagnostics: { overlay: true }
});
```

Full workflow details live in `docs/agents/prompt-to-3d-workflow.md`.

## Product rule

Do not make the scene feel generated. Use authored assets, typed refs, scene
kits, readable controls, and screenshot evidence. Aura3D is there to help an
agent ship browser 3D that feels intentional, not improvised.
