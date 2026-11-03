import type { Constraint } from "../Constraint.js";
import type { RigidBody } from "../RigidBody.js";

/**
 * Quiet thresholds are experimental host policy, not measured backend defaults.
 * Separate cutoffs do not model the observed shape-dependent coupling of linear
 * and angular motion or floating-point behavior at the public backend's boundary.
 * Even a scalar farthest-collider radius is insufficient for translated hulls:
 * public behavior can differ with direction when speed magnitudes are equal.
 */
export interface NativeSleepingOptions {
  readonly enableSleeping?: boolean;
  readonly linearSpeedThreshold: number;
  readonly angularSpeedThreshold: number;
  readonly quietDuration: number;
}

/** Only physical contacts connect islands. A stable key distinguishes collider pairs. */
export interface NativeSleepingContact {
  readonly bodyA: RigidBody;
  readonly bodyB: RigidBody;
  readonly sensor?: boolean;
  readonly key?: string;
}

type BodyState = { readonly body: RigidBody; quiet: number; observedSleeping: boolean };
type Edge = readonly [RigidBody, RigidBody];
type Graph = {
  readonly contacts: Map<string, Edge>;
  readonly joints: Set<Constraint>;
  readonly islands: readonly (readonly BodyState[])[];
  readonly driven: Set<RigidBody>;
};

declare const snapshotBrand: unique symbol;
/** Opaque controller bookkeeping; body state belongs to the caller. @internal */
export interface NativeSleepingSnapshot { readonly [snapshotBrand]: true }
type SavedState = {
  readonly revision: number;
  readonly bodies: readonly { readonly state: BodyState; readonly quiet: number; readonly observedSleeping: boolean }[];
  readonly contacts: Map<string, Edge>;
  readonly joints: Set<Constraint>;
};

/**
 * Isolated sleep policy for native integration. Quiet time is accumulated per
 * connected dynamic island and is not an assertion of another backend's timing.
 * Call wakeConnected before contact/joint solving and whenever the graph changes;
 * call finishStep once after a successful outer step and consumed forces. A host
 * should pass explicit activations for mutations the body API cannot expose,
 * including nonzero force/torque already consumed before finishStep. A repeated
 * zero input need not reset a body that was already awake.
 * Sensor contacts never connect islands, and fixed bodies never join two islands.
 */
export class NativeSleepingController {
  private readonly bodies = new Map<number, BodyState>();
  private readonly checkpoints = new WeakMap<NativeSleepingSnapshot, SavedState>();
  private contacts = new Map<string, Edge>();
  private joints = new Set<Constraint>();
  private revision = 0;
  private disposed = false;
  private readonly enabled: boolean;
  private readonly linearThreshold: number;
  private readonly angularThreshold: number;
  private readonly duration: number;

  constructor(options: NativeSleepingOptions) {
    if (!options || typeof options !== "object") throw new Error("Native sleeping requires explicit thresholds and quiet duration.");
    if (options.enableSleeping !== undefined && typeof options.enableSleeping !== "boolean") {
      throw new Error("Native sleeping enableSleeping must be a boolean.");
    }
    for (const [label, value] of [["linear speed threshold", options.linearSpeedThreshold], ["angular speed threshold", options.angularSpeedThreshold]] as const) {
      if (!Number.isFinite(value) || value < 0) throw new Error(`Native sleeping ${label} must be finite and non-negative.`);
    }
    if (!Number.isFinite(options.quietDuration) || options.quietDuration <= 0) throw new Error("Native sleeping quiet duration must be finite and positive.");
    this.enabled = options.enableSleeping ?? true;
    this.linearThreshold = options.linearSpeedThreshold;
    this.angularThreshold = options.angularSpeedThreshold;
    this.duration = options.quietDuration;
  }

  add(body: RigidBody): void {
    this.assertActive();
    if (!Number.isInteger(body.id) || body.id <= 0 || this.bodies.has(body.id)) throw new Error("Native sleeping body is invalid or already registered.");
    this.bodies.set(body.id, { body, quiet: 0, observedSleeping: body.sleeping });
    this.revision++;
  }

  remove(body: RigidBody): void {
    this.assertActive();
    const state = this.bodies.get(body.id);
    if (!state) return;
    if (state.body !== body) throw new Error("Native sleeping body belongs to another controller.");
    this.bodies.delete(body.id);
    this.revision++;
  }

