import { Scene, type SceneNode } from "@aura3d/scene";
import { BehaviorHost, BehaviorSystem, type ScriptContext } from "@aura3d/scripting";

interface ScriptingBrowserResult {
  readonly status: "ready" | "error";
  readonly position?: readonly number[];
  readonly nonBlankPixels?: number;
  readonly errorCount?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_SCRIPTING_BROWSER_TEST__?: ScriptingBrowserResult;
  }
}

function publish(result: ScriptingBrowserResult): void {
  window.__AURA3D_SCRIPTING_BROWSER_TEST__ = result;
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>("#script-viewport");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) throw new Error("Scripting viewport canvas is unavailable.");

  const scene = new Scene();
  const node = scene.createNode("scripted-node");
  scene.root.addChild(node);

  const system = new BehaviorSystem();
  const host = new BehaviorHost({ target: node });
  host.attach({
    onStart: (scriptContext: ScriptContext) => {
      (scriptContext.target as SceneNode).transform.setPosition(1, 0, 0);
    },
    onUpdate: (scriptContext: ScriptContext) => {
      const target = scriptContext.target as SceneNode;
      target.transform.setPosition(
        target.transform.position[0] + 2,
        target.transform.position[1] + 3,
        target.transform.position[2] + 4
      );
    }
  });
  system.registerHost(host);
  await system.update({ deltaSeconds: 1 / 60 });
  scene.updateWorldTransforms();

  context.fillStyle = "#020617";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#38bdf8";
  context.fillRect(40 + node.transform.position[0] * 4, 40, 18, 18);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonBlankPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] > 20 || pixels[index + 1] > 20 || pixels[index + 2] > 20) {
      nonBlankPixels += 1;
    }
  }

  publish({
    status: "ready",
    position: [...node.transform.position],
    nonBlankPixels,
    errorCount: system.errors.length
  });
} catch (error) {
  publish({
    status: "error",
    error: error instanceof Error ? error.message : String(error)
  });
}
