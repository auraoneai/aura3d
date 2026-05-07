export type VisualPortDirection = "input" | "output";
export type VisualPortType = "flow" | "number" | "boolean" | "string" | "object";

export interface VisualPort {
  readonly id: string;
  readonly direction: VisualPortDirection;
  readonly type: VisualPortType;
}

export interface VisualNode {
  readonly id: string;
  readonly kind: string;
  readonly ports: readonly VisualPort[];
  readonly data?: Readonly<Record<string, unknown>>;
}

export function validateNode(node: VisualNode): readonly string[] {
  const errors: string[] = [];
  const ports = new Set<string>();

  if (node.id.length === 0) {
    errors.push("Node id is required");
  }

  for (const port of node.ports) {
    if (ports.has(port.id)) {
      errors.push(`Duplicate port id on node ${node.id}: ${port.id}`);
    }
    ports.add(port.id);
  }

  return errors;
}
