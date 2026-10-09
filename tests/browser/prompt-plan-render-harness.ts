// PRD-13 §17.2 — prompt-plan-render harness.
// Compiles one plan (?recipe=<sceneType>&plan=<0|1|2>) through the v2 pipeline,
// mounts the compiled scene, and exposes the v2 report (visualSystems census,
// appliedEffects, rejected, look) plus app diagnostics on window.
import { compilePromptPlanV2, createAuraApp, defineAuraAssets, definePromptPlan, type AuraPromptSceneType } from "@aura3d/engine";

const params = new URLSearchParams(location.search);
const recipe = params.get("recipe") as AuraPromptSceneType | null;
const planIndex = Number(params.get("plan") ?? "0");

const assets = defineAuraAssets({
  helmet: {
    type: "model",
    url: "/fixtures/asset-corpus/damaged-helmet.glb",
    hash: "4028ccbce11eb924"
  }
});

// Three plan variants per recipe — the §17.2/S3 grid is 4 recipes × 3 plans.
// Variants exercise look resolution via plan.look, environment, and lighting paths.
const PLANS: Record<AuraPromptSceneType, readonly unknown[]> = {
  "product-viewer": [
    definePromptPlan({
      sceneType: "product-viewer",
      subject: { asset: assets.helmet, label: "damaged helmet product hero" },
      style: "clean studio product shot",
      camera: { preset: "product-orbit" },
      lighting: { preset: "studio-softbox" },
      interaction: "orbit",
      acceptanceCriteria: ["the helmet is the visible hero subject"]
    }),
    definePromptPlan({
      sceneType: "product-viewer",
      subject: { asset: assets.helmet, label: "helmet on turntable" },
      style: "editorial macro",
      environment: "dark studio sweep",
      lighting: { preset: "neon-practicals" },
      effects: ["bloom"],
      interaction: "orbit",
      acceptanceCriteria: ["rim light separates the helmet from the background"]
    }),
    definePromptPlan({
      sceneType: "product-viewer",
      subject: { asset: assets.helmet, label: "helmet detail pass" },
      look: "product-studio",
      effects: ["wet-reflection"],
      interaction: "orbit",
      acceptanceCriteria: ["contact shadow grounds the helmet"]
    })
  ],
  "cinematic-scene": [
    definePromptPlan({
      sceneType: "cinematic-scene",
      subject: { asset: assets.helmet, label: "abandoned helmet in the rain" },
      style: "rainy noir product reveal",
      environment: "wet neon alley with practical lights and fog",
      camera: { preset: "cinematic-dolly" },
      lighting: { preset: "neon-practicals" },
      effects: ["rain", "fog", "bloom"],
      interaction: "pointer",
      acceptanceCriteria: ["rain is visible as a scene volume"]
    }),
    definePromptPlan({
      sceneType: "cinematic-scene",
      subject: { asset: assets.helmet, label: "helmet at golden hour" },
      look: "golden-hour",
      camera: { preset: "product-orbit" },
      effects: ["bloom"],
      interaction: "pointer",
      acceptanceCriteria: ["warm key on the visor"]
    }),
    definePromptPlan({
      sceneType: "cinematic-scene",
      subject: { asset: assets.helmet, label: "helmet in snow" },
      look: "alpine-snow",
      effects: ["rain", "fog"],
      interaction: "pointer",
      acceptanceCriteria: ["snow falls through the frame"]
    })
  ],
  "mini-game": [
    definePromptPlan({
      sceneType: "mini-game",
      subject: { asset: assets.helmet, label: "playable helmet hero" },
      style: "bright arcade platformer",
      camera: { preset: "game-board" },
      lighting: { preset: "game-readable" },
      interaction: "keyboard",
      acceptanceCriteria: ["the hero reads as playable"]
    }),
    definePromptPlan({
      sceneType: "mini-game",
      subject: { asset: assets.helmet, label: "helmet runner" },
      look: "outdoor-day",
      interaction: "keyboard",
      effects: ["bloom"],
      acceptanceCriteria: ["daytime readability"]
    }),
    definePromptPlan({
      sceneType: "mini-game",
      subject: { asset: assets.helmet, label: "helmet in arcade" },
      look: "neon-arcade",
      interaction: "keyboard",
      acceptanceCriteria: ["neon accent palette"]
    })
  ],
  "material-studio": [
    definePromptPlan({
      sceneType: "material-studio",
      subject: { asset: assets.helmet, label: "helmet material inspection" },
      style: "neutral inspection bench",
      lighting: { preset: "studio-softbox" },
      interaction: "orbit",
      acceptanceCriteria: ["PBR channels readable"]
    }),
    definePromptPlan({
      sceneType: "material-studio",
      subject: { asset: assets.helmet, label: "helmet under hard key" },
      look: "interior-industrial",
      lighting: { preset: "studio-softbox" },
      effects: ["wet-reflection"],
      interaction: "orbit",
      acceptanceCriteria: ["specular response visible"]
    }),
    definePromptPlan({
      sceneType: "material-studio",
      subject: { asset: assets.helmet, label: "helmet roughness pass" },
      look: "interior-neutral",
      interaction: "orbit",
      acceptanceCriteria: ["roughness variation visible"]
    })
  ]
};

declare global {
  interface Window {
    __AURA3D_PROMPT_PLAN__?: {
      recipe: string | null;
      plan: number;
      status: "built" | "error";
      error?: string;
      report?: unknown;
      diagnostics?: unknown;
    };
  }
}

try {
  if (!recipe || !(recipe in PLANS)) throw new Error(`unknown recipe "${recipe}"`);
  const plan = PLANS[recipe][planIndex] as Parameters<typeof compilePromptPlanV2>[0] | undefined;
  if (!plan) throw new Error(`no plan index ${planIndex} for recipe "${recipe}"`);
  const canvas = document.getElementById("plan-canvas") as HTMLCanvasElement;
  const compiled = compilePromptPlanV2(plan);
  const app = createAuraApp(canvas, { scene: compiled.scene, pixelRatio: 1, resize: false });
  for (let i = 0; i < 5; i++) app.step(1 / 60);
  app.pause();
  window.__AURA3D_PROMPT_PLAN__ = {
    recipe,
    plan: planIndex,
    status: "built",
    report: compiled.report,
    diagnostics: app.diagnostics()
  };
} catch (error) {
  window.__AURA3D_PROMPT_PLAN__ = {
    recipe,
    plan: planIndex,
    status: "error",
    error: error instanceof Error ? error.message : String(error)
  };
}
