/**
 * PRD-13 §17.2 looks-expansion harness. Query params:
 *   look=<id>               — one of looks.list()
 *   expansion=v0|v1         — forced expansion passed to looks.preset
 *   control=none|no-ibl|no-shadow
 *                           — broken controls for the pixel half: the same
 *                             look built from looks.nodes(id) with the
 *                             environment node removed (IBL off) or every
 *                             light's shadow turned off
 *   a3d-qr=<list>           — the spec passes `looks` so the C-31 `look`
 *                             section is populated
 *
 * Scene: `scene().add(looks.preset(id)).add(model(DamagedHelmet))` plus an
 * authored camera and a ground plane (the §17.2 shadow check needs a
 * receiver). Publishes window.__PRD13_READY__ or window.__PRD13_ERROR__.
 */
import {
  camera,
  createAuraApp,
  defineAuraAssets,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraLookId,
  type AuraSceneNode
} from "@aura3d/engine";
import { measureFrame, publish, publishError, settle } from "./frame";

const params = new URLSearchParams(location.search);
const lookId = params.get("look") as AuraLookId | null;
const expansion = params.get("expansion") === "v1" ? "v1" : "v0";
const control = params.get("control") ?? "none";

const assets = defineAuraAssets({
  helmet: {
    type: "model",
    format: "glb",
    url: "/fixtures/asset-corpus/damaged-helmet.glb",
    hash: "4028ccbce11eb924"
  }
});

interface NodeSummary {
  readonly kind: string;
  readonly name?: string;
  readonly detail?: string;
  readonly shadow?: boolean;
  readonly textureUrl?: string;
}

function summarize(node: AuraSceneNode): NodeSummary {
  const record = node as unknown as Record<string, unknown>;
  const detail = (record.environment ?? record.light ?? record.effect) as string | undefined;
  const texture = record.texture as { url?: string } | undefined;
  return {
    kind: node.kind,
    ...(typeof record.name === "string" ? { name: record.name } : {}),
    ...(detail !== undefined ? { detail } : {}),
    ...(record.shadow !== undefined ? { shadow: record.shadow === true || typeof record.shadow === "object" } : {}),
    ...(texture?.url ? { textureUrl: texture.url } : {})
  };
}

function controlNodes(id: AuraLookId, kind: string): AuraSceneNode[] {
  const nodes = looks.nodes(id).map((builder) => builder.toJSON());
  if (kind === "no-ibl") return nodes.filter((node) => node.kind !== "environment");
  if (kind === "no-shadow") {
    return nodes.map((node) => (node.kind === "light" ? ({ ...node, shadow: false } as AuraSceneNode) : node));
  }
  throw new Error(`unknown control "${kind}"`);
}

async function run(): Promise<void> {
  if (!lookId) throw new Error("missing ?look=<id> query param");
  const canvas = document.getElementById("look-canvas") as HTMLCanvasElement;
  const lookNode =
    control === "none"
      ? looks.preset(lookId, undefined, { expansion })
      : undefined;
  const authored = lookNode === undefined ? undefined : "toJSON" in lookNode ? lookNode.toJSON() : lookNode;

  const built = scene()
    .camera(camera.perspective({ position: [0, 0.75, 3.6], target: [0, 0.05, 0], fov: 40, near: 0.1, far: 80 }))
    .add(
      primitives.plane({ name: "ground", size: 12, material: material.pbr({ color: "#8a8a84", roughness: 0.85 }) })
        .position(0, -0.85, 0)
    )
    .add(model(assets.helmet, { name: "damaged helmet", castShadow: true }));
  if (authored !== undefined) built.add(authored as AuraSceneNode);
  else built.addMany(controlNodes(lookId, control));

  const app = createAuraApp(canvas, { scene: built, pixelRatio: 1, resize: false, autoStart: false });
  const hdriStatus = await settle(app);
  const frame = measureFrame(app, canvas);
  const diagnostics = app.diagnostics() as unknown as Record<string, unknown>;
  const children =
    authored !== undefined && authored.kind === "group"
      ? (authored as { children: readonly AuraSceneNode[] }).children.map(summarize)
      : [];

  publish({
    look: lookId,
    expansion,
    control,
    listed: looks.list(),
    authored: authored === undefined ? null : { kind: authored.kind, name: (authored as { name?: string }).name ?? null, look: (authored as { look?: string }).look ?? null },
    children,
    groupBackground: (authored as { background?: string } | undefined)?.background ?? null,
    sceneBackground: app.scene.background,
    hdriStatus,
    frame,
    diagnostics: {
      errors: diagnostics.errors ?? [],
      drawCalls: diagnostics.drawCalls ?? null,
      look: diagnostics.look ?? null
    }
  });
}

run().catch(publishError);
