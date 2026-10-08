/**
 * `MSFT_lod` glTF extension for gltf-transform (PRD-05 §6.1/§6.3.6).
 *
 * `@gltf-transform/extensions` ships no MSFT_lod implementation, so this is a
 * custom `Extension` subclass covering the parts the LOD step writes and the
 * runtime reads:
 *
 *   node.extensions.MSFT_lod = { ids: [<nodeIndex>, ...] }   // LOD1..N targets
 *   node.extras.MSFT_screencoverage = number[]               // per level incl. LOD0
 *
 * `extras` round-trips through `Node.getExtras()/setExtras()` natively; the
 * extension property only carries the LOD target node list. Readers that do
 * not understand `MSFT_lod` render LOD0 only (three r185 GLTFLoader included).
 */

import {
  Extension,
  ExtensionProperty,
  PropertyType,
  RefList,
  type Document,
  type IProperty,
  type Nullable,
  type Node,
  type ReaderContext,
  type WriterContext
} from "@gltf-transform/core";

export const MSFT_LOD_EXTENSION_NAME = "MSFT_lod";
export const MSFT_SCREENCOVERAGE_EXTRA = "MSFT_screencoverage";

interface IMSFTLod extends IProperty {
  lods: RefList<Node>;
}

/** Per-node LOD chain payload. `getLods()[0]` is LOD1 — LOD0 is the holder. */
export class MSFTLodNode extends ExtensionProperty<IMSFTLod> {
  public static EXTENSION_NAME = MSFT_LOD_EXTENSION_NAME;
  public declare extensionName: typeof MSFT_LOD_EXTENSION_NAME;
  public declare parentTypes: [PropertyType.NODE];
  public declare propertyType: "MSFTLodNode";

  protected init(): void {
    this.extensionName = MSFT_LOD_EXTENSION_NAME;
    this.parentTypes = [PropertyType.NODE];
    this.propertyType = "MSFTLodNode";
  }

  protected getDefaults(): Nullable<IMSFTLod> {
    return Object.assign(super.getDefaults(), { lods: new RefList<Node>() });
  }

  public addLod(level: Node): this {
    return this.addRef("lods" as never, level as never);
  }

  public removeLod(level: Node): this {
    return this.removeRef("lods" as never, level as never);
  }

  public listLods(): Node[] {
    return this.listRefs("lods" as never) as Node[];
  }
}

export class MSFTLod extends Extension {
  public static EXTENSION_NAME = MSFT_LOD_EXTENSION_NAME;
  public readonly extensionName = MSFT_LOD_EXTENSION_NAME;

  public static register(): void {
    // No global registration needed — MSFTLodNode is a plain ExtensionProperty.
  }

  public createLodNode(): MSFTLodNode {
    return new MSFTLodNode(this.document.getGraph());
  }

  public read(context: ReaderContext): this {
    const { jsonDoc } = context;
    const nodeDefs = jsonDoc.json.nodes ?? [];
    nodeDefs.forEach((nodeDef, nodeIndex) => {
      const lodDef = nodeDef.extensions?.[MSFT_LOD_EXTENSION_NAME] as { ids?: number[] } | undefined;
      if (!lodDef?.ids?.length) return;
      const prop = this.createLodNode();
      for (const id of lodDef.ids) {
        const target = context.nodes[id];
        if (target) prop.addLod(target);
      }
      context.nodes[nodeIndex].setExtension(MSFT_LOD_EXTENSION_NAME, prop);
    });
    return this;
  }

  public write(context: WriterContext): this {
    const { jsonDoc } = context;
    const json = jsonDoc.json;
    json.nodes = json.nodes ?? [];
    for (const node of this.document.getRoot().listNodes()) {
      const prop = node.getExtension(MSFT_LOD_EXTENSION_NAME) as MSFTLodNode | null;
      if (!prop) continue;
      const nodeIndex = context.nodeIndexMap.get(node);
      if (nodeIndex === undefined) continue;
      const ids = prop
        .listLods()
        .map((target) => context.nodeIndexMap.get(target))
        .filter((id): id is number => id !== undefined);
      const nodeDef = json.nodes[nodeIndex] ?? (json.nodes[nodeIndex] = {});
      nodeDef.extensions = nodeDef.extensions ?? {};
      nodeDef.extensions[MSFT_LOD_EXTENSION_NAME] = { ids };
    }
    return this;
  }
}

/**
 * Registers `MSFT_lod` on a Document for io (reader/writer lists) and returns
 * it — callers add it to `NodeIO.registerExtensions([...])` for reads, or
 * create it on the Document before writing LOD chains.
 */
export function msftLodExtension(document: Document): MSFTLod {
  return document.createExtension(MSFTLod);
}