  /** Propagate activation before the solver consumes a new contact graph. */
  wakeConnected(contacts: readonly NativeSleepingContact[], constraints: readonly Constraint[], activated: readonly RigidBody[] = []): void {
    this.assertActive();
    const graph = this.graph(contacts, constraints, activated);
    this.wake(graph, activated);
    this.contacts = graph.contacts;
    this.joints = graph.joints;
  }

  /**
   * Count one completed outer step and sleep a whole quiet island together.
   * The caller must have consumed/cleared outer-step forces first; nonzero
   * pending forces conservatively prevent sleeping if this contract is missed.
   */
  finishStep(dt: number, contacts: readonly NativeSleepingContact[], constraints: readonly Constraint[], activated: readonly RigidBody[] = []): void {
    this.assertActive();
    if (!Number.isFinite(dt) || dt <= 0) throw new Error("Native sleeping dt must be finite and positive.");
    const graph = this.graph(contacts, constraints, activated);
    this.wake(graph, activated);
    this.contacts = graph.contacts;
    this.joints = graph.joints;
    if (!this.enabled) {
      for (const state of this.bodies.values()) if (!state.body.sleeping) state.quiet = 0;
      return;
    }
    for (const island of graph.islands) {
      if (island.every((state) => state.body.sleeping)) continue;
      const active = island.some(({ body }) => graph.driven.has(body) ||
        Math.hypot(...body.velocity) > this.linearThreshold || Math.hypot(...body.angularVelocity) > this.angularThreshold ||
        Math.hypot(...body.pendingForce()) > 0 || Math.hypot(...body.pendingTorque()) > 0);
      if (active) { for (const state of island) state.quiet = 0; continue; }
      const quiet = Math.min(...island.map((state) => state.quiet)) + dt;
      for (const state of island) state.quiet = quiet;
      if (quiet + Number.EPSILON * this.duration * 8 >= this.duration) {
        for (const state of island) { state.body.sleep(); state.observedSleeping = true; }
      }
    }
  }

  /** Capture only controller bookkeeping; the host must also roll back body state. */
  snapshotState(): NativeSleepingSnapshot {
    this.assertActive();
    const token = Object.freeze({}) as NativeSleepingSnapshot;
    this.checkpoints.set(token, {
      revision: this.revision,
      bodies: [...this.bodies.values()].map((state) => ({ state, quiet: state.quiet, observedSleeping: state.observedSleeping })),
      contacts: new Map(this.contacts),
      joints: new Set(this.joints)
    });
    return token;
  }

  restoreState(token: NativeSleepingSnapshot): void {
    this.assertActive();
    const saved = token && typeof token === "object" ? this.checkpoints.get(token) : undefined;
    if (!saved) throw new Error("Native sleeping snapshot does not belong to this controller.");
    if (saved.revision !== this.revision || saved.bodies.some(({ state }) => this.bodies.get(state.body.id) !== state)) {
      throw new Error("Cannot restore native sleeping snapshot: the body set changed.");
    }
    for (const { state, quiet, observedSleeping } of saved.bodies) { state.quiet = quiet; state.observedSleeping = observedSleeping; }
    this.contacts = new Map(saved.contacts);
    this.joints = new Set(saved.joints);
  }

  dispose(): void {
    if (this.disposed) return;
    this.bodies.clear();
    this.contacts.clear();
    this.joints.clear();
    this.disposed = true;
  }

