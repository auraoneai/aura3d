import {
  PropertyBinding,
  type AnimationObjectGroupLike,
  type ParsedTrackName,
  type PropertyBindingLike,
  type PropertyBindingNode
} from "./PropertyBinding.js";

interface GroupMember {
  readonly object: PropertyBindingNode;
  /** The UUID at admission, if supplied. It remains the member's identity. */
  readonly uuid: string | undefined;
  active: boolean;
}

interface Subscription {
  readonly path: string;
  readonly parsedPath: ParsedTrackName;
  /** Shared with composite bindings; preserve this array's identity. */
  readonly orderedBindings: PropertyBindingLike[];
  readonly byMember: Map<GroupMember, PropertyBinding>;
  readonly byBinding: Map<PropertyBindingLike, GroupMember>;
}

function samePath(a: ParsedTrackName, b: ParsedTrackName): boolean {
  return (a.directoryName ?? "") === (b.directoryName ?? "")
    && (a.nodeName ?? "") === (b.nodeName ?? "")
    && a.objectName === b.objectName && a.objectIndex === b.objectIndex
    && a.propertyName === b.propertyName && a.propertyIndex === b.propertyIndex;
}

let nextGroupId = 0;

/**
 * Shares animation paths across a set of objects. Removed objects stay cached
 * until re-added or explicitly uncached. A cached object receives no writes.
 *
 * A subscription owns one binding per member. Composite bindings hold its
 * ordered array, so membership changes rebuild the contents in place with the
 * cached members first and active members after `nCachedObjects_`.
 */
export class AnimationObjectGroup implements AnimationObjectGroupLike {
  readonly isAnimationObjectGroup = true as const;
  readonly uuid = `animation-object-group-${(nextGroupId++).toString(36)}-${Math.random().toString(36).slice(2)}`;

  /** Number of leading cached entries in every subscribed binding array. */
  nCachedObjects_ = 0;

  private readonly members: GroupMember[] = [];
  private readonly membersByObject = new Map<PropertyBindingNode, GroupMember>();
  private readonly membersByUuid = new Map<string, GroupMember>();
  private readonly subscriptions = new Map<string, Subscription>();
  private disposed = false;
  private preparingBindings = false;

  readonly stats: {
    readonly objects: { readonly total: number; readonly inUse: number };
    readonly bindingsPerObject: number;
  };

  constructor(...objects: PropertyBindingNode[]) {
    const group = this;
    this.stats = {
      objects: {
        get total() { return group.members.length; },
        get inUse() { return group.members.length - group.nCachedObjects_; }
      },
      get bindingsPerObject() { return group.subscriptions.size; }
    };
    this.add(...objects);
  }

  /** Add new objects or reactivate cached objects. Repeated additions are safe. */
  add(...objects: PropertyBindingNode[]): void {
    this.assertAlive();
    const staged = this.prepare(() => {
      const additions: GroupMember[] = [];
      const additionsByObject = new Map<PropertyBindingNode, GroupMember>();
      const additionsByUuid = new Map<string, GroupMember>();
      const reactivations = new Set<GroupMember>();
      for (const object of objects) {
        const known = this.membersByObject.get(object) ?? additionsByObject.get(object);
        if (known) {
          if (!known.active) reactivations.add(known);
          continue;
        }

        // Read admission identity once: accessors may throw or return changing values.
        const candidateUuid = object.uuid;
        const uuid = typeof candidateUuid === "string" && candidateUuid.length > 0 ? candidateUuid : undefined;
        if (uuid !== undefined && (this.membersByUuid.has(uuid) || additionsByUuid.has(uuid))) {
          // A different object cannot inherit the bindings owned by this UUID.
          console.error(`AnimationObjectGroup: Different objects share UUID "${uuid}".`);
          continue;
        }

        const member: GroupMember = { object, uuid, active: true };
        additions.push(member);
        additionsByObject.set(object, member);
        if (uuid !== undefined) additionsByUuid.set(uuid, member);
      }

      // Construct every new path before publishing membership. A failing node
      // accessor or path lookup must not leave a half-added member or empty a
      // composite binding's live array.
      const bindings = new Map<Subscription, Map<GroupMember, PropertyBinding>>();
      for (const subscription of this.subscriptions.values()) {
        const created = new Map<GroupMember, PropertyBinding>();
        for (const member of additions) {
          created.set(member, new PropertyBinding(member.object, subscription.path, subscription.parsedPath));
        }
        bindings.set(subscription, created);
      }
      return { additions, reactivations, bindings };
    });

    if (staged.additions.length === 0 && staged.reactivations.size === 0) return;
    for (const member of staged.reactivations) member.active = true;
    for (const member of staged.additions) {
      this.members.push(member);
      this.membersByObject.set(member.object, member);
      if (member.uuid !== undefined) this.membersByUuid.set(member.uuid, member);
    }
    for (const [subscription, bindings] of staged.bindings) {
      for (const [member, binding] of bindings) {
        subscription.byMember.set(member, binding);
        subscription.byBinding.set(binding, member);
      }
    }
    this.refreshBindings();
  }

