import {
  camera,
  createAuraApp,
  game,
  lights,
  material,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

interface MorphTargetEvidence {
  readonly imports: readonly string[];
  readonly renderer: {
    readonly mode: string;
    readonly runtimeBackend: string | undefined;
    readonly fallbackUsed: boolean;
    readonly backend: string;
    readonly drawCalls: number;
    readonly warnings: readonly string[];
  };
  readonly asset: {
    readonly typedRef: "assets.showcaseMorphExpression";
    readonly assetId: string | undefined;
    readonly targetNames: readonly string[];
    readonly morphRenderItemCount: number;
    readonly activeMorphTargets: Readonly<Record<string, number>>;
    readonly missingMorphTargets: readonly string[];
    readonly importedEvidence?: unknown;
  };
  readonly claims: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_MORPH_TARGETS_CONTRACT__?: MorphTargetEvidence;
    __AURA3D_MORPH_TARGETS_CAPTURE__?: (weights: Record<string, number>) => Promise<MorphTargetEvidence>;
    __AURA3D_MORPH_TARGETS_ERROR__?: string;
  }
}

void run().catch((error: unknown) => {
  window.__AURA3D_MORPH_TARGETS_ERROR__ = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

async function run(): Promise<void> {
  const app = createAuraApp(requiredElement("stage"), {
    autoStart: false,
    pixelRatio: 1,
    resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: scene()
      .background("#05070b")
      .camera(camera.perspective({ position: [0, 0.45, 4.1], target: [0, 0.35, 0], fov: 32 }))
      .add(
        model(assets.showcaseMorphExpression, { name: "Root API morph expression", scale: 1.15 })
          .position(0, 0, 0)
          .material(material.pbr({ color: "#f97316", roughness: 0.42, metallic: 0.04 }))
          .runtime(game.runtimeNode("morph-expression", { tags: ["typed-glb", "morph-target"] }))
      )
      .add(lights.studio())
  });

  const robot = app.nodes.require("morph-expression");
  const targetNames = assets.showcaseMorphExpression.metadata.morphTargets.targetNames;
  await waitForProductionRuntime(app);

  window.__AURA3D_MORPH_TARGETS_CAPTURE__ = async (weights: Record<string, number>) => {
    robot.setMorphTargets(weights);
    await stepApp(app);
    const diagnostics = app.diagnostics();
    const runtimeSnapshot = robot.snapshot();
    const importedEvidence = runtimeSnapshot.importedAssetEvidence;
    const evidence: MorphTargetEvidence = {
      imports: ["@aura3d/engine", "../../src/aura-assets"],
      renderer: {
        mode: diagnostics.renderer?.runtime.backend === "production-runtime" ? "production" : "safe-basic",
        runtimeBackend: diagnostics.renderer?.runtime.backend,
        fallbackUsed: diagnostics.renderer?.runtime.backend !== "production-runtime",
        backend: diagnostics.backend,
        drawCalls: diagnostics.drawCalls,
        warnings: diagnostics.renderer?.warnings ?? []
      },
      asset: {
        typedRef: "assets.showcaseMorphExpression",
        assetId: importedEvidence?.assetId,
        targetNames,
        morphRenderItemCount: importedEvidence?.morphRenderItemCount ?? 0,
        activeMorphTargets: importedEvidence?.activeMorphTargets ?? {},
        missingMorphTargets: importedEvidence?.missingMorphTargets ?? [],
        importedEvidence
      },
      claims: diagnostics.renderer?.runtime.backend === "production-runtime"
        ? ["root-createAuraApp-morph-targets", "typed-glb-production-bridge", "morph-target-pixel-change"]
        : []
    };
    window.__AURA3D_MORPH_TARGETS_CONTRACT__ = evidence;
    return evidence;
  };

  await window.__AURA3D_MORPH_TARGETS_CAPTURE__({ "target-0": 0 });
}

async function stepApp(app: ReturnType<typeof createAuraApp>): Promise<void> {
  app.step(1 / 60);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function waitForProductionRuntime(app: ReturnType<typeof createAuraApp>): Promise<void> {
  await waitFor(() => app.diagnostics().renderer?.runtime.backend === "production-runtime", 15_000);
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Aura3D production runtime.");
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}
