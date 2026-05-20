export interface NodeMaterialNode {
  readonly id: string;
  readonly type: string;
  readonly inputs?: Readonly<Record<string, string | number | boolean>>;
}

export class NodeMaterial {
  readonly nodes: NodeMaterialNode[] = [];

  addNode(node: NodeMaterialNode): this {
    if (!node.id.trim() || !node.type.trim()) throw new Error("NodeMaterial nodes require id and type.");
    if (this.nodes.some((entry) => entry.id === node.id)) throw new Error(`Duplicate NodeMaterial node: ${node.id}`);
    this.nodes.push(node);
    return this;
  }

  toShaderKey(): string {
    return `node:${this.nodes.map((node) => node.type).join("+") || "empty"}`;
  }
}
