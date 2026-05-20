export type BehaviorTreeStatus = "success" | "failure" | "running";
export type BlackboardValue = number | string | boolean | readonly unknown[] | Record<string, unknown> | null | undefined;

export interface BlackboardChange {
  readonly key: string;
  readonly value: BlackboardValue;
  readonly previous: BlackboardValue;
  readonly version: number;
}

export interface BehaviorTreeContext {
  readonly blackboard: Blackboard;
  readonly deltaSeconds: number;
  readonly depth: number;
}

export interface BehaviorTreeTickResult {
  readonly status: BehaviorTreeStatus;
  readonly tickCount: number;
  readonly trace: readonly string[];
  readonly blackboardVersion: number;
}

export abstract class BehaviorTreeNode {
  public status: BehaviorTreeStatus = "failure";
  public running = false;

  constructor(public readonly name: string) {}

  abstract tick(context: BehaviorTreeContext): BehaviorTreeStatus;

  reset(): void {
    this.status = "failure";
    this.running = false;
  }
}

export class Blackboard {
  private readonly values = new Map<string, { readonly value: BlackboardValue; readonly version: number }>();
  private readonly changes: BlackboardChange[] = [];
  private localVersion = 0;

  constructor(public readonly parent?: Blackboard) {}

  get version(): number {
    return this.localVersion;
  }

  set(key: string, value: BlackboardValue): void {
    const previous = this.get(key);
    this.localVersion += 1;
    this.values.set(key, { value, version: this.localVersion });
    this.changes.push({ key, value, previous, version: this.localVersion });
  }

  get<T extends BlackboardValue = BlackboardValue>(key: string, fallback?: T): T {
    const local = this.values.get(key);
    if (local) return local.value as T;
    if (this.parent?.has(key)) return this.parent.get<T>(key, fallback);
    return fallback as T;
  }

  has(key: string): boolean {
    return this.values.has(key) || this.parent?.has(key) === true;
  }

  snapshot(): Record<string, BlackboardValue> {
    const inherited = this.parent?.snapshot() ?? {};
    return { ...inherited, ...Object.fromEntries([...this.values].map(([key, entry]) => [key, entry.value])) };
  }

  changeLog(): readonly BlackboardChange[] {
    return [...this.changes];
  }
}

export class BehaviorAction extends BehaviorTreeNode {
  constructor(name: string, private readonly action: (context: BehaviorTreeContext) => BehaviorTreeStatus) {
    super(name);
  }

  tick(context: BehaviorTreeContext): BehaviorTreeStatus {
    this.running = true;
    this.status = this.action(context);
    if (this.status !== "running") this.running = false;
    return this.status;
  }
}

export class BehaviorCondition extends BehaviorTreeNode {
  constructor(name: string, private readonly condition: (context: BehaviorTreeContext) => boolean) {
    super(name);
  }

  tick(context: BehaviorTreeContext): BehaviorTreeStatus {
    this.status = this.condition(context) ? "success" : "failure";
    return this.status;
  }
}

export class BehaviorSequence extends BehaviorTreeNode {
  private currentIndex = 0;

  constructor(name: string, public readonly children: readonly BehaviorTreeNode[]) {
    super(name);
  }

  tick(context: BehaviorTreeContext): BehaviorTreeStatus {
    this.running = true;
    while (this.currentIndex < this.children.length) {
      const child = this.children[this.currentIndex]!;
      const status = child.tick({ ...context, depth: context.depth + 1 });
      if (status === "failure") {
        this.reset();
        return "failure";
      }
      if (status === "running") {
        this.status = "running";
        return "running";
      }
      this.currentIndex += 1;
    }
    this.reset();
    this.status = "success";
    return "success";
  }

  override reset(): void {
    super.reset();
    this.currentIndex = 0;
    for (const child of this.children) child.reset();
  }
}

export class BehaviorSelector extends BehaviorTreeNode {
  private currentIndex = 0;

  constructor(name: string, public readonly children: readonly BehaviorTreeNode[]) {
    super(name);
  }

  tick(context: BehaviorTreeContext): BehaviorTreeStatus {
    this.running = true;
    while (this.currentIndex < this.children.length) {
      const child = this.children[this.currentIndex]!;
      const status = child.tick({ ...context, depth: context.depth + 1 });
      if (status === "success") {
        this.reset();
        return "success";
      }
      if (status === "running") {
        this.status = "running";
        return "running";
      }
      this.currentIndex += 1;
    }
    this.reset();
    this.status = "failure";
    return "failure";
  }

  override reset(): void {
    super.reset();
    this.currentIndex = 0;
    for (const child of this.children) child.reset();
  }
}

export class BehaviorTree {
  private tickCounter = 0;
  private lastTrace: string[] = [];

  constructor(public readonly root: BehaviorTreeNode, public readonly blackboard = new Blackboard()) {}

  tick(deltaSeconds: number): BehaviorTreeTickResult {
    this.tickCounter += 1;
    this.lastTrace = [];
    const status = this.tickNode(this.root, { blackboard: this.blackboard, deltaSeconds, depth: 0 });
    return {
      status,
      tickCount: this.tickCounter,
      trace: [...this.lastTrace],
      blackboardVersion: this.blackboard.version
    };
  }

  reset(): void {
    this.root.reset();
    this.lastTrace = [];
    this.tickCounter = 0;
  }

  private tickNode(node: BehaviorTreeNode, context: BehaviorTreeContext): BehaviorTreeStatus {
    const status = node.tick({
      ...context,
      blackboard: new TracingBlackboard(context.blackboard, (key, value) => {
        this.lastTrace.push(`${node.name}:${key}=${String(value)}`);
      })
    });
    this.lastTrace.push(`${node.name}:${status}`);
    return status;
  }
}

class TracingBlackboard extends Blackboard {
  constructor(private readonly target: Blackboard, private readonly onSet: (key: string, value: BlackboardValue) => void) {
    super();
  }

  override get version(): number {
    return this.target.version;
  }

  override set(key: string, value: BlackboardValue): void {
    this.target.set(key, value);
    this.onSet(key, value);
  }

  override get<T extends BlackboardValue = BlackboardValue>(key: string, fallback?: T): T {
    return this.target.get(key, fallback);
  }

  override has(key: string): boolean {
    return this.target.has(key);
  }

  override snapshot(): Record<string, BlackboardValue> {
    return this.target.snapshot();
  }

  override changeLog(): readonly BlackboardChange[] {
    return this.target.changeLog();
  }
}
