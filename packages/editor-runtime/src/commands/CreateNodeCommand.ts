import type { Command } from "../Command";

export interface NodeContainer<TNode> {
  add(node: TNode): void;
  remove(node: TNode): void;
}

export class CreateNodeCommand<TNode> implements Command {
  readonly name = "Create Node";

  constructor(
    private readonly container: NodeContainer<TNode>,
    private readonly node: TNode
  ) {}

  execute(): void {
    this.container.add(this.node);
  }

  undo(): void {
    this.container.remove(this.node);
  }
}