  /** Deactivate objects while retaining their bindings for later reactivation. */
  remove(...objects: PropertyBindingNode[]): void {
    this.assertNotPreparing();
    let changed = false;
    for (const object of objects) {
      const member = this.membersByObject.get(object);
      if (member?.active) {
        member.active = false;
        changed = true;
      }
    }
    if (changed) this.refreshBindings();
  }

  /** Release all group-owned bindings for the supplied objects. */
  uncache(...objects: PropertyBindingNode[]): void {
    this.assertNotPreparing();
    let changed = false;
    for (const object of objects) {
      const member = this.membersByObject.get(object);
      if (!member) continue;

      this.membersByObject.delete(object);
      if (member.uuid !== undefined) this.membersByUuid.delete(member.uuid);
      const index = this.members.indexOf(member);
      if (index !== -1) this.members.splice(index, 1);
      for (const subscription of this.subscriptions.values()) {
        const binding = subscription.byMember.get(member);
        binding?.unbind();
        if (binding) subscription.byBinding.delete(binding);
        subscription.byMember.delete(member);
      }
      changed = true;
    }
    if (changed) this.refreshBindings();
  }

  /** Internal interface used by composite bindings. */
  subscribe_(path: string, parsedPath?: ParsedTrackName): PropertyBindingLike[] {
    this.assertAlive();
    return this.prepare(() => this.createSubscription(path, parsedPath));
  }

  private createSubscription(path: string, parsedPath?: ParsedTrackName): PropertyBindingLike[] {
    // Validate supplied descriptors even when there are no members, and take
    // a private copy so a caller cannot later redirect a subscription.
    const normalized = new PropertyBinding({}, path, parsedPath).parsedPath;
    const existing = this.subscriptions.get(path);
    if (existing) {
      if (!samePath(existing.parsedPath, normalized)) {
        throw new Error(`AnimationObjectGroup: Conflicting parsed path for subscription "${path}".`);
      }
      return existing.orderedBindings;
    }

    const subscription: Subscription = {
      path,
      parsedPath: normalized,
      orderedBindings: [],
      byMember: new Map(),
      byBinding: new Map()
    };
    // Build before publishing the subscription, so an invalid binding cannot
    // leave a partially registered path or disturb an existing subscription.
    for (const member of this.orderedMembers()) {
      const binding = new PropertyBinding(member.object, path, subscription.parsedPath);
      subscription.byMember.set(member, binding);
      subscription.byBinding.set(binding, member);
      subscription.orderedBindings.push(binding);
    }
    this.subscriptions.set(path, subscription);
    return subscription.orderedBindings;
  }

  /** Internal constant-time membership check for a composite dispatch snapshot. */
  isBindingActive_(path: string, binding: PropertyBindingLike): boolean {
    return this.subscriptions.get(path)?.byBinding.get(binding)?.active === true;
  }

  /** Unsubscribe only this path; previously returned arrays become inert. */
  unsubscribe_(path: string): void {
    this.assertNotPreparing();
    const subscription = this.subscriptions.get(path);
    if (!subscription) return;
    this.subscriptions.delete(path);
    this.releaseSubscription(subscription);
  }

  /** Release all members and subscriptions. A disposed group cannot be reused. */
  dispose(): void {
    this.assertNotPreparing();
    if (this.disposed) return;
    this.disposed = true;
    for (const subscription of this.subscriptions.values()) this.releaseSubscription(subscription);
    this.subscriptions.clear();
    this.members.length = 0;
    this.membersByObject.clear();
    this.membersByUuid.clear();
    this.nCachedObjects_ = 0;
  }

  private refreshBindings(): void {
    const ordered = this.orderedMembers();
    this.nCachedObjects_ = ordered.filter((member) => !member.active).length;

    for (const subscription of this.subscriptions.values()) {
      const bindings = subscription.orderedBindings;
      bindings.length = 0;
      for (const member of ordered) {
        let binding = subscription.byMember.get(member);
        if (!binding) {
          binding = new PropertyBinding(member.object, subscription.path, subscription.parsedPath);
          subscription.byMember.set(member, binding);
          subscription.byBinding.set(binding, member);
        }
        bindings.push(binding);
      }
    }
  }

  private orderedMembers(): GroupMember[] {
    const cached: GroupMember[] = [];
    const active: GroupMember[] = [];
    for (const member of this.members) (member.active ? active : cached).push(member);
    return cached.concat(active);
  }

  private releaseSubscription(subscription: Subscription): void {
    for (const binding of subscription.byMember.values()) binding.unbind();
    subscription.byMember.clear();
    subscription.byBinding.clear();
    subscription.orderedBindings.length = 0;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("AnimationObjectGroup is disposed.");
  }

  /** Binding construction can invoke user getters; reject nested mutations. */
  private prepare<T>(create: () => T): T {
    this.assertNotPreparing();
    this.preparingBindings = true;
    try {
      return create();
    } finally {
      this.preparingBindings = false;
    }
  }

  private assertNotPreparing(): void {
    if (this.preparingBindings) {
      throw new Error("AnimationObjectGroup cannot be mutated while preparing bindings.");
    }
  }
}
