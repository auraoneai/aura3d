export interface ThreeCompatShaderNode {
  readonly id: string;
  readonly kind: "color" | "float" | "texture" | "math" | "output";
}

export class NodeMaterialThreeCompat {
  readonly type = "NodeMaterial";
  readonly nodes: ThreeCompatShaderNode[] = [];

  addNode(node: ThreeCompatShaderNode): this {
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
