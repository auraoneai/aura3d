export type VisualPortDirection = "input" | "output";
export type VisualPortType = "flow" | "number" | "boolean" | "string" | "object" | "any";

export interface VisualPort {
  readonly id: string;
  readonly direction: VisualPortDirection;
  readonly type: VisualPortType;
  readonly optional?: boolean;
  readonly defaultValue?: unknown;
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
    if (port.id.length === 0) {
      errors.push(`Port id is required on node ${node.id}`);
    }
    if (ports.has(port.id)) {
      errors.push(`Duplicate port id on node ${node.id}: ${port.id}`);
    }
    ports.add(port.id);
    if (port.direction !== "input" && port.direction !== "output") {
      errors.push(`Invalid port direction on node ${node.id}.${port.id}`);
    }
    if (!["flow", "number", "boolean", "string", "object", "any"].includes(port.type)) {
      errors.push(`Invalid port type on node ${node.id}.${port.id}`);
    }
  }

  return errors;
}
