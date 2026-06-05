import type {
  AuraRuntimeNodeSpec,
  AuraSceneBuilder,
  AuraSceneNode,
  AuraSceneSnapshot,
  AuraVec3
} from "./index";

export interface GameSceneRuntimeNode {
  readonly id: string;
  readonly debugLabel: string;
  readonly kind: AuraSceneNode["kind"];
  readonly name?: string;
  readonly tags: readonly string[];
  readonly mutable: boolean;
}

export interface GameSceneBridgeApp {
  readonly scene?: AuraSceneSnapshot;
  readonly nodes?: {
    get(id: string): GameSceneBridgeNodeHandle | undefined;
    require(id: string): GameSceneBridgeNodeHandle;
    ids(): readonly string[];
  };
}

export interface GameSceneBridgeNodeHandle {
  readonly id: string;
  position: AuraVec3;
  rotation: AuraVec3;
  scale: number | AuraVec3;
  visible: boolean;
  setPosition?(x: number, y: number, z: number): this;
  setRotation?(x: number, y: number, z: number): this;
  play?(clip: string, options?: Record<string, unknown>): this;
}

export interface GameSceneBridgeBodyLike {
  readonly position: AuraVec3;
  readonly facing?: 1 | -1;
  readonly grounded?: boolean;
}

export interface GameSceneBridgeEvidence {
  readonly kind: "aura-game-scene-bridge-evidence";
  readonly runtimeNodeCount: number;
  readonly runtimeNodeIds: readonly string[];
  readonly runtimeNodeDebugLabels: Record<string, string>;
  readonly mutableNodeCount: number;
  readonly tags: Record<string, readonly string[]>;
  readonly runtimeUpdatesReconstructScene: false;
  readonly sceneReconstructionRequired: false;
}

export interface GameSceneBridge {
  node(id: string): GameSceneBridgeNodeHandle | undefined;
  requireNode(id: string): GameSceneBridgeNodeHandle;
  syncBody(id: string, body: GameSceneBridgeBodyLike): boolean;
  play(id: string, clip: string, options?: Record<string, unknown>): boolean;
  setVisible(id: string, visible: boolean): boolean;
  evidence(scene?: AuraSceneBuilder | AuraSceneSnapshot): GameSceneBridgeEvidence;
}

export function createRuntimeNodeSpec(id: string, options: Omit<AuraRuntimeNodeSpec, "id"> = {}): AuraRuntimeNodeSpec {
  return {
    mutable: true,
    ...options,
    id
  };
}

export function collectGameSceneRuntimeNodes(sceneValue: AuraSceneBuilder | AuraSceneSnapshot): readonly GameSceneRuntimeNode[] {
  const snapshot = normalizeScene(sceneValue);
  const nodes: GameSceneRuntimeNode[] = [];
  for (const node of snapshot.nodes) collectRuntimeNode(node, nodes);
  return nodes;
}

export function createGameSceneBridge(app: GameSceneBridgeApp): GameSceneBridge {
  return {
    node(id) {
      return app.nodes?.get(id);
    },
    requireNode(id) {
      const node = app.nodes?.require(id);
      if (!node) throw new Error(`Aura3D runtime node "${id}" is not available on this app handle.`);
      return node;
    },
    syncBody(id, body) {
      const node = app.nodes?.get(id);
      if (!node) return false;
      if (node.setPosition) node.setPosition(body.position[0], body.position[1], body.position[2]);
      else node.position = body.position;
      if (body.facing) {
        const rotation: AuraVec3 = [0, body.facing < 0 ? Math.PI : 0, 0];
        if (node.setRotation) node.setRotation(rotation[0], rotation[1], rotation[2]);
        else node.rotation = rotation;
      }
      return true;
    },
    play(id, clip, options) {
      const node = app.nodes?.get(id);
      if (!node?.play) return false;
      node.play(clip, options);
      return true;
    },
    setVisible(id, visible) {
      const node = app.nodes?.get(id);
      if (!node) return false;
      node.visible = visible;
      return true;
    },
    evidence(scene) {
      const runtimeNodes = scene ? collectGameSceneRuntimeNodes(scene) : [];
      const ids = app.nodes?.ids() ?? runtimeNodes.map((node) => node.id);
      const tags: Record<string, readonly string[]> = {};
      const debugLabels: Record<string, string> = {};
      for (const node of runtimeNodes) tags[node.id] = node.tags;
      for (const node of runtimeNodes) debugLabels[node.id] = node.debugLabel;
      for (const id of ids) {
        if (!debugLabels[id]) debugLabels[id] = `runtime:${id}`;
      }
      return {
        kind: "aura-game-scene-bridge-evidence",
        runtimeNodeCount: ids.length,
        runtimeNodeIds: ids,
        runtimeNodeDebugLabels: debugLabels,
        mutableNodeCount: runtimeNodes.filter((node) => node.mutable).length || ids.length,
        tags,
        runtimeUpdatesReconstructScene: false,
        sceneReconstructionRequired: false
      };
    }
  };
}

function normalizeScene(sceneValue: AuraSceneBuilder | AuraSceneSnapshot): AuraSceneSnapshot {
  return typeof (sceneValue as AuraSceneBuilder).toJSON === "function" ? (sceneValue as AuraSceneBuilder).toJSON() : sceneValue as AuraSceneSnapshot;
}

function collectRuntimeNode(node: AuraSceneNode, nodes: GameSceneRuntimeNode[]): void {
  const runtime = "runtime" in node ? node.runtime : undefined;
  if (runtime?.id) {
    nodes.push({
      id: runtime.id,
      debugLabel: runtimeDebugLabel(node, runtime.id),
      kind: node.kind,
      name: "name" in node ? node.name : undefined,
      tags: runtime.tags ?? [],
      mutable: runtime.mutable !== false
    });
  }
  if (node.kind === "group") {
    for (const child of node.children) collectRuntimeNode(child, nodes);
  }
}

function runtimeDebugLabel(node: AuraSceneNode, runtimeId: string): string {
  const runtime = "runtime" in node ? node.runtime as { debugLabel?: string } | undefined : undefined;
  if (runtime?.debugLabel) return runtime.debugLabel;
  const name = "name" in node && node.name ? `:${node.name}` : "";
  return `${node.kind}${name}#${runtimeId}`;
}
