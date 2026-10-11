/**
 * PRD-13 §17.2 prompt-plan-render harness (4 recipes × 3 plans, S3 grid).
 * Query: recipe=<sceneType>&plan=<0|1|2>&a3d-qr=looks
 *
 * Compiles one plan through compilePromptPlanV2, mounts the compiled scene,
 * settles the mount + HDRI chain, renders one frame, and publishes the v2
 * report, an independent node census of the compiled snapshot (so the spec
 * can check `visualSystems ⊆ census` without trusting the compiler's own
 * census code), diagnostics and the frame PNG for the S3 judged half.
 */
import {
  compilePromptPlanV2,
  createAuraApp,
  defineAuraAssets,
  definePromptPlan,
  groups,
  type AuraSceneNode
} from "@aura3d/engine";
import { measureFrame, publish, publishError, settle } from "./frame";

type AuraPromptSceneType = Parameters<typeof definePromptPlan>[0]["sceneType"];

const params = new URLSearchParams(location.search);
const recipe = params.get("recipe") as AuraPromptSceneType | null;
const planIndex = Number(params.get("plan") ?? "0");

const assets = defineAuraAssets({
  helmet: { type: "model", format: "glb", url:"/fixtures/asset-corpus/damaged-helmet.glb", hash: "4028ccbce11eb924" }
});

// Three variants per recipe exercise look resolution via plan.look,
// environment keywords, and the lighting preset.
const PLANS: Partial<Record<AuraPromptSceneType, readonly unknown[]>> = {
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

interface CensusNode {
  readonly kind: string;
  readonly detail?: string;
  readonly shadow: boolean;
}

function groupNames(nodes: readonly AuraSceneNode[]): string[] {
  const names: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "group") continue;
    if (typeof node.name === "string") names.push(node.name);
    names.push(...groupNames(node.children));
  }
  return names;
}

async function run(): Promise<void> {
  const variants = recipe ? PLANS[recipe] : undefined;
  if (!recipe || !variants) throw new Error(`unknown recipe "${recipe}"`);
  const plan = variants[planIndex] as Parameters<typeof compilePromptPlanV2>[0] | undefined;
  if (!plan) throw new Error(`no plan index ${planIndex} for recipe "${recipe}"`);
  const canvas = document.getElementById("plan-canvas") as HTMLCanvasElement;
  const compiled = compilePromptPlanV2(plan);
  const snapshot = compiled.scene.toJSON();
  const census: CensusNode[] = groups.flatten(snapshot.nodes).map((node) => {
    const record = node as unknown as Record<string, unknown>;
    const detail = (record.environment ?? record.light ?? record.effect) as string | undefined;
    return {
      kind: node.kind,
      ...(detail !== undefined ? { detail } : {}),
      shadow: record.shadow === true || (typeof record.shadow === "object" && record.shadow !== null)
    };
  });
  const app = createAuraApp(canvas, { scene: compiled.scene, pixelRatio: 1, resize: false, autoStart: false });
  const hdriStatus = await settle(app);
  const frame = measureFrame(app, canvas);
  const diagnostics = app.diagnostics() as unknown as Record<string, unknown>;
  publish({
    recipe,
    plan: planIndex,
    report: compiled.report,
    census,
    groupNames: groupNames(snapshot.nodes),
    hdriStatus,
    frame,
    diagnostics: { errors: diagnostics.errors ?? [], drawCalls: diagnostics.drawCalls ?? null, look: diagnostics.look ?? null }
  });
}

run().catch(publishError);