  private graph(contacts: readonly NativeSleepingContact[], constraints: readonly Constraint[], activated: readonly RigidBody[]): Graph {
    const states = [...this.bodies.values()];
    for (const { body } of states) {
      if (![...body.velocity, ...body.angularVelocity, ...body.pendingForce(), ...body.pendingTorque()].every(Number.isFinite)) {
        throw new Error("Native sleeping body motion and forces must be finite.");
      }
    }
    for (const body of activated) this.requireBody(body);
    const links = new Map<string, Edge>();
    for (const contact of contacts) {
      this.requireBody(contact.bodyA); this.requireBody(contact.bodyB);
      if (contact.bodyA === contact.bodyB) throw new Error("Native sleeping contact requires different bodies.");
      if (contact.sensor !== undefined && typeof contact.sensor !== "boolean") throw new Error("Native sleeping sensor flag must be boolean.");
      if (contact.key !== undefined && (typeof contact.key !== "string" || contact.key.length === 0)) throw new Error("Native sleeping contact key must be a nonempty string.");
      if (contact.sensor) continue;
      const low = Math.min(contact.bodyA.id, contact.bodyB.id), high = Math.max(contact.bodyA.id, contact.bodyB.id);
      const key = contact.key === undefined ? `${low}:${high}` : `${low}:${high}:${contact.key}`;
      links.set(key, [contact.bodyA, contact.bodyB]);
    }
    const joints = new Set<Constraint>();
    for (const constraint of constraints) {
      this.requireBody(constraint.bodyA); this.requireBody(constraint.bodyB);
      if (constraint.isEnabled()) joints.add(constraint);
    }

    const adjacency = new Map<RigidBody, Set<RigidBody>>();
    for (const { body } of states) if (body.type === "dynamic") adjacency.set(body, new Set());
    const driven = new Set<RigidBody>();
    const connect = (a: RigidBody, b: RigidBody) => {
      if (a.type === "dynamic" && b.type === "dynamic") { adjacency.get(a)!.add(b); adjacency.get(b)!.add(a); }
      else {
        const dynamic = a.type === "dynamic" ? a : b.type === "dynamic" ? b : undefined;
        const other = dynamic === a ? b : a;
        if (dynamic && (activated.includes(other) || (other.type === "kinematic" &&
          (other.poseOverridden || other.velocityOverridden || Math.hypot(...other.velocity) > 0 || Math.hypot(...other.angularVelocity) > 0)))) driven.add(dynamic);
      }
    };
    for (const [a, b] of links.values()) connect(a, b);
    for (const constraint of joints) {
      connect(constraint.bodyA, constraint.bodyB);
      // Public probes found even an enabled zero-speed motor keeps its body awake.
      if (constraint.type === "motorised-hinge") {
        if (constraint.bodyA.type === "dynamic") driven.add(constraint.bodyA);
        if (constraint.bodyB.type === "dynamic") driven.add(constraint.bodyB);
      }
    }
    const islands: BodyState[][] = [];
    const seen = new Set<RigidBody>();
    for (const state of states) {
      if (state.body.type !== "dynamic" || seen.has(state.body)) continue;
      const island: BodyState[] = [], stack = [state.body];
      seen.add(state.body);
      while (stack.length) {
        const body = stack.pop()!;
        island.push(this.bodies.get(body.id)!);
        for (const other of adjacency.get(body)!) if (!seen.has(other)) { seen.add(other); stack.push(other); }
      }
      islands.push(island);
    }
    return { contacts: links, joints, islands, driven };
  }

  private wake(graph: Graph, activated: readonly RigidBody[]): void {
    const changed = new Set<RigidBody>(activated);
    const mark = (edge: Edge) => { for (const body of edge) if (this.bodies.get(body.id)?.body === body) changed.add(body); };
    for (const [key, edge] of graph.contacts) if (!this.contacts.has(key)) mark(edge);
    for (const [key, edge] of this.contacts) if (!graph.contacts.has(key)) mark(edge);
    for (const joint of graph.joints) if (!this.joints.has(joint)) mark([joint.bodyA, joint.bodyB]);
    for (const joint of this.joints) if (!graph.joints.has(joint)) mark([joint.bodyA, joint.bodyB]);
    for (const island of graph.islands) {
      const activate = island.some(({ body }) => !body.sleeping || changed.has(body) || graph.driven.has(body));
      const reset = island.some((state) => changed.has(state.body) || graph.driven.has(state.body) || (state.observedSleeping && !state.body.sleeping));
      if (activate) for (const state of island) {
        if (state.body.sleeping) { state.body.wake(); state.quiet = 0; }
        if (reset) state.quiet = 0;
      }
      for (const state of island) state.observedSleeping = state.body.sleeping;
    }
  }

  private requireBody(body: RigidBody): void {
    if (!body || this.bodies.get(body.id)?.body !== body) throw new Error("Native sleeping body is not registered with this controller.");
  }

  private assertActive(): void { if (this.disposed) throw new Error("Native sleeping controller is disposed."); }
}
