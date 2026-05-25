export interface V5ShaderNode {
  readonly id: string;
  readonly kind: "color" | "float" | "texture" | "math" | "output";
}

export class NodeMaterialV5 {
  readonly type = "NodeMaterial";
  readonly nodes: V5ShaderNode[] = [];

  addNode(node: V5ShaderNode): this {
    this.nodes.push(node);
    return this;
  }

  compileGraph(): { readonly nodeCount: number; readonly hasOutput: boolean } {
    return {
      nodeCount: this.nodes.length,
      hasOutput: this.nodes.some((node) => node.kind === "output")
    };
  }
}
