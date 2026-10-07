/**
 * PRD-04 P2-4 — C-15 real material handle for model nodes.
 *
 * Records every `TypedGLBActor` by node id through the §3.6 actor-extension seam (always-on
 * bookkeeping — no flag) and provides the C-37 `materials` `NodeHandleExtension`. The handle
 * falls back to the contract-stub semantics while `A3D_QR_MATERIALS` is off (`inspectMaterials`
 * reports `featureKey: "legacy"`, overrides carry a `STUB_MATERIAL_HANDLE` warning), so the
 * registration is inert flag-off and real flag-on.
 */
import type { TypedGLBActor } from "../TypedGLBActor";
import { registerTypedGLBActorExtension, typedGLBActorQrFlags } from "./extensions";
import { registerNodeHandleExtension } from "../../contracts/runtimeNodes";
import {
  StubModelMaterialHandle,
  type AuraModelMaterialHandle,
  type AuraModelMaterialOverride,
  type AuraResolvedMaterialInfo
} from "../../contracts/materials";
import { lowerModelMaterialOverrides, type TypedGLBActorMaterialOverride } from "../ModelMaterialOverrides";

const actorsByNodeId = new Map<string, TypedGLBActor>();

/** Test/inspection seam: the actor currently bound to a node id, if loaded. */
export function typedGLBActorForNode(nodeId: string): TypedGLBActor | undefined {
  return actorsByNodeId.get(nodeId);
}

/** Every live registered actor — P2-5 diagnostics section and C-37 handle resolution. */
export function registeredTypedGLBActors(): readonly TypedGLBActor[] {
  return [...actorsByNodeId.values()];
}

class TypedGLBActorMaterialHandle implements AuraModelMaterialHandle {
  private lazyStub: StubModelMaterialHandle | undefined;

  private stub(): StubModelMaterialHandle {
    this.lazyStub ??= new StubModelMaterialHandle(undefined, this.authoredNames);
    return this.lazyStub;
  }

  private get authoredNames(): readonly string[] {
    if (!this.actor) return [];
    const names = new Set<string>();
    for (const binding of this.actor.pipeline.resources.renderableBindings) {
      if (binding.sourceMaterialName) names.add(binding.sourceMaterialName);
    }
    return [...names].sort();
  }

  private get materialsOn(): boolean {
    return typedGLBActorQrFlags().on("A3D_QR_MATERIALS");
  }

  constructor(private readonly actor: TypedGLBActor | undefined) {}

  materialNames(): readonly string[] {
    return this.materialsOn ? this.authoredNames : this.stub().materialNames();
  }

  materialVariants(): readonly string[] {
    return this.materialsOn ? (this.actor?.materialVariants() ?? []) : this.stub().materialVariants();
  }

  setMaterialVariant(name: string | null): void {
    if (!this.materialsOn) {
      this.stub().setMaterialVariant(name);
      return;
    }
    this.actor?.setMaterialVariant(name);
  }

  setMaterialOverrides(overrides: readonly AuraModelMaterialOverride[]): void {
    if (!this.materialsOn) {
      this.stub().setMaterialOverrides(overrides);
      return;
    }
    this.actor?.setMaterialOverrides(lowerModelMaterialOverrides(undefined, overrides));
  }

  inspectMaterials(): readonly AuraResolvedMaterialInfo[] {
    return this.materialsOn ? (this.actor?.inspectMaterials() ?? []) : this.stub().inspectMaterials();
  }
}

/**
 * Lane-barrel entry point (P2-4): registers the actor bookkeeping extension and the C-37
 * `materials` handle. The handle registration carries `flag: "A3D_QR_MATERIALS"` — consumers of
 * the C-37 map must honour the flag; the stub fallback inside the handle keeps flag-off behavior
 * identical regardless.
 */
let registered = false;

export function registerPrd04TypedGLBActorMaterials(): () => void {
  if (registered) return () => {};
  registered = true;
  const unregisterActorExtension = registerTypedGLBActorExtension({
    id: "prd04.materials-actor-registry",
    owner: "prd04",
    onLoad: (actor) => {
      actorsByNodeId.set(actor.id, actor);
    },
    dispose: (actor) => {
      actorsByNodeId.delete(actor.id);
    }
  });
  const unregisterHandle = registerNodeHandleExtension({
    id: "prd04.materials-handle",
    owner: "prd04",
    flag: "A3D_QR_MATERIALS",
    member: "materials",
    appliesTo: ["model"],
    create: (handle) => new TypedGLBActorMaterialHandle(actorsByNodeId.get(handle.id))
  });
  return () => {
    unregisterActorExtension();
    unregisterHandle();
    registered = false;
  };
}

export type { TypedGLBActorMaterialOverride };
